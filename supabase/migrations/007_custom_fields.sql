-- Per-BU custom form data capture
-- custom_fields: JSON object of BU-specific form fields captured at submission
-- duplicate_of: reference to the ticket id this ticket is a confirmed duplicate of
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS duplicate_of TEXT DEFAULT NULL;
