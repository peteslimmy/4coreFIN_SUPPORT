# Testing Strategy

## Layers
| Layer | Tooling | Location | Covers |
|---|---|---|---|
| Unit | Vitest + Testing Library | `src/**/*.test.{ts,tsx}` | State machine (transitions, guards, SLA pause), SLA math (timezones, holidays, windows), RBAC tiers, partner-org isolation, duplicate detection, metrics, form configs, UI primitives |
| Integration (API) | Vitest + real test project | `tests/*.test.ts` | Route behavior against a disposable Supabase test project: tenant isolation, auth flows, CSRF, evidence security, reference data, customer linkage, SLA job |
| E2E | Playwright | `e2e/*.spec.ts` | Auth journeys, accessibility (axe-core) |

## Running
- `npm test` — unit suite (always runs; integration tests are included automatically when test credentials are present via `.env.test`, otherwise skipped locally).
- `npm run test:e2e` / `npm run test:a11y` — Playwright suites.
- `npm run lint` — ESLint + `tsc --noEmit`.

## Integration-test environment
Integration tests require a dedicated disposable Supabase project (`scripts/prepareTestDb.ts`, `.env.test`). The schema is reset between tests via the `reset_test_schema()` RPC (migration 041_test_reset). **Never point `.env.test` at a project holding real data.**

## Conventions
- Business rules are tested at the pure-module level first (fast, CI-friendly), then proven through the API in integration.
- Every security-relevant fix lands with a regression test (e.g. holiday-infinite-loop, PATCH state-machine bypass, StrictMode duplicate writes).
- Current status: 209 unit tests green; CI gates on lint + typecheck + unit suite (+ integration when credentials exist).
