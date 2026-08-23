-- Trigram (pg_trgm) GIN indexes for global search.
--
-- GET /api/search issues leading-wildcard ILIKE queries (`%term%`) across
-- tickets, customers, kb_articles and documents.document_registry. B-tree
-- indexes cannot serve leading wildcards, so every search was a sequential
-- scan of each table. gin_trgm_ops indexes accelerate ILIKE %...% directly.
--
-- pg_trgm requires an enabled extension; creation is attempted but tolerated
-- when the database role lacks privileges. Indexes are only created when the
-- extension is present so the migration never hard-fails.

DO $$
DECLARE
  ext_ok BOOLEAN := FALSE;
  stmt TEXT;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    ext_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm extension could not be created: %', SQLERRM;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    ext_ok := FALSE;
  END IF;

  IF ext_ok THEN
    -- Tickets: customer_name / category / id (id also searched via ILIKE)
    CREATE INDEX IF NOT EXISTS idx_tickets_customer_name_trgm
      ON tickets USING gin (customer_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_tickets_category_trgm
      ON tickets USING gin (category gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_tickets_id_trgm
      ON tickets USING gin (id gin_trgm_ops);

    -- Customers: first_name / last_name / email
    CREATE INDEX IF NOT EXISTS idx_customers_first_name_trgm
      ON customers USING gin (first_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_customers_last_name_trgm
      ON customers USING gin (last_name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_customers_email_trgm
      ON customers USING gin (email gin_trgm_ops);

    -- KB articles: title / content / category
    CREATE INDEX IF NOT EXISTS idx_kb_articles_title_trgm
      ON kb_articles USING gin (title gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_content_trgm
      ON kb_articles USING gin (content gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_category_trgm
      ON kb_articles USING gin (category gin_trgm_ops);

    -- Document registry (schema-qualified)
    CREATE INDEX IF NOT EXISTS idx_doc_registry_title_trgm
      ON documents.document_registry USING gin (title gin_trgm_ops);

    RAISE NOTICE 'trigram indexes ensured';
  ELSE
    RAISE NOTICE 'skipping trigram indexes — pg_trgm not available';
  END IF;
END $$;
