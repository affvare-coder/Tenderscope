-- Disposable PostgreSQL fixture for Project A's work and acceptance receipts.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA tenderscope_private;
CREATE TABLE public.tenders (
 id uuid PRIMARY KEY, bid_number text, source text, status text, deadline timestamptz,
 reviewed_at timestamptz, lifecycle_state text, ingestion_status text
);
CREATE TABLE public.tender_documents (
 id uuid PRIMARY KEY, tender_id uuid REFERENCES public.tenders(id) ON DELETE CASCADE,
 kind text, official_url text, content_hash text, version_no integer, availability text
);
CREATE TABLE public.product_writes (tender_id uuid, source_url text);
CREATE FUNCTION public.record_tender_products(uuid,text,text,jsonb,text,text) RETURNS jsonb
LANGUAGE plpgsql AS $stub$
BEGIN
 INSERT INTO public.product_writes VALUES ($1,$2);
 IF $4->0->>'name'='Failed write' THEN RETURN NULL; END IF;
 RETURN '{"status":"COMPLETE"}';
END
$stub$;

-- Apply the Project A BOQ receipt migration here.
DO $test$
DECLARE
  tender_id uuid := gen_random_uuid();
  other_tender_id uuid := gen_random_uuid();
  document_id uuid := gen_random_uuid();
  other_document_id uuid := gen_random_uuid();
  atc_id uuid := gen_random_uuid();
  source_url text := 'https://mkp.gem.gov.in/uploaded_documents/items.csv';
  source_hash text := repeat('a',64);
  first_ticket jsonb;
  ticket jsonb;
  items jsonb;
  result jsonb;
  result_hash text;
  recorded jsonb;
BEGIN
  INSERT INTO public.tenders VALUES
    (tender_id,'GEM/2026/B/8313971','GeM','published',now()+interval '2 days',now(),'ACTIVE','verified'),
    (other_tender_id,'GEM/2026/B/8313972','GeM','published',now()+interval '2 days',now(),'ACTIVE','verified');
  INSERT INTO public.tender_documents VALUES
    (document_id,tender_id,'boq',source_url,source_hash,1,'available'),
    (atc_id,tender_id,'atc','https://bidplus.gem.gov.in/atc.pdf',repeat('b',64),1,'available'),
    (other_document_id,other_tender_id,'boq',source_url,source_hash,1,'available');
  first_ticket:=public.prepare_boq_engine_work(document_id);
  IF first_ticket->>'status'<>'prepared' OR first_ticket IS DISTINCT FROM public.prepare_boq_engine_work(document_id) THEN
    RAISE EXCEPTION 'Dispatch must be stable on retry';
  END IF;
  IF public.prepare_boq_engine_work(other_document_id)->>'status'<>'busy' THEN
    RAISE EXCEPTION 'The canary must bound concurrent dispatch';
  END IF;

  items:=jsonb_build_array(jsonb_build_object(
    'item_key',source_url||'#row=1','source_url',source_url,'source_hash',source_hash,
    'name','Current official item','quantity',2,'unit','NOS'
  ));
  result:=jsonb_build_object('parser_version','gem-boq-csv-v4','items',items);
  result_hash:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
  recorded:=public.accept_boq_engine_result(
    (first_ticket->>'work_id')::uuid,(first_ticket->>'revision')::bigint-1,1,
    first_ticket->>'manifest_sha256',source_hash,result_hash,result
  );
  IF recorded->>'status'<>'stale_ticket' THEN RAISE EXCEPTION 'An older revision was accepted'; END IF;

  UPDATE public.tender_documents SET version_no=2,content_hash=repeat('c',64) WHERE id=atc_id;
  recorded:=public.accept_boq_engine_result(
    (first_ticket->>'work_id')::uuid,(first_ticket->>'revision')::bigint,1,
    first_ticket->>'manifest_sha256',source_hash,result_hash,result
  );
  IF recorded->>'status'<>'stale_source' OR EXISTS(SELECT FROM public.product_writes) THEN
    RAISE EXCEPTION 'An amended source wrote product rows';
  END IF;
  ticket:=public.prepare_boq_engine_work(document_id);
  IF (ticket->>'revision')::bigint<=(first_ticket->>'revision')::bigint OR ticket->>'work_id'=first_ticket->>'work_id' THEN
    RAISE EXCEPTION 'A changed source did not get a new work revision';
  END IF;

  recorded:=public.accept_boq_engine_result(
    (ticket->>'work_id')::uuid,(ticket->>'revision')::bigint,1,
    ticket->>'manifest_sha256',source_hash,repeat('0',64),result
  );
  IF recorded->>'status'<>'invalid_result' THEN RAISE EXCEPTION 'A mismatched result digest was accepted'; END IF;
  BEGIN
    result:=jsonb_set(result,'{items,0,name}','"Failed write"');
    PERFORM public.accept_boq_engine_result((ticket->>'work_id')::uuid,(ticket->>'revision')::bigint,1,
      ticket->>'manifest_sha256',source_hash,encode(sha256(convert_to(result::text,'UTF8')),'hex'),result);
    RAISE EXCEPTION 'A failed write was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm<>'BOQ extraction did not commit' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT FROM public.product_writes) OR EXISTS(
     SELECT FROM tenderscope_private.boq_dispatch_receipts WHERE accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Failed publication did not roll back atomically';
  END IF;

  result:=jsonb_build_object('parser_version','gem-boq-csv-v4','items',items);
  recorded:=public.accept_boq_engine_result(
    (ticket->>'work_id')::uuid,(ticket->>'revision')::bigint,1,
    ticket->>'manifest_sha256',source_hash,result_hash,result
  );
  IF recorded->>'status'<>'accepted' THEN RAISE EXCEPTION 'The current source result failed'; END IF;
  recorded:=public.accept_boq_engine_result(
    (ticket->>'work_id')::uuid,(ticket->>'revision')::bigint,1,
    ticket->>'manifest_sha256',source_hash,result_hash,result
  );
  IF recorded->>'status'<>'already_accepted' OR (SELECT count(*) FROM public.product_writes)<>1
     OR public.prepare_boq_engine_work(document_id)->>'status'<>'already_accepted' THEN
    RAISE EXCEPTION 'Replay wrote another set of rows';
  END IF;
  IF has_function_privilege('anon','public.prepare_boq_engine_work(uuid)','EXECUTE') OR
     has_function_privilege('authenticated','public.accept_boq_engine_result(uuid,bigint,integer,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles can access the engine bridge';
  END IF;
END
$test$;
