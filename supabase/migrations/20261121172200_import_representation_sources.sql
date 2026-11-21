-- Staff-only importer for a read-only official source reconciliation.
-- Each invocation is one bid. Never advance its lifecycle or restart its filing clock.
create or replace function tenderscope_private.import_representation_sources(p_case jsonb,p_since timestamptz)
returns jsonb language plpgsql set search_path='' as $$
declare
 t public.tenders%rowtype; d jsonb; current_doc public.tender_documents%rowtype; src jsonb; patch jsonb;
 usable jsonb:='[]'; links jsonb:='[]'; facts jsonb; report jsonb; recorded int:=0; rows_added int:=0; conflicts int:=0;
begin
 if pg_database_size(current_database())>=485000000 then raise exception 'Database capacity limit';end if;
 if p_since>now()+interval '2 minutes' or p_since<now()-interval '2 days' then raise exception 'Invalid observation time';end if;
 perform pg_advisory_xact_lock(hashtextextended('gem:'||(p_case->>'bid'),0));
 select * into strict t from public.tenders where bid_number=p_case->>'bid' and status='published' and deadline>now() and reviewed_at is not null
 and coalesce(ingestion_status,'')<>'excluded' and lifecycle_state not in ('OPENED','EXPIRED','CANCELLED','EXCLUDED','CLOSED_PENDING_VERIFICATION') for update;
 if not exists(select from jsonb_array_elements(p_case->'docs') x where x->>'url'=t.source_url and x->>'kind'='bid' and x->>'sha'~'^[0-9a-f]{64}$' and not(x?'error')) then return '{"status":"parent_unverified"}';end if;
 if exists(select from public.tender_documents where tender_id=t.id and official_url=t.source_url
 and coalesce(observed_at,last_checked_at)>p_since and (availability='removed' or (content_hash is not null and content_hash is distinct from
 (select x->>'sha' from jsonb_array_elements(p_case->'docs') x where x->>'url'=t.source_url limit 1)))) then return '{"status":"parent_changed"}';end if;
 patch:=jsonb_build_object('bid_number',t.bid_number,'documents_complete',false);
 for d in select value from jsonb_array_elements(p_case->'docs') loop
  if d->>'url' !~ '^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/' then continue;end if;
  select * into current_doc from public.tender_documents where tender_id=t.id and official_url=d->>'url' order by id limit 1;
  if current_doc.availability='removed' or (current_doc.content_hash is not null and current_doc.content_hash<>d->>'sha' and current_doc.observed_at>p_since)
    then conflicts:=conflicts+1;continue;end if;
  src:=jsonb_build_object('official_url',d->>'url','kind',coalesce(current_doc.kind,d->>'kind'),
    'document_key',coalesce(current_doc.document_key,case when d->>'url'=t.source_url then 'bid' else (d->>'kind')||':'||(d->>'url') end));
  if d?'error' or coalesce(d->>'sha','')!~'^[a-f0-9]{64}$' then
   if current_doc.id is null then links:=links||jsonb_build_array(src);end if;
   continue;
  end if;
  usable:=usable||jsonb_build_array(d);
  if current_doc.content_hash is distinct from d->>'sha' or current_doc.availability is distinct from 'available' then
   links:=links||jsonb_build_array(src||jsonb_build_object('availability','available','link_status','verified','content_hash',d->>'sha'));
  end if;
  if d->>'url'=t.source_url then
   if t.estimated_value_inr is null and d->'value'->>'amount'~'^[0-9]+([.][0-9]+)?$' then patch:=patch||jsonb_build_object('estimated_value_inr',d->'value'->'amount','value_basis','buyer_declared');end if;
   if t.emd_inr is null and d->'emd'->>'amount'~'^[0-9]+([.][0-9]+)?$' then patch:=patch||jsonb_build_object('emd_inr',d->'emd'->'amount');end if;
  end if;
 end loop;
 if jsonb_array_length(links)>0 or patch?'estimated_value_inr' or patch?'emd_inr' then
  -- A concurrent listing may have been observed after the batch started. The URL/hash
  -- and amendment checks above protect each file. Do not supersede a newer document.
  if exists(select from public.tender_events where tender_id=t.id and detected_at>p_since and event_code in ('CORRIGENDUM','ATC_CHANGED','BOQ_CHANGED','SPECIFICATION_CHANGED','BID_DOCUMENT_CHANGED','DOCUMENT_REMOVED')) then return '{"status":"amended"}';end if;
  perform public.ingest_tender(patch||jsonb_build_object('documents',links),'gem','representation-source-review',null,clock_timestamp(),null);
 end if;
 for d in select value from jsonb_array_elements(usable) loop
  if not exists(select from public.tender_documents where tender_id=t.id and official_url=d->>'url' and content_hash=d->>'sha' and availability='available') then continue;end if;
  if d?'review' then
   facts:=jsonb_strip_nulls(jsonb_build_object('page_count',d->'pages','filing_hours',d->'filing_hours','review_limited',d->'limited'))||jsonb_build_object('review_pages',d->'review');
   insert into public.document_parse_cache(source_url,source_hash,parser_version,parsed,scan_started_at_page,scan_complete,updated_at)
   values(d->>'url',d->>'sha','gem-representation-review-v1',facts,1,(d->>'pages')::int=jsonb_array_length(d->'review'),p_since)
   on conflict(source_url,source_hash,parser_version) do update set parsed=excluded.parsed,scan_complete=excluded.scan_complete,updated_at=excluded.updated_at
   where public.document_parse_cache.updated_at<=excluded.updated_at;
   recorded:=recorded+1;
  end if;
  if jsonb_typeof(d->'items')='array' and jsonb_array_length(d->'items')>0 then
   report:=public.record_tender_products(t.id,d->>'url',d->>'sha',d->'items',case when d->>'kind'='bid' then 'gem-reviewed-catalogue-v1' else 'gem-boq-csv-v4' end);
   if report->>'status'='COMPLETE' then rows_added:=rows_added+(report->>'count')::int;end if;
   if (d->>'independent_count')::int=jsonb_array_length(d->'items') then
    insert into public.tender_boq_counts values(t.id,d->>'url',d->>'sha',(d->>'independent_count')::int,case when d->>'kind'='bid' then 'official_bid_pdf' else 'official_boq_csv' end,coalesce(d->>'count_location','Official BOQ CSV data rows, excluding header'),p_since) on conflict do nothing;
   end if;
  end if;
 end loop;
 return jsonb_build_object('status','recorded','documents',recorded,'new_rows',rows_added,'superseded',conflicts);
end $$;
revoke all on function tenderscope_private.import_representation_sources(jsonb,timestamptz) from public,anon,authenticated;
