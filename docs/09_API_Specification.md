# API Specification

Base: `/api`. Auth: httpOnly session cookie (`4c_session`, 12h JWT) or `Authorization: Bearer`. All mutating requests require the `X-CSRF-Token` header matching the `4c_csrf` cookie. Interactive docs (Swagger UI) mount at `/docs` in non-production. Full OpenAPI source: `server/openapi.ts`.

## Ticket lifecycle
| Method & path | Permission | Notes |
|---|---|---|
| `GET /tickets` | tickets:view | Filters: status, priority, businessUnit, partner, search, limit/offset, includeDeleted, unmask (needs tickets:unmask). Returns array, or `{tickets, limit, offset, total}` when paginated |
| `GET /tickets/:id` | tickets:view | `?unmask=true` requires tickets:unmask |
| `POST /tickets` | tickets:create | BU-scoped (tenant check); customer auto-link; Zod-validated; SLA deadline computed |
| `PATCH /tickets/:id` | tickets:edit | **All status changes (`to` or `status`) go through the state machine**; escalation/merge/priority-CRITICAL gated by their permissions; SLA recomputed on priority change |
| `PATCH /tickets/:id/feedback` | tickets:view (+own-BU for customers) | Score 1–5 + comment |
| `DELETE /tickets/:id` | tickets:delete | Soft delete |

## Other domains
`GET/POST /comments`, `PATCH /comments/:id` · `GET/POST /evidence`, `POST /evidence/upload` (raw body + headers), `DELETE /evidence/:id` · `GET/POST /major-incidents`, `GET/PATCH /major-incidents/:id` · `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id` · `GET /users`, `POST/PATCH/DELETE /users...` (activation) · `GET /audit-log`, `POST /audit-log`, `GET /audit-log/verify` · `GET /notifications`, `POST /notifications`, `PATCH /notifications/:id/read` · `GET /bootstrap?scope=` · `GET /events` (SSE) · `POST /sla/run-check` (admin:sla) · auth: `/auth/login|logout|me|register|forgot-password|reset-password|change-password|verify-password` · config & reference: `GET/PUT /config/:key`, `/reference/:kind` CRUD + kinds · webhooks CRUD · profile · landing-page images · `/gemini/analyze|classify|rca|chat` (budgeted) · `GET /health`.

## Conventions
- Validation: Zod per-route schemas; unknown fields stripped; first issue returned as `400 {error: "<path>: <message>"}`.
- Authorization: `403 {error: "Requires permission: <perm>"}`; scope misses return `404`.
- Errors: single JSON shape `{error}`; production 500s are generic.
- Transitions rejected by the state machine return `400` with `allowed: [{to,label}]` or `blockers: [...]`.
- Idempotency: send an `Idempotency-Key` header on POST/PUT to replay cached responses.
