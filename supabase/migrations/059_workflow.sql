-- 4CoreFinSupport — Workflow domain
-- Migration 059: Formal workflow states, transitions, transition rules,
-- and ticket state history. Mirrors transitions from ticketStateMachine.ts.

CREATE SCHEMA IF NOT EXISTS workflow;

-- Workflow states
CREATE TABLE IF NOT EXISTS workflow.states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  terminal    BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workflow.states (code, name, terminal, active) VALUES
  ('RECEIPT', 'Receipt', false, true),
  ('ASSIGNED', 'Assigned', false, true),
  ('INVESTIGATE', 'Investigating', false, true),
  ('WAITING_CUSTOMER', 'Waiting Customer', false, true),
  ('WAITING_PARTNER', 'Waiting Partner', false, true),
  ('WAITING_INTERNAL', 'Waiting Internal', false, true),
  ('RESOLVED', 'Resolved', false, true),
  ('CLOSED', 'Closed', true, true)
ON CONFLICT (code) DO NOTHING;

-- Workflow transitions (adjacency list)
CREATE TABLE IF NOT EXISTS workflow.transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state_id   UUID NOT NULL REFERENCES workflow.states(id),
  to_state_id     UUID NOT NULL REFERENCES workflow.states(id),
  command_code    TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_state_id, command_code)
);

CREATE INDEX IF NOT EXISTS idx_wf_trans_from ON workflow.transitions (from_state_id);

-- Workflow transition rules (role-based authorization)
CREATE TABLE IF NOT EXISTS workflow.transition_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transition_id   UUID NOT NULL REFERENCES workflow.transitions(id) ON DELETE CASCADE,
  role_code       TEXT NOT NULL,
  requires_fields JSONB DEFAULT '[]',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transition_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_wf_rules_transition ON workflow.transition_rules (transition_id);
