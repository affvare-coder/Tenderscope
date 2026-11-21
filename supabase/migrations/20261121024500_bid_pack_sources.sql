-- An independent count applies to exactly one version of the source schedule.
create table public.tender_boq_counts (
 tender_id uuid not null references public.tenders(id) on delete cascade,
 source_url text not null, source_sha text not null check(source_sha ~ '^[a-f0-9]{64}$'),
 expected_count integer not null check(expected_count>0),
 source_type text not null check(source_type in ('official_boq_csv','official_bid_pdf')),
 source_location text not null check(length(trim(source_location))>0),
 reviewed_at timestamptz not null,
 primary key (tender_id,source_url,source_sha)
);
alter table public.tender_boq_counts enable row level security;
revoke all on public.tender_boq_counts from public, anon, authenticated;
grant select on public.tender_boq_counts to anon,authenticated;
grant select,insert,update,delete on public.tender_boq_counts to service_role;
create policy published_boq_counts on public.tender_boq_counts for select to anon,authenticated using
(exists(select from public.tenders t where t.id=tender_id and t.status='published' and t.reviewed_at is not null));

-- A single snapshot keeps the items, document versions and review used for an export together.
create function public.bid_pack_source(p_tender_id uuid,p_summary boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
with t as (select * from public.tenders where id=p_tender_id and status='published' and reviewed_at is not null),
docs as (select d.* from public.tender_documents d join t on t.id=d.tender_id),
doc_state as (select coalesce(jsonb_agg(jsonb_build_array(kind,official_url,version_no,content_hash,availability) order by id),'[]') d from docs),
items as (select i.* from public.tender_items i join t on t.id=i.tender_id where i.is_current),
rows_state as (select coalesce(jsonb_agg(to_jsonb(i)-'observed_at' order by i.item_key),'[]'::jsonb) as rows from items i),
cert as (select r.* from public.tender_boq_reviews r join public.verified_boq_bids v using(tender_id) where r.tender_id=p_tender_id order by r.reviewed_at desc limit 1),
counts as (
 select expected_count,count_url as source_url,count_sha as source_sha,
 case when count_url ~* '\.csv($|\?)' then 'official_boq_csv' else 'official_bid_pdf' end as source_type,count_location as source_location,1 priority from cert
 union all select c.expected_count,c.source_url,c.source_sha,c.source_type,c.source_location,2
 from public.tender_boq_counts c join docs d on d.official_url=c.source_url and d.content_hash=c.source_sha and d.availability='available'
 where c.tender_id=p_tender_id and not exists(select from docs d2 where lower(d2.kind)='corrigendum' and coalesce(d2.observed_at,d2.first_detected_at)>c.reviewed_at)
), one_count as (select min(expected_count) n from counts group by priority having count(distinct expected_count)=1 order by priority limit 1),
evidence as(select jsonb_build_object('count',expected_count,'source_url',source_url,'source_hash',source_sha,'source_type',source_type,'source_location',source_location,'verified',true) proof
 from counts join one_count on expected_count=n order by priority, source_url limit 1),
last_amendment as (select max(e.detected_at) as at from public.tender_events e where e.tender_id=p_tender_id
 and upper(coalesce(e.event_code,e.event_type,'')) in ('CORRIGENDUM','ATC_CHANGED','SPECIFICATION_CHANGED','BOQ_CHANGED','DOCUMENT_CHANGED','DOCUMENT_REMOVED','DOCUMENT_UPDATED','BID_DOCUMENT_CHANGED','CANCELLED','REOPENED')),
snap as(select jsonb_build_object('documents',doc_state.d,'deadline',t.deadline,'status',t.status,'lifecycle',t.lifecycle_state,'amendment',last_amendment.at,
 'buyer',t.buyer,'title',t.title,'amount',t.emd_inr,'ra',t.bid_to_ra,'quantity',t.quantity,'location',t.location,'rows_digest',md5(rows_state.rows::text),
 'certified',exists(select from cert),'expected',(select proof from evidence)) info from t,doc_state,rows_state,last_amendment)
select jsonb_build_object('version',md5(info::text),'deadline',info->'deadline','amendment',info->'amendment','document_versions',info->'documents') ||
 case when p_summary then '{}'::jsonb else jsonb_build_object('bid',(select to_jsonb(t) from t),'items',(select rows from rows_state),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.kind,d.id) from docs d),'[]'::jsonb),
 'expected',(select proof from evidence),'certified_rows',coalesce((select rows from cert),'[]'::jsonb)) end from snap
$$;
revoke all on function public.bid_pack_source(uuid,boolean) from public;
grant execute on function public.bid_pack_source(uuid,boolean) to anon,authenticated,service_role;
