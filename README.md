# 4CoreFinSupport

FinTech Incident Control & Payment Operations Intelligence.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, and `ENCRYPTION_KEY`:
   `npm run dev`

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Express + Vite dev server |
| `npm run build` | Production build (Vite + server bundle) |
| `npm run start` | Run the production server (`dist/server.cjs`) |
| `npm run lint` | ESLint + `tsc --noEmit` |
| `npm run test` | Unit/integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |

## Documentation

Feature specs and operational runbooks live in [`docs/`](docs/).

## Authentication

All logins use Supabase Auth (`AUTH_PROVIDER=supabase`). The server refuses to boot in production with the legacy `local` provider. See `docs/25_GoLive_QA_and_Auth_Migration.md` for the cutover checklist.
