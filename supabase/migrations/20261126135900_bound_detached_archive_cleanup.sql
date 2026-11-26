-- Keep the verified receipt and exact hash as a permanent fence against
-- reattaching this object key. Remove only detached, unversioned file copies
-- through Storage. This does not retire any bid, candidate, job or evidence.
ALTER TABLE tenderscope_private.cold_archives
  ADD COLUMN IF NOT EXISTS object_absence_verified_at timestamptz;

CREATE OR REPLACE FUNCTION tenderscope_private.detached_candidate_archives(p_keys text[])
RETURNS TABLE(object_key text, verified_at timestamptz, compressed_bytes bigint)
LANGUAGE sql STABLE
SET search_path = ''
AS $function$
  WITH archive_pointers AS MATERIALIZED (
    SELECT row_data->>'__archived' AS object_key FROM public.sync_candidates
    UNION SELECT payload->>'__archived' FROM public.sync_jobs
    UNION SELECT stats->>'retired_archive_object_key' FROM public.sync_jobs
    UNION SELECT archive_object_key FROM tenderscope_private.excluded_candidate_receipts
    UNION SELECT retired.object_key FROM tenderscope_private.retired_bids retired
    UNION SELECT archived_document_ref->>'archive_object_key' FROM public.member_download_events
    UNION SELECT permit.object_key FROM tenderscope_private.archive_purge_permits permit
  ), protected_bids AS MATERIALIZED (
    SELECT bid_number FROM public.tenders
    UNION SELECT bid_number FROM public.member_saved_bids
    UNION SELECT bid_number FROM public.sync_candidates
    UNION SELECT bid_number FROM public.sync_document_facts
    UNION SELECT bid_number FROM tenderscope_private.retired_bids
    UNION SELECT payload#>>'{row,bid_number}' FROM public.sync_jobs
      WHERE state IN ('queued', 'running') AND payload->>'kind' = 'document'
  ), archived AS MATERIALIZED (
    SELECT archive.*
    FROM tenderscope_private.cold_archives archive
    WHERE archive.scope = 'candidates'
      AND archive.sha256 ~ '^[0-9a-f]{64}$'
      AND archive.object_key = 'candidates/' || archive.sha256 || '.json.gz'
      AND archive.verified_at < now() - interval '14 days'
      AND archive.compressed_bytes BETWEEN 1 AND 6291456
      AND cardinality(archive.ids) BETWEEN 1 AND 500
      AND (p_keys IS NULL OR archive.object_key = ANY(p_keys))
      AND NOT EXISTS (SELECT 1 FROM archive_pointers pointer WHERE pointer.object_key = archive.object_key)
  ), protected_archives AS MATERIALIZED (
    SELECT DISTINCT archive.object_key
    FROM archived archive
    CROSS JOIN LATERAL unnest(archive.ids) original(bid_number)
    LEFT JOIN protected_bids protected ON protected.bid_number = original.bid_number
    WHERE protected.bid_number IS NOT NULL
      OR original.bid_number IS NULL
      OR original.bid_number !~ '^GEM/[0-9]{4}/B/[0-9]+$'
  )
  SELECT archive.object_key, archive.verified_at, archive.compressed_bytes
  FROM archived archive
  WHERE NOT EXISTS (SELECT 1 FROM protected_archives protected WHERE protected.object_key = archive.object_key);
$function$;

CREATE OR REPLACE FUNCTION public.prepare_detached_archive_cleanup(p_limit integer DEFAULT 16)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
  SELECT jsonb_build_object('objects', coalesce(jsonb_agg(
    jsonb_build_object('key', selected.object_key, 'present', selected.present)
    ORDER BY selected.verified_at, selected.object_key), '[]'::jsonb))
  FROM (
    SELECT archive.object_key, archive.verified_at, object.id IS NOT NULL AS present
    FROM tenderscope_private.detached_candidate_archives(NULL) archive
    JOIN tenderscope_private.cold_archives receipt ON receipt.object_key = archive.object_key
    JOIN storage.buckets bucket ON bucket.id = 'tenderscope-cold-archive' AND NOT bucket.public
    LEFT JOIN storage.objects object ON object.bucket_id = bucket.id AND object.name = archive.object_key
    WHERE (object.id IS NULL AND receipt.object_absence_verified_at IS NULL)
       OR (object.archived_at IS NULL AND object.is_versioned IS FALSE AND object.is_delete_marker IS FALSE
          AND object.created_at < now() - interval '14 days'
          AND object.metadata->>'size' = archive.compressed_bytes::text
          AND NOT EXISTS (
            SELECT 1 FROM storage.objects other
            WHERE other.bucket_id = object.bucket_id AND other.name = object.name AND other.id <> object.id
          ))
    ORDER BY archive.verified_at, archive.object_key
    LIMIT least(greatest(coalesce(p_limit, 16), 1), 32)
  ) selected;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_detached_archive_cleanup(p_keys text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  confirmed integer;
BEGIN
  IF p_keys IS NULL OR cardinality(p_keys) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Expected one to 32 archive keys';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('tenderscope:retention', 0)) THEN
    RETURN jsonb_build_object('status', 'busy', 'confirmed', 0);
  END IF;

  UPDATE tenderscope_private.cold_archives receipt
  SET object_absence_verified_at = now()
  FROM tenderscope_private.detached_candidate_archives(p_keys) archive
  JOIN storage.buckets bucket ON bucket.id = 'tenderscope-cold-archive' AND NOT bucket.public
  WHERE receipt.object_key = archive.object_key
    AND receipt.object_absence_verified_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects object WHERE object.bucket_id = bucket.id AND object.name = archive.object_key
    );
  GET DIAGNOSTICS confirmed = ROW_COUNT;
  RETURN jsonb_build_object('status', 'checked', 'confirmed', confirmed);
END;
$function$;

REVOKE ALL ON FUNCTION tenderscope_private.detached_candidate_archives(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_detached_archive_cleanup(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_detached_archive_cleanup(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_detached_archive_cleanup(integer), public.confirm_detached_archive_cleanup(text[]) TO service_role;
