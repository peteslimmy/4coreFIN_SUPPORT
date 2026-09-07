# Functional Requirements Specification (FRD)

## FR-1 Ticket lifecycle (state machine)
States: RECEIPT, ASSIGNED, INVESTIGATE, WAITING_CUSTOMER, WAITING_PARTNER, WAITING_INTERNAL, RESOLVED, CLOSED.

| Transition | Event | Roles | Guards |
|---|---|---|---|
| RECEIPT→ASSIGNED | ASSIGNED | BU agents | — |
| ASSIGNED→INVESTIGATE | BEGIN_INVESTIGATION | BU + Partner | assignedAgentId set |
| INVESTIGATE→WAITING_CUSTOMER/PARTNER/INTERNAL | WAIT_* | BU agents | starts SLA pause clock |
| WAITING_*→INVESTIGATE | *_REPLIED / INTERNAL_RESUMED | BU agents (+Partner for WAITING_PARTNER) | accumulates pause span |
| INVESTIGATE→RESOLVED | RESOLVE | PARTNER | full RCA required |
| RESOLVED→CLOSED | CLOSE | BU agents | customer feedback score required |
| RESOLVED→INVESTIGATE | REJECT_AND_REOPEN | BU agents | auto-escalates |
| CLOSED→INVESTIGATE | REOPEN | BU agents | — |
| any active→CLOSED | MERGE_CLOSE | BU agents | duplicate merge (also from WAITING_*) |

Every status change through the API (fields `to` or `status`) routes through `applyTransition`; raw status writes are impossible via the API, and a DB trigger (migration 046) enforces the adjacency list for any direct writer.

## FR-2 Duplicate handling
Duplicate detection on create (email/BU/amount/transaction heuristics, `src/lib/duplicateDetection.ts`); `duplicateOf` marking requires `tickets:merge`; merges close the source via MERGE_CLOSE while preserving history.

## FR-3 Major incidents
Roles with `major-incidents:declare` (L2+, partners) can declare an incident (severity, partner, category), auto-link and CRITICAL-escalate tickets, and maintain a timeline plus post-incident review (PIR).

## FR-4 Comments
Threaded comments with an internal flag; `comments:internal` is required for internal notes; partners and customers never see internal notes; per-ticket seen-by receipts.

## FR-5 Evidence
MIME-sniffed uploads (magic bytes, not extensions), size-capped, rate-limited, tenant-scoped; deletions are audited.

## FR-6 Feedback loop (ISO 10002)
`PATCH /api/tickets/:id/feedback` accepts score 1–5 plus comment; customers are limited to their own BU tickets; the CLOSE transition is blocked without a score.

## FR-7 Notifications
Watcher notifications on state changes; SLA at-risk/breach alerts deduplicated by a database unique constraint; SSE broadcast to live sessions (client auto-reconnects with exponential backoff); configurable stage e-mail routes; outbound webhooks (`ticket.updated`, `ticket.transitioned`, `sla.breach`, ...) with a delivery log.

## FR-8 Administration & reference data
Users (provision, activate/suspend, forced password change), roles (permission-matrix editor), categories/SLA rules/holidays/templates/KB (atomic full-table replace via the `replace_table_rows` RPC), per-tenant business hours, branding, landing images, webhook endpoints.

## FR-9 Search & filtering
Ticket list filters (status, priority, BU, partner, text search over name/email/description/id) with pagination (`limit`/`offset` + total).

## FR-10 Reporting
Executive dashboards: volume trends, partner scorecards (SLA %, MTTR, CSAT), exposure by partner/BU/category, risk register, audit health, FCR/RFT/CSAT/health score; PDF export.
