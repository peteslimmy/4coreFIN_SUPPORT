# Coding & TypeScript Standards

- **Imports:** structured named imports at the top of the file; no default-export mixes within a module family; server code never imports from the SPA except shared pure modules in `src/lib` (e.g. `slaCalculator`, `ticketStateMachine`, `rbac`, `canAccessTicket`) — the shared modules must stay side-effect free.
- **Typing:** strict enums for domain values (TicketStatus, TicketPriority, UserRole, Permission); `any` only at explicit trust boundaries (legacy rows in the repository) with narrowing at the edge; no non-null assertions outside proven invariants.
- **Validation:** every mutating route validates with a Zod schema via `validateBody`; schemas strip unknown fields (no `.passthrough()`).
- **State machine:** all status changes go through `applyTransition` — never assign `status` directly.
- **Server boundaries:** route = parse/authorize/orchestrate; repository = data access + scoping; pure modules = business math. No fetch/API details inside page components (use `src/lib/api.ts`).
- **Data fetching:** React Query is the cache; context holds session-scoped domain state hydrated from bootstrap; no localStorage/IndexedDB mirrors.
- **Errors:** one JSON error shape (`{error}`); thrown `Error`s carry `status`/`code` when the error middleware needs them.
- **Naming:** camelCase in app code; snake_case only at the DB boundary (`toSnake`/`toCamel` in the repository).
- **Tests:** pure logic gets unit tests colocated (`*.test.ts`); API behavior is proven in `tests/` against the test project; every bug fix lands with a regression test.
- **Lint/format:** ESLint (typescript-eslint + react-hooks) and Prettier; CI runs `eslint src/ && tsc --noEmit`.
