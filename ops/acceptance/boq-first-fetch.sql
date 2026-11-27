-- Project A disposable fixture. Apply after the BOQ receipt fixture's setup
-- and both Project A migrations. The harness provides local pg_net and Vault fixtures.
do $test$
declare
  tender_id uuid:=gen_random_uuid();
  parent_id uuid:=gen_random_uuid();
  doc_id uuid;
  pilot tenderscope_private.boq_first_fetch_pilot%rowtype;
  outcome text;
  url text;
  source_sha text:=repeat('a',64);
  result jsonb;
  digest text;
  response jsonb;
  probe integer;
begin
  insert into public.tenders values
    (tender_id,'GEM/2026/B/8313971','GeM','published',now()+interval '2 days',now(),'ACTIVE','verified');
  insert into public.tender_documents(id,tender_id,kind,official_url,content_hash,version_no,availability)
    values(parent_id,tender_id,'bid','https://bidplus.gem.gov.in/showbidDocument/11',repeat('a',64),1,'available');

  for probe in 1..3 loop
    doc_id:=gen_random_uuid();
    url:='https://mkp.gem.gov.in/uploaded_documents/boq'||probe||'.csv';
    insert into public.tender_documents(id,tender_id,kind,official_url,content_hash,version_no,availability,document_key)
      values(doc_id,tender_id,'boq',url,null,1,'unverified','boq:'||url);
    insert into tenderscope_private.boq_first_fetch_pilot(document_id,manifest_sha256,expires_at)
      values(doc_id,tenderscope_private.boq_source_manifest(tender_id,doc_id,now()+interval '2 days'),now()+interval '20 minutes');
    assert tenderscope_private.tick_boq_first_fetch()='request_sent';
    select * into pilot from tenderscope_private.boq_first_fetch_pilot where document_id=doc_id;
    assert (select payload->>'operation' from net.requests where id=pilot.request_id)='run';
    assert (select headers ? 'x-tenderscope-signature' and not headers ? 'Authorization' from net.requests where id=pilot.request_id);
    result:=jsonb_build_object('parser_version','gem-boq-csv-v4','items',jsonb_build_array(jsonb_build_object(
      'item_key',url||'#row=1','source_url',url,'source_hash',source_sha,'quantity',2,'unit','NOS',
      'name',case when probe=2 then 'Failed write' else 'Official item' end)));
    digest:=encode(sha256(convert_to(result::text,'UTF8')),'hex');
    response:=jsonb_build_object('status','ready','work_id',pilot.work_id,'revision',pilot.revision,
      'generation',1,'source_sha256',source_sha,'result_sha256',digest,'manifest_sha256',pilot.manifest_sha256,
      'result',result,'ready_at',clock_timestamp());
    if probe=1 then
      update public.tender_documents set version_no=2 where id=parent_id;
    end if;
    insert into net._http_response values(pilot.request_id,200,response::text);
    update tenderscope_private.boq_first_fetch_pilot set next_attempt_at=now() where document_id=doc_id;
    outcome:=tenderscope_private.tick_boq_first_fetch();
    if probe in (1,2) then
      assert outcome='processed_response';
      assert (select p.stage='stopped' and p.last_status=case when probe=1 then 'stale_source' else 'publication_rejected' end
              from tenderscope_private.boq_first_fetch_pilot p where p.document_id=doc_id);
      assert not exists(select from public.product_writes);
      assert not exists(select from tenderscope_private.boq_dispatch_receipts);
      assert (select d.content_hash is null from public.tender_documents d where d.id=doc_id);
    else
      assert outcome='accepted';
      assert (select count(*) from public.product_writes)=1;
      assert (select r.accepted_sha256=digest from tenderscope_private.boq_dispatch_receipts r where r.work_id=pilot.work_id);
      assert tenderscope_private.tick_boq_first_fetch()='request_sent';
      select * into pilot from tenderscope_private.boq_first_fetch_pilot where document_id=doc_id;
      assert (select payload->>'operation'='ack' and payload->>'result_sha256'=digest from net.requests where id=pilot.request_id);
      insert into net._http_response values(pilot.request_id,200,
        jsonb_build_object('status','replay','work_id',pilot.work_id,'revision',pilot.revision)::text);
      update tenderscope_private.boq_first_fetch_pilot set next_attempt_at=now() where document_id=doc_id;
      assert tenderscope_private.tick_boq_first_fetch()='delivered';
      assert tenderscope_private.tick_boq_first_fetch()='idle';
    end if;
  end loop;
  assert not has_function_privilege('anon','tenderscope_private.tick_boq_first_fetch()','EXECUTE');
  assert not has_function_privilege('authenticated','tenderscope_private.tick_boq_first_fetch()','EXECUTE');
  assert not has_function_privilege('service_role','tenderscope_private.tick_boq_first_fetch()','EXECUTE');
end;
$test$;
