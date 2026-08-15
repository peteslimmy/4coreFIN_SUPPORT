# QA Test Data Register

Regulation: all test records use `QA_TEST_<YYYYMMDD_HHMMSS>_<n>` naming and are tracked here for cleanup.

| ID | Timestamp | Environment | Object Type | ID / Identifier | Purpose | Status | Cleaned Up |
|---|---|---|---|---|---|---|---|
| QA_REG_01 | 2026-08-15T20:00Z | live Supabase | user | `qa_test_20260815_201550@4coreqa.local` / `QA_TEST_USR_20260815_201550` / GoTrue `c987cdeb-9bb9-4158-b7d6-169d14387b15` | SUPER_ADMIN QA account used to drive all critical tests | KEPT until final sign-off (per cleanup policy) | NO (intentional) |
| QA_REG_02 | 2026-08-15 | live Supabase | user | `qa_partner_1786821730046@4coreqa.local` / `usr-1786821730414-4gn34` | First-run partner (is_active=false) — SEC-18 discovery | CLEANED 2026-08-15 | YES |
| QA_REG_03 | 2026-08-15 | live Supabase | user | `qa_partner_1786821855258@4coreqa.local` / `usr-1786821855637-f0szy` | Partner activated for SEC-18 run #1 | CLEANED 2026-08-15 | YES |
| QA_REG_04 | 2026-08-15 | live Supabase | user | `qa_bu_1786821861974@4coreqa.local` / `usr-1786821862348-1r0r1` | BU_SUPPORT (is_active=false) run #1 | CLEANED 2026-08-15 | YES |
| QA_REG_05 | 2026-08-15 | live Supabase | user | `qa_partner2_1786824908145@4coreqa.local` / `usr-1786824908550-oredr` | Partner — SEC-18 confirm run #2 | CLEANED 2026-08-15 | YES |
| QA_REG_06 | 2026-08-15 | live Supabase | user | `qa_bu_1786824910258@4coreqa.local` / `usr-1786824910610-yptqq` | BU_SUPPORT run #2 (never activated) | CLEANED 2026-08-15 | YES |
| QA_REG_07 | 2026-08-15 | live Supabase | user | `qa_partner2_1786824953177@4coreqa.local` / `usr-1786824953573-svd8u` | Partner — SEC-18 run #3 (bypass reproduced) | CLEANED 2026-08-15 | YES |
| QA_REG_08 | 2026-08-15 | live Supabase | user | `qa_bu_1786824955153@4coreqa.local` / `usr-1786824955549-6a37c` | BU_SUPPORT — SEC-21b isolation PASS | CLEANED 2026-08-15 | YES |
| QA_REG_09 | 2026-08-15 | live Supabase | ticket | `QA_TKT_1786824911886` | PII ticket POSSAP — run #2 | CLEANED 2026-08-15 | YES |
| QA_REG_10 | 2026-08-15 | live Supabase | ticket | `QA_TKT_OTHER_1786824923036` | Isolation ticket CORPORATE — run #2 | CLEANED 2026-08-15 | YES |
| QA_REG_11 | 2026-08-15 | live Supabase | ticket | `QA_TKT_1786824956974` | PII ticket POSSAP — SEC-18 run #3 | CLEANED 2026-08-15 | YES |
| QA_REG_12 | 2026-08-15 | live Supabase | ticket | `QA_TKT_OTHER_1786824968232` | Isolation ticket CORPORATE — run #3 | CLEANED 2026-08-15 | YES |
| QA_REG_13 | 2026-08-15 | live Supabase | customer | `cust-1786821857497-ka1dh` | Auto-created by QA ticket create | CLEANED 2026-08-15 | YES |
| QA_REG_14 | 2026-08-15 | live Supabase | customer | `cust-1786824912637-bmndd` | Auto-created (POSSAP PII) | CLEANED 2026-08-15 | YES |
| QA_REG_15 | 2026-08-15 | live Supabase | customer | `cust-1786824923761-k3vdj` | Auto-created (CORPORATE isolation) | CLEANED 2026-08-15 | YES |
| QA_REG_16 | 2026-08-15 | live Supabase | user | `qa_life_1786826737384.@4coreqa.local` / `usr-1786826737384-6z6cs` | SEC-38 lifecycle probe (created+deleted in-test) | CLEANED 2026-08-15 (deleted in test) | YES |

Cleanup policy: every record created must be deleted at end of test run and verified absent before reporting.

Cleanup verification (2026-08-15 20:47 UTC):
- `users` where email LIKE `*qa*` → only the retained SUPER_ADMIN QA account remains.
- `tickets` where id LIKE `QA*` → 0 remaining.
- `customers` — auto-created `cust-1786*` QA rows removed; only pre-existing seed customers remain (`cust-1786629533687-dstck`, `cust-1786629629579-4git1`).
- GoTrue identities for all 7 removed QA users deleted via Admin API (HTTP 200 each).

Audit chain note: audit_log is append-only by design (SHA-256 chain verified valid for 1000 entries
after cleanup at 20:47 UTC). QA-generated audit entries (event traces of QA activity) were deliberately
RETAINED — deleting them would break hash linkage and defeat the tamper-evidence guarantee. They remain
as legitimate records of the QA session.