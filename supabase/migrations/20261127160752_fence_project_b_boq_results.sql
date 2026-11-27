-- Project A owns the current source and canonical product writes.
-- Store compact dispatch and acceptance receipts; Project B holds the payload.
CREATE SEQUENCE tenderscope_private.boq_dispatch_revision START WITH 2;

CREATE TABLE tenderscope_private.boq_dispatch_receipts (
  document_id uuid PRIMARY KEY REFERENCES public.tender_documents(id) ON DELETE CASCADE,
  work_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL,
  manifest_sha256 text NOT NULL,
  source_sha256 text NOT NULL,
  dispatch_expires_at timestamptz NOT NULL,
  accepted_sha256 text,
  accepted_at timestamptz
);
ALTER TABLE tenderscope_private.boq_dispatch_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenderscope_private.boq_dispatch_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON tenderscope_private.boq_dispatch_receipts TO service_role;
REVOKE ALL ON SEQUENCE tenderscope_private.boq_dispatch_revision FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE tenderscope_private.boq_dispatch_revision TO service_role;

CREATE FUNCTION tenderscope_private.boq_source_manifest(
  p_tender_id uuid, p_document_id uuid, p_deadline timestamptz
) RETURNS text LANGUAGE sql STABLE SET search_path = ''
AS $function$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'document_id',p_document_id,
    'deadline_epoch',extract(epoch FROM p_deadline),
    'documents',coalesce(jsonb_agg(
      jsonb_build_array(d.id,d.kind,d.official_url,d.content_hash,d.version_no,d.availability)
      ORDER BY d.id
    ),'[]'::jsonb)
  )::text,'UTF8')),'hex')
  FROM public.tender_documents d
  WHERE d.tender_id=p_tender_id;
$function$;
REVOKE ALL ON FUNCTION tenderscope_private.boq_source_manifest(uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tenderscope_private.boq_source_manifest(uuid,uuid,timestamptz) TO service_role;

CREATE FUNCTION public.prepare_boq_engine_work(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE
  tender public.tenders%rowtype;
  source public.tender_documents%rowtype;
  ticket tenderscope_private.boq_dispatch_receipts%rowtype;
  manifest text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('tenderscope:boq-engine-dispatch',0)) THEN
    RETURN jsonb_build_object('status','busy');
  END IF;
  SELECT t.* INTO tender
  FROM public.tender_documents d JOIN public.tenders t ON t.id=d.tender_id
  WHERE d.id=p_document_id FOR UPDATE OF t;
  IF NOT FOUND OR tender.status IS DISTINCT FROM 'published'
     OR NOT coalesce(tender.deadline>now(),false)
     OR tender.reviewed_at IS NULL
     OR lower(tender.source) IS DISTINCT FROM 'gem'
     OR coalesce(tender.ingestion_status,'')='excluded'
     OR tender.lifecycle_state IN ('EXPIRED','CANCELLED','EXCLUDED','OPENED','CLOSED_PENDING_VERIFICATION') THEN
    RETURN jsonb_build_object('status','ineligible');
  END IF;
  SELECT d.* INTO source FROM public.tender_documents d
  WHERE d.id=p_document_id AND d.tender_id=tender.id FOR UPDATE;
  IF NOT FOUND OR source.kind IS DISTINCT FROM 'boq'
     OR source.availability IS DISTINCT FROM 'available'
     OR NOT coalesce(source.content_hash ~ '^[0-9a-f]{64}$',false)
     OR NOT coalesce(source.official_url ~* '^https://([a-z0-9-]+[.])*gem[.]gov[.]in/[^[:space:]#]+[.]csv([?][^[:space:]#]+)?$',false) THEN
    RETURN jsonb_build_object('status','ineligible');
  END IF;

  manifest:=tenderscope_private.boq_source_manifest(tender.id,source.id,tender.deadline);
  SELECT r.* INTO ticket FROM tenderscope_private.boq_dispatch_receipts r
  WHERE r.document_id=source.id FOR UPDATE;
  IF ticket.manifest_sha256=manifest AND ticket.accepted_sha256 IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_accepted','work_id',ticket.work_id);
  END IF;
  IF NOT coalesce(ticket.manifest_sha256=manifest AND ticket.dispatch_expires_at>now(),false) THEN
    IF pg_database_size(current_database())>=480000000 OR
       (ticket.document_id IS NULL AND (SELECT count(*) FROM tenderscope_private.boq_dispatch_receipts)>=256) THEN
      RETURN jsonb_build_object('status','capacity');
    END IF;
    IF EXISTS (
      SELECT 1 FROM tenderscope_private.boq_dispatch_receipts r
      WHERE r.document_id<>source.id AND r.accepted_sha256 IS NULL AND r.dispatch_expires_at>now()
    ) THEN
      RETURN jsonb_build_object('status','busy');
    END IF;
    INSERT INTO tenderscope_private.boq_dispatch_receipts AS r
      (document_id,work_id,revision,manifest_sha256,source_sha256,dispatch_expires_at)
    VALUES(source.id,gen_random_uuid(),nextval('tenderscope_private.boq_dispatch_revision'),
      manifest,source.content_hash,least(tender.deadline,now()+interval '2 hours'))
    ON CONFLICT(document_id) DO UPDATE SET
      work_id=excluded.work_id,revision=excluded.revision,manifest_sha256=excluded.manifest_sha256,
      source_sha256=excluded.source_sha256,dispatch_expires_at=excluded.dispatch_expires_at,
      accepted_sha256=NULL,accepted_at=NULL
    RETURNING r.* INTO ticket;
  END IF;
  RETURN jsonb_build_object(
    'status','prepared','document_id',ticket.document_id,'work_id',ticket.work_id,
    'tender_id',tender.id,'bid_number',tender.bid_number,'revision',ticket.revision,
    'manifest_sha256',ticket.manifest_sha256,'source_url',source.official_url,
    'source_sha256',ticket.source_sha256,'parser_version','gem-boq-csv-v4',
    'rules_version','boq-engine-v1','deadline',tender.deadline,
    'dispatch_expires_at',ticket.dispatch_expires_at
  );
END
$function$;

CREATE FUNCTION public.accept_boq_engine_result(
  p_work_id uuid, p_revision bigint, p_generation integer, p_manifest_sha256 text,
  p_source_sha256 text, p_result_sha256 text, p_result jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE
  tender public.tenders%rowtype;
  source public.tender_documents%rowtype;
  ticket tenderscope_private.boq_dispatch_receipts%rowtype;
  items jsonb;
  recorded jsonb;
BEGIN
  SELECT t.* INTO tender
  FROM tenderscope_private.boq_dispatch_receipts r
  JOIN public.tender_documents d ON d.id=r.document_id
  JOIN public.tenders t ON t.id=d.tender_id
  WHERE r.work_id=p_work_id FOR UPDATE OF t;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','stale_ticket'); END IF;
  -- Protect sibling source revisions from concurrent document refreshes.
  PERFORM d.id FROM public.tender_documents d WHERE d.tender_id=tender.id
  ORDER BY d.id FOR UPDATE;
  SELECT d.* INTO source
  FROM public.tender_documents d
  JOIN tenderscope_private.boq_dispatch_receipts r ON r.document_id=d.id
  WHERE r.work_id=p_work_id AND d.tender_id=tender.id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','stale_ticket'); END IF;
  SELECT r.* INTO ticket FROM tenderscope_private.boq_dispatch_receipts r
  WHERE r.work_id=p_work_id AND r.document_id=source.id FOR UPDATE;
  IF NOT FOUND OR ticket.revision IS DISTINCT FROM p_revision
     OR ticket.manifest_sha256 IS DISTINCT FROM p_manifest_sha256
     OR ticket.source_sha256 IS DISTINCT FROM p_source_sha256 THEN
    RETURN jsonb_build_object('status','stale_ticket');
  END IF;

  IF NOT coalesce(p_generation BETWEEN 1 AND 4,false)
     OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
     OR NOT coalesce(p_result_sha256 ~ '^[0-9a-f]{64}$',false)
     OR octet_length(p_result::text)>131072
     OR encode(sha256(convert_to(p_result::text,'UTF8')),'hex') IS DISTINCT FROM p_result_sha256 THEN
    RETURN jsonb_build_object('status','invalid_result');
  END IF;
  IF ticket.accepted_sha256 IS NOT NULL THEN
    RETURN jsonb_build_object('status',CASE WHEN ticket.accepted_sha256=p_result_sha256 THEN 'already_accepted' ELSE 'conflict' END);
  END IF;
  IF ticket.dispatch_expires_at<=now() OR tender.status IS DISTINCT FROM 'published'
     OR NOT coalesce(tender.deadline>now(),false)
     OR tender.reviewed_at IS NULL
     OR lower(tender.source) IS DISTINCT FROM 'gem'
     OR coalesce(tender.ingestion_status,'')='excluded'
     OR tender.lifecycle_state IN ('EXPIRED','CANCELLED','EXCLUDED','OPENED','CLOSED_PENDING_VERIFICATION')
     OR source.availability IS DISTINCT FROM 'available'
     OR source.content_hash IS DISTINCT FROM p_source_sha256
     OR tenderscope_private.boq_source_manifest(tender.id,source.id,tender.deadline) IS DISTINCT FROM ticket.manifest_sha256 THEN
    RETURN jsonb_build_object('status','stale_source');
  END IF;
  IF pg_database_size(current_database())>=485000000 THEN
    RETURN jsonb_build_object('status','capacity');
  END IF;
  items:=p_result->'items';
  IF p_result->>'parser_version' IS DISTINCT FROM 'gem-boq-csv-v4'
     OR jsonb_typeof(items) IS DISTINCT FROM 'array'
     OR p_result - ARRAY['parser_version','items'] <> '{}'::jsonb THEN
    RETURN jsonb_build_object('status','invalid_result');
  END IF;
  IF jsonb_array_length(items) NOT BETWEEN 1 AND 20000 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(items) WITH ORDINALITY AS result_row(item,row_no)
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR item->>'item_key' IS DISTINCT FROM source.official_url||'#row='||row_no
       OR item->>'source_url' IS DISTINCT FROM source.official_url
       OR item->>'source_hash' IS DISTINCT FROM source.content_hash
       OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
       OR nullif(btrim(item->>'name'),'') IS NULL
       OR coalesce(jsonb_typeof(item->'quantity'),'null') NOT IN ('number','null')
  ) THEN
    RETURN jsonb_build_object('status','invalid_result');
  END IF;

  recorded:=public.record_tender_products(tender.id,source.official_url,source.content_hash,items,'gem-boq-csv-v4',NULL);
  IF NOT coalesce(recorded->>'status' IN ('COMPLETE','UNCHANGED'),false) THEN
    RAISE EXCEPTION 'BOQ extraction did not commit';
  END IF;
  UPDATE tenderscope_private.boq_dispatch_receipts SET accepted_sha256=p_result_sha256,accepted_at=now()
  WHERE document_id=source.id AND work_id=p_work_id;
  RETURN jsonb_build_object('status','accepted','products',recorded);
END
$function$;

REVOKE ALL ON FUNCTION public.prepare_boq_engine_work(uuid),
  public.accept_boq_engine_result(uuid,bigint,integer,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_boq_engine_work(uuid),
  public.accept_boq_engine_result(uuid,bigint,integer,text,text,text,jsonb)
  TO service_role;
