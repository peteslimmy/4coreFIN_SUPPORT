# Product Roadmap

## Shipped (current)
- Multi-tenant isolation + partner-org FK scoping; tiered RBAC (L1/L2/L3) with additive permissions
- Full ticket lifecycle incl. WAITING_* states with SLA pause/resume; DB-enforced transition adjacency
- Timezone-correct business-hours SLA engine; exactly-once alerting; webhook fan-out
- Immutable hash-chained audit ledger + verification; PII encryption/masking; GDPR erasure
- Executive dashboards + PDF export; customer self-service portal; major-incident command
- AI triage/RCA/chat with budgets and sanitization

## Near term
1. Per-day business-hours granularity surfaced in the deadline math (table already supports it; config UI pending)
2. Escalation rules engine (time-based auto-escalation ladders) — data model present (`escalationRules`), scheduler pending
3. Saved replies / KB integrations in the partner portal composer
4. Export/search hardening: trigram index for ILIKE search, saved filters per user

## Mid term
5. Extract the SLA monitor/webhooks into a worker for multi-instance deployments
6. Bulk operations (mass assign/close) with per-item audit
7. Partner-facing SLA scorecards (self-view) and quarterly report packs
8. MFA enforcement (TOTP) for SUPER_ADMIN/high tiers (console-side; see doc 25 §6)

## Long term
9. Public REST API + API keys for partner system integration (table scaffold exists)
10. Data-warehouse export for cross-year GAID reporting
