# Backlog & Future Enhancements

## Technical debt (tracked, acceptable)
- `dexie` dependency remains in package.json though unused at runtime (removed from the bundle) — drop after lockfile coordination
- `tests/**` integration suite runs only where test-project credentials exist (CI) — local unit suite is the default gate
- Partner name string fallback for pre-migration accounts — remove once all partner users carry `partner_org_id`
- `_totalCount`-per-row pagination shape on `GET /tickets` — migrate consumers to the envelope, then drop the per-row stamp

## Candidate enhancements
- **Attachments on comments** (currently ticket-level evidence only)
- **Customer satisfaction surveys** beyond the 1–5 gate (CSAT/NPS campaigns)
- **Scheduled reports** (weekly partner scorecard e-mails)
- **Ticket templates gallery** in the customer portal
- **Real-time presence** (who is viewing a ticket) over the existing SSE hub
- **Audit log streaming export** (SIEM sink)
- **Localization** — the product is currently English-only; Intl plumbing is already in the SLA engine
- **Advanced duplicate clustering** (fuzzy matching across amounts/transactions)

## Rejected / out of scope
- Offline mutation replay (removed with the mirrors — server is the source of truth; revisit only with a product requirement)
- Microservices split (single-process Express + Postgres is appropriate at current scale)
- Client-side encryption of non-PII fields (no requirement; adds key-distribution complexity)
