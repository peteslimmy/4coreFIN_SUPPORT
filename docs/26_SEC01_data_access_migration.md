# SEC-01: Per-Request User-JWT Data Access (Migration Specification)

**Status:** Specified — not yet implemented.
**Priority:** P0 security architecture (the single biggest remaining finding).
**Prerequisite:** A disposable Supabase test project with `TEST_SUPABASE_*` secrets configured (so the integration suite in `tests/*.test.ts` can run end-to-end).

---

## 1. Current state (the problem)

`server/supabase.ts` exports a **single service-role client** used by every repository:

```ts
export const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_KEY);
```

The service role **bypends RLS entirely**. Every row-level restriction — tenant isolation,
partner scoping, the `tenantScope(user)` helper in `server/repositories/shared.ts` — exists
only as **application code**. One missed `.eq('tenant_id', …)` anywhere is a silent cross-tenant
data leak, with no database backstop. The RLS policies added in migrations 076/080 are correct
but currently dead weight against the service client.

There is also `supabaseAuth` (anon key), used **only** for `signInWithPassword` — it is deliberately
never used for data queries.

## 2. Target state

Introduce a **per-request user-JWT Supabase client** for data reads/writes, so RLS becomes the
real authorization boundary:

- Service-role client (`supabase`) → retained **only** for true admin operations
  (user provisioning, migrations, anything that must cross tenant boundaries).
- User-JWT client (`supabaseUser` / a request-scoped factory) → used for all per-user data
  queries. It sends the caller's JWT in the `Authorization` header, so RLS policies evaluate
  against `auth.uid()` and the per-request `app.tenant_id` / `app.partner_org_id` GUCs.

Result: even if application code forgets a `.eq('tenant_id', …)`, RLS denies the row.

## 3. Tenant / scope model (must be preserved)

From `server/repositories/shared.ts` and `server/tenant.ts`:

| Role | Scope |
|------|-------|
| `SUPER_ADMIN`, `EXECUTIVE`, `bu === 'ALL'` | cross-tenant (`tenantScope` returns `null`) |
| `BU_SUPPORT*` | single tenant = `user.tenantId` |
| `PARTNER` | scoped by `partner_org_id` (FK) or legacy `partner` name |
| `CUSTOMER` | customer-portal scoped |

`tenantIdForBu(bu)` → deterministic `tnt-<BU>` (must stay in sync with SQL
`tenant_id_for_bu()` in migration 009). `GLOBAL_TENANT_ID = 'tnt-global'`.

## 4. Migration steps (incremental, each independently revertible)

### Step A — Add authenticated RLS policies (migration 081)
For every tenant-scoped table (`tickets`, `comments`, `evidence`, `watcher_notifications`,
`major_incidents`, `customers`, `users`, `kb_articles`, …) add a policy of the form:

```sql
CREATE POLICY "authenticated tenant read" ON tickets FOR SELECT
  TO authenticated
  USING (
    auth.role() = 'service_role' OR
    tenant_id = current_setting('app.tenant_id', true)::text
        OR current_setting('app.tenant_id', true) IS NULL  -- cross-tenant roles
  );
```

Plus INSERT/UPDATE/DELETE variants matching the existing service-role-only intent. **Do not**
drop the service-role policies. Verify against the integration suite before proceeding.

### Step B — Add a request-scoped user-client factory (`server/supabase.ts`)
```ts
export function supabaseForUser(jwt: string) {
  return createClient(supabaseUrl, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
```
Keep the existing `supabase` (service) and `supabaseAuth` exports untouched.

### Step C — Add per-request context middleware (`server/middleware/tenantContext.ts`)
After `requireAuth`, read the tenant/partner scope from `req.user` (already populated by
`auth.ts`) and issue:
```sql
SELECT set_config('app.tenant_id', <scope>, false);
SELECT set_config('app.partner_org_id', <partnerScope>, false);
```
Mount it ahead of the API router. Cross-tenant roles set `app.tenant_id = NULL` so the
"IS NULL" branch of the policies grants access.

### Step D — Migrate repositories one at a time
Start with the read-most, highest-risk tables (`tickets`, `comments`, `evidence`). Each repo
gains an optional user-client parameter; routes pass the request-scoped client. Run the
integration suite after each. Service-role client remains the default so nothing breaks if a
caller is missed.

### Step E — Enforce (final)
Once all repos are migrated and green, flip the default: service-role client requires an
explicit opt-in (e.g. an `AdminRequest` marker), making user-JWT the path of least resistance.

## 5. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| A route misses the user client → service role still works but RLS not enforced | Integration suite asserts tenant isolation directly (user A cannot read user B's tickets) |
| `set_config` per request adds latency | Negligible (single round-trip, same connection pool); cache is per-request anyway |
| Cross-tenant roles (SUPER_ADMIN) break if GUC is wrong | `tenantScope` already returns `null` for them → middleware sets NULL → policy IS NULL branch |
| JWT expiry mid-request | Tokens are 12h (see `auth.ts`); refresh handled by existing `auth:expired` SSE flow |

## 6. Rollback
Each step is a separate, reversible commit. The service-role client is never removed, so any
step can be reverted by pointing repos back to `supabase`. RLS policies can be dropped
independently of application code.

## 7. Definition of done
- [ ] Migration 081 adds authenticated policies for all tenant-scoped tables
- [ ] `supabaseForUser()` factory + tenant-context middleware added
- [ ] Integration suite (`tests/*.test.ts`) passes against a disposable test project
- [ ] At least `tickets`/`comments`/`evidence` repos migrated and verified tenant-isolated
- [ ] No regression in the 50 existing unit tests
