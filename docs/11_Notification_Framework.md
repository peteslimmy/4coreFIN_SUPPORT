# Notification Framework

## Channels
| Channel | Mechanism |
|---|---|
| In-app | `watcher_notifications` table → bell menu + notifications page (tenant-scoped) |
| Live push | SSE (`/api/events`) — tenant-scoped fan-out; client reconnects automatically |
| Email | `server/services/emailService.ts` + configurable stage routes (`notificationConfigs`) |
| Webhooks | Outbound dispatcher with signed delivery + `webhook_deliveries` log |

## Event catalog (selected)
- Ticket: `ticket.updated`, `ticket.transitioned`, `ticket.deleted`
- Collaboration: `comment_added`, `evidence_added`
- SLA: `sla.at_risk`, `sla.breach`, `sla_check_complete`
- Major incidents: `major_incident_updated`
- Audit: `audit_created`, `notification_created`

## SLA alerting semantics
The monitor runs every `SLA_CHECK_INTERVAL_MS` (default 60s):
- **At-risk:** effective deadline within `max(25% of SLA duration, 30min)`.
- **Breach:** effective deadline passed and not escalated.
- Recipients: stage-configured emails + ticket watchers + assigned partner ops address.
- **Exactly-once per episode:** `sla_notification_log` (`UNIQUE(kind, ticket_id, recipient)`, migration 047) claims alert slots atomically; rows pruned after 6h. Breach detection also writes one audit entry per ticket per episode.

## Watchers
Per-ticket watcher emails receive state-change notifications; adding/removing watchers is part of the ticket edit flow.
