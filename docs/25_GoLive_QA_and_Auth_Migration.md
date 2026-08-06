# 25_GoLive_QA_and_Auth_Migration.md

Status: CODE COMPLETE — Supabase Auth is the sole authentication provider. Migrations 001→022 applied live. Demo accounts deleted. New admin `peteslimmy@gmail.com` created with SUPER_ADMIN role. Remaining items below are manual steps before production cutover.

## 1. Production-go-live commitments (implemented in code)

- **All login via Supabase Auth.** `AUTH_PROVIDER` (default `supabase`):
  - `POST /auth/login` → `supabase.auth.signInWithPassword` (anon-key client, no session pollution).
  - `POST /auth/register` → `supabase.auth.admin.createUser` (self-service PARTNER only), storing the Supabase user id in `users.auth_user_id`.
  - `server.ts:validateEnv()` **refuses to boot** production with `AUTH_PROVIDER=local`.
  - Legacy bcrypt path remains only as a password-hash carrier for the local `users.password_hash` column; it is never the source of truth for an authentication decision.
- **Committed secrets removed.** `scripts/archive/runMigration*.ts` and `server/fixPartnerRole.ts` no longer contain hardcoded service-role JWTs or project refs; they require `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` and exit if absent.
- **Forced password change.** Users with `must_change_password=true` are gated by `requireAuth` middleware (returns `403 { code: 'PASSWORD_CHANGE_REQUIRED' }`). Only `/auth/change-password`, `/auth/verify-password`, `/auth/me`, `/auth/logout` are allowed until the password is changed.

## 2. Database migrations applied live

Migrations **001→022** have all been applied to the live project `kflxtzlwyxphfoghfvzq` via the Supabase Management API (`/v1/projects/<ref>/database/query`). Key additions:

| Migration | What it adds |
|-----------|-------------|
| 012 | `users.auth_user_id` FK → `auth.users(id)`, backfilled by email |
| 014 | FK constraints: tickets→customers, comments/evidence/notifications→tickets |
| 016 | `idempotency_keys` table for API idempotency |
| 017 | Lockout columns: `failed_login_attempts`, `locked_until`, `last_failed_login` |
| 018 | `verify_audit_chain_chunked()` + `get_audit_chain_stats()` functions |
| 020 | Audit log immutability: `audit_logs_protect` trigger + INSERT/SELECT policies only |
| 021 | `cleanup_expired_data()` function (weekly cron placeholder) |
| 022 | `users.must_change_password` BOOLEAN DEFAULT false |

## 3. Demo accounts — DELETED

All 5 demo identities have been removed from Supabase Auth and their app rows cascaded:

| Deleted User | Email | UID |
|-------------|-------|-----|
| Adaobi Okeke | `adaobi.okeke@4core.com` | `071080d9-c01d-4a9c-84f4-7b0d945dc2d5` |
| Chioma Adebayo | `chioma.adebayo@4core.com` | `2d596d47-65d1-4aaf-aa03-4c75badf235c` |
| Emeka Nwosu | `emeka.nwosu@4core.com` | `7980ba89-cd92-4586-9b4b-c9a60712b533` |
| Sarah Okafor | `sarah.okafor@4core.com` | `1bd5cf06-f662-49fe-a022-2b85434f392b` |
| Tunde Balogun | `tunde.balogun@4core.com` | `12ac1a3f-2e68-4b89-ba28-1c7fa0e46967` |

## 4. New admin user created

| Field | Value |
|-------|-------|
| Email | `peteslimmy@gmail.com` |
| Password | `@Pete12345678` |
| App Role | SUPER_ADMIN |
| BU | POSSAP |
| Tenant | tnt-POSSAP |
| Supabase Auth UID | `22e671bd-c547-4595-a333-e20f29953cce` |
| App User ID | `usr-pete-admin` |

> ⚠️ Change the default password `@Pete12345678` immediately after first login.

## 5. Dev-account removal checklist (MANUAL, Supabase Dashboard)

- [x] Open Supabase Dashboard → **Authentication → Users**.
- [x] Verify the only users present are real accounts (query `auth.users`):
  ```sql
  select id, email, created_at from auth.users
   where email like '%@4core.com' or id like 'usr-seed-%';
  ```
- [x] Delete all seeded demo identities from **Authentication → Users** (or via `auth.admin.deleteUser`). — **DONE**
- [ ] Confirm zero orphan rows in the app table:
  ```sql
  select id, email from users where email like '%@4core.com' or id like 'usr-seed-%';
  ```
- [ ] Confirm the `users` row count matches the `auth.users` count (1:1 via `auth_user_id`):
  ```sql
  select count(*) as users, count(auth_user_id) as linked from users;
  ```
- [ ] Rotate the Supabase **service role key** (Dashboard → Settings → API). The key previously committed to `scripts/archive/*` and `server/fixPartnerRole.ts` must be treated as compromised and revoked.
- [ ] Update `.env` / secret manager with the new `SUPABASE_SERVICE_KEY`, `SUPABASE_URL`, `JWT_SECRET`, and `AUTH_PROVIDER=supabase`.

## 6. Supabase Auth console hardening (MANUAL, recommended before GA)

- [ ] **Email confirmation ON**: Authentication → Providers → Email → enable "Confirm email". Until enabled, `email_confirm` is set true by `admin.createUser`.
- [ ] **Password policy**: min 8 chars, require letters+numbers+symbol where acceptable to business.
- [ ] **MFA TOTP** for `SUPER_ADMIN` and `BU_SUPPORT`: Authentication → Multi-factor → enable TOTP; app already sets cookies `httpOnly`/`secure` in prod.
- [ ] **Auth rate limiting**: keep default 60 req/min; enable CAPTCHA for the login/register endpoints in the Dashboard if bot volume warrants.
- [ ] Add a `roles` / `metadata` sync so new `auth.users` get an initial app role only via self-registration (PARTNER) or admin provisioning.

## 7. Go-live QA gates

### Functional (F)
- [ ] F-01 Login via Supabase Auth for each role (SUPER_ADMIN, EXECUTIVE, BU_SUPPORT, PARTNER, PROVIDER).
- [ ] F-02 Login with wrong password → 401; locked-out account → correct error.
- [ ] F-03 Registration (PARTNER) → creates `auth.users` + `users.auth_user_id` + correct BU/tenant.
- [ ] F-04 Session persists across refresh; logout clears both cookies.
- [ ] F-05 CSRF: state-changing request without `X-CSRF-Token` → 403.
- [ ] F-06 Tenant isolation: BU_SUPPORT of BU A cannot read tickets of BU B (already covered by `tests/routes.tenant.test.ts`).
- [ ] F-07 Evidence upload rejects EXE-masquerading files (415) — `tests/evidence-security.test.ts`.
- [ ] F-08 Customer auto-link creates/reuses customers and stamps `customer_id`.
- [ ] F-09 Reference data delete blocked while referenced; audit-chain verification works.
- [ ] F-10 SLA job flips overdue tickets (manual run via `runSlaCheck`).
- [ ] F-11 Gemini analyze/classify/rca/chat rate-limited (429 after budget) — manual smoke.
- [ ] F-12 SSE real-time broadcast fires on ticket changes.
- [ ] F-13 Forced password change: `must_change_password=true` user can only access `/auth/change-password`, `/auth/verify-password`, `/auth/me`, `/auth/logout`; all other endpoints return 403.
- [ ] F-14 Change password clears `must_change_password` flag and allows full access.
- [ ] F-15 Forgot-password returns success without enumeration; reset-password via token sets new password and clears flag.

### Security (SEC)
- [ ] SEC-01 HTTP response headers: HSTS, COOP, CORP, referrer-policy, Permissions-Policy present in prod.
- [ ] SEC-02 `AUTH_PROVIDER=local` fails to boot in prod (negative test).
- [ ] SEC-03 No `sbp_`/service-role JWT string anywhere in repo (CI grep guard).
- [ ] SEC-04 HTTPS only; cookies `secure`.
- [ ] SEC-05 `npm audit` shows no HIGH in runtime deps (xlsx is client/admin-only, size-capped).
- [ ] SEC-06 Login uses anon-key client (`supabaseAuth`) — verify service-key client is not polluted with user session (no RLS data-return-zero bug).

### Ops / Release (OPS)
- [ ] OPS-01 Fresh prod DB: apply migrations 001→022, then do NOT seed.
- [ ] OPS-02 App boots with `NODE_ENV=production`, `AUTH_PROVIDER=supabase`, service key rotated.
- [ ] OPS-03 `GET /api/health` returns 200; version banner correct.
- [ ] OPS-04 Graceful shutdown; restarts drain SSE clients.

## 8. GO / NO-GO

**GO** when: all F-*, SEC-*, OPS-* above pass; **241 tests green**; `npm run lint`, `tsc --noEmit`, `npm run build` clean; service key rotated; zero dev accounts; production uses Supabase Auth only; forced-password-change gate verified; `peteslimmy@gmail.com` SUPER_ADMIN login confirmed.

**NO-GO** if any: seeded dev account present, `AUTH_PROVIDER=local` in prod, old service key unrotated, any F-01/SEC-02/SEC-03 failure, or audit chain breaks.
