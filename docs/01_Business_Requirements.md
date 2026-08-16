# Business Requirements Document (BRD)

## BR-1 Multi-tenant isolation
Business Units (BUs) are secure tenant boundaries. Every row that carries a `tenant_id` is query-scoped to the caller's tenant; SUPER_ADMIN/EXECUTIVE and `bu=ALL` accounts see across tenants. Partner accounts are scoped by partner organization FK (`users.partner_org_id → partner_organizations.id`), falling back to name matching only for pre-migration rows.

## BR-2 Partner accountability
Dedicated partner portals replace unmonitored email: partner reps work a scoped queue, collaborate via comments (never internal notes), and submit structured RCAs. A ticket cannot move INVESTIGATE → RESOLVED without a complete RCA (root cause, corrective actions, preventive actions, owner, due date).

## BR-3 Auditable accountability
Every status change, unmasking, escalation, merge, and lifecycle event appends to a hash-chained audit ledger (`audit_logs`), enforced immutable by a database trigger. The chain is independently verifiable via chunked verification.

## BR-4 Enforceable SLAs
Deadline computation is deterministic: category+priority rules (with priority fallback table), tenant business hours in the tenant's IANA timezone, holiday skips, and pause/resume during waiting states. Breach and at-risk alerts fire exactly once per episode (DB-enforced dedupe), with webhook fan-out.

## BR-5 Tiered internal operations
BU Support is tiered (L1/L2/L3) with strictly additive permissions — frontline handling at L1; escalation/merge/unmask/declare at L2; deletion/config/audit-write at L3. The legacy flat role retains the full set for migration safety.

## BR-6 Privacy and data protection
PII fields (customer email/phone, card PAN, submitter phone) are AES-256-GCM encrypted at rest with per-row IVs; masking applies per role in API responses; GDPR erasure requests null out PII while preserving the audit chain; data-retention cleanup is provided as a scheduled function.

## BR-7 Customer self-service (ISO 10002)
Customers file complaints against their BU, track status with customer-facing labels, and must supply a feedback score before a ticket closes.

## BR-8 Operational insight
Executives get live KPIs (SLA adherence, MTTR, FCR/RFT, CSAT, health score), partner scorecards, risk registers, and exportable PDF reports.
