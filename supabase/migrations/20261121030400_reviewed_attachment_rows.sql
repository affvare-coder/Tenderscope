-- Preserve the raw official schedule. Overlay an independently compared attachment only
-- while the exact underlying tender, row set, documents and amendments still match.
create table public.tender_specification_reviews (
 tender_id uuid not null references public.tenders(id) on delete cascade,
 base_version text not null check(base_version ~ '^[a-f0-9]{32}$'),
 source_url text not null check(source_url ~ '^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/'),
 source_sha text not null check(source_sha ~ '^[a-f0-9]{64}$'),
 reviewed_at timestamptz not null,
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)>0),
 primary key(tender_id,base_version)
);
alter table public.tender_specification_reviews enable row level security;
revoke all on public.tender_specification_reviews from public,anon,authenticated;
grant select on public.tender_specification_reviews to anon,authenticated;
grant select,insert,update,delete on public.tender_specification_reviews to service_role;
create policy published_attachment_reviews on public.tender_specification_reviews for select to anon,authenticated
 using (exists(select from public.tenders t where t.id=tender_id and t.status='published' and t.reviewed_at is not null));

alter function public.bid_pack_source(uuid,boolean) rename to bid_pack_extracted_source;
create function public.bid_pack_source(p_tender_id uuid,p_summary boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
with raw as materialized(select public.bid_pack_extracted_source(p_tender_id,p_summary) b),
review as (
 select r.* from public.tender_specification_reviews r,raw
 where r.tender_id=p_tender_id and r.base_version=raw.b->>'version'
 and exists(select from jsonb_array_elements(raw.b->'document_versions') d
  where d->>1=r.source_url and d->>3=r.source_sha and d->>4='available')
), overlay as (
 select i,r.source_url,x from raw cross join lateral jsonb_array_elements(b->'items') i
 join review r on true left join lateral (
  select x from jsonb_array_elements(r.rows) x
  where x->>'n'=i->>'item_number' and x->>'name'=i->>'name'
  and x->'quantity'=i->'quantity' and x->>'unit'=i->>'unit'
 ) m on true
), visible as (
 select coalesce(jsonb_agg(case when x is null then i else i || jsonb_build_object(
 'specification',x->>'specification','pvms',x->>'pvms','buyer_condition',x->>'condition',
 'buyer_nomenclature',x->>'nomenclature','source_question',x->>'question',
 'spec_url',source_url,'spec_page',(x->>'page')::int,'reviewed_specification',coalesce(x->>'question','')='') end
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
