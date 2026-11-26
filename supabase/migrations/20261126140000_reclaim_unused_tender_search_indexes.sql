-- Public search uses the current structured filters and ILIKE paths.
-- Verify both legacy search indexes are unused and non-constraint before removal.
SET LOCAL lock_timeout = '1s';

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid=s.indexrelid
    JOIN pg_class c ON c.oid=s.indexrelid
    JOIN pg_am a ON a.oid=c.relam
    WHERE s.schemaname='public'
      AND s.indexrelname IN ('tenders_search','tenders_search_text')
      AND (s.relid<>'public.tenders'::regclass OR s.idx_scan<>0
        OR i.indisprimary OR i.indisunique OR i.indisexclusion
        OR a.amname<>'gin' OR i.indexprs IS NULL)
  ) THEN
    RAISE EXCEPTION 'Legacy search index safety check changed';
  END IF;
END
$guard$;

DROP INDEX IF EXISTS public.tenders_search, public.tenders_search_text;
