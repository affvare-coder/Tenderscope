-- Reviewed public buyer documents. Only the ingestion role may write a review.
create table public.tender_buyer_reviews (
  tender_id uuid not null references public.tenders(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text not null check (source_url ~ '^https://[a-zA-Z0-9.-]+\.(gov|edu|ac)\.in/'),
  gem_url text not null check (gem_url ~ '^https://bidplus\.gem\.gov\.in/showbidDocument/[0-9]+$'),
  reviewed_at timestamptz not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  primary key (tender_id, reviewed_at)
);
alter table public.tender_buyer_reviews enable row level security;
revoke all on public.tender_buyer_reviews from public, anon, authenticated;
grant select on public.tender_buyer_reviews to anon, authenticated;
grant select, insert, update, delete on public.tender_buyer_reviews to service_role;
create policy published_buyer_reviews on public.tender_buyer_reviews for select to anon,authenticated
using (exists (select 1 from public.tenders t where t.id=tender_id and t.status='published' and t.reviewed_at is not null));

-- Keep previous reviews for audit. Withhold the facts after a source change.
create view public.current_tender_buyer_reviews with (security_invoker=true) as
select r.tender_id,r.reviewed_at,r.source_url,r.source_sha256,
  case when t.source_url is distinct from r.gem_url or t.latest_change_at > r.reviewed_at
    or exists (select from public.tender_documents d where d.tender_id=r.tender_id and
        ((d.official_url=r.gem_url and (d.availability='removed' or
           (d.content_hash is not null and d.content_hash<>r.source_sha256)))
         or (d.first_detected_at>r.reviewed_at and lower(d.kind) in ('corrigendum','amendment','atc','boq','specification'))
         or (d.version_no>1 and d.observed_at>r.reviewed_at)))
    or exists (select from public.tender_events e where e.tender_id=r.tender_id and e.detected_at>r.reviewed_at
       and upper(coalesce(e.event_code,e.event_type,'')) in
       ('CORRIGENDUM','ATC_CHANGED','BOQ_CHANGED','SPECIFICATION_CHANGED','BID_DOCUMENT_CHANGED','DOCUMENT_CHANGED','DOCUMENT_REMOVED','DOCUMENT_UPDATED'))
    then null else r.facts end as facts
from (select distinct on (tender_id) * from public.tender_buyer_reviews order by tender_id,reviewed_at desc) r
join public.tenders t on t.id=r.tender_id and t.status='published' and t.reviewed_at is not null;
revoke all on public.current_tender_buyer_reviews from public,anon,authenticated;
grant select on public.current_tender_buyer_reviews to anon,authenticated,service_role;
