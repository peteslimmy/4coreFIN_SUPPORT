# Product Requirements Document (PRD)

## 1. Primary users
Customers, BU Support (L1/L2/L3), Payment Partner representatives, Executives, Super Admins.

## 2. Personas & jobs
- **Ada (BU L1 agent):** intake during peak volume; needs duplicate detection, AI triage, fast hand-off upward.
- **Sarah (BU L3 lead):** owns escalations; merges duplicates, unmasks PII when justified, closes with feedback.
- **Marcus (Partner rep, Parkway):** answers a queue of tickets waiting on his org; submits RCAs that gate resolution.
- **Elena (Executive):** reads dashboards, verifies audit chain, exports compliance reports.
- **Chidinma (Customer):** files a complaint with evidence, tracks progress, scores the resolution.

## 3. Core user journeys
1. **Intake:** BU agent (or customer) files ticket → customer auto-linked by (email, BU) → duplicate check → SLA deadline computed → audit TICKET_CREATED.
2. **Investigation:** assign → investigate → request partner/customer input (waiting states pause SLA) → partner replies.
3. **Resolution:** partner/SUPER_ADMIN completes RCA → RESOLVED (state machine enforces RCA completeness).
4. **Closure:** customer feedback required → CLOSED; rejects reopen with escalation.
5. **Major incident:** L2+ declares, links tickets, tracks timeline + PIR.

## 4. Key product milestones (shipped)
- Multi-tenant workspace isolation (tenant scoping + RLS backstop).
- Tiered RBAC with additive permissions and a full permission matrix in the admin UI.
- ISO 10002 feedback gate before closure.
- Waiting-state SLA pause/resume.
- Hash-chained immutable audit ledger with verification.
- Live executive dashboards + PDF scorecard export.
- Outbound webhooks with delivery logging.
- GDPR erasure workflow.

## 5. Acceptance criteria highlights
- Any status change through the API passes the state machine (role + required fields + adjacency); the database additionally rejects illegal transitions via trigger.
- A partner can never read another partner's or another tenant's tickets (FK scoping at query level, double-checked object-level).
- Unmasking requires `tickets:unmask` and writes an audit entry.
- All list endpoints that grow unboundedly are paginated or scoped.

## 6. Non-functional requirements
Security (CSRF, CSP, rate limits, lockout, forced password change), auditability, deterministic SLA math, offline-free SPA with SSE live updates and reconnect, accessibility (axe-tested), responsive to mobile.

## 7. Out of scope
Money movement, partner-internal tooling, non-payment helpdesk use cases.
