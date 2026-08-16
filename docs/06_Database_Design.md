# Database Design

PostgreSQL (Supabase). Migrations live in `supabase/migrations/` and are applied in numbered order.

## Core tables
| Table | Purpose | Key columns / constraints |
|---|---|---|
| users | App principals | `auth_user_id` FK → auth.users, `role` CHECK (8 roles), `tenant_id` FK, `partner_org_id` FK (044), lockout columns, `must_change_password` |
| tenants | BU tenants | `id` deterministic (`tnt-<BU>`), `business_units[]` |
| partner_organizations | Partner identities | `id SERIAL`, unique-ish `name`, tier/status |
| tickets | Master incident | `tenant_id` FK, `partner` + `partner_org_id`, status CHECK (8 states), priority CHECK, `sla_deadline`, `sla_paused_ms`, `sla_pause_started_at` (048), PII columns encrypted, `duplicate_of`, JSONB watchers/rca/custom fields |
| customers | End customers | `UNIQUE(email, business_unit)` per BU, `total_tickets` |
| comments | Collaboration | FK ticket CASCADE, `is_internal`, seen_by JSONB |
| evidence | Attachments | FK ticket CASCADE, MIME/size metadata, URL |
| major_incidents | Incident command | severity/status CHECKs (040), timeline/PIR JSONB |
| audit_logs | Immutable ledger | hash chain (`previous_hash`/`hash`), immutability trigger (020), tenant-scoped |
| watcher_notifications | Alerts | recipient, seen |
| sla_notification_log | Alert dedupe | `UNIQUE(kind, ticket_id, recipient)` (047) |
| sla_rules / holidays / ticket_templates / kb_articles | Reference data | replaced atomically via `replace_table_rows` RPC (045) |
| app_config | Key-value config | JSONB values (roles, BUs, channels, forms...) |
| business_hours | Per-tenant schedule | `UNIQUE(tenant_id, day_of_week)`, IANA tz (036) |
| webhooks / webhook_deliveries | Outbound integrations | delivery attempts log (038/039) |
| erasure_requests | GDPR workflow | status lifecycle (037) |
| idempotency_keys | API idempotency | cached responses (016) |

## Database-enforced invariants (selected)
- Ticket status adjacency list — trigger `tickets_status_transition_guard` (046).
- Role/priority/status/severity enumerations — CHECK constraints (003, fixed in 040).
- Customer uniqueness per BU — UNIQUE(email, business_unit).
- Audit immutability — BEFORE UPDATE/DELETE trigger raises (020).
- SLA alert exactly-once per episode — unique constraint (047).
- Referential integrity — FKs with explicit cascade/set-null behavior (003/014).

## Notes
- PII columns (`customer_email`, `customer_phone`, `card_pan`, `submitted_by_phone`) hold AES-256-GCM ciphertext (`iv:tag:cipher`); plaintext equality matching is impossible by design — customer linkage uses `customer_id`.
- Deterministic `tenant_id_for_bu()` SQL function mirrors `server/tenant.ts`.
- Partitioning scaffold and retention cleanup exist (019/021) for future volume.
