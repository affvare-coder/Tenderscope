-- Keep one keyed join for live bids and avoid sorting the full pointer and
-- bid sets. Only open each original ID array after its archive is detached.
CREATE OR REPLACE FUNCTION tenderscope_private.detached_candidate_archives(p_keys text[])
RETURNS TABLE(object_key text, verified_at timestamptz, compressed_bytes bigint)
LANGUAGE sql STABLE
SET search_path = ''
SET work_mem = '12MB'
AS $function$
  WITH possible_archives AS MATERIALIZED (
    SELECT archive.object_key, archive.verified_at, archive.compressed_bytes, archive.ids
    FROM tenderscope_private.cold_archives archive
    WHERE archive.scope = 'candidates'
      AND archive.sha256 ~ '^[0-9a-f]{64}$'
      AND archive.object_key = 'candidates/' || archive.sha256 || '.json.gz'
      AND archive.verified_at < now() - interval '14 days'
      AND archive.compressed_bytes BETWEEN 1 AND 6291456
      AND cardinality(archive.ids) BETWEEN 1 AND 500
      AND (p_keys IS NULL OR archive.object_key = ANY(p_keys))
  ), candidate_refs AS MATERIALIZED (
    SELECT bid_number, row_data->>'__archived' AS object_key FROM public.sync_candidates
  ), job_refs AS MATERIALIZED (
    SELECT payload->>'__archived' AS archived_object_key,
      stats->>'retired_archive_object_key' AS retired_object_key,
      CASE WHEN state IN ('queued', 'running') AND payload->>'kind' = 'document'
        THEN payload#>>'{row,bid_number}' END AS active_bid_number
    FROM public.sync_jobs
  ), archive_pointers AS (
    SELECT object_key FROM candidate_refs WHERE object_key LIKE 'candidates/%'
    UNION ALL SELECT pointer.object_key
    FROM job_refs job
    CROSS JOIN LATERAL (VALUES (job.archived_object_key), (job.retired_object_key)) pointer(object_key)
    WHERE pointer.object_key LIKE 'candidates/%'
    UNION ALL SELECT archive_object_key FROM tenderscope_private.excluded_candidate_receipts
    UNION ALL SELECT retired.object_key FROM tenderscope_private.retired_bids retired
    UNION ALL SELECT archived_document_ref->>'archive_object_key' FROM public.member_download_events
      WHERE archived_document_ref ? 'archive_object_key'
    UNION ALL SELECT permit.object_key FROM tenderscope_private.archive_purge_permits permit
  ), detached_keys AS MATERIALIZED (
    SELECT archive.*
    FROM possible_archives archive
    WHERE NOT EXISTS (SELECT 1 FROM archive_pointers pointer WHERE pointer.object_key = archive.object_key)
  ), protected_bids AS MATERIALIZED (
    SELECT bid_number FROM public.tenders
    UNION ALL SELECT bid_number FROM public.member_saved_bids
    UNION ALL SELECT bid_number FROM candidate_refs
    UNION ALL SELECT bid_number FROM public.sync_document_facts
    UNION ALL SELECT bid_number FROM tenderscope_private.retired_bids
    UNION ALL SELECT active_bid_number FROM job_refs WHERE active_bid_number IS NOT NULL
  ), protected_keys AS MATERIALIZED (
    SELECT DISTINCT archive.object_key
    FROM detached_keys archive
    CROSS JOIN LATERAL unnest(archive.ids) original(bid_number)
    LEFT JOIN protected_bids protected ON protected.bid_number = original.bid_number
    WHERE protected.bid_number IS NOT NULL
       OR original.bid_number IS NULL
       OR original.bid_number !~ '^GEM/[0-9]{4}/B/[0-9]+$'
  )
  SELECT archive.object_key, archive.verified_at, archive.compressed_bytes
  FROM detached_keys archive
  WHERE NOT EXISTS (SELECT 1 FROM protected_keys protected WHERE protected.object_key = archive.object_key);
$function$;

-- The dedicated Storage cleanup request runs one batch under a 35s HTTP
-- timeout. Keep both RPCs bounded and reserve time for Storage confirmation.
ALTER FUNCTION public.prepare_detached_archive_cleanup(integer) SET statement_timeout = '14s';
ALTER FUNCTION public.confirm_detached_archive_cleanup(text[]) SET statement_timeout = '14s';
