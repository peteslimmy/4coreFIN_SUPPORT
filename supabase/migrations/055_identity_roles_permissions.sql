-- 4CoreFinSupport — Identity domain: roles, permissions, role_permissions, user_roles
-- Migration 055: DB-driven RBAC with proper junction tables.
-- All operations are idempotent and forward-only.

CREATE SCHEMA IF NOT EXISTS identity;

-- Roles
CREATE TABLE IF NOT EXISTS identity.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  role_type   TEXT NOT NULL DEFAULT 'custom' CHECK (role_type IN ('system', 'custom')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_roles_name ON identity.roles (name);

-- Permissions
CREATE TABLE IF NOT EXISTS identity.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  resource    TEXT NOT NULL,
  action      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_permissions_code ON identity.permissions (code);

-- Role-Permission junction
CREATE TABLE IF NOT EXISTS identity.role_permissions (
  role_id       UUID NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES identity.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role junction (multi-role support)
CREATE TABLE IF NOT EXISTS identity.user_roles (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by TEXT REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

-- RLS
ALTER TABLE identity.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_roles_service_all' AND tablename = 'roles' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_roles_service_all" ON identity.roles FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_perms_service_all' AND tablename = 'permissions' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_perms_service_all" ON identity.permissions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_rp_service_all' AND tablename = 'role_permissions' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_rp_service_all" ON identity.role_permissions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_ur_service_all' AND tablename = 'user_roles' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_ur_service_all" ON identity.user_roles FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_roles_auth_read' AND tablename = 'roles' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_roles_auth_read" ON identity.roles FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_perms_auth_read' AND tablename = 'permissions' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_perms_auth_read" ON identity.permissions FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_rp_auth_read' AND tablename = 'role_permissions' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_rp_auth_read" ON identity.role_permissions FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'identity_ur_auth_read' AND tablename = 'user_roles' AND schemaname = 'identity') THEN
    CREATE POLICY "identity_ur_auth_read" ON identity.user_roles FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Seed default roles
INSERT INTO identity.roles (name, description, role_type) VALUES
  ('SUPER_ADMIN', 'Full system access', 'system'),
  ('BU_SUPPORT_L1', 'Level 1 BU support', 'system'),
  ('BU_SUPPORT_L2', 'Level 2 BU support', 'system'),
  ('BU_SUPPORT_L3', 'Level 3 BU support', 'system'),
  ('BU_SUPPORT', 'Legacy flat BU role', 'system'),
  ('EXECUTIVE', 'Executive dashboard access', 'system'),
  ('PARTNER', 'Payment partner access', 'system'),
  ('CUSTOMER', 'Customer portal access', 'system')
ON CONFLICT (name) DO NOTHING;

-- Seed permissions
INSERT INTO identity.permissions (code, resource, action) VALUES
  ('tickets:view', 'tickets', 'view'),
  ('tickets:create', 'tickets', 'create'),
  ('tickets:edit', 'tickets', 'edit'),
  ('tickets:resolve', 'tickets', 'resolve'),
  ('tickets:delete', 'tickets', 'delete'),
  ('tickets:escalate', 'tickets', 'escalate'),
  ('tickets:merge', 'tickets', 'merge'),
  ('tickets:unmask', 'tickets', 'unmask'),
  ('tickets:assign', 'tickets', 'assign'),
  ('comments:view', 'comments', 'view'),
  ('comments:create', 'comments', 'create'),
  ('comments:internal', 'comments', 'internal'),
  ('major-incidents:manage', 'major-incidents', 'manage'),
  ('major-incidents:declare', 'major-incidents', 'declare'),
  ('customers:manage', 'customers', 'manage'),
  ('notifications:view', 'notifications', 'view'),
  ('audit:view', 'audit', 'view'),
  ('audit:write', 'audit', 'write'),
  ('audit:verify', 'audit', 'verify'),
  ('reports:view', 'reports', 'view'),
  ('executive:dashboard', 'executive', 'dashboard'),
  ('partner:rca', 'partner', 'rca'),
  ('admin:config', 'admin', 'config'),
  ('admin:users', 'admin', 'users'),
  ('admin:forms', 'admin', 'forms'),
  ('admin:access', 'admin', 'access'),
  ('admin:branding', 'admin', 'branding'),
  ('admin:landing_page', 'admin', 'landing_page'),
  ('admin:sla', 'admin', 'sla'),
  ('users:view', 'users', 'view')
ON CONFLICT (code) DO NOTHING;

-- Link roles to permissions (mirrors DEFAULT_ROLES from rbac.ts)
-- SUPER_ADMIN gets all permissions via wildcard in code, but we seed a representative set
DO $$
DECLARE
  v_super UUID;
  v_l1 UUID;
  v_l2 UUID;
  v_l3 UUID;
  v_bu_legacy UUID;
  v_exec UUID;
  v_partner UUID;
  v_customer UUID;
  v_perm UUID;
BEGIN
  SELECT id INTO v_super FROM identity.roles WHERE name = 'SUPER_ADMIN';
  SELECT id INTO v_l1 FROM identity.roles WHERE name = 'BU_SUPPORT_L1';
  SELECT id INTO v_l2 FROM identity.roles WHERE name = 'BU_SUPPORT_L2';
  SELECT id INTO v_l3 FROM identity.roles WHERE name = 'BU_SUPPORT_L3';
  SELECT id INTO v_bu_legacy FROM identity.roles WHERE name = 'BU_SUPPORT';
  SELECT id INTO v_exec FROM identity.roles WHERE name = 'EXECUTIVE';
  SELECT id INTO v_partner FROM identity.roles WHERE name = 'PARTNER';
  SELECT id INTO v_customer FROM identity.roles WHERE name = 'CUSTOMER';

  -- BU_SUPPORT_L1 (base permissions)
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:view','tickets:create','tickets:edit','tickets:resolve','tickets:assign',
    'comments:view','comments:create','comments:internal',
    'major-incidents:manage','customers:manage','notifications:view',
    'audit:view','reports:view','users:view'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_l1, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;

  -- BU_SUPPORT_L2 (+ escalate, merge, unmask, declare)
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:escalate','tickets:merge','tickets:unmask','major-incidents:declare'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_l2, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;
  -- L2 inherits L1
  INSERT INTO identity.role_permissions (role_id, permission_id)
  SELECT v_l2, rp.permission_id FROM identity.role_permissions rp WHERE rp.role_id = v_l1
  ON CONFLICT DO NOTHING;

  -- BU_SUPPORT_L3 (+ delete, admin:config, audit:write)
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:delete','admin:config','audit:write'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_l3, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;
  -- L3 inherits L2
  INSERT INTO identity.role_permissions (role_id, permission_id)
  SELECT v_l3, rp.permission_id FROM identity.role_permissions rp WHERE rp.role_id = v_l2
  ON CONFLICT DO NOTHING;

  -- BU_SUPPORT (legacy) = L3 permissions
  INSERT INTO identity.role_permissions (role_id, permission_id)
  SELECT v_bu_legacy, rp.permission_id FROM identity.role_permissions rp WHERE rp.role_id = v_l3
  ON CONFLICT DO NOTHING;

  -- EXECUTIVE
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:view','tickets:unmask','comments:view','notifications:view',
    'audit:view','audit:verify','reports:view','executive:dashboard'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_exec, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;

  -- PARTNER
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:view','tickets:edit','comments:view','comments:create',
    'partner:rca','major-incidents:manage','major-incidents:declare'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_partner, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;

  -- CUSTOMER
  FOR v_perm IN SELECT id FROM identity.permissions WHERE code IN (
    'tickets:create','tickets:view','comments:view'
  ) LOOP
    INSERT INTO identity.role_permissions (role_id, permission_id) VALUES (v_customer, v_perm) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION identity.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_identity_roles_updated ON identity.roles;
CREATE TRIGGER trg_identity_roles_updated
  BEFORE UPDATE ON identity.roles
  FOR EACH ROW EXECUTE FUNCTION identity.update_updated_at();
