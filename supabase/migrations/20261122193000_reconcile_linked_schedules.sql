-- Reuse sources already fetched by regular workers. Prioritise a bounded
-- native-PDF reconciliation when its independently fetched GeM CSV is available.
create function public.claim_bid_source_pair(p_spare boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j record; tok uuid:=gen_random_uuid(); n int;
begin
 select (state->>'calls')::int into n from public.sync_state where key='daily_worker_budget';
 if n is null or (not p_spare and n%4<>0) or pg_database_size(current_database())>=485000000 then return null;end if;
 select t.id,t.bid_number,t.deadline,t.source_url parent,d.official_url url,d.content_hash sha,
  b.official_url csv,b.content_hash csv_sha,m.content_hash parent_sha,
  exists(select from public.tender_documents a where a.tender_id=t.id and a.availability is distinct from 'removed' and a.id not in (b.id,m.id,d.id)) extra_files into j
 from public.tenders t join public.tender_documents d on d.tender_id=t.id and d.kind='specification' and d.availability='available'
 join public.tender_documents b on b.tender_id=t.id and b.kind='boq' and b.availability='available' and b.official_url ~* '/BoqLineItemsDocument/[^?#]+\.csv$'
 join public.tender_documents m on m.tender_id=t.id and m.official_url=t.source_url and m.availability='available'
 left join tenderscope_private.bid_source_checks c on c.tender_id=t.id and c.url=d.official_url
 where t.status='published' and t.reviewed_at is not null and t.published_at<=now() and t.deadline>now() and coalesce(t.ingestion_status,'')<>'excluded'
 and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED') and b.content_hash~'^[0-9a-f]{64}$' and d.content_hash~'^[0-9a-f]{64}$' and m.content_hash~'^[0-9a-f]{64}$'
 and not exists(select from public.tender_documents a where a.tender_id=t.id and a.id not in (d.id,b.id) and a.availability is distinct from 'removed' and (a.kind in ('specification','corrigendum','amendment') or a.official_url~*'\.csv([?#]|$)'))
 and exists(select from public.document_parse_cache cache where cache.source_url=d.official_url and cache.source_hash=d.content_hash and cache.scan_complete and cache.parsed->>'page_count'='1' and cache.parsed->'review_pages'->0->>'needs_image_review'='false'
 and cache.parsed->'review_pages'->0->'section'->>'text' ~* '(Item Description|TECH SPECS)')
 and (c.tender_id is null or c.retry_at<=now() or (c.token is null and c.sha<>d.content_hash))
 order by case when t.published_at>=now()-interval '24 hours' and n%8<4 then 0 when t.deadline<=now()+interval '72 hours' and n%8>=4 then 0
 when t.published_at>=now()-interval '24 hours' or t.deadline<=now()+interval '72 hours' then 1 when t.published_at>=now()-interval '72 hours' then 2 else 3 end,
 c.attempts nulls first,t.published_at desc,t.id,d.id limit 1 for update of t skip locked;
 if not found then return null;end if;
 insert into tenderscope_private.bid_source_checks(tender_id,url,token,started_at,retry_at) values(j.id,j.url,tok,now(),now()+interval '10 minutes')
 on conflict(tender_id,url) do update set token=excluded.token,started_at=excluded.started_at,retry_at=excluded.retry_at,attempts=bid_source_checks.attempts+1;
 return (to_jsonb(j)-'bid_number')||jsonb_build_object('bid',j.bid_number,'token',tok);
end $$;
create function public.finish_bid_source_pair(p_id uuid,p_url text,p_token uuid,p_data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare t public.tenders%rowtype; lease tenderscope_private.bid_source_checks%rowtype; result_status text:='source_pending';
 n int; matches int; conflicts int; snap jsonb; raw jsonb; evidence_rows jsonb; manifest jsonb; proof jsonb:=p_data->'proof'; source_count int;
begin
 select * into t from public.tenders where id=p_id for update;
 select * into lease from tenderscope_private.bid_source_checks where tender_id=p_id and url=p_url and token=p_token for update;
 if not found then return 'lease_expired';end if;
 if p_data?'error' then result_status:=left(p_data->>'error',100);
 elsif t.deadline>now() and t.status='published' and t.reviewed_at is not null and (t.latest_change_at is null or t.latest_change_at<=lease.started_at) and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED') and coalesce(t.ingestion_status,'')<>'excluded' and pg_database_size(current_database())<485000000
 and jsonb_typeof(p_data->'rows')='array' and jsonb_array_length(p_data->'rows') between 1 and 500
 and exists(select from public.tender_documents where tender_id=p_id and official_url=p_url and content_hash=p_data->>'sha' and availability='available' and kind='specification')
 and exists(select from public.tender_documents where tender_id=p_id and official_url=p_data->>'csv' and content_hash=p_data->>'csv_sha' and availability='available')
 and exists(select from public.tender_documents where tender_id=p_id and official_url=t.source_url and content_hash=p_data->>'parent_sha' and availability='available')
 and not exists(select from public.tender_documents d where d.tender_id=p_id and d.availability is distinct from 'removed' and d.official_url not in (p_url,p_data->>'csv') and (d.kind in ('specification','corrigendum','amendment') or d.official_url~*'\.csv([?#]|$)')) then
  n:=(p_data->>'n')::int;
  select count(*),count(*) filter(where r->>'question' is not null),jsonb_agg(jsonb_build_object(
   'key',i.item_key,'ordinal',ord,'number',i.item_number,'name',i.name,'quantity',i.quantity,'unit',i.unit,'pack',i.pack,'specification',i.specification,
   'url',i.source_url,'sha',i.source_hash,'spec_url',p_url,'spec_sha',p_data->>'sha','spec_page',1,'row_location','Official CSV record '||ord,
   'spec_location','Buyer PDF page 1, row '||ord,'pdf_wording',r->>'specification') order by ord),
   jsonb_agg(jsonb_strip_nulls(r||jsonb_build_object('name',i.name,'condition',case when proof->>'common' is not null then 'Buyer ATC, page '||(proof->>'atc_page')||' onwards. '||(proof->>'common') end)) order by ord)
  into matches,conflicts,snap,evidence_rows
  from jsonb_array_elements(p_data->'rows') with ordinality as a(r,ord)
  join public.tender_items i on i.tender_id=p_id and i.is_current and i.item_number=ord::text and i.item_number=r->>'n' and trim(i.name)=trim(r->>'name')
   and i.quantity=(r->>'quantity')::numeric and trim(i.unit)=trim(r->>'unit') and i.source_url=p_data->>'csv' and i.source_hash=p_data->>'csv_sha';
  if n=matches and n=jsonb_array_length(p_data->'rows') and n=(select count(*) from public.tender_items where tender_id=p_id and is_current)
   and n=(select count(distinct r->>'key') from jsonb_array_elements(snap) r) then
   perform public.record_schedule_denominator(p_id,p_data->>'csv',p_data->>'csv_sha',n);
   select jsonb_agg(jsonb_build_object('url',d.official_url,'sha',d.content_hash) order by d.official_url,d.id),count(*) into manifest,source_count
   from public.tender_documents d where d.tender_id=p_id and d.availability is distinct from 'removed';
   if source_count=3 and conflicts=0
    and not exists(select from public.tender_events e where e.tender_id=p_id and upper(coalesce(e.event_code,e.event_type,'')) in ('CORRIGENDUM','ATC_CHANGED','SPECIFICATION_CHANGED','BOQ_CHANGED'))
    and not exists(select from jsonb_array_elements(evidence_rows) r where nullif(r->>'consignee_location','') is null or nullif(r->>'consignee','') is null) and proof->>'deadline' is not null and (proof->>'deadline')::timestamptz=t.deadline
    and (proof->>'checked_at')::timestamptz between lease.started_at-interval '1 minute' and clock_timestamp()+interval '1 minute'
    and length(proof->>'common') between 1 and 15000 and n=(select expected_count from public.tender_boq_counts where tender_id=p_id and source_url=p_data->>'csv' and source_sha=p_data->>'csv_sha')
    and not exists(select from jsonb_array_elements(snap) r where regexp_replace(trim(r->>'specification'),'[[:space:]]+',' ','g') is distinct from regexp_replace(trim(r->>'pdf_wording'),'[[:space:]]+',' ','g'))
    and not exists(select from public.verified_boq_bids where tender_id=p_id) then
    insert into public.tender_boq_reviews values(p_id,clock_timestamp(),n,p_data->>'csv',p_data->>'csv_sha','Independent CSV serials reconciled with all buyer PDF schedule rows and parent references',manifest,snap);
   end if;
   raw:=public.bid_pack_extracted_source(p_id,false);
   if (raw->'expected'->>'count')::int=n then
    insert into public.tender_specification_reviews(tender_id,base_version,source_url,source_sha,reviewed_at,rows)
    values(p_id,raw->>'version',p_url,p_data->>'sha',clock_timestamp(),evidence_rows) on conflict do nothing;
    result_status:=case when exists(select from public.verified_boq_bids where tender_id=p_id) then 'certified' when conflicts>0 then 'specification_conflict' else 'rows_compared' end;
   end if;
  end if;
 end if;
 update tenderscope_private.bid_source_checks set token=null,outcome=result_status,sha=coalesce(p_data->>'sha',bid_source_checks.sha),
 retry_at=now()+case when p_data?'error' then least(24,2*lease.attempts)*interval '1 hour' else interval '24 hours' end
 where tender_id=p_id and url=p_url;
 return result_status;
end $$;
revoke all on function public.claim_bid_source_pair(boolean),public.finish_bid_source_pair(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_bid_source_pair(boolean),public.finish_bid_source_pair(uuid,text,uuid,jsonb) to service_role;
