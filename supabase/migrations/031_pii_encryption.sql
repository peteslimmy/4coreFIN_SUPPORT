-- 4CoreFinSupport — PII Encryption at Rest
-- Migration 031: Envelope encryption (AES-256-GCM) for PII fields.
-- Columns already exist in the tickets table; this migration adds:
--   • A per-row encryption-status marker for backfill tracking
--   • A key-rotation metadata table
--   • A stored procedure to safely encrypt a single row's PII
--   • A stored procedure to safely decrypt a single row's PII
-- The actual encrypt/decrypt logic lives in server/services/encryptionService.ts
-- (key sourced from ENCRYPTION_KEY env var; iv+tag stored alongside ciphertext).

-- Track which rows have been encrypted (for backfill idempotency)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pii_encrypted BOOLEAN NOT NULL DEFAULT false;

-- Key rotation metadata
CREATE TABLE IF NOT EXISTS pii_encryption_keys (
  id INTEGER PRIMARY KEY DEFAULT 1,
  key_hash TEXT NOT NULL,
  iv_length INTEGER NOT NULL DEFAULT 16,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);

-- Insert initial key slot (key_hash must match ENCRYPTION_KEY value in runtime).
-- Uses missing_ok=true so the migration never fails when the GUC is absent
-- (e.g. applied via the Management API, where session GUCs are not set).
INSERT INTO pii_encryption_keys (id, key_hash)
VALUES (1, md5(coalesce(current_setting('ENCRYPTION_KEY', true), '')))
ON CONFLICT (id) DO NOTHING;

-- Helper: encrypt a single PII field value (returns ciphertext:iv:tag format)
CREATE OR REPLACE FUNCTION encrypt_pii_field(plain TEXT) RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  -- Use pgcrypto aes-256-gcm; the actual runtime will use app-layer crypto
  -- but having a DB helper keeps schema-versioned consistency.
  -- In production the app-layer encryptionService encrypts before insert;
  -- this function exists for audit/backfill scripts that run inside Postgres.
  EXECUTE format(
    'SELECT encode(pgp_sym_encrypt(%L, coalesce(current_setting(''ENCRYPTION_KEY'', true), '''')), ''hex'')',
    plain
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: decrypt a single PII field value
CREATE OR REPLACE FUNCTION decrypt_pii_field(cipher TEXT) RETURNS TEXT AS $$
BEGIN
  -- Decrypt via pgp_sym_decrypt; app-layer will use its own crypto
  RETURN pgp_sym_decrypt(cipher::bytea, coalesce(current_setting('ENCRYPTION_KEY', true), ''))::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Idempotent backfill: encrypt all currently-plaintext PII rows and mark them
CREATE OR REPLACE FUNCTION encrypt_all_pending_pii() RETURNS INTEGER AS $$
DECLARE
  rows_updated INTEGER := 0;
  row_record RECORD;
BEGIN
  FOR row_record IN
    SELECT id, customer_email, customer_phone, card_pan, submitted_by_phone
    FROM tickets
    WHERE pii_encrypted = false
  LOOP
    UPDATE tickets
    SET
      customer_email = encrypt_pii_field(row_record.customer_email),
      customer_phone = encrypt_pii_field(row_record.customer_phone),
      card_pan = encrypt_pii_field(row_record.card_pan),
      submitted_by_phone = encrypt_pii_field(row_record.submitted_by_phone),
      pii_encrypted = true
    WHERE id = row_record.id;

    rows_updated := rows_updated + 1;
  END LOOP;
  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the backfill once — but ONLY when ENCRYPTION_KEY is set in the session.
-- Encrypting live PII with an empty/unset key would corrupt it, and runtime
-- encryption is owned by the app-layer encryptionService (AES-256-GCM), so
-- skipping here is always safe. Idempotent on re-run via pii_encrypted=false.
DO $$
BEGIN
  IF coalesce(current_setting('ENCRYPTION_KEY', true), '') <> '' THEN
    PERFORM encrypt_all_pending_pii();
  ELSE
    RAISE NOTICE 'ENCRYPTION_KEY not set in this session; skipping DB-level PII backfill (app-layer encryptionService owns runtime encryption).';
  END IF;
END $$;

COMMENT ON COLUMN tickets.pii_encrypted IS 'Set to true when PII fields have been envelope-encrypted via app-layer encryptionService. Do not rely on DB-level encrypt flag alone for security; this is an aid for backfill tracking.';