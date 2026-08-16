# SLA Engine & Escalation Policies

Implementation: `src/lib/slaCalculator.ts` (shared), `server/slaJob.ts` (monitor), migrations 036/048.

## Deadline computation
1. **Resolve duration:** exact `(category, priority)` rule from `sla_rules`; otherwise the priority fallback table (CRITICAL 4h, HIGH 12h, MEDIUM 24h, LOW 48h). The resolved source (`rule`/`fallback`) is reported for auditability.
2. **Business hours (when configured):** only time inside `[open, close)` on Mon–Fri in the tenant's IANA timezone counts. Wall-clock math uses `Intl` (DST-safe); holidays (tenant-local dates) contribute no business time.
3. **No config → 24/7 + holiday cascade:** every hour counts; each distinct holiday inside the window extends the deadline by 24h exactly once (the applied-set guard prevents the historical infinite-loop when a holiday falls on the creation date).

## Pause/resume
Entering WAITING_CUSTOMER/PARTNER/INTERNAL stamps `sla_pause_started_at`; leaving folds the span into `sla_paused_ms`. **Effective deadline** = `sla_deadline + sla_paused_ms (+ ongoing pause)` (`effectiveSlaDeadline`). The monitor skips waiting tickets entirely.

## Priority changes
Priority escalation to CRITICAL requires `tickets:escalate`; any priority change recomputes the deadline from `createdAt` under the new priority.

## Breach & at-risk handling
Monitor sweep (60s default): at-risk threshold `max(25% × duration, 30min)`; breach requires `!isEscalated`. Alerts claim slots in `sla_notification_log` (exactly-once); breaches audit `SLA_BREACH_DETECTED`, broadcast `sla_breach`, and dispatch the `sla.breach` webhook. Manual re-run: `POST /api/sla/run-check` (`admin:sla`).

## Escalation model
- Manual: `tickets:escalate` sets `isEscalated` and increments `escalationCount` server-side (client-supplied counts are ignored).
- Automatic: REJECT_AND_REOPEN escalates; declaring a major incident escalates linked tickets and forces CRITICAL.

## Determinism & auditability
Pure functions, fixed inputs (createdAt, rules, holidays, business hours, tz) → reproducible deadlines; `SlaDeadlineInfo.source/rule` records why a duration was chosen; unit tests cover tz offsets (Lagos UTC+1, New York UTC-4), weekends, holidays, before/after-hours, and quota boundaries.
