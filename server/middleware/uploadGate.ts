import type { Request, Response, NextFunction } from 'express';

/**
 * Upload memory-pressure controls.
 *
 * All upload handlers buffer the full body in memory (up to 10MB each).
 * Without coordination, a burst of concurrent uploads multiplies heap usage
 * linearly (100 × 10MB = 1GB) and can OOM the process.
 *
 * - `createUploadGate`: semaphore that lets at most `maxConcurrent` uploads
 *   process at once; up to `maxQueued` additional requests wait their turn,
 *   and overflow beyond that is shed with 429 so queues cannot grow without
 *   bound either.
 * - `rejectOversize`: drops requests whose Content-Length already exceeds the
 *   route's limit before a single byte is buffered (the handlers keep their
 *   own streaming-time checks as defense against missing/spoofed headers).
 */

interface GateOptions {
  maxConcurrent?: number;
  maxQueued?: number;
}

export function createUploadGate(opts: GateOptions = {}) {
  const maxConcurrent = opts.maxConcurrent ?? 8;
  const maxQueued = opts.maxQueued ?? 40;

  let active = 0;
  const queue: Array<() => void> = [];

  return function uploadGate(req: Request, res: Response, next: NextFunction) {
    let entered = false;
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      if (!entered) {
        // Aborted while still queued: drop the dead entry so a later `release`
        // cannot wake it (which would permanently inflate `active` — the
        // response is already closed and no finish/close event will fire to
        // decrement it).
        const idx = queue.indexOf(enter);
        if (idx !== -1) queue.splice(idx, 1);
        return;
      }
      active--;
      const wakeup = queue.shift();
      if (wakeup) wakeup();
    };

    // Either event may fire first depending on client/abort behaviour.
    res.on('finish', release);
    res.on('close', release);

    const enter = () => {
      entered = true;
      active++;
      next();
    };

    if (active < maxConcurrent) {
      enter();
      return;
    }
    if (queue.length >= maxQueued) {
      res.status(429).json({ error: 'Upload capacity reached. Please retry shortly.' });
      // Release the never-entered slot bookkeeping immediately.
      released = true;
      res.removeListener('finish', release);
      res.removeListener('close', release);
      return;
    }
    queue.push(enter);
  };
}

/** Reject early when Content-Length exceeds maxBytes (413 before buffering). */
export function rejectOversize(maxBytes: number) {
  return function oversizeCheck(_req: Request, res: Response, next: NextFunction) {
    const raw = _req.headers['content-length'];
    const len = raw ? Number(raw) : NaN;
    if (Number.isFinite(len) && len > maxBytes) {
      res.status(413).json({ error: `Payload exceeds ${Math.floor(maxBytes / (1024 * 1024))}MB limit` });
      return;
    }
    next();
  };
}
