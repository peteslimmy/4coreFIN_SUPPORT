-- 4CoreFinSupport — Notification preferences: per-channel details (FE-03)
-- The NotificationPreferencesPage manages six sections of granular settings
-- (general, email, sms, in-app, ticket, system) but notify.preferences only had
-- fixed channel-flag columns, so PUT silently dropped every granular key and
-- the page never persisted anything. This adds a namespaced JSONB store; the
-- page now writes { general, email, sms, inApp, ticket, system } objects here.

ALTER TABLE notify.preferences
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;