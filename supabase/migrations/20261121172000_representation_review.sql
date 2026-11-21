-- Only the published tender and the current official document hash can expose a review.
-- Cached PDF metadata also contains operational fields. Project only the public evidence.
create or replace function public.representation_sources(p_tender_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('kind',d.kind,'url',d.official_url,'sha',d.content_hash,
 'pages',c.parsed->'page_count','checked_pages',c.parsed->'review_pages',
 'scan_complete',coalesce(c.scan_complete,false),'limited',c.parsed->'review_limited',
 'observed_at',c.updated_at) order by (d.kind='bid') desc,d.kind,d.official_url),'[]'::jsonb)
from public.tenders t join public.tender_documents d on d.tender_id=t.id
left join lateral (select parsed,scan_complete,updated_at from public.document_parse_cache
 where source_url=d.official_url and source_hash=d.content_hash and d.availability='available'
 and parser_version in ('gem-representation-review-v1','gem-pdf-review-v6') and parsed ? 'review_pages'
 order by scan_complete desc,updated_at desc limit 1) c on true
where t.id=p_tender_id and t.status='published' and t.reviewed_at is not null and t.bid_number !~ '/R/'
 and coalesce(t.ingestion_status,'')<>'excluded' and d.availability is distinct from 'removed'
 and d.official_url ~ '^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/'
$$;
revoke all on function public.representation_sources(uuid) from public;
grant execute on function public.representation_sources(uuid) to anon,authenticated,service_role;

create index if not exists representation_explicit_hours on public.document_parse_cache(source_url,source_hash)
 where parsed->>'filing_hours' is not null;
create or replace function public.official_representation_windows()
returns table(tender_id uuid, ends_at timestamptz) language sql stable security definer set search_path='' as $$
select t.id,least(t.deadline,t.published_at+make_interval(hours=>min((c.parsed->>'filing_hours')::integer)))
from public.document_parse_cache c join public.tender_documents d on d.official_url=c.source_url and d.content_hash=c.source_hash
join public.tenders t on t.id=d.tender_id and t.source_url=d.official_url
where c.parser_version in ('gem-representation-review-v1','gem-pdf-review-v6')
 and c.parsed->>'filing_hours' is not null and c.parsed->>'filing_hours' ~ '^[0-9]{1,3}$'
 and c.scan_complete and d.availability='available' and d.kind='bid'
 and t.status='published' and t.reviewed_at is not null and t.deadline>now() and t.published_at<=now()
 and t.bid_number !~ '/R/' and coalesce(t.ingestion_status,'')<>'excluded'
 and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
 and not exists(select from public.tender_documents amendment where amendment.tender_id=t.id
 and amendment.kind in ('corrigendum','amendment') and amendment.availability is distinct from 'removed')
group by t.id,t.deadline,t.published_at having count(distinct c.parsed->>'filing_hours')=1
 and min((c.parsed->>'filing_hours')::integer) between 1 and 720
$$;
revoke all on function public.official_representation_windows() from public;
grant execute on function public.official_representation_windows() to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.public_tender_feed(p_view text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'deadline'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
with windows as materialized (select * from public.official_representation_windows()), verified as materialized (select tender_id,expected_count from public.verified_boq_bids), base as materialized (
 select id,bid_number,title,buyer,location,category,subcategory,pvms,matched_keywords,defence,
 (select ends_at from windows w where w.tender_id=tenders.id) as representation_ends_at,
 deadline,closing_date,closing_time_verified,deadline_precision,status,lifecycle_state,first_seen_at,
 updated_at,priority,estimated_value_inr,value_basis,is_extended,extension_count,last_event_code,last_event_type,
 latest_change_at,location_class,location_includes_delhi,published_at,source_url,emd_inr,bid_to_ra,
 (select expected_count from verified v where v.tender_id=tenders.id) as verified_boq_count,
 previous_deadline,last_source_checked_at,location_evidence,analysis_summary,risk_flags,recommended_action,
 lower(concat_ws(' ',bid_number,title,buyer,location,category,subcategory,pvms,matched_keywords)) as hay,
 (deadline>now() and lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')) as is_open,
 (coalesce(defence,false) or concat_ws(' ',buyer,title) ~* 'army|navy|air force|dg armed|defence|military') as is_defence
 from public.tenders where status='published' and reviewed_at is not null and published_at<=now()
 and bid_number !~ '/R/' and coalesce(ingestion_status,'')<>'excluded'
 and deadline>now() and lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
), tagged as materialized (
 select b.*,array_remove(array[
 case when is_open then 'allopen' end,
 case when is_open and coalesce(representation_ends_at,least(deadline,published_at+interval '72 hours'))>now() then 'representation' end,
 case when is_open and closing_time_verified and deadline_precision<>'date_only' and deadline<=now()+interval '72 hours' then 'closing72' end,
 case when is_open and published_at>=now()-interval '24 hours' then 'published24' end,
 case when is_open and published_at>=now()-interval '92 hours' then 'published92' end,
 case when is_open and verified_boq_count is not null then 'ready' end,
 case when is_open and (verified_boq_count is not null or coalesce(p_search,'')<>'' or not exists(select from base where verified_boq_count is not null)) then 'landing' end,
 case when is_open and location_class is distinct from 'DELHI' then 'active' end,
 case when is_open and location_class is distinct from 'DELHI' and published_at>now()-interval '24 hours' and not coalesce(is_extended,false) and coalesce(extension_count,0)=0 then 'new' end,
 case when is_open and location_class is distinct from 'DELHI' and published_at>now()-interval '96 hours' and not coalesce(is_extended,false) and coalesce(extension_count,0)=0 then 'recent96' end,
 case when is_open and location_class is distinct from 'DELHI' and coalesce(last_event_code,'') not in ('','NEW_BID','NEW','PUBLISHED','DISCOVERED','INITIAL_IMPORT','IMPORTED','UNCHANGED','CHECKED') then 'updated' end,
 case when is_open and location_class is distinct from 'DELHI' and (is_extended or extension_count>0) then 'extended' end,
 case when is_open and location_class is distinct from 'DELHI' and closing_time_verified and deadline_precision<>'date_only' and deadline<=now()+interval '72 hours' then 'closing' end,
 case when is_open and location_class is distinct from 'DELHI' and is_defence then 'defence' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'dgafms|dg armed|armed forces medical' then 'dgafms' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'echs|ex.servicemen contributory health' then 'echs' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'dental|endodont|orthodont|periodont' then 'dental' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'medical|surgic|diagnostic|hospital|\micu\M|clinical' then 'medical' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'pharma|medicin|\mdrugs?\M|vaccine' then 'pharma' end,
 case when is_open and location_class is distinct from 'DELHI' and hay ~ 'research|\mafmrc\M|\manv\M|anveshan' then 'research' end,
 case when is_open and (location_class='DELHI' or (location_class='MULTI_LOCATION' and location_includes_delhi)) then 'delhi' end,
 case when is_open and location_class='MULTI_LOCATION' then 'multi' end,
 case when not is_open and lifecycle_state='CLOSED_PENDING_VERIFICATION' and location_class is distinct from 'DELHI' then 'watch' end
 ],null) as views from base b
), filtered as (
 select * from tagged where p_view=any(views) and (coalesce(p_search,'')='' or strpos(hay,lower(left(p_search,200)))>0)
 and (coalesce(p_filters->>'category','')='' or coalesce(subcategory,category)=p_filters->>'category')
 and (coalesce(p_filters->>'priority','')='' or priority like (p_filters->>'priority')||'%')
 and (coalesce(p_filters->>'defence','')='' or is_defence=(p_filters->>'defence'='yes'))
 and (coalesce(p_filters->>'time','')='' or (closing_time_verified and deadline_precision<>'date_only')=(p_filters->>'time'='verified'))
 and (coalesce(p_filters->>'urgency','')='' or (closing_time_verified and deadline>now() and deadline<=now()+case p_filters->>'urgency' when 'critical' then interval '24 hours' when '72' then interval '72 hours' else interval '7 days' end))
), paged as (
 select * from filtered order by
 case when p_sort='newest' then published_at end desc nulls last,
 case when p_sort='updated' then latest_change_at end desc nulls last,
 case when p_sort='value' then coalesce(estimated_value_inr,case when emd_inr>0 then emd_inr*30 end) end desc nulls last,
 deadline asc nulls last,id asc limit least(greatest(coalesce(p_limit,40),1),40) offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'hay'-'views'-'is_open'-'is_defence') from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(view,n) from(select view,count(*) n from tagged cross join lateral unnest(views) view group by view)x),'{}'::jsonb),
 'categories',coalesce((select jsonb_agg(c order by c) from(select distinct coalesce(subcategory,category) c from base)x),'[]'::jsonb),'read_at',now());
$function$
;

create or replace function public.bid_pack_source(p_tender_id uuid,p_summary boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
with raw as materialized(select public.bid_pack_extracted_source(p_tender_id,p_summary) b),
review as (
 select r.* from public.tender_specification_reviews r,raw
 where r.tender_id=p_tender_id and r.base_version=raw.b->>'version'
 and exists(select from jsonb_array_elements(raw.b->'document_versions') d
  where d->>1=r.source_url and d->>3=r.source_sha and d->>4='available')
), overlay as (
 select i,r.source_url,r.source_sha,x from raw cross join lateral jsonb_array_elements(b->'items') i
 join review r on true left join lateral (
  select x from jsonb_array_elements(r.rows) x
  where x->>'n'=i->>'item_number' and x->>'name'=i->>'name'
  and x->'quantity'=i->'quantity' and x->>'unit'=i->>'unit'
 ) m on true
), visible as (
 select coalesce(jsonb_agg(case when x is null then i else i || jsonb_build_object(
 'boq_specification',i->'specification','spec_sha',source_sha,'specification',x->>'specification','pvms',x->>'pvms','buyer_condition',x->>'condition',
 'buyer_nomenclature',x->>'nomenclature','source_question',x->>'question',
 'spec_url',source_url,'spec_page',(x->>'page')::int,'reviewed_specification',coalesce(x->>'question','')='' and coalesce((x->>'parameters_complete')::boolean,true)) end
 order by i->>'item_key'),'[]'::jsonb) items from overlay
)
select case when r.tender_id is null then b else
 b || jsonb_build_object('version',md5(r.base_version||r.source_sha||r.rows::text)) ||
 case when p_summary then '{}'::jsonb else jsonb_build_object('items',v.items,
 'expected',case when b->'expected' is not null and b->'expected'<>'null'::jsonb then
 (b->'expected')||jsonb_build_object('full_review_pending',jsonb_array_length(b->'certified_rows')=0) else null end) end
 end from raw left join review r on true cross join visible v
$$;
revoke all on function public.bid_pack_source(uuid,boolean) from public;
grant execute on function public.bid_pack_source(uuid,boolean) to anon,authenticated,service_role;
