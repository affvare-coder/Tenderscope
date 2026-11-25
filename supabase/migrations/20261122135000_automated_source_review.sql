-- One bounded review slot in four existing worker starts. No additional Edge schedule.
create table tenderscope_private.bid_source_checks (
 tender_id uuid not null references public.tenders(id) on delete cascade,
 url text not null, token uuid, started_at timestamptz not null, retry_at timestamptz not null,
 attempts integer not null default 1, outcome text, sha text, primary key(tender_id,url)
);
revoke all on tenderscope_private.bid_source_checks from public,anon,authenticated;
create function public.claim_bid_source_review() returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; tok uuid:=gen_random_uuid(); n int; lane int;
begin
 if pg_database_size(current_database())>=485000000 then return null;end if;
 select (state->>'calls')::int into n from public.sync_state where key='daily_worker_budget';
 if n is null or n%4<>0 then return null;end if;
 lane:=(n/4)%4;
 select t.id,t.bid_number,t.deadline,d.official_url url,case when d.official_url=t.source_url then 'bid' else 'boq' end kind into job
 from public.tenders t join public.tender_documents d on d.tender_id=t.id
 left join tenderscope_private.bid_source_checks c on c.tender_id=t.id and c.url=d.official_url
 where t.status='published' and t.reviewed_at is not null and t.published_at<=now() and t.deadline>now()
 and coalesce(t.ingestion_status,'')<>'excluded' and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
 and d.availability is distinct from 'removed' and ((d.official_url=t.source_url and t.source_url~'^https://bidplus\.gem\.gov\.in/showbidDocument/[0-9]+$')
 or (d.official_url~*'^https://mkp\.gem\.gov\.in/[^?#]+/BoqLineItemsDocument/[^?#]+\.csv$' and d.availability='available'))
 and (c.tender_id is null or c.retry_at<=now() or (c.token is null and c.sha is not null and d.content_hash is not null and c.sha<>d.content_hash))
 order by case when lane=1 and d.official_url<>t.source_url and t.deadline<=now()+interval '72 hours' then 0
 when lane=2 and d.official_url=t.source_url and t.deadline<=now()+interval '72 hours' then 0
 when lane in(0,3) and d.official_url=t.source_url and t.published_at>=now()-interval '24 hours' then 0
 when t.published_at>=now()-interval '24 hours' or t.deadline<=now()+interval '72 hours' then 1 else 2 end,
 case when lane=3 and d.official_url=t.source_url and not exists(select from public.tender_documents x where x.tender_id=t.id and x.official_url<>t.source_url and x.availability is distinct from 'removed') then 0 else 1 end,
 c.attempts nulls first,case when lane in(1,2) then t.deadline end, t.published_at desc,t.id,d.id limit 1 for update of t skip locked;
 if not found then return null;end if;
 insert into tenderscope_private.bid_source_checks(tender_id,url,token,started_at,retry_at) values(job.id,job.url,tok,now(),now()+interval '10 minutes')
 on conflict(tender_id,url) do update set token=excluded.token,started_at=excluded.started_at,retry_at=excluded.retry_at,attempts=bid_source_checks.attempts+1;
 return jsonb_build_object('id',job.id,'bid',job.bid_number,'url',job.url,'kind',job.kind,'deadline',job.deadline,'token',tok);
end $$;
create function public.record_schedule_denominator(p_id uuid,p_url text,p_sha text,p_count int) returns void
language sql security definer set search_path='' as $$
 insert into public.tender_boq_counts(tender_id,source_url,source_sha,expected_count,source_type,source_location,reviewed_at)
 select t.id,p_url,p_sha,p_count,'official_boq_csv','Official CSV Item Number, contiguous source records 1–'||p_count,now()
 from public.tenders t join public.tender_documents d on d.tender_id=t.id and d.official_url=p_url and d.content_hash=p_sha and d.availability='available'
 where t.id=p_id and t.deadline>now() and p_count between 1 and 20000 and pg_database_size(current_database())<485000000
 and p_url~*'^https://mkp\.gem\.gov\.in/[^?#]+/BoqLineItemsDocument/[^?#]+\.csv$'
 and exists(select from public.tender_documents main join public.document_parse_cache c on c.source_url=main.official_url and c.source_hash=main.content_hash
 where main.tender_id=t.id and main.official_url=t.source_url and main.availability='available' and c.scan_complete and c.scan_started_at_page=1 and c.parsed->>'bid_number'=t.bid_number
 and exists(select from jsonb_array_elements(c.parsed->'documents') a where a->>'url'=p_url))
 and not exists(select from public.tender_documents x where x.tender_id=t.id and x.availability is distinct from 'removed'
 and ((x.official_url<>p_url and x.official_url~*'\.csv([?#]|$)') or x.kind in ('corrigendum','amendment')))
 on conflict(tender_id,source_url,source_sha) do nothing
$$;
create function public.finish_bid_source_review(p_id uuid,p_url text,p_token uuid,p_data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare t public.tenders%rowtype; c tenderscope_private.bid_source_checks%rowtype; d public.tender_documents%rowtype;
 result_status text:='source_pending'; sha text:=p_data->>'sha'; proof jsonb:=p_data->'proof'; facts jsonb:=p_data->'facts'; review_time timestamptz;
 manifest jsonb; snap jsonb; k text:=p_url||'#catalogue:1'; rowdata jsonb; newdocs jsonb;
begin
 select * into t from public.tenders where id=p_id for update;
 select * into c from tenderscope_private.bid_source_checks where tender_id=p_id and url=p_url and token=p_token for update;
 if not found then return 'lease_expired';end if;
 select * into d from public.tender_documents where tender_id=p_id and official_url=p_url;
 if p_data?'error' then result_status:='fetch_or_parse_failed: '||left(p_data->>'error',100);
 elsif pg_database_size(current_database())>=485000000 then result_status:='capacity_guard';
 elsif d.id is null or d.availability='removed' or t.deadline<=now() or coalesce(t.ingestion_status,'')='excluded' or t.reviewed_at is null or t.status<>'published'
  or sha is null or sha !~'^[0-9a-f]{64}$' or (d.content_hash is not null and d.content_hash<>sha)
  or t.latest_change_at>c.started_at then result_status:='source_changed';
 elsif p_url<>t.source_url then
  if (p_data->>'count')~'^[1-9][0-9]{0,4}$' then
   perform public.record_schedule_denominator(p_id,p_url,sha,(p_data->>'count')::int);
   if exists(select from public.tender_boq_counts where tender_id=p_id and source_url=p_url and source_sha=sha) then result_status:='count_recorded';end if;
  end if;
 else
  select coalesce(jsonb_agg(jsonb_build_object('kind',case when l->>'kind'='boq_csv' then 'boq' else l->>'kind' end,
   'document_key',case when l->>'kind'='boq_csv' then 'boq' else l->>'kind' end||':'||(l->>'url'),'official_url',l->>'url')),'[]') into newdocs
   from jsonb_array_elements(p_data->'links') l where l->>'url'~'^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/' and l->>'url'<>p_url
   and not exists(select from public.tender_documents e where e.tender_id=p_id and e.official_url=l->>'url');
  if d.content_hash is null or d.availability is distinct from 'available' then
   newdocs:=newdocs||jsonb_build_array(jsonb_build_object('kind','bid','document_key',d.document_key,'official_url',p_url,'content_hash',sha,'availability','available','link_status','verified'));
  end if;
  if jsonb_array_length(newdocs)>0 then perform public.ingest_tender(jsonb_build_object('bid_number',t.bid_number,'documents_complete',false,'documents',newdocs),'gem','automated-source-review',null,clock_timestamp(),null);end if;
  if exists(select from public.tender_documents x where x.tender_id=p_id and x.official_url=p_url and x.content_hash=sha and x.availability='available')
   and not exists(select from public.tender_documents x where x.tender_id=p_id and x.kind in ('corrigendum','amendment') and x.availability is distinct from 'removed')
   and not exists(select from public.tender_events e where e.tender_id=p_id and upper(coalesce(e.event_code,e.event_type,'')) in ('CORRIGENDUM','ATC_CHANGED','SPECIFICATION_CHANGED','BOQ_CHANGED')) then
   review_time:=clock_timestamp();
   if facts is not null and facts<>'{}'::jsonb and not exists(select from public.tender_buyer_reviews where tender_id=p_id and (source_url<>gem_url or (source_sha256=sha and tender_buyer_reviews.facts=p_data->'facts'))) then
    insert into public.tender_buyer_reviews values(p_id,sha,p_url,p_url,review_time,facts);
   end if;
   result_status:=case when facts is not null and facts<>'{}'::jsonb then 'header_reviewed' else 'no_header_match' end;
   if jsonb_typeof(proof)='object' and p_data->'lifecycle'->>'bid'=t.bid_number
    and p_data->'lifecycle'->>'corrigendum'='none' and (p_data->'lifecycle'->>'deadline')::timestamptz=t.deadline
    and (p_data->'lifecycle'->>'checked_at')::timestamptz between c.started_at-interval '1 minute' and clock_timestamp()+interval '1 minute' and (p_data->>'complete')::boolean and jsonb_array_length(p_data->'links')=0 and length(proof->>'specification') between 10 and 45000
    and (proof->>'quantity')::numeric>0 and nullif(proof->>'name','') is not null and nullif(proof->>'unit','') is not null
    and not exists(select from public.tender_documents x where x.tender_id=p_id and x.official_url<>p_url and x.availability is distinct from 'removed')
    and not exists(select from public.tender_items i where i.tender_id=p_id and i.is_current and i.item_key<>k) then
    manifest:=jsonb_build_array(jsonb_build_object('url',p_url,'sha',sha));
    rowdata:=proof||jsonb_build_object('item_number','1','item_key',k);
    perform public.record_tender_products(p_id,p_url,sha,jsonb_build_array(rowdata),'gem-catalogue-reconciliation-v1');
    select jsonb_build_array(jsonb_build_object('key',i.item_key,'ordinal',1,'name',i.name,'number',i.item_number,'quantity',i.quantity,'unit',i.unit,'pack',i.pack,'specification',i.specification,'url',p_url,'sha',sha,'spec_url',p_url,'spec_sha',sha,'row_location',proof->>'row_location','spec_page',proof->'spec_page','spec_location',proof->>'spec_location')) into snap
    from public.tender_items i where i.tender_id=p_id and i.item_key=k and i.is_current and i.source_hash=sha and i.specification=proof->>'specification';
    if snap is not null and not exists(select from public.verified_boq_bids where tender_id=p_id) then
     insert into public.tender_boq_reviews values(p_id,clock_timestamp(),1,p_url,sha,proof->>'count_location',manifest,snap);
    end if;
    if exists(select from public.verified_boq_bids where tender_id=p_id) then result_status:='certified';end if;
   end if;
  end if;
 end if;
 update tenderscope_private.bid_source_checks set token=null,sha=coalesce(finish_bid_source_review.p_data->>'sha',bid_source_checks.sha),outcome=result_status,
 retry_at=now()+case when p_data?'error' then least(24,greatest(1,c.attempts))*interval '1 hour' else interval '24 hours' end
 where tender_id=p_id and url=p_url;
 return result_status;
end $$;
revoke all on function public.claim_bid_source_review(),public.record_schedule_denominator(uuid,text,text,int),public.finish_bid_source_review(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_bid_source_review(),public.record_schedule_denominator(uuid,text,text,int),public.finish_bid_source_review(uuid,text,uuid,jsonb) to service_role;

create function public.record_bid_header_evidence(p_id uuid,p_url text,p_sha text,p_facts jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tenders t where t.id=p_id and t.source_url=p_url and t.deadline>now() and t.reviewed_at is not null and t.status='published' for update;
 if not found or pg_database_size(current_database())>=485000000 or jsonb_typeof(p_facts) is distinct from 'object' or p_facts='{}' or length(p_facts::text)>24000 then return;end if;
 if not exists(select from public.tender_documents d where d.tender_id=p_id and d.official_url=p_url and d.content_hash=p_sha and d.availability='available')
 or exists(select from public.tender_documents d where d.tender_id=p_id and d.kind in ('corrigendum','amendment') and d.availability is distinct from 'removed')
 or exists(select from public.tender_events e where e.tender_id=p_id and upper(coalesce(e.event_code,e.event_type,'')) in ('CORRIGENDUM','ATC_CHANGED','SPECIFICATION_CHANGED','BOQ_CHANGED'))
 or exists(select from public.tender_buyer_reviews r where r.tender_id=p_id and (r.source_url<>r.gem_url or r.source_sha256=p_sha)) then return;end if;
 insert into public.tender_buyer_reviews values(p_id,p_sha,p_url,p_url,clock_timestamp(),p_facts);
end $$;
revoke all on function public.record_bid_header_evidence(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_bid_header_evidence(uuid,text,text,jsonb) to service_role;
