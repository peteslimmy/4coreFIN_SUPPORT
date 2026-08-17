-- 4CoreFinSupport — PII encryption tolerance and key-availability fix
-- Migration 049: make SQL helpers tolerant when ENCRYPTION_KEY is absent,
-- and document that app-layer encryptionService.ts is the source of truth.
-- The 031 helpers are retained for ad-hoc backfill scripts only.

-- Safe key getter: returns NULL instead of throwing when ENCRETION_KEY is unset.
CREATE OR REPLACE FUNCTION get_encryption_key_safe() RETURNS bytea
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  raw TEXT;
BEGIN
  raw := current_setting('encryption_key', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::bytea;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Tolerant decrypt: returns '' on any failure (missing key, wrong format, etc.)
CREATE OR REPLACE FUNCTION decrypt_pii_field(cipher TEXT) RETURNS TEXT AS $$
DECLARE
  key bytea;
BEGIN
  IF cipher IS NULL OR cipher = '' THEN
    RETURN '';
  END IF;
  key := get_encryption_key_safe();
  IF key IS NULL THEN
    RETURN '';
  END IF;
  BEGIN
    RETURN pgp_sym_decrypt(cipher::bytea, key)::text;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN '';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tolerant encrypt: returns input unchanged on any failure (no key, bad input)
CREATE OR REPLACE FUNCTION encrypt_pii_field(plain TEXT) RETURNS TEXT AS $$
DECLARE
  key bytea;
BEGIN
  IF plain IS NULL OR plain = '' THEN
    RETURN '';
  END IF;
  key := get_encryption_key_safe();
  IF key IS NULL THEN
    RETURN plain;
  END IF;
  BEGIN
    RETURN encode(pgp_sym_encrypt(plain, key), 'hex');
  EXCEPTION
    WHEN OTHERS THEN
      RETURN plain;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_encryption_key_safe    IS 'Returns ENCRYPTION_KEY as bytea or NULL; never throws.';
COMMENT ON FUNCTION decrypt_pii_field          IS 'Tolerant decrypt — returns empty string on any error.';
COMMENT ON FUNCTION encrypt_pii_field          IS 'Tolerant encrypt — returns plaintext unchanged when key is absent/erring.';