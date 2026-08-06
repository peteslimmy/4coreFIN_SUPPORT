-- Add missing indexes for query performance

-- Audit logs: query by ticket_id
CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit_logs(ticket_id);

-- Watcher notifications: query by ticket_id
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON watcher_notifications(ticket_id);

-- Tickets: query by assigned_agent_id (provider lookups)
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(assigned_agent_id);

-- Tickets: query by customer_email (customer lookups)
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email);

-- Add missing foreign key constraints

-- watcher_notifications.ticket_id -> tickets.id
ALTER TABLE watcher_notifications
  ADD CONSTRAINT fk_notifications_ticket
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- comments.parent_comment_id -> comments.id (self-referencing)
ALTER TABLE comments
  ADD CONSTRAINT fk_comments_parent
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE SET NULL;

-- tickets.major_incident_id -> major_incidents.id
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_major_incident
  FOREIGN KEY (major_incident_id) REFERENCES major_incidents(id) ON DELETE SET NULL;

-- Add UNIQUE constraint on customers.email
ALTER TABLE customers
  ADD CONSTRAINT uq_customers_email UNIQUE (email);

-- Add CHECK constraints for domain columns
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('SUPER_ADMIN', 'BU_SUPPORT', 'PROVIDER', 'EXECUTIVE', 'PARTNER'));
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_priority CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'));
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status CHECK (status IN ('RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED'));
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_submitted_by CHECK (submitted_by IN ('BU_SUPPORT', 'PARTNER'));
