-- 068_escalation_engine.sql
-- Escalation engine: notification dedup table + seed default rules

CREATE TABLE IF NOT EXISTS escalation_notification_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id    text NOT NULL,
  ticket_id  text NOT NULL,
  notified_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escalation_dedup
  ON escalation_notification_log (rule_id, ticket_id);

-- Seed 3 default escalation rules into app_config
INSERT INTO app_config (key, value)
VALUES (
  'escalationRules',
  '[
    {
      "id": "esc-p1-2h",
      "name": "Auto-escalate P1 after 2 hours",
      "condition": { "hoursFromCreation": 2, "priority": "CRITICAL" },
      "actions": [
        { "type": "notify", "target": "ops-team", "message": "CRITICAL ticket open > 2h — immediate attention required" }
      ]
    },
    {
      "id": "esc-p2-4h",
      "name": "Auto-escalate P2 after 4 hours",
      "condition": { "hoursFromCreation": 4, "priority": "HIGH" },
      "actions": [
        { "type": "notify", "target": "ops-team", "message": "HIGH ticket open > 4h — review needed" }
      ]
    },
    {
      "id": "esc-unassigned-1h",
      "name": "Notify on unassigned after 1 hour",
      "condition": { "hoursFromCreation": 1 },
      "actions": [
        { "type": "notify", "target": "ops-team", "message": "Ticket unassigned for > 1h — please assign" }
      ]
    }
  ]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
