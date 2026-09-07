# Incident Workflows & State Transitions

Authoritative implementation: `src/lib/ticketStateMachine.ts` (shared client/server) + DB trigger (migration 046).

## Lifecycle diagram
```
RECEIPT ──Assign──▶ ASSIGNED ──Start Investigation──▶ INVESTIGATE
                                                  │  ▲  ▲
                     Wait for Customer ───────────┘  │  └─ Partner/Customer/Internal replied
                     Wait for Partner  ──┐           │      (SLA paused while waiting)
                     Wait Internal      ──┴─▶ WAITING_*
INVESTIGATE ──Resolve (RCA complete; PARTNER only)──▶ RESOLVED
RESOLVED ──Close (feedback required)──▶ CLOSED
RESOLVED ──Reject & Reopen (auto-escalate)──▶ INVESTIGATE
CLOSED ──Reopen──▶ INVESTIGATE
any active state ──Mark Merged (duplicateOf)──▶ CLOSED
```

## ISO 10002 gate
A ticket cannot move RESOLVED → CLOSED without a customer feedback score (`PATCH /tickets/:id/feedback`, 1–5). Rejecting a resolution reopens the case and auto-increments the escalation counter.

## SLA pause/resume
Entering any WAITING_* state stamps `sla_pause_started_at`; leaving folds the elapsed span into `sla_paused_ms` and clears the clock. Effective deadline = `sla_deadline + sla_paused_ms (+ ongoing pause)`. The monitor excludes WAITING_* tickets entirely (`openTicketsForSla`).

## Assignment & escalation
Assignment sets `assignedAgentId` (BEGIN_INVESTIGATION requires it). Escalation (`tickets:escalate`) bumps `escalationCount` server-side; priority changes to CRITICAL recompute the SLA deadline; REJECT_AND_REOPEN auto-escalates.

## Major incident flow
Declare (L2+/partner) → tickets auto-linked and CRITICAL-escalated → timeline entries + initial notification → status lifecycle (INVESTIGATING → IDENTIFIED → MITIGATED → RESOLVED → CLOSED) → PIR drafted and completed.

## Customer portal flow
File complaint (BU-scoped form) → evidence upload → customer-facing status labels (Receipt/Assigned/In Review/Waiting on You/With Payment Partner/Decision Made/Closed) → feedback submission gates closure.
