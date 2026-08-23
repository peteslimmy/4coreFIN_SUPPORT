# Product Requirements Document (PRD)
**Product:** 4CoreFinSupport — FinTech Incident Control & Payment Operations Intelligence
**Version:** 1.0
**Status:** Approved
**Owner:** Product & Engineering
**Sources:** Codebase at `ef783fd`, docs/00_Product_Vision.md, docs/01_Business_Requirements.md, docs/02_PRD.md, docs/23_Product_Roadmap.md

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Market Context & Problem Statement](#2-market-context--problem-statement)
3. [Target Users & Personas](#3-target-users--personas)
4. [Value Proposition](#4-value-proposition)
5. [Feature Breakdown by Module](#5-feature-breakdown-by-module)
6. [Business Model & Economics](#6-business-model--economics)
7. [Success Metrics & KPIs](#7-success-metrics--kpis)
8. [Product Roadmap](#8-product-roadmap)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Go-to-Market Strategy](#10-go-to-market-strategy)
11. [Competitive Landscape](#11-competitive-landscape)

---

## 1. Executive Summary

**4CoreFinSupport** is a purpose-built SaaS platform that transforms how financial institutions manage payment-issue disputes across internal support teams and third-party payment partners. It replaces fragmented email threads, phone calls, and spreadsheets with a single, auditable system of record.

**Headline stat:** A single unresolved payment dispute now averages 4.2 touchpoints across 3 teams; without a shared system, that takes 8.6 days on average to resolve with zero accountability trail.

**Core thesis:** Organizations that enforce structured complaint handling (receipt → investigation → SLA → partner RCA → customer feedback → closure) resolve disputes 3× faster, reduce partner escalations by 60%, and pass ISO 10002 + NDPA audits without penalty.

**Who it serves:** BU Support Agents (L1/L2/L3), Payment Partner representatives, Customers (end users), Executives, Super Admins.

**Go-to-market:** Vertical SaaS — starting with payment-operations teams in Nigerian financial institutions, expanding to African fintechs and payment processors.

---

## 2. Market Context & Problem Statement

### 2.1 The Problem
Payment-issue support in African fintech runs on:
- **Email threads** — disputes die in inboxes
- **Spreadsheets** — no SLA enforcement, no audit trail
- **Phone calls** — decisions aren't recorded
- **WhatsApp/Slack** — compliance ghost, no ownership

Result: disputes drag on 5–15+ days, partners point fingers, regulators cannot verify resolution quality, and customers lose trust.

### 2.2 Market Drivers
- **Regulatory pressure:** CBN, NDPA 2023 require complaint handling frameworks and audit retention
- **Partner accountability:** Payment processors need documented RCA before releasing funds
- **Customer expectations:** Same-day acknowledgment, transparent status tracking
- **Operational scale:** Manual handling breaks at 200+ tickets/month per team

### 2.3 Competitive Landscape
| Competitor | Type | Gap vs 4CoreFinSupport |
|---|---|---|
| Zendesk / Freshdesk | General helpdesk | No payment-partner scoping, no SLA pause, no audit-chain |
| HubSpot Service Hub | CRM-adjacent | No multi-tenant partner isolation, no ISO 10002 gate |
| Jira Service Management | ITSM | No customer self-service portal, no payment-partner portal |
| Custom spreadsheets | Ad hoc | No real-time sync, no SLA enforcement, no RBAC |
| Intercom | Chat-first | No ticket lifecycle state machine, no PII encryption |

**Differentiator:** 4CoreFinSupport is the only platform with payment-partner foreign-key identity, ISO 10002 closure gate, hash-chained audit ledger, and SLA pause on waiting states.

---

## 3. Target Users & Personas

### 3.1 Persona Definitions

**Ada — BU Support L1 Agent**
- Role: First-line intake, triage, initial investigation
- Needs: Duplicate detection, fast ticket creation, clear SLA countdown, escalation hand-off
- Frustrations: Unclear ownership, partner tickets stuck in inbox, manual follow-up reminders

**Sarah — BU Support L3 Lead**
- Role: Escalation owner, complex case handler, config manager
- Needs: Merge duplicates, unmask PII when justified, approve RCA, manage FORM configs
- Frustrations: L1 tickets arriving half-formed, no visibility into partner queue, config changes not audited

**Marcus — Payment Partner Representative (Parkway, e.g.)**
- Role: Owns partner-side resolution
- Needs: Scoped ticket queue, RCA submission, internal + BU communication, no cross-partner leakage
- Frustrations: Blind to BU internal discussions, unclear RCA requirements, duplicate tickets across BUs

**Elena — Executive Sponsor**
- Role: Oversight, compliance, strategy
- Needs: SLA scorecards, partner health trends, audit verification, PDF exports for board
- Frustrations: No live dashboards, manual report generation, can't verify audit integrity

**Chidinma — Customer (End User)**
- Role: Files complaints, tracks resolution, submits feedback
- Needs: Simple form, evidence upload, transparent status, feedback submission
- Frustrations: No acknowledgement of receipt, no status visibility, long resolution times

**Obi — Super Administrator**
- Role: Platform owner
- Needs: User CRUD, role editor, reference data, branding, webhooks, system health
- Frustrations: No audit of config changes, hard to onboard new BUs, stale onboarding tour

---

## 4. Value Proposition

### 4.1 For BU Support Teams
- **Speed:** Duplicate detection, AI triage, and form auto-population cut intake time by 50%
- **Accountability:** Hash-chained audit trail proves every action to regulators
- **Control:** SLA pause on waiting states prevents false breaches

### 4.2 For Payment Partners
- **Isolation:** Partner-org FK scope means partners see only their tickets — ever
- **Clarity:** RCA submission gates resolution, so partners know exactly what's required
- **Transparency:** Real-time ticket status, no email round-trips

### 4.3 For Executives
- **Confidence:** Live dashboards with verified SLA metrics and exportable PDF scorecards
- **Compliance:** One-click audit chain verification proves NDPA / ISO 10002 alignment

### 4.4 For Customers
- **Trust:** Confirmation of receipt, visible status, feedback loop
- **Access:** Self-service portal — no call-center dependency

### 4.5 For the Organization
- **Single source of truth:** One system. One audit trail. No spreadsheet reconciliation.
- **GDPR-ready:** PII encryption at rest, anonymization workflows, audit-preserving erasure
- **Extensible:** Webhooks, outbound notifications, API for downstream systems

---

## 5. Feature Breakdown by Module

### 5.1 Ticket Workspace
- Split-pane: ticket list + detail + activity pane
- Ticket CRUD with state machine enforcement
- Status, priority, category, partner, BU, amount, transaction ID fields
- Internal notes (permission-gated)
- Assignment + change tracking
- Customer linking (by email + BU)
- Evidence upload with drag-and-drop
- AI-assisted categorization, priority suggestion
- Duplicate detection on create
- Merge/close of duplicates
- SLA deadline display (countdown)
- SLA pause on waiting states

### 5.2 SLA Engine
- Category × priority rule table
- Business hours per tenant (day-of-week, IANA timezone)
- Holiday exclusion
- Pause/resume on waiting states
- At-risk warning
- Breach alert + audit entry
- ILSLA (inter-tenant SLA) for partner tickets
- SLA monitor (interval job, server-side)

### 5.3 Major Incidents
- Declare major incident from ticket or standalone
- Severity levels: CRITICAL, HIGH, MEDIUM, LOW
- Link/unlink tickets (auto-CRITICAL on link)
- Timeline entries with author, role, timestamp
- PIR (Post-Incident Review) draft + finalize + sign-off
- Emergency advisory broadcast (Slack/Teams/Email)
- Notification delivery log

### 5.4 Customer Portal
- Public-facing complaint form (BU-scoped)
- Evidence upload (images, PDFs)
- Transaction ID lookup before filing
- Duplicate check at filing time
- Status labels (Receipt → Assigned → In Review → Waiting on You → With Payment Partner → Decision Made → Closed)
- Feedback submission (1–5 score + comment)
- Ticket history

### 5.5 Payment Partner Portal
- Partner-org scoped queue
- RCA submission workflow
- Comment threading
- Evidence viewing
- Active investigations count
- No cross-partner data leakage

### 5.6 Executive Dashboard
- KPI cards: Active Complaints, SLA %, MTTR, CSAT
- Partner SLA scorecard table
- Exposure by partner / BU / category
- Risk register (BU × Partner heatmap)
- FCR, RFT, health score
- PDF export

### 5.7 Knowledge Base
- Article CRUD (Playbook, Resolution, General categories)
- Partner-scoped articles
- Search + filter by category and partner
- Inject resolution into active ticket draft
- Article version history

### 5.8 Administration
- User CRUD (provision, activate/suspend, password reset, invite resend)
- Role-permission matrix editor (29 permissions, custom roles)
- Reference data: SLA rules, holidays, templates, KB articles, categories, BUs, partners, channels
- Business hours per tenant
- Saved replies
- Escalation rules
- Notification config
- Form config per BU (field types, validation, conditional display)
- Branding: logo, favicon, primary color, border radius
- Landing page image management

### 5.9 Audit & Compliance
- Hash-chained immutable ledger
- Chain verification
- Soft deletes + GDPR erasure (ticket PII anonymization)
- 10-year retention target
- Tamper-evident display

### 5.10 AI Features
- AI chatbot for agents (Gemini-powered)
- Ticket analysis (category, priority, partner suggestion)
- RCA draft generation
- Classification (description → category + subcategory)
- Per-user budget + rate limit
- Prompt sanitization

### 5.11 Real-Time Features
- SSE live updates: ticket changes, comments, notifications, SLA alerts
- Auto-reconnect with backoff
- 45-second poll fallback
- Browser notification integration

### 5.12 Security
- Supabase Auth (JWT, httpOnly cookies)
- CSRF protection (double-submit cookie pattern)
- CSP headers with per-request nonces
- Rate limiting (login, API)
- Account lockout after failed attempts
- PII encryption at rest (AES-256-GCM)
- PII masking in transit

---

## 6. Business Model & Economics

### 6.1 Pricing Model
- **Per-seat SaaS:** Tiered by role count + business units
  - Starter: up to 5 BUs, 20 users
  - Business: up to 20 BUs, 100 users
  - Enterprise: unlimited BUs, unlimited users, dedicated support
- **Add-on:** AI usage (per-query metered beyond included budget)
- **Add-on:** Webhook delivery volume

### 6.2 Unit Economics
- CAC: Direct sales + fintech community
- LTV: Multi-year contracts with annual renewal
- Gross margin target: >80% (cloud infrastructure is primary COGS)

### 6.3 Expansion Strategy
- Phase 1 (now): Single-tenant per-instance, Nigerian market
- Phase 2: Multi-tenant SaaS, pan-African
- Phase 3: Partner-facing white-label

---

## 7. Success Metrics & KPIs

### 7.1 Product Metrics
| Metric | Target | Measurement |
|---|---|---|
| Average resolution time | < 3 days | Ticket created → CLOSED |
| First contact resolution rate | > 60% | Resolved without escalation |
| SLA on-time rate | > 95% | Breaches / open tickets |
| Partner RCA response time | < 4 hours | Ticket → WAITING_PARTNER → RCA received |
| Duplicate detection rate | > 85% | Similar tickets flagged on create |
| Customer CSAT | > 4.0 / 5 | Average feedback score |
| Audit verification pass rate | 100% | Chain verification success |
| NDPR compliance incidents | 0 | PII leakage / access violations |

### 7.2 Business Metrics
| Metric | Target |
|---|---|
| ARR | $X (tbd) |
| Monthly active users | Growing 15% MoM |
| Net revenue retention | > 110% |
| Customer acquisition cost (CAC) | < $X |
| Lifetime value (LTV) | > 3× CAC |

### 7.3 Technical Metrics
| Metric | Target |
|---|---|
| P99 API latency | < 300ms |
| SSE reconnect time | < 5s |
| Uptime | > 99.5% |
| CSAT scorecard | A+ |

---

## 8. Product Roadmap

### 8.1 Shipped (Current)
- Multi-tenant isolation
- Tiered RBAC
- ISO 10002 closure gate
- SLA pause/resume
- Hash-chained audit ledger
- Live executive dashboards
- Outbound webhooks
- GDPR erasure workflow
- Form config per BU
- Knowledge base
- Customer portal
- Partner portal
- Real-time sync (SSE)
- AI chat + analysis + classification
- PDF scorecard export

### 8.2 Next (Q2)
- Advanced SLA analytics (trend detection, predictive breach)
- Bulk ticket actions (mass assign, mass close)
- Advanced reporting: custom dashboard builder
- Mobile app (React Native)
- SSO / SAML support
- Advanced webhook templates

### 8.3 Future (Q3+)
- Multi-language support
- Advanced AI: auto-RCA generation, sentiment analysis
- Marketplace integrations (Slack, Microsoft Teams, Salesforce)
- Advanced RBAC (attribute-based access control)
- Compliance reporting packs (regulator-ready PDFs)

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Partner adoption resistance | Medium | High | Co-design with partners; pilot with 2 partners before launch |
| PII compliance failure | Low | Critical | AES-256-GCM at rest; RLS; audit; quarterly penetration testing |
| SLA fairness disputes | Medium | High | Deterministic math; timezone-aware; pause on waiting states; audit trail |
| RBAC complexity | Medium | Medium | Permission matrix UI; additive tiers; default deny |
| AI hallucination in RCA | Medium | Medium | Human-in-the-loop; prompt templates; logged AI output for audit |
| Data migration (onboarding) | Low | Medium | SQL seed scripts; validation; dry-run mode |

---

## 10. Go-to-Market Strategy

### 10.1 Launch Sequence
1. **Pilot (current):** Internal ops team at 4Core
2. **Beta:** 2–3 payment partners + 3 BUs
3. **GA:** Full Nigerian market launch
4. **Expansion:** Pan-African fintechs

### 10.2 Positioning
"4CoreFinSupport is the only platform where your support team, payment partners, and customers share one compliant system of record — with judgment-proof audit trails."

### 10.3 Channels
- Direct sales (executive outreach to CFO/CTO)
- Partner referral (payment processors recommending to their connected merchants)
- Content: compliance whitepapers, ISO 10002 playbooks, NDPR guides

---

## 11. Competitive Landscape

| Dimension | 4CoreFinSupport | Zendesk | Jira | Custom Spreadsheet |
|---|---|---|---|---|
| Payment partner isolation | ✅ native | ❌ | ❌ | ❌ |
| SLA pause on waiting | ✅ | ❌ | ❌ | ❌ |
| Hash-chained audit | ✅ | ❌ | ❌ | ❌ |
| ISO 10002 gate | ✅ | ❌ | ❌ | ❌ |
| PII encryption at rest | ✅ AES-256-GCM | ❌ shared | ❌ | ❌ |
| Multi-tenant RBAC | ✅ 8 roles | ✅ | ✅ | ❌ |
| Real-time SSE | ✅ | ❌ | ❌ | ❌ |
| Partner self-service | ✅ | ❌ | ❌ | ❌ |
| Executive scorecard | ✅ PDF export | add-on | ❌ | ❌ |
| Configurable per-BU forms | ✅ | ❌ | ❌ | ❌ |