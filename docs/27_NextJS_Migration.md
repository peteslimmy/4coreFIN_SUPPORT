# Next.js Migration — Architecture & Cutover State

**Status:** In progress (phased, dual-server transition).
**Supersedes (in part):** `docs/05_System_Architecture.md` (runtime topology), `docs/04_SRS` (stack
description), `docs/16_Deployment_Guide` (build & serving). Where those documents describe the
Vite SPA + single Express process, this document reflects current reality.

---

## 1. Target architecture

```
Browser
  └─ Next.js 15 App Router (:3000)
       ├─ middleware.ts        CSRF (double-submit + same-origin) for /api, auth presence gate for /app
       ├─ src/app/api/**       Route handlers (Next-native, security-hardened ports)
       ├─ src/app/[[...slug]]  Mounts the legacy React SPA shell (src/App.tsx, client-only)
       └─ rewrites → Express API (:3001)   Routes not yet ported
```

- **Frontend serving** moved from Vite dev middleware / `dist/` to Next.js. The SPA's internal
  tab routing still works; deep-linkable per-ticket routes (`/app/tickets/[id]`) are a follow-up.
- **Dual-server transition**: Next shadows the paths it has ported (route handlers match before
  rewrites); everything else proxies to Express (`LEGACY_API_URL`, default `http://127.0.0.1:3001`).
  Set `DISABLE_LEGACY_API_PROXY=1` to cut over fully once parity is reached.
- Run dev with: `npm run dev:next` (:3000) + `npm run dev:legacy-api` (:3001).

## 2. Auth model (hybrid)

Supabase Auth remains the identity provider (`docs/13` still applies). On login the Next handler
verifies credentials via `signInWithPassword`, then issues:

1. The existing app-issued JWT session cookie (`4c_session`, 12h, `tokenVersion` invalidation,
   lockout integration — all ported behavior preserved), and
2. The **Supabase access token**, stored in the httpOnly `4c_sb_at` cookie, enabling per-request
   user-JWT Supabase clients (SEC-01 — see `docs/26`).

CSRF (double-submit `4c_csrf` + same-origin) is enforced by `middleware.ts` for all state-changing
`/api` requests, with the same exemption list as the Express server (login / forgot / reset /
email webhook).

## 3. Shared domain package

Canonical, side-effect-free domain logic (per `docs/18` shared-module rule) lives in `shared/`:

- `shared/rbac.ts` — roles + permissions, incl. `BU_SUPPORT_L1/L2/L3` tiers, `ai:use`,
  `admin:config:read|write`. `src/lib/rbac.ts` and `server/rbac.ts` are re-export shims.
- `shared/ticketStateMachine.ts` — transitions (incl. escalation reason rule, merge-close, reopen).
- `shared/slaCalculator.ts` — SLA math shared client/server.

The server no longer imports frontend code across the app boundary (`docs/18` rule restored).

## 4. Security remediations carried into the ported routes

| Fix | Where |
|---|---|
| `ai:use` permission gate + server-owned system prompts + prompt sanitization on all Gemini routes | `src/app/api/gemini/*` |
| Ticket PATCH: partner field allowlist, masked-PII round-trip rejection, `expectedVersion` (409 on conflict), escalation requires reason ≥10 chars + `tickets:escalate` | `src/app/api/tickets/[id]/route.ts` |
| Soft-delete & feedback honor optimistic concurrency | `src/app/api/tickets/[id]/{route,feedback}/route.ts` |
| DB-backed idempotency (shared `idempotency_keys` table with Express middleware) | `lib/server/idempotency.ts` |
| Escalation rules relational with optimistic concurrency (migration 083) | `src/app/api/escalation/rules/route.ts` |
| Per-request user-JWT Supabase client; greppable `supabaseAdmin` service client | `lib/server/supabaseUser.ts`, `server/supabaseAdmin.ts`, migration `082_user_jwt_rls.sql` |

Ported routes: auth (login/logout/me), tickets (list/create/patch/delete/feedback + comments),
Gemini (chat/analyze/classify/rca), escalation rules, bootstrap, notifications (+ read),
users (GET), customers (CRUD), audit-log (GET), SSE `/events`.

**Response/error contracts are preserved exactly as `docs/09` specifies** (403
`Requires permission: <perm>`, scope miss → 404, transition rejection → 400 with
`allowed`/`blockers`, Zod 400 `<path>: <message>`).

## 5. Cross-process event bus

The SSE registry is per-process; during the transition (and in any multi-replica deployment) a
mutation handled by one process must reach SSE clients connected to another.
`server/eventBus.ts` implements a Postgres LISTEN/NOTIFY bus:

- `broadcast()` fans out locally (unchanged, synchronous) **and** publishes to the `4c_broadcast`
  channel; each process ignores its own echoes.
- NOTIFY payloads >7KB are delivered as data-less hints (SSE is a refetch trigger, never a data
  source — consistent with `docs/05` decision 2).
- Initialized from `server.ts` (Express) and `instrumentation.ts` (Next). Requires `DATABASE_URL`;
  degrades to local-only delivery without it.

## 6. Typecheck topology

- `tsconfig.typecheck.json` is the **lint/type gate** (`npm run lint`, `npm run type-check`).
  It excludes the Next tree (`src/app`), generated files (`.next`, `next-env.d.ts` — Next rewrites
  both during builds), and the legacy UI trees.
- `next build` owns the root `tsconfig.json` (it normalizes `jsx: preserve` and appends
  `.next/types` on every run — do not fight it) and has `typescript.ignoreBuildErrors` enabled;
  correctness there is gated by webpack compile + ESLint.
- Known debt: installing Next pulled in `@types/react` (React 19), surfacing ~76 latent type
  errors in legacy UI components (interface drift, not runtime bugs — full inventory:
  [`qa/typecheck-ui-debt.txt`](../qa/typecheck-ui-debt.txt)). Remediation tracked in `docs/24`.

## 7. Repo layout changes

- `src/pages/` → `src/views/` (Next auto-detects `src/pages` as the Pages Router and would compile
  page components into routes). Update any script/bookmark referencing the old path.
- New top-level: `src/app/`, `lib/server/`, `shared/`, `middleware.ts`, `instrumentation.ts`,
  `next.config.mjs`, `postcss.config.mjs`, `tsconfig.typecheck.json`.

## 8. Remaining cutover work

1. Port the remaining ~30 Express routes (admin settings, evidence upload, email inbox, surveys,
   documents, search, analytics, partner portal, identity, webhooks, landing-page images).
2. Run migrations 082/083 against the live project; execute the cross-tenant isolation test
   (`docs/26` step E gate).
3. Migrate repositories to the user-JWT client (`docs/26` steps D–E).
4. Regenerate OpenAPI (`server/openapi.ts`) once parity is reached; retire the Express server and
   the legacy Vite build (`npm run build` / `dist/server.cjs`).
5. UI remediation: React Query migration, per-ticket deep-link routes, strictNull debt
   (`qa/typecheck-ui-debt.txt`).
