# Software Requirements Specification (SRS)

## Stack
- **Frontend:** React 19 + TypeScript, Vite 6, Tailwind CSS 4, TanStack React Query 5, framer-motion, lucide-react, recharts (dashboard chunk only).
- **Server:** Node.js + Express 4 (`server.ts` + `server/routes/*`), Zod request validation, helmet CSP with per-request nonces, pino structured logging with request ids.
- **Data:** Supabase (PostgreSQL) accessed server-side with the service-role client; Supabase Auth (GoTrue) is the sole identity provider.
- **Realtime:** Server-Sent Events over the same session cookie; client reconnects with exponential backoff.
- **AI:** Google Gemini via server-side routes only (model allow-list, per-user budget, rate limits, prompt sanitization).

## Runtime topology
Single Node process serves the API, the SSE hub, the SLA monitor (interval job), and (in production) the built SPA from `dist/` with immutable asset caching. Vite middleware is used in dev.

## Data-retention & compliance requirements
- Soft deletes for tickets; hard deletes only via GDPR erasure (`anonymize_ticket_pii`) which preserves the audit chain.
- `cleanup_expired_data()` scheduled function (migration 021) as the retention hook; GAID-oriented 10-year audit retention target.
- PII encrypted at rest (AES-256-GCM, per-row IV) — see doc 13.

## Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-1 | Every mutating request carries a double-submit CSRF token + same-origin check |
| NFR-2 | Sessions are httpOnly cookies (12h JWT); forced password change gates fresh provisioning |
| NFR-3 | Tenant isolation enforced at query level and object level; RLS backstop for non-service connections |
| NFR-4 | SLA computation deterministic and timezone-correct (IANA tz via Intl) |
| NFR-5 | List endpoints bounded (pagination or scoping); counting done in SQL |
| NFR-6 | Static assets immutable-cached; SPA shell revalidated |
| NFR-7 | Accessibility: axe-core e2e suite, skip links, focus rings, ARIA labels |
| NFR-8 | Graceful shutdown drains SSE; unhandled rejections logged, never fatal |
