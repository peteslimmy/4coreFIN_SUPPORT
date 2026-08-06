-- 4CoreFinSupport — Performance Indexes
-- Migration 015: Add critical indexes for multi-tenant queries and JSONB fields

-- ============================================================
-- TENANT-SCOPED INDEXES (Critical for RLS performance)
-- ============================================================

-- Tickets: tenant-scoped queries (most frequent)
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_created ON tickets(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_provider ON tickets(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_category ON tickets(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_priority ON tickets(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_assigned ON tickets(tenant_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_sla ON tickets(tenant_id, sla_deadline);

-- Audit logs: tenant-scoped chronological queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_ts ON audit_logs(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_ticket ON audit_logs(tenant_id, ticket_id);

-- Comments: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_comments_tenant ON comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_tenant_ticket ON comments(tenant_id, ticket_id);

-- Evidence: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_evidence_tenant ON evidence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant_ticket ON evidence(tenant_id, ticket_id);

-- Customers: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, email);

-- Notifications: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_watcher_notifications_tenant ON watcher_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_watcher_notifications_tenant_recipient ON watcher_notifications(tenant_id, recipient);

-- Major incidents: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_major_incidents_tenant ON major_incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_major_incidents_tenant_provider ON major_incidents(tenant_id, provider);

-- Users: tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users(tenant_id, role);

-- ============================================================
-- JSONB GIN INDEXES (for queryable JSON fields)
-- ============================================================

-- Tickets: rca_details, watchers, custom_fields
CREATE INDEX IF NOT EXISTS idx_tickets_rca_details_gin ON tickets USING GIN (rca_details);
CREATE INDEX IF NOT EXISTS idx_tickets_watchers_gin ON tickets USING GIN (watchers);
CREATE INDEX IF NOT EXISTS idx_tickets_custom_fields_gin ON tickets USING GIN (custom_fields);

-- Major incidents: timeline, notifications, pir
CREATE INDEX IF NOT EXISTS idx_major_incidents_timeline_gin ON major_incidents USING GIN (timeline);
CREATE INDEX IF NOT EXISTS idx_major_incidents_notifications_gin ON major_incidents USING GIN (notifications);
CREATE INDEX IF NOT EXISTS idx_major_incidents_pir_gin ON major_incidents USING GIN (pir);

-- Comments: seen_by
CREATE INDEX IF NOT EXISTS idx_comments_seen_by_gin ON comments USING GIN (seen_by);

-- KB articles: tags
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags_gin ON kb_articles USING GIN (tags);

-- ============================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================

-- Tickets: status + created_at (dashboard lists)
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets(status, created_at DESC) WHERE is_deleted = false;

-- Tickets: priority + sla_deadline (SLA breach queries)
CREATE INDEX IF NOT EXISTS idx_tickets_priority_sla ON tickets(priority, sla_deadline) WHERE is_deleted = false AND status NOT IN ('CLOSED', 'RESOLVED');

-- Tickets: business_unit + status (BU-scoped lists)
CREATE INDEX IF NOT EXISTS idx_tickets_bu_status ON tickets(business_unit, status) WHERE is_deleted = false;

-- Comments: ticket_id + timestamp (thread loading)
CREATE INDEX IF NOT EXISTS idx_comments_ticket_ts ON comments(ticket_id, timestamp DESC);

-- Audit logs: ticket_id + timestamp (ticket audit trail)
CREATE INDEX IF NOT EXISTS idx_audit_logs_ticket_ts ON audit_logs(ticket_id, timestamp DESC);

-- ============================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================

-- Verify all indexes created
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('tickets', 'comments', 'audit_logs', 'evidence', 'customers', 'watcher_notifications', 'major_incidents', 'users', 'kb_articles')
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- Check index usage (run after production load)
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY idx_scan DESC;