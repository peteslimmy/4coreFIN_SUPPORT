# Functional Requirements Document (FRD)
**Product:** 4CoreFinSupport — FinTech Incident Control & Payment Operations Intelligence
**Version:** 1.0
**Status:** Approved
**Sources:** Codebase at `ef783fd`, docs/03_Functional_Requirements.md, docs/07_RBAC_and_Permissions.md, docs/08_Workflows.md, docs/09_API_Specification.md, docs/12_SLA_and_Escalation.md, docs/11_Notification_Framework.md, docs/13_Compliance_and_Security.md

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Actor & Permission Model](#2-actor--permission-model)
3. [Ticket Lifecycle (FR-1)](#3-ticket-lifecycle-fr-1)
4. [Duplicate Detection & Merge (FR-2)](#4-duplicate-detection--merge-fr-2)
5. [Major Incident Management (FR-3)](#5-major-incident-management-fr-3)
6. [Comments & Collaboration (FR-4)](#6-comments--collaboration-fr-4)
7. [Evidence Management (FR-5)](#7-evidence-management-fr-5)
8. [Customer Feedback Loop (FR-6)](#8-customer-feedback-loop-fr-6)
9. [Notification Framework (FR-7)](#9-notification-framework-fr-7)
10. [Administration & Reference Data (FR-8)](#10-administration--reference-data-fr-8)
11. [Search & Filtering (FR-9)](#11-search--filtering-fr-9)
12. [Reporting & Analytics (FR-10)](#12-reporting--analytics-fr-10)
13. [SLA Engine (FR-11)](#13-sla-engine-fr-11)
14. [Tenant Isolation & Security (FR-12)](#14-tenant-isolation--security-fr-12)
15. [Authentication & Session (FR-13)](#15-authentication--session-fr-13)
16. [Configurable Business Unit Forms (FR-14)](#16-configurable-business-unit-forms-fr-14)
17. [Knowledge Base (FR-15)](#17-knowledge-base-fr-15)
18. [Customer Portal Self-Service (FR-16)](#18-customer-portal-self-service-fr-16)
19. [Payment Partner Portal (FR-17)](#19-payment-partner-portal-fr-17)
20. [Executive Oversight (FR-18)](#18-customer-portal-self-service)
21. [Audit & Compliance (FR-19)](#21-audit--compliance-fr-19)
22. [AI-Assisted Features (FR-20)](#22-ai-assisted-features-fr-20)
23. [Data Import/Export (FR-21)](#23-data-importexport-fr-21)
24. [Branding & White-label (FR-22)](#24-branding--white-label-fr-22)
25. [Real-Time Sync (FR-23)](#25-real-time-sync-fr-23)
26. [Non-Functional Requirements (NFR)](#26-non-functional-requirements-nfr)

---

## 1. System Overview

### 1.1 Purpose
4CoreFinSupport is a single system of record for payment-incident support. It manages the full lifecycle of payment disputes and operational incidents across internal Business Unit (BU) support teams, third-party payment partners, customers, and executive oversight.

### 1.2 Scope
- **In scope:** Complaint/incident intake, investigation, escalation, resolution, closure, SLA enforcement, partner collaboration, audit logging, executive reporting
- **Out of scope:** Payment processing, general-purpose helpdesk ticketing, partner-side internal tooling

### 1.3 Architecture Summary
- Frontend: React 19 + TypeScript SPA
- Server: Node.js + Express 4 REST API
- Data: Supabase (PostgreSQL) with server-side service-role access
- Identity: Supabase Auth (GoTrue) — sole identity provider
- Realtime: Server-Sent Events (SSE) over session cookie with exponential backoff
- AI: Google Gemini via server-side routes only (model allowlist, per-user budget, rate limits, prompt sanitization)

---

## 2. Actor & Permission Model

### 2.1 Roles
| ID | Label | Scope |
|---|---|---|
| SUPER_ADMIN | Super Administrator | Global — full platform access |
| EXECUTIVE | Executive | Global — read-only oversight |
| BU_SUPPORT_L1 | BU Support Level 1 | Tenant-scoped |
| BU_SUPPORT_L2 | BU Support Level 2 | Tenant-scoped + escalate/merge |
| BU_SUPPORT_L3 | BU Support Level 3 | Tenant-scoped + delete/config |
| BU_SUPPORT | Legacy BU Support | Full pre-tier set (migration safety) |
| PARTNER | Payment Partner | Partner-org scoped |
| CUSTOMER | End Customer | Own BU only |

### 2.2 Permission Groups (29 permissions)

**Tickets:** `tickets:view`, `tickets:create`, `tickets:edit`, `tickets:resolve`, `tickets:delete`, `tickets:escalate`, `tickets:merge`, `tickets:unmask`, `tickets:assign`

**Comments & Notifications:** `comments:view`, `comments:create`, `comments:internal`, `notifications:view`

**Operations:** `major-incidents:manage`, `major-incidents:declare`, `customers:manage`, `partner:rca`

**Oversight:** `audit:view`, `audit:write`, `audit:verify`, `reports:view`, `executive:dashboard`

**Administration:** `admin:config`, `admin:users`, `admin:forms`, `admin:access`, `admin:branding`, `admin:landing_page`, `admin:sla`, `users:view`

### 2.3 Enforcement Layers
1. Route middleware `requirePermission` (server-checked on every request)
2. Object-level `canAccessTicket` (pure module)
3. Query-level scoping in repository (`tenant_id` / `partner_org_id` filters)
4. RLS policies as backstop
5. DB CHECK/trigger invariants for enum + transition legality

---

## 3. Ticket Lifecycle (FR-1)

### 3.1 States
| State | Description |
|---|---|
| RECEIPT | Ticket just created, unassigned |
| ASSIGNED | Agent assigned, not yet started |
| INVESTIGATE | Active investigation in progress |
| WAITING_CUSTOMER | Paused waiting on customer input |
| WAITING_PARTNER | Paused waiting on partner input |
| WAITING_INTERNAL | Paused waiting on internal dependency |
| RESOLVED | Resolution reached, RCA submitted |
| CLOSED | Ticket closed after customer feedback |

### 3.2 Transitions
| From | To | Event | Required Role | Guards |
|---|---|---|---|---|
| RECEIPT | ASSIGNED | ASSIGNED | BU agents | — |
| ASSIGNED | INVESTIGATE | BEGIN_INVESTIGATION | BU + Partner | assignedAgentId set |
| INVESTIGATE | WAITING_CUSTOMER | WAIT_CUSTOMER | BU agents | Starts SLA pause clock |
| INVESTIGATE | WAITING_PARTNER | WAIT_PARTNER | BU agents | Starts SLA pause clock |
| INVESTIGATE | WAITING_INTERNAL | WAIT_INTERNAL | BU agents | Starts SLA pause clock |
| WAITING_* | INVESTIGATE | *_REPLIED / INTERNAL_RESUMED | BU agents (+Partner for WAITING_PARTNER) | Accumulates pause span |
| INVESTIGATE | RESOLVED | RESOLVE | PARTNER | Full RCA required |
| RESOLVED | CLOSED | CLOSE | BU agents | Customer feedback score 1–5 required |
| RESOLVED | INVESTIGATE | REJECT_AND_REOPEN | BU agents | Auto-escalates, increment escalationCount |
| CLOSED | INVESTIGATE | REOPEN | BU agents | — |
| any active | CLOSED | MERGE_CLOSE | BU agents | Duplicate merge (also from WAITING_*) |

### 3.3 Enforcement
- Every API status change routes through `applyTransition` in `src/lib/ticketStateMachine.ts`
- Raw status writes are impossible via the API
- DB trigger (migration 046) enforces adjacency list for direct writers
- ISO 10002 compliance: feedback score gates RESOLVED → CLOSED

---

## 4. Duplicate Detection & Merge (FR-2)

| ID | Requirement |
|---|---|
| FR-2a | System detects duplicate tickets on create using heuristics: email + BU + amount + transaction ID similarity |
| FR-2b | Duplicate candidates surfaced to user at filing time; user confirms merge or files separately |
| FR-2c | `tickets:merge` permission required to mark ticket as `duplicateOf` another |
| FR-2d | Merge closes source ticket via MERGE_CLOSE while preserving full history of both tickets |
| FR-2e | Merged ticket inherits the higher-priority ticket's SLA and escalation state |
| FR-2f | `duplicateKey` field in form configs enables custom duplicate detection rules |

---

## 5. Major Incident Management (FR-3)

| ID | Requirement |
|---|---|
| FR-3a | Users with `major-incidents:declare` (L2+, partners, EXECUTIVE) can declare a Major Incident |
| FR-3b | Declaration form captures: name, description, partner, category (Duplicate Debit / Gateway Timeout / etc.), severity (CRITICAL/HIGH/MEDIUM/LOW), affected partners, affected BUs, impact, expected RTO, severity justification |
| FR-3c | Declaring auto-links selected tickets and upgrades their priority to CRITICAL |
| FR-3d | Major Incident lifecycle: DECLARED → INVESTIGATING → IDENTIFIED → MITIGATED → RESOLVED → CLOSED |
| FR-3e | Timeline: milestone entries with author, role, timestamp, message |
| FR-3f | Post-Incident Review (PIR) mandatory before CLOSED: root cause, impact assessment, preventive owner, due date |
| FR-3g | Emergency advisory broadcasts configurable per channel (Slack/Teams Webhook, Email) |
| FR-3h | Notification delivery logged; failed advisories can be re-sent |
| FR-3i | PIR documents stored immutably; version history maintained |

---

## 6. Comments & Collaboration (FR-4)

| ID | Requirement |
|---|---|
| FR-4a | Threaded comments per ticket with author, role, timestamp, message |
| FR-4b | Internal flag: `comments:internal` permission required |
| FR-4c | Partners and customers never see internal notes; internal-only rendering gated client AND server |
| FR-4d | Per-ticket seen-by receipts track which participants have read each comment |
| FR-4e | SSE broadcasts `comment_added` to live sessions |
| FR-4f | Comment authors can edit/delete within grace period |
| FR-4g | @mention autocomplete with user normalization`

---

## 7. Evidence Management (FR-5)

| ID | Requirement |
|---|---|
| FR-5a | File uploads per ticket with MIME-sniffing (magic bytes, not extensions) |
| FR-5b | Size-capped uploads (configurable per form field) |
| FR-5c | Rate-limited per user per ticket |
| FR-5d | Tenant-scoped storage; evidence cannot leak across tenants |
| FR-5e | Deletions are audited with actor + timestamp |
| FR-5f | Supported types: PDF, JPG, PNG, CSV, XLSX, XLS, DOC, DOCX |
| FR-5g | Image thumbnail previews for image evidence |
| FR-5h | Bulk upload with progress indication |

---

## 8. Customer Feedback Loop (FR-6)

| ID | Requirement |
|---|---|
| FR-6a | `PATCH /api/tickets/:id/feedback` accepts score 1–5 plus optional comment |
| FR-6b | Customers can only submit feedback on tickets in their own BU |
| FR-6c | CLOSE transition is blocked without a feedback score (ISO 10002 gate) |
| FR-6d | Feedback score feeds into CSAT metric on executive dashboard |
| FR-6e | Feedback submission is audited |
| FR-6f | Customer can reopen RESOLVED ticket by rejecting the resolution |

---

## 9. Notification Framework (FR-7)

| ID | Requirement |
|---|---|
| FR-7a | Watcher notifications on ticket state changes, comments, escalations |
| FR-7b | SLA at-risk and SLA breach alerts with deduplication (DB unique constraint) |
| FR-7c | SSE broadcast to live sessions; client auto-reconnects with exponential backoff (2s → 30s cap) |
| FR-7d | Configurable stage email routes (stage + recipient email per route) |
| FR-7e | Outbound webhooks: `ticket.updated`, `ticket.transitioned`, `sla.breach`, `sla.at_risk`, `comment_added`, `evidence_added`, `major_incident.updated`, `notification.created` |
| FR-7f | Webhook delivery log with retry; failed deliveries can be re-sent |
| FR-7g | In-app notification center with seen/unseen state |
| FR-7h | Email dispatch async via Nodemailer/SMTP with queue resilience |

---

## 10. Administration & Reference Data (FR-8)

| ID | Requirement |
|---|---|
| FR-8a | User CRUD: provision, activate/suspend, force password change, resend invite |
| FR-8b | Role-permission matrix editor in admin UI (29 permissions, additive tiers) |
| FR-8c | Reference tables: SLA rules, holidays, ticket templates, KB articles — atomic full-table replace via `replace_table_rows` RPC |
| FR-8d | Per-tenant business hours (day-of-week open/close, IANA timezone) |
| FR-8e | Business unit management with codes, tenant derivation |
| FR-8f | Payment partner management with referential integrity checks (cannot delete partner with active tickets) |
| FR-8g | Category CRUD with SLA hours association |
| FR-8h | Saved replies for common ticket responses |
| FR-8i | Escalation rule definitions (condition → level → target → action) |
| FR-8j | Notification config: stage + email per stage |
| FR-8k | Admin can view all tenants' data (global scope); BU agents scoped to their tenant |

---

## 11. Search & Filtering (FR-9)

| ID | Requirement |
|---|---|
| FR-9a | Ticket list filters: status, priority, BU, partner, category, assignee |
| FR-9b | Full-text search over: customer name, description, ticket ID |
| FR-9c | Pagination: `limit`/`offset` with total count |
| FR-9d | Sortable columns (default: created_at desc) |
| FR-9e | Saved filter presets per user |
| FR-9f | Deep-linkable URL state: `/app/<tab>?ticket=<id>` |
| FR-9g | Command palette (Ctrl+K / Cmd+K) for global search |

---

## 12. Reporting & Analytics (FR-10)

| ID | Requirement |
|---|---|
| FR-10a | Executive dashboard with volume trends (tickets per period) |
| FR-10b | Payment partner SLA scorecard: SLA %, MTTR, Reopen %, CSAT |
| FR-10c | FCR (First Contact Resolution) rate |
| FR-10d | RFT (Right First Time) metric |
| FR-10e | Exposure by partner / BU / category |
| FR-10f | Risk register: BU × Partner heatmap for INCIDENTS and BREACHES |
| FR-10g | Audit health metric |
| FR-10h | Overall health score |
| FR-10i | PDF export of executive scorecard |
| FR-10j | CSV export of filtered ticket lists |

---

## 13. SLA Engine (FR-11)

| ID | Requirement |
|---|---|
| FR-11a | SLA deadline computed from: category + priority rule + business hours + holidays |
| FR-11b | Deadline pauses in WAITING_CUSTOMER, WAITING_PARTNER, WAITING_INTERNAL states |
| FR-11c | `sla_paused_ms` accumulates all pause spans; effective deadline = `sla_deadline + sla_paused_ms` |
| FR-11d | SLA monitor runs on interval (45s), checks open tickets via `openTicketsForSla` |
| FR-11e | At-risk detection: warns before deadline |
| FR-11f | Breach detection: fires breach event at deadline |
| FR-11g | SLA page pause/resume allowed by authorized users |
| FR-11h | Business hours per tenant (day-of-week, timezone-aware via IANA tz + Intl) |
| FR-11i | Holidays exclusion from SLA calculation |

---

## 14. Tenant Isolation & Security (FR-12)

| ID | Requirement |
|---|---|
| FR-12a | Every query scoped by `tenant_id` for BU roles |
| FR-12b | Partner accounts scoped by `partner_org_id` FK (migration 044) |
| FR-12c | Object-level `canAccessTicket` double-checks scope |
| FR-12d | RLS policies as database backstop |
| FR-12e | PII encrypted at rest (AES-256-GCM): customerEmail, customerPhone, cardPan, submittedByPhone |
| FR-12f | PII masked in transit for unauthorized roles via `applyTicketMasking` |
| FR-12g | Unmasking requires `tickets:unmask` permission + audit entry |
| FR-12h | Soft deletes standard; GDPR erasure (`anonymize_ticket_pii`) hard-anonymizes while preserving chain |

---

## 15. Authentication & Session (FR-13)

| ID | Requirement |
|---|---|
| FR-13a | Supabase Auth (GoTrue JWT) is sole identity provider |
| FR-13b | HttpOnly session cookie (12h); CSRF token via separate cookie (`4c_csrf`) |
| FR-13c | State-changing requests require X-CSRF-Token header |
| FR-13d | 401 responses dispatch `auth:expired` event → client clears state → redirects to login |
| FR-13e | Session restore on refresh via `/api/me` when session cookie present |
| FR-13f | Force password change gates new provisioning; `mustChangePassword` blocks non-auth pages |
| FR-13g | Dev-only role-switch perspective in header |

---

## 16. Configurable Business Unit Forms (FR-14)

| ID | Requirement |
|---|---|
| FR-14a | Per-BU form configuration: fields, order, visibility, validation |
| FR-14b | Field types: text, number, currency, select, date, textarea, file |
| FR-14c | Duplicate key detection per field |
| FR-14d | Conditional display: `showIf` rules |
| FR-14e | Field validation: min, max, pattern, custom message |
| FR-14f | Atomic full-table replace for form configs |
| FR-14g | CSV/XLSX import for bulk field seeding |
| FR-14h | Copy to All BUs admin action |
| FR-14i | Reset to default config per BU |

---

## 17. Knowledge Base (FR-15)

| ID | Requirement |
|---|---|
| FR-15a | KB articles with: title, category, partner, content, tags, lastUpdated |
| FR-15b | Categories: Playbook, Resolution, General |
| FR-15c | Publish, edit, delete by authorized roles (global or BU support) |
| FR-15d | Search by keyword, filter by category and partner |
| FR-15e | Article content injected into active ticket response draft |
| FR-15f | Access-controlled: global roles and BU support roles only |

---

## 18. Customer Portal Self-Service (FR-16)

| ID | Requirement |
|---|---|
| FR-16a | Public-facing complaint filing form per BU (configurable fields) |
| FR-16b | Duplicate detection at filing time |
| FR-16c | Evidence upload (images, PDFs) |
| FR-16d | Transaction ID lookup to check for existing tickets before filing |
| FR-16e | Customer record lookup by email or name |
| FR-16f | Customer can link/unlink from existing customer record |
| FR-16g | Internal observation mode (no customer on file) |
| FR-16h | Customer-facing status labels: Receipt, Assigned, In Review, Waiting on You, With Payment Partner, Decision Made, Closed |
| FR-16i | Customer can submit feedback (1–5) on RESOLVED tickets |
| FR-16j | Customer can view own ticket history |

---

## 19. Payment Partner Portal (FR-17)

| ID | Requirement |
|---|---|
| FR-17a | Partner-scoped view: only tickets assigned to their partner organization |
| FR-17b | Partner can add comments (visible to BU + customer where appropriate) |
| FR-17c | Partner can submit Root Cause Analysis (RCA) — required before RESOLVED |
| FR-17d | Partner can view ticket history and evidence |
| FR-17e | Partner cannot see BU-internal notes or other partners' tickets |
| FR-17f | Active investigations count displayed |
| FR-17g | Partner receives notifications on ticket updates |

---

## 20. Executive Oversight (FR-18)

| ID | Requirement |
|---|---|
| FR-18a | Executive dashboard: KPI cards with sparklines (volume, SLA %, MTTR, CSAT) |
| FR-18b | Payment Partner SLA Scorecard table (SLA %, Active, MTTR, Reopen, CSAT, Status) |
| FR-18c | Exposure metrics by partner, BU, and category |
| FR-18d | Risk register: BU × Partner heatmap |
| FR-18e | Audit health indicator |
| FR-18f | FCR / RFT / health score calculations |
| FR-18g | PDF export of executive scorecard |
| FR-18h | Read-only — no write actions |

---

## 21. Audit & Compliance (FR-19)

| ID | Requirement |
|---|---|
| FR-19a | Append-only audit ledger with hash-chaining (SHA-256) |
| FR-19b | Audit entries for: every state transition, PII unmask, config change, user CRUD, login/logout, role switch |
| FR-19c | Chain verification: `audit:verify` recomputes full chain |
| FR-19d | 10-year retention target (GAID) |
| FR-19e | Soft deletes preserve audit chain; GDPR erasure anonymizes while preserving ledger |
| FR-19f | Tamper-evident: any break in chain is surfaced to user |

---

## 22. AI-Assisted Features (FR-20)

| ID | Requirement |
|---|---|
| FR-20a | AI chat: conversational assistant for agents (server-side Gemini only) |
| FR-20b | AI ticket analysis: auto-suggests category, priority, partner |
| FR-20c | AI Root Cause Analysis (RCA) draft generation |
| FR-20d | AI classification: maps description to category + subcategory |
| FR-20e | Per-user AI budget; rate limiting on server |
| FR-20f | Prompt sanitization before submission to model |
| FR-20g | Model allow-list enforced server-side |
| FR-20h | AI responses logged for compliance |

---

## 23. Data Import/Export (FR-21)

| ID | Requirement |
|---|---|
| FR-21a | CSV export of filtered ticket lists |
| FR-21b | PDF export of executive scorecard |
| FR-21c | Config table atomic full-table replace (JSON in `app_config`) |
| FR-21d | Form field CSV/XLSX import for bulk seeding |
| FR-21e | Browser cache backup/restore (offline mirror keys) |
| FR-21f | Image bulk upload for landing page |

---

## 24. Branding & White-label (FR-22)

| ID | Requirement |
|---|---|
| FR-22a | Organization name (browser + email) |
| FR-22b | Light/dark mode logo upload (separate files) |
| FR-22c | Favicon upload |
| FR-22d | Primary color picker (adapts UI via CSS variables) |
| FR-22e | Border radius customization |
| FR-22f | Landing page hero image management |
| FR-22g | Live preview of branding changes |
| FR-22h | Branding persisted in `app_config.settings` |

---

## 25. Real-Time Sync (FR-23)

| ID | Requirement |
|---|---|
| FR-23a | SSE connection: `/api/events` endpoint |
| FR-23b | Events: `ticket_updated`, `ticket_created`, `ticket_deleted`, `comment_added`, `evidence_added`, `notification_created`, `notification_read`, `sla_breach`, `sla_at_risk`, `major_incident_updated` |
| FR-23c | Client auto-reconnects with exponential backoff on disconnect |
| FR-23d | Periodic poll fallback every 45s for resilience |
| FR-23e | TanStack Query cache seeded from bootstrap payload |
| FR-23f | Optimistic local updates via React Query mutations |

---

## 26. Non-Functional Requirements (NFR)

| ID | Requirement |
|---|---|
| NFR-1 | Every mutating request carries double-submit CSRF token + same-origin check |
| NFR-2 | Sessions are httpOnly cookies (12h JWT); forced password change gates fresh provisioning |
| NFR-3 | Tenant isolation enforced at query level and object level; RLS backstop |
| NFR-4 | SLA computation deterministic and timezone-correct (IANA tz via Intl) |
| NFR-5 | List endpoints bounded (pagination or scoping); counting in SQL |
| NFR-6 | Static assets immutable-cached; SPA shell revalidated |
| NFR-7 | Accessibility: axe-core e2e suite, skip links, focus rings, ARIA labels |
| NFR-8 | Graceful SSE shutdown drains connections |
| NFR-9 | PII encrypted at rest (AES-256-GCM, per-row IV) |
| NFR-10 | Immutable audit ledger with 10-year retention target |
| NFR-11 | Responsive: mobile, tablet, desktop breakpoints |
| NFR-12 | Offline-capable SPA shell; server is source of truth |