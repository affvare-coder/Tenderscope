-- Match the existing vacuum thresholds on candidates and jobs so these
-- update-heavy tables can reuse pages earlier.
SET LOCAL lock_timeout = '1s';

ALTER TABLE public.tender_items SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500
);

ALTER TABLE public.sync_document_facts SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500
);
