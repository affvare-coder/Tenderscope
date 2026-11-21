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
 case when p_sort='value' then estimated_value_inr end desc nulls last,
 deadline asc nulls last,id asc limit least(greatest(coalesce(p_limit,40),1),40) offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'hay'-'views'-'is_open'-'is_defence') from paged p),'[]'::jsonb),
 'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(view,n) from(select view,count(*) n from tagged cross join lateral unnest(views) view group by view)x),'{}'::jsonb),
 'categories',coalesce((select jsonb_agg(c order by c) from(select distinct coalesce(subcategory,category) c from base)x),'[]'::jsonb),'read_at',now());
$function$
;
