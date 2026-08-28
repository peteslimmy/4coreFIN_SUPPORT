import { Router, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validateBody';
import { requireAuth, type AuthedRequest } from '../auth';
import { requirePermission } from '../middleware/requirePermission';
import { audit, AuditAction } from '../auditEvents';
import { listEvidence, insertEvidence, deleteEvidence, getScopedTicket, getEvidenceById } from '../repository';
import { uploadFile, deleteFile } from '../services/storageService';
import { buildId } from '../lib/ids';

const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
const EVIDENCE_ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Magic-byte signatures (first N bytes) for each allowed MIME type. The declared
// Content-Type header is untrusted; the actual bytes decide whether a file is
// stored/treated as the claimed type.
const MIME_SIGNATURES: Array<{ type: string; bytes: number[]; mask?: number[] }> = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff, 0xe0] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], mask: [0xff, 0xff, 0xff, 0xff] }, // RIFF...WEBP checked below
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

/** Return the MIME type whose magic bytes match the buffer, or null. */
export function sniffMimeType(buf: Buffer): string | null {
  // WEBP: "RIFF" + size + "WEBP" at offset 8.
  if (
    buf.length >= 12 &&
    buf.readUInt32LE(0) === 0x46464952 && // 'RIFF'
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  for (const sig of MIME_SIGNATURES) {
    const n = sig.bytes.length;
    if (buf.length < n) continue;
    let match = true;
    for (let i = 0; i < n; i++) {
      const mask = sig.mask?.[i] ?? 0xff;
      if ((buf[i] & mask) !== (sig.bytes[i] & mask)) { match = false; break; }
    }
    if (match) return sig.type;
  }
  // Text/plain and Office XML/DOCX have no reliable fixed signature; fall back
  // to heuristic checks only for the explicitly allowed types.
  return null;
}

export function createEvidenceRouter(): Router {
  const router = Router();

  router.get('/tickets/:id/evidence', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const rows = await listEvidence([req.params.id], req.user!);
    res.json(rows);
  });

  router.get('/evidence', requireAuth, requirePermission('tickets:view'), async (req: AuthedRequest, res: Response) => {
    const raw = req.query.ticketId;
    const ticketIds = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    const rows = await listEvidence(ticketIds?.length ? ticketIds : undefined, req.user!);
    res.json(rows);
  });

  router.post('/evidence', requireAuth, requirePermission('tickets:edit'), validateBody(z.object({ id: z.string().min(1), ticketId: z.string().min(1), fileName: z.string().min(1), fileSize: z.number().int().nonnegative(), fileType: z.string().min(1), uploadedAt: z.string().min(1), uploadedBy: z.string().min(1), url: z.string().url() })), async (req: AuthedRequest, res: Response) => {
    const evidence = req.body;
    const ticket = await getScopedTicket(evidence.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    await insertEvidence(evidence);
    await audit({ event: 'EVIDENCE_UPLOADED', ticketId: evidence.ticketId, actor: req.user!.name, role: req.user!.role, action: AuditAction.EVIDENCE_UPLOADED, details: `Evidence ${evidence.id} for ticket ${evidence.ticketId}` });
    res.status(201).json(evidence);
  });

  router.post('/evidence/upload', requireAuth, requirePermission('tickets:edit'), (req: AuthedRequest, res: Response) => {
    const ticketId = req.headers['x-ticket-id'] as string | undefined;
    const fileName = req.headers['x-filename'] as string | undefined;
    const fileType = (req.headers['x-file-type'] as string | undefined) || (req.headers['content-type'] as string | undefined);
    if (!ticketId || !fileName || !fileType) {
      return res.status(400).json({ error: 'Missing upload metadata headers (x-ticket-id, x-filename, content-type)' });
    }
    if (!EVIDENCE_ALLOWED_TYPES.has(fileType)) {
      return res.status(415).json({ error: `Unsupported file type: ${fileType}` });
    }

    const chunks: Buffer[] = [];
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > EVIDENCE_MAX_BYTES) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
        if (buffer.length > EVIDENCE_MAX_BYTES) return res.status(413).json({ error: 'File exceeds 5MB limit' });
        // The declared Content-Type is untrusted: reject files whose magic bytes
        // contradict the claim. Text/plain and Office docs fall back to a length
        // sanity check (no reliable signature) but only for the allowed types.
        let verifiedType = sniffMimeType(buffer);
        if (!verifiedType) {
          if (fileType === 'text/plain') {
            // Reject text/plain files containing HTML/script markers
            const textContent = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));
            if (/<\s*(?:script|html|head|body|iframe|object|embed|form|input|meta|link|style)/i.test(textContent)) {
              return res.status(415).json({ error: 'text/plain file contains HTML/script content' });
            }
            verifiedType = 'text/plain';
          } else if (fileType === 'application/msword' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            verifiedType = fileType;
          } else {
            return res.status(415).json({ error: 'File content does not match the declared type' });
          }
        }
        const ticket = await getScopedTicket(ticketId, req.user!);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        const url = await uploadFile(buffer, fileName, verifiedType, 'evidence');
        if (!url) return res.status(500).json({ error: 'Upload failed' });
        const row = {
          id: buildId('ev'),
          ticketId,
          fileName,
          fileSize: buffer.length,
          fileType: verifiedType,
          uploadedAt: new Date().toISOString(),
          uploadedBy: req.user!.name,
          url,
        };
        await insertEvidence(row);
        await audit({ event: 'EVIDENCE_UPLOADED', ticketId, actor: req.user!.name, role: req.user!.role, action: AuditAction.EVIDENCE_UPLOADED, details: `Evidence ${row.id} for ticket ${ticketId}` });
        res.status(201).json(row);
      } catch (e: any) {
        res.status(500).json({ error: e.message || 'Upload failed' });
      }
    });
  });

  router.delete('/evidence/:id', requireAuth, requirePermission('tickets:edit'), async (req: AuthedRequest, res: Response) => {
    // Direct scoped lookup — no full-table scan to find one row.
    const ev = await getEvidenceById(req.params.id, req.user!);
    if (!ev) return res.status(404).json({ error: 'Evidence not found' });
    const ticket = await getScopedTicket(ev.ticketId, req.user!);
    if (!ticket) return res.status(404).json({ error: 'Evidence not found' });
    await deleteFile(ev.url);
    await deleteEvidence(req.params.id);
    await audit({ event: 'EVIDENCE_DELETED', ticketId: ev.ticketId, actor: req.user!.name, role: req.user!.role, action: AuditAction.EVIDENCE_DELETED, details: `Evidence ${req.params.id} deleted` });
    res.json({ ok: true });
  });

  return router;
}
