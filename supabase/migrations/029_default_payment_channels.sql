-- 4CoreFinSupport — Default payment channels initialization.
--
-- Initializes default payment channels in the app_config table.
-- Idempotent.

INSERT INTO app_config (key, value)
VALUES ('paymentChannels', '["POS", "Web", "Mobile App", "USSD", "API"]'::jsonb)
ON CONFLICT (key) DO NOTHING;