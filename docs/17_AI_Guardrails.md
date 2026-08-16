# AI Engine Guardrails

Gemini access is server-side only (`/api/gemini/*` routes in `server.ts`).

## Controls
- **Model allow-list:** `gemini-3.5-flash`, `gemini-3.1-pro-preview`; client-requested models are validated, arbitrary model ids rejected.
- **Budgets:** per-IP rate limit (120/15min) + per-user rolling budget (30 requests/15min) → 429 with a clear message.
- **Authentication:** every route requires an authenticated session (AI is never anonymous).
- **Prompt hygiene:** `server/lib/promptSanitizer.ts` strips injection patterns and enforces JSON response contracts; classification/RCA use response schemas (`responseMimeType` + `responseSchema`) so malformed outputs fail fast.
- **Scoped prompts:** prompts are seeded with reference data (categories, partner-efficiency rules) — not with other tenants' data.
- **Auditability:** AI-assisted actions that mutate state (e.g. RCA fields) flow through the normal ticket-update path and are audited like manual edits.

## Features
| Endpoint | Purpose |
|---|---|
| `/gemini/classify` | Category/sub-issue/priority/partner triage suggestion for new tickets |
| `/gemini/rca` | Draft RCA fields (root cause, contributing factors, corrective/preventive actions, owner, due date) |
| `/gemini/analyze` | Free-form analysis with system instruction |
| `/gemini/chat` | Operations assistant chat (bounded history) |

## Human-in-the-loop
All AI output is advisory: agents review before it is committed; state-machine gates (e.g. RCA completeness) apply identically to AI-drafted content.
