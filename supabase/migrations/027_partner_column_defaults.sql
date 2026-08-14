-- 4CoreFinSupport — Partner column defaults.
--
-- tickets.partner / major_incidents.partner / ticket_templates.partner /
-- kb_articles.partner are NOT NULL but the app can legitimately create a row
-- without a partner (e.g. a BU complaint). Provide a safe default so those
-- writes never violate the constraint. Idempotent.

ALTER TABLE tickets ALTER COLUMN partner SET DEFAULT '';
ALTER TABLE major_incidents ALTER COLUMN partner SET DEFAULT '';
ALTER TABLE ticket_templates ALTER COLUMN partner SET DEFAULT '';
ALTER TABLE kb_articles ALTER COLUMN partner SET DEFAULT '';