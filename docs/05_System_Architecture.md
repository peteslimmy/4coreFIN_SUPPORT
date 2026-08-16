# System Architecture

## Overview
```
Browser (React SPA)
  │  session cookie + CSRF header
  ▼
Express API (server.ts)
  ├── middleware: requestId → CSP nonce → helmet → rate limits → CSRF
  ├── feature routers (tickets, comments, evidence, users, customers,
  │   config, reference, operations, audit, webhooks, admin, landing)
  ├── repository layer (server/repository.ts) — Supabase service client
  ├── SSE hub (server/broadcast.ts) — tenant-scoped fan-out
  ├── SLA monitor (server/slaJob.ts) — interval job + DB dedupe
  ├── webhook dispatcher (delivery log + retries)
  └── Gemini routes (allow-listed models, budgets)
Supabase: Auth (GoTrue) + PostgreSQL (RLS backstop, triggers, RPCs)
```

## Boundary layers
Client interface → session auth (JWT cookie) → permission middleware (`requirePermission`) → tenant/org scoping (repository queries + object-level `canAccessTicket`) → PII decrypt/mask → encrypted storage.

## Key decisions
1. **Server-side authorization everywhere.** The SPA hides UI by permission, but every route re-checks permissions and scope; the state machine and DB trigger make illegal transitions impossible regardless of client.
2. **Single source of truth.** The server + React Query cache; no localStorage/IndexedDB domain mirrors (removed). SSE patches context in place with a local-write echo guard.
3. **Deterministic SLA math shared by client and server** (`src/lib/slaCalculator.ts` imported by both) — one implementation, no drift.
4. **Atomic reference-data writes** via the `replace_table_rows` RPC — the JS client cannot open transactions.
5. **Service-role client with query-level scoping.** RLS policies (migrations 010/032/039) act as a defense-in-depth backstop for any non-service connection.

## Failure handling
- Errors funnel to one Express error handler (no stack leakage in production).
- SSE writes are guarded; dead clients pruned; heartbeats every 25s.
- SLA monitor failures log per-ticket and never abort the sweep.
- Webhook dispatch is fire-and-forget with attempts logged.
