# User Journey Map
**Product:** 4CoreFinSupport — FinTech Incident Control & Payment Operations Intelligence

---

## Persona Index
| # | Persona | Role | Primary Goal |
|---|---|---|---|
| P1 | Ada | BU Support L1 | Intake and triage complaints fast |
| P2 | Sarah | BU Support L3 | Own escalations, close complex cases |
| P3 | Marcus | Payment Partner Rep | Resolve partner-assigned tickets |
| P4 | Elena | Executive | Verifying SLA health and audit integrity |
| P5 | Chidinma | Customer | Get her payment issue resolved |
| P6 | Obi | Super Admin | Keep the platform running and compliant |

---

## JOURNEY 1 — Ada (BU_L1): Intake & First Response
**Scenario:** New customer complaint arrives via phone call

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Ada receives call: customer Chidinma says "my NIP debit was duplicated" | — | Phone | Customer name, amount, bank, terminal ID |
| 2 | Ada opens 4CoreFinSupport, clicks "New Ticket" | Slider form opens (step 1: Customer Identity) | CustomerPortalPage / TicketWorkspace | — |
| 3 | Ada searches for Chidinma by email | System shows match: totalTickets=3 | Customer lookup dropdown | customers table, email |
| 4 | Ada clicks Chidinma's record | Customer record linked; form pre-fills name/email/phone | Form Step 2 | CustomerRecord |
| 5 | Ada fills transaction ID, amount, partner (Parkway), category (Duplicate Debit), description | System checks duplicate (same email + BU + amount + transaction ID within 30 days) | Form Step 3 | tickets, duplicateDetection |
| 6 | No duplicate found. Ada proceeds. | SLA deadline computed: category=Duplicate Debit, priority=HIGH, BU=POSSAP → 4 business hours | Form Step 4 | slaRules, businessHours, holidays |
| 7 | Ada uploads screenshot evidence (2 PNGs) | Files validated: MIME check, size check, rate limit | Drag-and-drop zone | evidence table, file store |
| 8 | Ada submits ticket | System: TICKET_CREATED audit entry, ticket created in RECEIPT state, Ada linked as assignedAgent, SSE broadcast to relevant users | Ticket detail view | tickets, auditLogs |
| 9 | Ada acknowledges SLA countdown | SLA clock starts; at-risk warning at 75% of deadline | Ticket header | slaDeadline, slaPausedMs |
| 10 | Ada flags to L2 (Sarah) via comment | Internal comment created; partner and customer hidden | ActivityPane | comments |
| 11 | Ada sets ticket status to WAITING_CUSTOMER | SLA pause starts; timestamp recorded in sla_pause_started_at | Status dropdown | tickets.status, slaPausedMs |

**Emotional arc:** Alert (customer is upset) → Focused (intake form) → Confident (duplicate check passed) → Relieved (evidence uploaded) → Alert again (SLA ticking)

---

## JOURNEY 2 — Sarah (BU_L3): Escalation & Resolution
**Scenario:** Complex duplicate cluster requiring merge and partner escalation

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Sarah gets notifyWatchers ping: Ada flagged 3 duplicate tickets | Notifications panel shows — | WatcherNotificationsPage | watcherNotifications |
| 2 | Sarah opens ticket TKT-2024-0892 | Detail pane shows 3 linked duplicates, timeline, comments, evidence | TicketDetailPane | tickets.duplicateOf |
| 3 | Sarah opens Activity tab | Comments show Ada's internal note + 2 customer replies | TicketActivitySection | comments |
| 4 | Sarah merges TKT-0891 and TKT-0893 into TKT-0892 | System: tickets marked duplicateOf=0892, 0891/0893 → MERGE_CLOSE, full audit trail preserved | Merge confirmation modal | tickets, auditLogs |
| 5 | Sarah escalates to Parkway | Transition rule: INVESTIGATE → WAITING_PARTNER; SLA pause starts | Status dropdown + partner selector | tickets.status, slaPausedMs |
| 6 | System sends advisory to Parkway contact | Email dispatched; entry created in major incident notifications log | — | notificationConfigs, email service |
| 7 | 4 hours later: Marcus (Parkway) replies via partner portal | Comment appears in Sarah's panel; SLA clock not yet resumed | ActivityPane | comments (SSE) |
| 8 | Sarah reviews Marcus's response + evidence | Evidence pane shows attached root-cause analysis PDF | TicketDetailPane | evidence |
| 9 | Sarah verifies RCA completeness | RCA complete? Yes | Internal checklist | — |
| 10 | Sarah assigns ticket to Partner for resolution | Ticket routed to Partner queue | Status indicator | assignedAgentId |
| 11 | System requests customer feedback | Customer notification sent; feedback form available to Chidinma | Customer portal | notifications |
| 12 | Chidinma submits 4/5 feedback within 2 hours | System: RESOLVED → CLOSED transition unlocked | Feedback panel | tickets.feedbackScore, feedbackComment |
| 13 | Sarah closes ticket | Ticket → CLOSED; closure audit entry; watcher notified | Status dropdown → Close | tickets, auditLogs, watcherNotifications |

**Emotional arc:** Curious (3 related tickets) → Methodical (merge, preserve history) → Patient (waiting on partner) → Satisfied (RCA complete, ticket closed)

---

## JOURNEY 3 — Marcus (Partner): RCA Submission
**Scenario:** Marcus at Parkway receives escalation and must submit RCA before ticket can resolve

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Marcus logs into Partner Portal | Partner-scoped dashboard loads; tickets filtered by partner=Parkway | PaymentPartnerPortalPage | users.partnerOrgId |
| 2 | Marcus sees ticket TKT-2024-0892 in queue with "Action Required" badge | Active investigations count increments; SLA clock visible in ticket card | Ticket list | tickets |
| 3 | Marcus opens ticket | Detail view shows: customer complaint, Ada's investigation notes, Sarah's escalation note, evidence files | TicketDetailPane | tickets, comments, evidence |
| 4 | Marcus reviews SLA display | "Breach in 1h 45m" — red warning bar | Ticket header | slaDeadline, slaPausedMs |
| 5 | Marcus adds internal comment (Parkway team only) | Comment created; BU + customer cannot see it | ActivityPane | comments (isInternal flag) |
| 6 | Marcus navigates to Evidence tab | Existing evidence listed; no upload permission (read-only for evidence) | Evidence pane | evidence |
| 7 | Marcus submits RCA via status action | Form: Root Cause Summary (textarea), Impact Assessment, Preventive Owner, Due Date | RCA submit modal | pir table |
| 8 | System validates RCA completeness | All required fields filled → transition to RESOLVED enabled | Inline validation | ticketStateMachine |
| 9 | Marcus transitions ticket to RESOLVED | State machine: INVESTIGATE → RESOLVED (PARTNER role only, RCA required) | Status dropdown | ticketStateMachine |
| 10 | System sends closure notification to customer | Email + in-app notification | — | notifications, email service |

**Emotional arc:** Obligated (new ticket in queue) → Pressured (SLA ticking) → Collaborative (internal team comment) → Satisfied (RCA submitted, ticket resolved)

---

## JOURNEY 4 — Elena (Executive): Oversight & Compliance
**Scenario:** Monthly SLA and compliance review

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Elena logs in as EXECUTIVE | Executive perspective loads; KPI cards show aggregate data | ExecutiveDashboardPage | dashboard view |
| 2 | Reviews KPI cards | Active Complaints: 147, SLA on-time: 94.2%, Avg MTTR: 3.1h, CSAT: 4.1/5 | ExecutiveDashboardPage | executiveMetrics |
| 3 | Opens Payment Partner SLA Scorecard | Table: Parkway (SLA 91.2%, MTTR 2.8h, CSAT 4.3), Interswitch (SLA 97.8%, MTTR 2.1h, CSAT 4.5) | ExecutiveDashboardPage | PartnerMetricRow[] |
| 4 | Cross-filters scorecard by Q4 | Rows refresh; trend sparklines update | Scorecard filter | tickets, date range |
| 5 | Opens Risk Register tab | BU × Partner heatmap: POSSAP × Parkway = 3 incidents (amber); CORP × Interswitch = 0 (green) | ExecutiveDashboardPage heatmap | heatmapData |
| 6 | Opens Audit Logs | Audit log table with hash chain; clicks "Verify Chain" | AuditLogsPage | auditLogs |
| 7 | System runs chain verification | All hashes valid → green checkmark | Verification banner | computeAuditHash |
| 8 | Exports PDF scorecard | PDF generated: current month SLA + partner breakdown + risk matrix | Download action | jsPDF/report |
| 9 | Flags LOW-CSAT partner for review | Internal note added; no write to ticket (read-only) | Executive dashboard | — |

**Emotional arc:** Confident (KPI cards) → Analytical (scorecard drill-down) → Assured (audit chain verified) → Actionable (PDF exported for board meeting)

---

## JOURNEY 5 — Chidinma (Customer): Filing & Tracking
**Scenario:** NIP debit duplicated; Chidinma files complaint through self-service portal

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Chidinma opens 4CoreFinSupport landing page | Public-facing form visible (BU=POSSAP) | LandingPage + CustomerPortalPage | branding config |
| 2 | Clicks "File a Complaint" | Slider form opens: Step 1 — Customer | CustomerPortalPage | — |
| 3 | Searches by email: chidinma@example.com | Found: name, BU (POSSAP), 3 previous tickets | Customer lookup | customers |
| 4 | Confirms customer record | Record linked; name/email auto-completed | Form Step 2 | CustomerRecord |
| 5 | Enters: amount=₦45,000, partner=Parkway, transaction ID=TXN_942295, description="Double debit, money not returned" | Duplicate check: same email + BU + amount + transaction ID within 30 days → no match | Form Step 3 | duplicateDetection |
| 6 | Uploads bank statement screenshot | File accepted (MIME check, size OK) | Drag-and-drop | evidence |
| 7 | Submits ticket | Receipt number generated; page shows "Receipt" status | Confirmation screen | tickets (RECEIPT) |
| 8 | Returns later, checks status | Status shows "Assigned → In Review → With Payment Partner" | Customer view | tickets.status |
| 9 | Receives email: "Your ticket has been resolved" | In-app notification + email; status shows DECISION_MADE | Notification panel + customer portal | notifications, email |
| 10 | Submits feedback: 4 stars, "Fast resolution but no proactive update" | Feedback score recorded; ticket moves to CLOSED | Feedback form | tickets.feedbackScore |
| 11 | Receives closure confirmation | "Your complaint has been closed. Thank you." | Customer portal | tickets.status=CLOSED |

**Emotional arc:** Anxious (money missing) → Reassured (receipt generated) → Patient (waiting) → Satisfied (resolution) → Loyal (feedback submitted)

---

## JOURNEY 6 — Obi (Super Admin): Platform Governance
**Scenario:** Monthly user rotation, new BU onboarding, and brand refresh

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Obi logs in, switches to SUPER_ADMIN perspective | Admin dashboard loads; Reference Data tab visible | AdminSettingsPage | roles |
| 2 | Reviews user list — 23 active, 2 pending invites | Table with role tags, activation status, last login | UserAccountsManager | users |
| 3 | Activates 2 pending invitees (L1 agents for new BU) | Accounts activated; force-password-change flag set | User edit modal | users (activation) |
| 4 | Creates new BU: "RISK_MANAGEMENT" | BU added to businessUnits config; tenant derived | Business Units panel | businessUnits, tenants |
| 5 | Creates 3 BU-specific form fields for RM tickets | Form builder: adds "Risk Category" (select), "Regulatory Reference" (text), "Latency" (number) | TicketFormBuilder | buFormConfigs |
| 6 | Assigns 2 users to new BU | User edit: BU=RISK_MANAGEMENT, role=BU_SUPPORT_L1 | User edit modal | users |
| 7 | Updates branding: new primary color | Color picker sets theme.primary; live preview updates | BrandingSettings | app_config.settings |
| 8 | Tests new user onboarding | Opens incognito: new L1 agent sees RM form fields, correct BU | Login + dashboard | buFormConfigs |
| 9 | Checks audit log for brand change | Entry shows: Obi, timestamp, previous value, new value | AuditLogsPage | auditLogs |
| 10 | Verifies audit chain | Full chain valid; last 30 days checked | Audit verify | computeAuditHash |

**Emotional arc:** Methodical (user management) → Confident (BU configured) → Creative (brand refresh) → Assured (audit verified)

---

## JOURNEY 7 — Sarah (BU_L3): Major Incident Declaration
**Scenario:** System-wide NIP timeout at 14:02 affecting multiple BUs

| Step | Action | System Response | Screen | Data Involved |
|---|---|---|---|---|
| 1 | Sarah sees 7 CRITICAL tickets arrive in 3 minutes | Ticket list spikes with CRITICAL priority badges | TicketListPane | tickets (CRITICAL) |
| 2 | Sarah declares Major Incident | Modal: name ("NIP Gateway Timeout Storm"), partner="Parkway", severity=CRITICAL, affectedPartners=[Parkway, Interswitch] | Declare MI modal | majorIncidents |
| 3 | System auto-links 7 tickets and upgrades priority | All 7 tickets → majorIncidentId set, priority=CRITICAL, SLA recomputed | Ticket list color change | tickets, slaDeadline |
| 4 | Sarah posts initial timeline entry | "14:02 — Outage detected; 47 tickets impacted; INVESTIGATING" | Timeline panel | majorIncidents.timeline |
| 5 | System dispatches advisory to Yammer/Teams | Advisory logged; delivery status = SENT | Notification log | notificationConfigs, dispatchWebhook |
| 6 | Sarah monitors ticket count in real-time | New tickets stop at 9 after 10 minutes | Ticket list + SSE | SSE event: ticket_created |
| 7 | 90 minutes later: gateway restored | Sarah posts resolution timeline; transitions MI to RESOLVED | Timeline + status transition | majorIncidents.status |
| 8 | Sarah drafts PIR: root cause, impact, preventive owner, due date | Draft saved; editable until all fields complete | PIR panel | majorIncidents.pir |
| 9 | Preventive owner (Platform Integrity) confirms due date | PIR finalized; transition to CLOSED unlocked | PIR finalize | majorIncidents.pir |
| 10 | MI → CLOSED | All linked tickets audited; closure broadcast sent | MI detail view | majorIncidents, audit chain |

**Emotional arc:** Alarmed (spike in tickets) → Decisive (declare MI) → Coordinated (advisory sent) → Relieved (resolution) → Satisfied (PIR complete)

---

## Cross-Journey Pain Points & Opportunities

| Pain Point | Affected Personas | Opportunity |
|---|---|---|
| Duplicate filing at intake | Ada, Chidinma | Improve duplicate heuristic; show earlier in form |
| SLA ambiguity when waiting | Ada, Sarah, Marcus | Display "SLA paused" clearly with expected resume |
| Partner inbox blindness | Marcus | Partner notification digests (daily summary email) |
| Executive report generation | Elena | One-click scheduled PDF delivery |
| Admin onboarding friction | Obi | Pre-built onboarding checklist wizard |
| AI RCA quality | Sarah | Template-guided RCA + prompt librarian |
| Evidence upload on mobile | Chidinma | Mobile-optimized upload + camera capture |
| Notification fatigue | All | Configurable notification rules + digest mode |

---

## Acceptance Criteria per Journey

| Journey | Critical AC |
|---|---|
| Ada Intake | Ticket created within 90s (excluding evidence upload); SLA computed correctly; duplicate check runs before submit |
| Sarah Escalation | Merge preserves both ticket histories; SLA pauses correctly in WAITING_PARTNER; RESOLVED blocked until RCA complete |
| Marcus RCA | Partner sees only their tickets; RCA submit unlocks RESOLVED without partner needing L2 access |
| Elena Oversight | Dashboard loads < 2s; PDF export completes < 5s; audit chain verifies in < 3s for 10,000 entries |
| Chidinma Filing | Receipt acknowledged in < 30s; duplicate check completes < 1s; feedback submit transitions to CLOSED |
| Obi Admin | New user active in < 30s; brand change visible in next session; audit trail records with hash |
| Sarah MI | Declaration under 2 minutes; auto-link covers all CRITICAL tickets; advisory delivered within 60s |

---

## Functional Coverage Matrix

| Feature | Ada L1 | Sarah L3 | Marcus Partner | Elena Exec | Chidinma Cust | Obi Admin |
|---|---|---|---|---|---|---|
| Ticket CRUD | ✅ | ✅ | ✅ | — | ✅ (own) | — |
| Duplicate detection | ✅ | ✅ | — | — | ✅ (at create) | — |
| SLA management | ✅ View | ✅ Manage | ✅ View | ✅ View | — | ✅ Config |
| Partner collaboration | — | ✅ | ✅ | — | — | — |
| Major incidents | — | ✅ | ✅ | — | — | — |
| Customer feedback | — | — | — | — | ✅ Submit | — |
| Executive dashboard | — | — | — | ✅ | — | — |
| User management | — | — | — | — | — | ✅ |
| Branding | — | — | — | — | — | ✅ |
| Audit verification | — | — | — | ✅ | — | ✅ |
| AI chat | ✅ | ✅ | — | — | — | — |
| Knowledge base | ✅ | ✅ | — | ✅ | — | ✅ |
| Configurable forms | ✅ Uses | ✅ Edits | — | — | — | ✅ |
| Real-time updates | ✅ | ✅ | ✅ | ✅ | ✅ | — |