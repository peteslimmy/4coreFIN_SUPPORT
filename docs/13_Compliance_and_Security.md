# Compliance, Masking, and Security

## Authentication
- **Sole provider:** Supabase Auth (GoTrue) via `signInWithPassword` on a dedicated anon-key client (session pollution guard). Production refuses to boot with any other `AUTH_PROVIDER`.
- **Sessions:** httpOnly, SameSite=Lax, Secure-in-prod cookie carrying a 12h JWT; JS-readable CSRF cookie paired with the `X-CSRF-Token` header + same-origin check on every mutating request.
- **Hardening:** account lockout (failed-attempt tracking with lockout TTL), forced password change gate for provisioned users (only password-change/me/logout reachable until cleared), activation/suspension lifecycle, session draining on logout.

## Authorization
Permission middleware on every route → tenant/org scoping at the query level → object-level `canAccessTicket` double-check → RLS policy backstop for non-service connections → DB CHECK/trigger invariants. See doc 07.

## PII protection
- **At rest:** AES-256-GCM envelope encryption (`iv:tag:cipher`, per-row random IV) for customer email/phone, card PAN, submitter phone. Key from `ENCRYPTION_KEY`; rotation metadata table exists (`pii_encryption_keys`).
- **In transit/responses:** role-based masking — partners/customers see masked email/phone/PAN; internal unmasked roles still see masked PAN unless they hold `tickets:unmask` and explicitly request unmasking (which is audited).
- **Erasure:** GDPR workflow (`erasure_requests` + `anonymize_ticket_pii`) nulls PII while preserving the hash-chained audit trail.

## Audit ledger
Append-only `audit_logs` with a SHA-256 hash chain (`previous_hash` → `hash`); UPDATE/DELETE blocked by trigger; chunked verification (`/audit-log/verify`, `audit:verify`); audit monitor service watches for anomalies. Actions recorded: ticket created/updated/transitioned/deleted/feedback, RCA/unmask events, escalations, merges, user administration, SLA breaches, role changes.

## Platform security
helmet CSP with per-request nonces, HSTS in prod, Permissions-Policy lockdown, rate limits (global API, auth, uploads, AI), request ids + pino structured logs, MIME-sniffed upload validation, magic-byte checks, size caps, webhook signing, idempotency keys, secrets validated at boot (JWT ≥ 32 chars), committed credentials removed and rotation documented (doc 25 §5).

## Standards mapping
| Standard | Implementation |
|---|---|
| ISO 10002 | Feedback gate before closure; complaint categories; response/resolution targets |
| NDPA 2023 | PII encryption, masking, erasure workflow, access minimization |
| GAID | Immutable hash-chained audit ledger, 10-year retention target, verification tooling |
