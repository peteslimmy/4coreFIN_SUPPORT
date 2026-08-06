-- 4CoreFinSupport — Foreign Key Constraints
-- Migration 014: Add referential integrity constraints
-- Run after all data is clean (no orphaned rows)

-- First, verify no orphaned rows exist
-- These queries should return 0 rows before applying FKs

-- Check tickets.customer_id references valid customers
-- SELECT t.id, t.customer_id FROM tickets t
-- LEFT JOIN customers c ON t.customer_id = c.id
-- WHERE t.customer_id IS NOT NULL AND c.id IS NULL;

-- Check comments.ticket_id references valid tickets
-- SELECT c.id, c.ticket_id FROM comments c
-- LEFT JOIN tickets t ON c.ticket_id = t.id
-- WHERE t.id IS NULL;

-- Check evidence.ticket_id references valid tickets
-- SELECT e.id, e.ticket_id FROM evidence e
-- LEFT JOIN tickets t ON e.ticket_id = t.id
-- WHERE t.id IS NULL;

-- Check watcher_notifications.ticket_id references valid tickets
-- SELECT w.id, w.ticket_id FROM watcher_notifications w
-- LEFT JOIN tickets t ON w.ticket_id = t.id
-- WHERE t.id IS NULL;

-- ============================================================
-- APPLY FOREIGN KEY CONSTRAINTS
-- ============================================================

-- tickets → customers (SET NULL on customer delete)
ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- comments → tickets (CASCADE on ticket delete)
ALTER TABLE comments
  ADD CONSTRAINT fk_comments_ticket
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- evidence → tickets (CASCADE on ticket delete)
ALTER TABLE evidence
  ADD CONSTRAINT fk_evidence_ticket
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- watcher_notifications → tickets (CASCADE on ticket delete)
ALTER TABLE watcher_notifications
  ADD CONSTRAINT fk_notifications_ticket
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- major_incidents → tickets (provider linkage, no direct FK)
-- The relationship is via provider name, not ticket_id

-- Add index for FK performance (complements existing indexes)
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_evidence_ticket_id ON evidence(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket_id ON watcher_notifications(ticket_id);

-- Verify constraints are active
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid IN ('tickets'::regclass, 'comments'::regclass, 'evidence'::regclass, 'watcher_notifications'::regclass)
-- AND contype = 'f';