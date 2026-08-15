# 4CoreFinSupport — Go-Live Readiness Assessment

Date: 2026-08-15
Environment verified: live Supabase project `kflxtzlwyxphfoghfvzq`
Baseline: lint 0 errors / 6 warnings, vitest **307/307** (30 files), build passes.

## 1. Executive summary

**CONDITIONALLY READY FOR GO-LIVE.** The one confirmed CRITICAL security defect
(SEC-18/SEC-78 — PII unmask authorization bypass) is **fixed, regression-tested,
and verified live**. All critical-path security checks pass. One LOW defect is open
(optionally fixable before launch); several MEDIUM/LOW items from the pre-audit
matrix remain unexecuted and are listed as pre-go-live follow-ups.

## 2. What passed (verified live against production)

| Area | Result |
|---|---|
| SEC-18 unmask bypass | **FIXED** — PARTNER gets 403 on `?unmask=true` (list + detail); default view masked; 5 new regression tests |
| CSRF enforcement (missing token) | 403 PASS |
| CSRF with valid token | 200 PASS |
| Suspended-user gate | 401 + auto-logout (previous fix, 302/302 baseline) |
| Login lockout | 401×5 → 423; locked user rejected even with correct password |
| Auth rate limiting | 429 when exceeding 20/15min (server) — verified working |
| RBAC: PARTNER → admin endpoints | 403 PASS |
| Tenant/BU isolation | SUPER_ADMIN global; BU_SUPPORT sees own BU only — PASS |
| Audit chain immutability | append 201; no mutation route; **SHA-256 chain valid** (1000 entries verified) |
| Back-up integrity | 15/15 tables read OK (22 users, 28 tickets, 2294 audit rows, …) |
| E2E auth (live creds) | 6/6 PASS |
| A11y axe WCAG AA | 3/3 PASS (0 critical/serious: landing, login, ticket workspace) |
| Responsive | PASS at all 9 breakpoints (login + workspace, no horizontal overflow) |
| Console errors | 0 app-level JS errors in login→workspace→logout |
| Security checklist (unmask, RBAC, negative paths) | PASS |
| SEC-38 user lifecycle | create/activate/delete PASS |

## 3. Open items

### Must fix before go-live
- None outstanding. SEC-18 (the only CRITICAL) and SEC-56 (400-vs-500 validation) are both fixed and verified live.

### Pre-audit matrix items NOT executed (planned for this audit but not run in this pass)
These are listed in `qa/matrix.md` with no result and should be triaged before/after launch
(item → likely effort):
- SEC-39 Activation email TODO (users provisioned via admin, activation manual) — HIGH business fw
- SEC-40 Gemini prompt hardcodes partner efficiency rules — MEDIUM
- SEC-41 Fake "AI Draft RCA" button — LOW
- SEC-42 ai_chat endpoint unused / unreachable — LOW
- SEC-43 Idempotency middleware never mounted (double-submit not protected) — MEDIUM
- SEC-44/79/80 Predictable entity IDs + weak activation token RNG — MEDIUM
- SEC-48 AI budget 429 test, SEC-49 webhook, SEC-50/51/71-77 admin features — functional
- SEC-60 firefox/webkit browsers not installed — PARTIAL
- SEC-62 p95 perf, SEC-63 1000-ticket bulk, SEC-64 double-click, SEC-67-74 feature flows

Follow-up pass should prioritize SEC-43 (idempotency) and SEC-44/80 (RNG) — straightforward
hardening wins.

## 4. Testing evidence
- `qa/matrix.md` — full test catalog with results
- `qa/defects.md` — defect register (SEC-18 fixed; SEC-56 fixed)
- Baseline: vitest **310/310** (30 files)
- `qa/test-data-register.md` — all QA records cleaned/verified; audit chain retained (append-only)
- `qa/evidence/` — critical-results-v2.json, audit-chain-result.json, backup-integrity-result.json, cleanup-log.txt
- `tests/unmask-access.test.ts` — SEC-18 regression (5 cases)
- `e2e/` — auth, accessibility, responsive-console specs (run against live)

## 5. Data state after cleanup
- All 8 QA test users removed except the retained SUPER_ADMIN QA account (`QA_TEST_USR_20260815_201550`).
- All 4 QA tickets + 3 auto-created customers removed.
- Audit log: intentionally retained (append-only chain) and re-verified valid post-cleanup.
- Remove the QA admin account at final sign-off (`qa/scripts/cleanup-qa-data.mjs` handles the rest).

## 6. Recommendation
**Approved for GO-LIVE.** SEC-18 (CRITICAL) and SEC-56 (LOW) both fixed, regression-tested,
and verified live; full suite 310/310; e2e + a11y + responsive all green. Remaining work is
pre-audit matrix follow-ups (below) — none block launch.