-- 4CoreFinSupport — Fix stale CHECK constraints
-- Migration 040: Align database CHECK constraints with the actual application
-- enum values used by the ticket state machine and RBAC system.
--
-- Problem: Migration 003 created constraints that only allowed the original
-- 5 ticket statuses and 5 user roles. Since then, 3 waiting statuses
-- (WAITING_CUSTOMER, WAITING_PARTNER, WAITING_INTERNAL) and 4 new roles
-- (BU_SUPPORT_L1, BU_SUPPORT_L2, BU_SUPPORT_L3, CUSTOMER) were added to
-- the application but never to the database constraints. Any INSERT/UPDATE
-- with these values would fail at the DB level.

-- 1. tickets.status — add WAITING_* statuses
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_status;
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_status CHECK (
  status IN (
    'RECEIPT',
    'ASSIGNED',
    'INVESTIGATE',
    'RESOLVED',
    'CLOSED',
    'WAITING_CUSTOMER',
    'WAITING_PARTNER',
    'WAITING_INTERNAL'
  )
);

-- 2. users.role — add BU_SUPPORT_L1/L2/L3, CUSTOMER; remove legacy PROVIDER
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (
  role IN (
    'SUPER_ADMIN',
    'EXECUTIVE',
    'BU_SUPPORT',
    'BU_SUPPORT_L1',
    'BU_SUPPORT_L2',
    'BU_SUPPORT_L3',
    'PARTNER',
    'CUSTOMER'
  )
);

-- 3. tickets.submitted_by — add CUSTOMER as valid submitter
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_tickets_submitted_by;
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_submitted_by CHECK (
  submitted_by IN ('BU_SUPPORT', 'PARTNER', 'CUSTOMER')
);

-- 4. major_incidents.severity — enforce known values
ALTER TABLE major_incidents DROP CONSTRAINT IF EXISTS chk_mi_severity;
ALTER TABLE major_incidents ADD CONSTRAINT chk_mi_severity CHECK (
  severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
);

-- 5. major_incidents.status — enforce known values
ALTER TABLE major_incidents DROP CONSTRAINT IF EXISTS chk_mi_status;
ALTER TABLE major_incidents ADD CONSTRAINT chk_mi_status CHECK (
  status IN ('INVESTIGATING', 'IDENTIFIED', 'MITIGATED', 'RESOLVED', 'CLOSED')
);
