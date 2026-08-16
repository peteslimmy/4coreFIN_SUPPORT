# Deployment & Operations Guide

## Build
`npm run build` → Vite builds the SPA to `dist/` and esbuild bundles the server to `dist/server.cjs`. `npm start` runs the production server.

## Runtime requirements
- Node 20+; single process serves API + SSE + SPA + SLA monitor.
- Environment (validated at boot — missing values abort):
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service role), `SUPABASE_ANON_KEY`
  - `JWT_SECRET` (≥ 32 chars), `ENCRYPTION_KEY` (32-byte hex for AES-256-GCM)
  - `AUTH_PROVIDER=supabase` (enforced in production)
  - Optional: `GEMINI_API_KEY`, `PORT`, `SLA_CHECK_INTERVAL_MS`, `REDIS_URL`

## Migrations
Apply `supabase/migrations/*.sql` in numbered order to the target project before deploying the code that depends on them. Notable recent migrations: 040 (CHECK constraints), 041_test_reset + 042 (test infra/audit events), 043 (customer count RPC), 044 (partner org FK), 045 (atomic replace RPC), 046 (transition trigger), 047 (SLA dedupe), 048 (SLA pause columns).

## Serving & caching
- `/assets/*` (content-hashed) → `Cache-Control: public, max-age=31536000, immutable`
- other static files → 300s must-revalidate; SPA shell → `no-cache`
- `GET /api/health` reports process + Supabase dependency status (200/503)

## Operations
- Graceful shutdown drains SSE connections; SLA monitor is in-process (single-instance assumption — scale-out requires extracting the job).
- Logs: pino structured JSON with request ids; security events flagged.
- Backups/DR: rely on Supabase PITR; audit ledger verification (`scripts/verifyAuditChain.ts`) validates integrity after restores.
- Recommended platforms: any Node host (Cloud Run, Fly, container); the SPA is served by the same process so no separate static hosting is required.
