# 🔍 Comprehensive Codebase Audit — Findings Report

**Project:** 4CoreFinSupport  
**Date:** 2026-08-28  
**Branch:** `develop` (12 commits ahead of origin)  
**Status:** Phase 1 Complete

---

## Executive Summary

| Category | Status |
|----------|--------|
| **Tests** | ✅ 425/425 passing (46 test files) |
| **TypeScript** | ✅ 1 error (standalone test file only) |
| **ESLint** | ⚠️ Warnings only (0 errors, ~150 `no-explicit-any` warnings) |
| **Secrets** | 🔴 2 CRITICAL hardcoded credentials in source |
| **Security** | 🔴 2 HIGH + 6 MEDIUM architectural weaknesses |
| **Correctness** | 🔴 1 CRITICAL + 8 HIGH runtime bugs |
| **Git Hygiene** | ⚠️ 150+ modified files, 20+ untracked artifacts |

---

## 🔴 CRITICAL Findings (Fix Immediately)

### C1 — Hardcoded SMTP Password in Source Code
- **File:** `updatesmtp_mailersend.ts:21-22`
- **Secret:** MailerSend SMTP password `mssp.7MOIDRw.o65qngkwq73gwr12.VIBwZRM`
- **Also contains:** SMTP username `MS_Cs8jxG@test-2p0347z19oylzdrn.mlsender.net`
- **Fix:** Delete this file. Rotate the MailerSend API password immediately.

### C2 — Same SMTP Password in Fix Script
- **File:** `fix_smtp_encryption.ts:17`
- **Secret:** Same MailerSend password in plaintext
- **Fix:** Delete this file. The credential was already written to DB via this script.

### C3 — Merge Race Condition Causes Client/Server Divergence
- **File:** `src/pages/TicketWorkspacePage.tsx:244-251`
- **Bug:** `confirmMerge` fires `syncTicketDelete` and `syncTicketUpdate` as fire-and-forget promises (`.catch(...)`), then immediately updates local state. If sync fails, client shows merged tickets while server has partial state — no recovery path.
- **Fix:** `await` both sync calls before updating local state. Use `Promise.allSettled` for partial failure handling.

---

## 🔴 HIGH Findings (Fix Before Release)

### H1 — Change-Password Endpoint Lacks Password Strength Validation
- **File:** `server/routes/profile.ts:130-161`
- **Bug:** `POST /auth/change-password` accepts `newPassword` with no length/complexity check. User can set `newPassword: "a"`. The reset-password endpoint enforces 8+ chars with uppercase/lowercase/number/special, but change-password does not.
- **Fix:** Add Zod validation: `z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)`

### H2 — Search Route `.or()` Filter Injection
- **File:** `server/routes/search.ts:27,42,57`
- **Bug:** User input interpolated into `.or()` PostgREST filter strings. While `%` and `,` are escaped, `.` or `)` characters could break the filter syntax or enable injection.
- **Fix:** Validate `q` to only allow alphanumeric + space + limited punctuation, or use separate `.ilike()` queries.

### H3 — Stale Closure in `logAuditAction` Drops Audit Entries
- **File:** `src/context/TicketContext.tsx:106-113`
- **Bug:** `logAuditAction` captures `auditLogs` from closure. Rapid successive calls read stale snapshot, silently dropping audit entries.
- **Fix:** Use functional `setAuditLogs(prev => ...)`.

### H4 — Stale Closure in `notifyWatchers` Duplicates Notifications
- **File:** `src/context/TicketContext.tsx:116-136`
- **Bug:** `notifyWatchers` captures `watcherNotifications` from stale closure. Concurrent calls append duplicates.
- **Fix:** Use `setWatcherNotifications(prev => ...)`.

### H5 — Race Condition in `transitionTicket` — Double-Click Overwrites
- **File:** `src/context/TicketContext.tsx:146-181`
- **Bug:** Reads `tickets.find(t => t.id === ticketId)` from stale closure. Two rapid transitions on the same ticket may use pre-transition snapshot.
- **Fix:** Use functional `setTickets(ts => { ... })` and validate transition inside updater.

### H6 — Type Mismatch in Merge Creates `[object Object]` ticketId
- **File:** `src/pages/TicketWorkspacePage.tsx:228-229`
- **Bug:** `ticketId: target` passes a `TicketRecord` object where `string` is expected. Audit log gets `[object Object]` as ticketId.
- **Fix:** Change to `ticketId: target.id`.

### H7 — Lockout Race Condition (TOCTOU) Prevents Account Lock
- **File:** `server/services/lockoutService.ts:78`
- **Bug:** `recordFailedLogin` reads attempt count, computes new value, writes back. Under concurrent attacks, two requests both read `failed_login_attempts=4`, both compute `5`, neither sets `locked_until` because neither sees `>=5` at the right moment.
- **Fix:** Use atomic Supabase RPC or `UPDATE ... SET failed_login_attempts = failed_login_attempts + 1 WHERE ... RETURNING *`.

### H8 — SSE Subscription Tears Down on Every Ticket Mutation
- **File:** `src/context/AppContext.tsx:449`
- **Bug:** SSE effect depends on `[... ticket]` — the entire `ticket` object changes identity on every state mutation. SSE subscription is torn down and re-created constantly, causing gaps where live events are missed.
- **Fix:** Destructure only stable setter functions (`ticket.setTickets`, `ticket.setComments`) as dependencies.

### H9 — `useSettings` Fetch Loop from `dirtyKeys` Dependency
- **File:** `src/hooks/useSettings.ts:17-45`
- **Bug:** `fetchAdminSettings` has `dirtyKeys` in its deps. Every `updateSetting` call changes `dirtyKeys`, triggering re-fetch, which merges, clears `dirtyKeys`, triggers another fetch — infinite loop.
- **Fix:** Remove `dirtyKeys` from deps; use a ref inside the callback.

### H10 — Resolution Response Handler Is Dead Code
- **File:** `src/pages/ticket-workspace/TicketDetailView.tsx:128`
- **Bug:** `handleResolutionResponse` ignores the `accept` parameter entirely. "Accept" and "Reject" resolution buttons do nothing.
- **Fix:** Wire to `onResolutionResponse` from props.

---

## 🟠 MEDIUM Findings

### M1 — tokenVersion Cache Bypass
- **File:** `server/auth.ts:469-481`
- **Bug:** User-row cache (30s TTL) stores `tokenVersion`. Password change increments DB `tokenVersion` but cache still has old value — cached sessions valid for up to 30s after password change.
- **Fix:** Call `invalidateUserRow(id)` after password change (function exists at `server/lib/userCache.ts:64` but is never invoked).

### M2 — No JWT Rotation Strategy
- **File:** `server/auth.ts:14-17`
- **Bug:** JWT_SECRET validated at boot (32+ chars, non-repeating), but no key rotation. Compromised secret = all tokens valid until manual restart.
- **Fix:** Support `JWT_SECRET_PREVIOUS` env var, verify against both during grace period.

### M3 — BU_SUPPORT_L3 Can Read All Platform Config
- **File:** `server/rbac.ts:79-82`
- **Bug:** `BU_SUPPORT_L3` inherits `admin:config` permission, granting read access to all notification configs, form configs, etc.
- **Fix:** Split into `admin:config:read` and `admin:config:write`.

### M4 — Partner Portal Missing Guard on Empty Partner ID
- **File:** `server/routes/partnerPortal.ts:11`
- **Bug:** `partnerId()` uses `req.user.partner || req.user.bu` — returns empty string if both unset for PARTNER role.
- **Fix:** Return 400 if neither `partner` nor `bu` is set.

### M5 — Ticket Fields Have No Max Length
- **File:** `server/validation.ts:18-47`
- **Bug:** All ticket fields are `z.string().optional()` with no `.max()`. Could send 100MB description.
- **Fix:** Add `.max(10000)` to string fields.

### M6 — SVG Sanitization Uses Incomplete Deny-List
- **File:** `server/lib/svgSanitize.ts:12-35`
- **Bug:** Misses CSS-based attacks: `<style>` with `expression()`, `@import url('javascript:...')`, `<set>`/`<animate>` with `attributeName="href"`.
- **Fix:** Use DOMPurify with SVG namespace support.

### M7 — Evidence Upload Trusts Content-Type Header
- **File:** `server/routes/evidence.ts:110-113`
- **Bug:** For `text/plain`, `application/msword`, `.docx` — trusts declared Content-Type when magic number sniffing fails. Malicious HTML could be uploaded as `text/plain`.
- **Fix:** Verify `text/plain` content doesn't contain `<script>`, `<html>` markers.

### M8 — Encryption Key Has No Rotation Mechanism
- **File:** `server/services/encryptionService.ts:4-7`
- **Bug:** Single `ENCRYPTION_KEY` for all PII. No mechanism to re-encrypt with a new key.
- **Fix:** Support `ENCRYPTION_KEY_PREVIOUS` for decryption, run background re-encryption job.

### M9 — `TicketDetailView` Watcher Toggle Not Synced to Server
- **File:** `src/pages/ticket-workspace/TicketDetailView.tsx:92-101`
- **Bug:** `handleToggleWatch` updates local state and shows toast, but never calls `syncTicketUpdate`. Watcher change lost on page refresh.
- **Fix:** Add `void syncTicketUpdate(activeTicket.id, { watchers: updatedWatchers })`.

### M10 — RCA Form Submit Handler Is No-Op
- **File:** `src/pages/ticket-workspace/TicketDetailView.tsx:224`
- **Bug:** `onResolveSubmit={() => {}}` — the RCA form submit button does nothing.
- **Fix:** Change to `onResolveSubmit={onResolve}`.

---

## 🟡 LOW Findings

| # | File | Issue |
|---|------|-------|
| L1 | `server/auth.ts:158` | Bcrypt cost factor 10 (12 now recommended) |
| L2 | `server/routes/profile.ts:164` | Password reset rate limit per-IP, not per-email |
| L3 | `server.ts:198` | No rate limit on `/api/auth/logout` |
| L4 | `src/pages/ticket-workspace/TicketListPane.tsx:83` | `now` timer causes unnecessary full-list re-renders |
| L5 | `src/pages/ticket-workspace/TicketListPane.tsx:217` | `<select>` uses `defaultValue` — dropdown appears stuck after batch |
| L6 | `src/components/ui/animated-ai-chat.tsx:228` | setTimeout not tracked/cleared on unmount |
| L7 | `server/lib/promptSanitizer.ts:163` | `crypto` import at bottom of file (works but poor practice) |
| L8 | `server/applyMigration.ts:5,7` | Hardcoded Supabase project ref fallback |

---

## ✅ Positive Findings (Already Secure)

| Area | Status |
|------|--------|
| **AES-256-GCM encryption** | ✅ Correct implementation — random IV, auth tag, format validation |
| **Error handler** | ✅ No stack traces exposed to client |
| **ErrorBoundary** | ✅ Details only in DEV mode |
| **RLS policies** | ✅ Supabase RLS configured with role-based policies |
| **Rate limiting** | ✅ General (600/min), auth (20/15min), upload (60/min + concurrency gate) |
| **CSP headers** | ✅ Nonce-based, strict in production |
| **Test suite** | ✅ 425/425 tests passing |
| **`.env` gitignored** | ✅ Never tracked in git |
| **File upload limits** | ✅ 5MB (evidence/avatar/branding), 10MB (storage/landing) |
| **SVG sanitization** | ✅ Deny-list catches `<script>`, `on*`, `javascript:`, `foreignObject` |
| **Logging** | ✅ PII masked via `maskValue` in errors/logs |

---

## Git Hygiene Summary

### Untracked Artifacts to Clean
```
# Build/runtime artifacts (DELETE)
dev.err, dev.out, server.err, server.out, server2.err, server2.out, temp.cjs

# Standalone test scripts (DELETE or move to scripts/)
check_constraint.ts, fix_smtp_encryption.ts, getsmtp.ts, 
test_connection.ts, test_connection2.ts, test_one_setting.ts, 
test_schema_client.ts, test_simple.ts, testimport.ts,
update_from_email.ts, updatesmtp.ts, updatesmtp_mailersend.ts

# Logs (DELETE)
*.log, *.out

# Generated (gitignore)
storybook-static/
```

### Files to Add to `.gitignore`
```
*.err
*.out
storybook-static/
tokens/
```

---

## Prioritized Remediation Roadmap

### Phase 1 — Immediate (Today)
1. **Delete** `fix_smtp_encryption.ts`, `updatesmtp_mailersend.ts`, `update_from_email.ts` (C1, C2)
2. **Rotate** MailerSend SMTP password immediately (C1, C2)
3. **Fix** merge race condition — await sync calls (C3)
4. **Add** password validation to change-password endpoint (H1)

### Phase 2 — This Week
5. **Fix** search route injection (H2)
6. **Fix** all stale closure bugs in TicketContext (H3, H4, H5)
7. **Fix** merge type mismatch (H6)
8. **Fix** lockout TOCTOU race (H7)
9. **Fix** SSE subscription teardown (H8)
10. **Fix** useSettings fetch loop (H9)
11. **Fix** resolution response dead code (H10)
12. **Add** `invalidateUserRow` after password change (M1)
13. **Clean** untracked artifacts and update `.gitignore`

### Phase 3 — This Month
14. JWT rotation strategy (M2)
15. RBAC split for config read/write (M3)
16. Partner portal guard (M4)
17. Ticket field max lengths (M5)
18. SVG sanitization upgrade (M6)
19. Evidence upload Content-Type validation (M7)
20. Encryption key rotation (M8)

---

**Next step:** Shall I proceed with Phase 1 fixes (delete credential files, fix merge race condition, add password validation)?
