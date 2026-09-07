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
| `npm run dev:next` | Start the Next.js dev server (frontend + ported API routes) on :3000 |
| `npm run dev:legacy-api` | Start the legacy Express API on :3001 (serves routes not yet ported; Next proxies to it) |
| `npm run dev` | Start the legacy Express + Vite dev server (pre-migration mode) |
| `npm run build:next` | Next.js production build |
| `npm run build` | Legacy production build (Vite + server bundle) |
| `npm run start:next` | Run the Next.js production server |
| `npm run start` | Run the legacy production server (`dist/server.cjs`) |
| `npm run lint` | ESLint + typecheck (`tsconfig.typecheck.json`) |
| `npm run test` | Unit/integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |

> **Migration note:** the app is being migrated from Express to Next.js (App Router).
> See [`docs/27_NextJS_Migration.md`](docs/27_NextJS_Migration.md) for the target architecture,
> which routes are already Next-native, and the cutover plan.

## Documentation

Feature specs and operational runbooks live in [`docs/`](docs/).

## Authentication

All logins use Supabase Auth (`AUTH_PROVIDER=supabase`). The server refuses to boot in production with the legacy `local` provider. See `docs/25_GoLive_QA_and_Auth_Migration.md` for the cutover checklist.
