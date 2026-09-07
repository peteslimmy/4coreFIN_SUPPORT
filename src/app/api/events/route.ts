import { NextRequest } from 'next/server';
import { addSseClient, removeSseClient } from '../../../../server/broadcast';
import { requireSession } from '../../../../lib/server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/events — Server-Sent Events stream (live ticket/comment/SLA
 * updates). Registers the connection in the shared SSE registry so both the
 * Express and Next servers (bridged via the Postgres event bus) deliver
 * events to it.
 *
 * The registry API expects an Express-like Response surface; a minimal
 * adapter over a ReadableStream keeps the single shared registry.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const user = session.user;

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const closeCbs: Array<() => void> = [];

      const res = {
        writableEnded: false,
        write: (chunk: string): boolean => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(chunk));
            return true;
          } catch {
            closed = true;
            res.writableEnded = true;
            return false;
          }
        },
        end: (): void => {
          if (closed) return;
          closed = true;
          res.writableEnded = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
        on: (event: string, cb: () => void): void => {
          if (event === 'close') closeCbs.push(cb);
        },
      };

      const finish = () => {
        clearInterval(heartbeat);
        removeSseClient(res as never);
        res.end();
        for (const cb of closeCbs) {
          try {
            cb();
          } catch {
            /* listener errors must not break teardown */
          }
        }
      };
      cleanup = finish;

      res.write(`event: connected\ndata: ${JSON.stringify({ user: user.email })}\n\n`);
      const global = user.role === 'SUPER_ADMIN' || user.role === 'EXECUTIVE' || user.bu === 'ALL';
      addSseClient(res as never, user.id, user.role, user.bu, user.tenantId || null, global);

      // Heartbeat keeps idle connections alive through proxies and detects
      // dead peers.
      const heartbeat = setInterval(() => {
        if (!res.write(': ping\n\n')) finish();
      }, 25_000);
      // Do not hold the process open for heartbeat timers alone.
      (heartbeat as unknown as { unref?: () => void }).unref?.();

      req.signal.addEventListener('abort', finish, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
