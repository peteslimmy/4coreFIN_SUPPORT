-- 4CoreFinSupport — Payment Provider custom reference kind.
--
-- Registers a user-created custom reference kind "Payment Provider" and
-- seeds its default list of providers. Idempotent.

INSERT INTO app_config (key, value)
VALUES (
  'customReferenceKinds',
  '[{"kind":"paymentProviders","label":"Payment Provider","labelPlural":"Payment Providers","description":"Payment providers supported for transaction enquiries and investigations","stringItems":true}]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value)
VALUES (
  'paymentProviders',
  '["Paystack","Flutterwave","Paga","MTN Mobile Money","Glo Mobile Money","Airtel Mobile Money","9mobile Money","Remita","OPay","PalmPay","Kuda Bank","Zenith Bank","GTBank","Access Bank","Moniepoint","Interswitch"]'::jsonb
)
ON CONFLICT (key) DO NOTHING;