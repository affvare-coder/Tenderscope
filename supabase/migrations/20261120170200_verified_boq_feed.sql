-- Each attestation describes a complete, independently checked official BOQ and its attachment set.
-- A row snapshot may be written only after comparing every mandatory parameter with its source.
create table public.tender_boq_reviews (
 tender_id uuid not null references public.tenders(id) on delete cascade,
 reviewed_at timestamptz not null,
 expected_count integer not null check (expected_count>0),
 count_url text not null, count_sha text not null check (count_sha ~ '^[a-f0-9]{64}$'),
 count_location text not null check (length(trim(count_location))>0),
 documents jsonb not null check (jsonb_typeof(documents)='array' and jsonb_array_length(documents)>0),
 rows jsonb not null check (jsonb_typeof(rows)='array' and jsonb_array_length(rows)=expected_count),
 primary key(tender_id,reviewed_at)
);
alter table public.tender_boq_reviews enable row level security;
revoke all on public.tender_boq_reviews from public,anon,authenticated;
grant select on public.tender_boq_reviews to anon,authenticated;
grant select,insert,update,delete on public.tender_boq_reviews to service_role;
create policy published_boq_reviews on public.tender_boq_reviews for select to anon,authenticated
 using (exists(select from public.tenders t where t.id=tender_id and t.status='published' and t.reviewed_at is not null));

create view public.verified_boq_bids with (security_invoker=true) as
select r.tender_id,r.expected_count from
(select distinct on(tender_id) * from public.tender_boq_reviews order by tender_id,reviewed_at desc) r
join public.tenders t on t.id=r.tender_id
where t.status='published' and t.deadline>now() and t.reviewed_at is not null
and coalesce(t.latest_change_at,'-infinity')<=r.reviewed_at
and not exists(select from public.tender_events e where e.tender_id=r.tender_id and e.detected_at>r.reviewed_at
 and upper(coalesce(e.event_code,e.event_type,'')) in ('CORRIGENDUM','ATC_CHANGED','BOQ_CHANGED','SPECIFICATION_CHANGED','BID_DOCUMENT_CHANGED','DOCUMENT_ADDED','DOCUMENT_CHANGED','DOCUMENT_REMOVED','DOCUMENT_UPDATED'))
and r.documents @> jsonb_build_array(jsonb_build_object('url',r.count_url,'sha',r.count_sha))
and r.documents=(select jsonb_agg(jsonb_build_object('url',d.official_url,'sha',d.content_hash) order by d.official_url,d.id)
 from public.tender_documents d where d.tender_id=r.tender_id and d.availability is distinct from 'removed')
and not exists(select from public.tender_documents d where d.tender_id=r.tender_id and d.availability is distinct from 'removed'
 and (d.availability is distinct from 'available' or coalesce(d.content_hash,'') !~ '^[a-f0-9]{64}$'
 or coalesce(d.official_url,'') !~ '^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/'))
and (select count(*) from public.tender_items i where i.tender_id=r.tender_id and i.is_current)=r.expected_count
and (select count(distinct row->>'key') from jsonb_array_elements(r.rows) row)=r.expected_count
and not exists(
 select from jsonb_array_elements(r.rows) with ordinality as x(row,ordinal)
 left join public.tender_items i on i.tender_id=r.tender_id and i.is_current and i.item_key=row->>'key'
 where i.item_key is null or not (row @> jsonb_build_object('name',i.name,'quantity',i.quantity,'unit',i.unit,'specification',i.specification,'url',i.source_url,'sha',i.source_hash,'number',i.item_number,'pack',i.pack))
 or coalesce(trim(i.name),'')='' or trim(i.name) ~* '^(sch(edule)?|item|boq)[[:space:]_.-]*[0-9]+$'
 or coalesce(i.quantity,0)<=0 or coalesce(trim(i.unit),'')='' or coalesce(trim(i.specification),'')=''
 or trim(i.specification) ~* '^(as per|refer to|see) (the )?(specification|attachment|ATC|BOQ)|^(unknown|not specified|pending|n/a)$'
 or coalesce(trim(row->>'spec_location'),'')='' or coalesce(trim(row->>'row_location'),'')=''
 or row->>'ordinal' is distinct from ordinal::text
 or not (r.documents @> jsonb_build_array(jsonb_build_object('url',i.source_url,'sha',i.source_hash)))
 or not (r.documents @> jsonb_build_array(jsonb_build_object('url',row->>'spec_url','sha',row->>'spec_sha')))
);
revoke all on public.verified_boq_bids from public,anon,authenticated;
grant select on public.verified_boq_bids to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.public_tender_feed(p_view text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'deadline'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
with verified as materialized (select tender_id,expected_count from public.verified_boq_bids), base as materialized (
 select id,bid_number,title,buyer,location,category,subcategory,pvms,matched_keywords,defence,
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
 case when p_sort='value' then estimated_value_inr end desc nulls last,
 deadline asc nulls last,id asc limit least(greatest(coalesce(p_limit,40),1),40) offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'hay'-'views'-'is_open'-'is_defence') from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(view,n) from(select view,count(*) n from tagged cross join lateral unnest(views) view group by view)x),'{}'::jsonb),
 'categories',coalesce((select jsonb_agg(c order by c) from(select distinct coalesce(subcategory,category) c from base)x),'[]'::jsonb),'read_at',now());
$function$
;
