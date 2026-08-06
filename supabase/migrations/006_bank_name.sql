-- Persist bank name (or 'Undefined') on tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
