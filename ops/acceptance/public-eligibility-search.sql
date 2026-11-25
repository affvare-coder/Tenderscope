-- Run with psql against an empty disposable database, with ON_ERROR_STOP set.
begin;
create role anon;
create role authenticated;
create role service_role;

create table public.tenders (
  id uuid primary key, bid_number text, title text, buyer text, location text, category text, subcategory text,
  pvms text, matched_keywords text, defence boolean, deadline timestamptz, closing_date date, closing_time_verified boolean,
  deadline_precision text, status text, lifecycle_state text, first_seen_at timestamptz, updated_at timestamptz, priority text,
  estimated_value_inr numeric, value_basis text, is_extended boolean, extension_count int, last_event_code text,
  last_event_type text, latest_change_at timestamptz, location_class text, location_includes_delhi boolean,
  published_at timestamptz, source_url text, emd_inr numeric, bid_to_ra text, previous_deadline timestamptz,
  last_source_checked_at timestamptz, location_evidence jsonb, analysis_summary text, risk_flags jsonb,
  recommended_action text, ingestion_status text, reviewed_at timestamptz
);
create table public.tender_documents (
  tender_id uuid, official_url text, availability text, content_hash text, kind text,
  first_detected_at timestamptz, version_no int, observed_at timestamptz
);
create table public.tender_events (
  tender_id uuid, detected_at timestamptz, event_code text, event_type text,
  source_url text, previous_value jsonb, new_value jsonb
);
create view public.verified_boq_bids as select null::uuid tender_id, null::int expected_count where false;
create function public.official_representation_windows() returns table(tender_id uuid,ends_at timestamptz)
language sql as $$ select null::uuid, null::timestamptz where false $$;
grant select on public.tenders, public.tender_documents, public.tender_events, public.verified_boq_bids to anon, authenticated;
alter table public.tenders enable row level security;
create policy visible_tenders on public.tenders for select to anon, authenticated using (
  reviewed_at is not null and status='published' and published_at<=now()
  and (deadline>now() or (lifecycle_state='CLOSED_PENDING_VERIFICATION' and deadline>now()-interval '14 days'))
);

\ir ../../supabase/migrations/20261120170000_buyer_pdf_reviews.sql
\ir ../../supabase/migrations/20261125144547_verified_eligibility_and_closed_search.sql
\ir ../../supabase/migrations/20261125144609_preserve_current_buyer_header.sql

insert into public.tenders (
  id,bid_number,title,buyer,category,deadline,status,lifecycle_state,location_class,published_at,source_url,reviewed_at,bid_to_ra
)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid, 'GEM/2026/B/'||n,'Dental forceps','Fixture buyer','Dental',
  now()+offset_days*interval '1 day',status,lifecycle_state,location_class,now()-interval '20 days',
  'https://bidplus.gem.gov.in/showbidDocument/'||n,case when review then now()-interval '1 day' end,'Yes'
from (values
  (1,1,'published','ACTIVE','NON_DELHI',true),
  (2,2,'published','ACTIVE','NON_DELHI',true),
  (3,3,'published','ACTIVE','NON_DELHI',true),
  (4,4,'published','ACTIVE','NON_DELHI',true),
  (5,5,'published','ACTIVE','NON_DELHI',true),
  (6,-1,'published','CLOSED_PENDING_VERIFICATION','DELHI',true),
  (7,-2,'published','CLOSED_PENDING_VERIFICATION','NON_DELHI',true),
  (8,-15,'published','CLOSED_PENDING_VERIFICATION','NON_DELHI',true),
  (9,-1,'expired','CLOSED_PENDING_VERIFICATION','NON_DELHI',true),
  (10,-1,'published','CLOSED_PENDING_VERIFICATION','NON_DELHI',false)
) x(n,offset_days,status,lifecycle_state,location_class,review);

insert into public.tender_buyer_reviews
select t.id,repeat('a',64),t.source_url,t.source_url,now()-interval '1 hour',x.facts
from (values
  (1,'{"ra":{"quote":"No","page":3,"section":"Bid to RA enabled"},"turnover_method":{"quote":"GeM verified turnover","page":3,"section":"Turnover eligibility criteria"},"evaluation":{"quote":"Total value wise evaluation","page":3,"section":"Evaluation Method"},"precedence":{"quote":"ATC supersedes the bid specifications.","page":8,"section":"Specification precedence"}}'::jsonb),
  (2,'{"ra":{"quote":"H1-Highest Priced Bid Elimination","page":2},"turnover_method":{"quote":"To be verified by the buyer at the time of technical evaluation","page":3},"evaluation":{"quote":"Group-wise evaluation","page":3}}'),
  (3,'{"ra":{"quote":"No","page":3},"turnover_method":{"quote":"GeM verified turnover","page":3},"evaluation":{"quote":"Total value wise evaluation","page":3}}'),
  (4,'{"ra":{"quote":"Yes","page":0},"evaluation":{"quote":"Unknown","page":2}}'),
  (5,'{"ra":{"quote":"Yes","page":1,"section":"Bid to RA enabled"}}')
) x(n,facts)
join public.tenders t on t.bid_number='GEM/2026/B/'||x.n;
insert into public.tender_documents
select id,source_url,'available',repeat(case when bid_number='GEM/2026/B/3' then 'b' else 'a' end,64),'bid',now()-interval '1 day',1,now()
from public.tenders where bid_number in ('GEM/2026/B/1','GEM/2026/B/2','GEM/2026/B/3','GEM/2026/B/4');
insert into public.tender_documents
select id,'https://mkp.gem.gov.in/buyer-atc.pdf','unverified',null,'atc',now()-interval '1 day',1,now()-interval '1 day'
from public.tenders where bid_number='GEM/2026/B/1';
insert into public.tender_events
select id,now(),'UPDATED','UPDATED',source_url,'{"location":"Unknown","bid_to_ra":"No"}'::jsonb,'{"location":"Fixture Wing","bid_to_ra":"No"}'::jsonb
from public.tenders where bid_number='GEM/2026/B/1';
update public.tenders set latest_change_at=now() where bid_number='GEM/2026/B/1';

set local role anon;
do $test$
declare result jsonb;
begin
  result := public.public_tender_feed('allopen','','{"ra":"no","turnover_method":"gem","evaluation":"total"}');
  if (result->>'total')::int is distinct from 1 or result#>>'{rows,0,bid_number}' is distinct from 'GEM/2026/B/1' then
    raise exception 'Expected one current match after invalidating the stale hash';
  end if;
  if exists (select from public.current_tender_buyer_reviews where facts ? 'precedence') then
    raise exception 'An unresolved linked ATC must withhold buyer-specific precedence';
  end if;
  if (result#>>'{counts,allopen}')::int is distinct from 5 or (result#>>'{counts,watch}')::int is distinct from 2 then
    raise exception 'Filtered results must preserve public view counts';
  end if;
  result := public.public_tender_feed('allopen','','{"ra":"yes","turnover_method":"buyer","evaluation":"group"}');
  if (result->>'total')::int is distinct from 1 or result#>>'{rows,0,bid_number}' is distinct from 'GEM/2026/B/2' then
    raise exception 'Expected the verified H1 and buyer-verified group-wise case';
  end if;
  if (public.public_tender_feed('allopen','','{"ra":"yes"}')->>'total')::int is distinct from 1 then
    raise exception 'Listing-only evidence, missing digest or missing source page matched';
  end if;
  result := public.public_tender_feed('watch','Dental forceps','{}','deadline',0,1);
  if (result->>'total')::int is distinct from 2 or result#>>'{rows,0,bid_number}' is distinct from 'GEM/2026/B/6'
    or public.public_tender_feed('watch','Dental forceps','{}','deadline',1,1)#>>'{rows,0,bid_number}' is distinct from 'GEM/2026/B/7' then
    raise exception 'Closed search lost its counts, recency, pagination or Delhi row';
  end if;
  if (public.public_tender_feed('watch','GEM/2026/B/8')->>'total')::int is distinct from 0
    or (public.public_tender_feed('watch','GEM/2026/B/9')->>'total')::int is distinct from 0
    or (public.public_tender_feed('watch','GEM/2026/B/10')->>'total')::int is distinct from 0 then
    raise exception 'Unavailable closed record leaked';
  end if;
end $test$;
rollback;
