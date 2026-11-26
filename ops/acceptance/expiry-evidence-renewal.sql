-- Run after the expiry-evidence and bounded-renewal migrations on a disposable database.
begin;
create temp table tenders (
  id uuid primary key,
  bid_number text not null,
  deadline timestamptz not null,
  q2_hrk_status text,
  source text not null,
  status text not null,
  lifecycle_state text not null default 'EXPIRED'
);
create temp table member_saved_bids (tender_id uuid, bid_number text not null);
create temp table expiry_checks (
  tender_id uuid not null,
  deadline timestamptz not null,
  check_day integer not null,
  checked_at timestamptz not null default now(),
  observed_deadline timestamptz,
  source_url text,
  outcome text not null,
  error text,
  primary key(tender_id, deadline, check_day)
);

do $install$
begin
  execute replace(replace(
    pg_get_functiondef('public.expiry_checks_due(integer)'::regprocedure),
    'public.', 'pg_temp.'), 'tenderscope_private.', 'pg_temp.');
  execute replace(replace(
    pg_get_functiondef('public.record_expiry_check(uuid,timestamptz,integer,timestamptz,text,text,text)'::regprocedure),
    'public.', 'pg_temp.'), 'tenderscope_private.', 'pg_temp.');
  execute replace(replace(
    pg_get_functiondef('tenderscope_private.retirement_eligible(uuid)'::regprocedure),
    'public.', 'pg_temp.'), 'tenderscope_private.', 'pg_temp.');
end;
$install$;

insert into pg_temp.tenders(id, bid_number, deadline, source, status)
select gen_random_uuid(), test_case, now() - time_since_deadline, 'GeM', 'expired'
from (values
  ('just-closed', interval '26 hours'),
  ('pending-second', interval '55 hours'),
  ('fresh-proof', interval '4 days'),
  ('stale-proof', interval '5 days'),
  ('stale-failure', interval '6 days'),
  ('recent-failure', interval '7 days'),
  ('expired-job-round', interval '8 days')
) as cases(test_case, time_since_deadline);

insert into pg_temp.expiry_checks(
  tender_id, deadline, check_day, checked_at, observed_deadline, source_url, outcome
)
select id, deadline, 1, now() - interval '2 days', deadline,
  'https://bidplus.gem.gov.in/all-bids', 'unchanged'
from pg_temp.tenders where bid_number not in ('just-closed', 'expired-job-round');

insert into pg_temp.expiry_checks(
  tender_id, deadline, check_day, checked_at, observed_deadline, source_url, outcome
)
select id, deadline, 2,
  now() - case bid_number
    when 'fresh-proof' then interval '35 hours'
    when 'stale-proof' then interval '36 hours'
    when 'stale-failure' then interval '48 hours'
    else interval '3 hours' end,
  case when bid_number <> 'recent-failure' then deadline end,
  'https://bidplus.gem.gov.in/all-bids',
  case when bid_number = 'recent-failure' then 'failed' else 'unchanged' end
from pg_temp.tenders where bid_number in ('fresh-proof', 'stale-proof', 'stale-failure', 'recent-failure');

do $tests$
declare
  actual text[];
  source_url constant text := 'https://bidplus.gem.gov.in/all-bids';
  stale pg_temp.tenders%rowtype;
  failed pg_temp.tenders%rowtype;
  fresh pg_temp.tenders%rowtype;
begin
  select array_agg((x->>'bid_number') || ':' || (x->>'check_day') order by ord)
  into actual
  from jsonb_array_elements(pg_temp.expiry_checks_due(20)) with ordinality as j(x, ord);
  if actual is distinct from array[
    'just-closed:1', 'stale-failure:2', 'pending-second:2', 'stale-proof:2', 'expired-job-round:1'
  ] then
    raise exception 'Expected stale day 2 evidence while preserving priority and cooldown, got %', actual;
  end if;

  if jsonb_array_length(pg_temp.expiry_checks_due(1)) <> 1 then
    raise exception 'Requested limit must bound official source checks';
  end if;
  if (pg_temp.expiry_checks_due(2)->0->>'bid_number') <> 'just-closed'
    or (pg_temp.expiry_checks_due(2)->1->>'bid_number') <> 'stale-failure'
  then
    raise exception 'Renewal must share early turns with ordinary recent checks';
  end if;

  select * into strict stale from pg_temp.tenders where bid_number = 'stale-proof';
  select * into strict failed from pg_temp.tenders where bid_number = 'stale-failure';
  select * into strict fresh from pg_temp.tenders where bid_number = 'fresh-proof';

  perform pg_temp.record_expiry_check(stale.id, stale.deadline, 2, stale.deadline, source_url, 'unchanged');
  if not exists (
    select 1 from pg_temp.expiry_checks e where e.tender_id = stale.id
      and e.deadline = stale.deadline and e.check_day = 2
      and e.checked_at = now() and e.observed_deadline = stale.deadline
      and e.outcome = 'unchanged'
  ) then
    raise exception 'Fresh official evidence must renew the original deadline proof';
  end if;

  if not pg_temp.retirement_eligible(fresh.id) then
    raise exception 'A confirmed, unsaved old tender must remain eligible';
  end if;
  insert into pg_temp.member_saved_bids values (null, fresh.bid_number);
  if pg_temp.retirement_eligible(fresh.id) then
    raise exception 'A saved bid with only its bid number must remain readable';
  end if;
  delete from pg_temp.member_saved_bids where bid_number=fresh.bid_number;
  insert into pg_temp.member_saved_bids values (fresh.id, 'older saved snapshot');
  if pg_temp.retirement_eligible(fresh.id) then
    raise exception 'A saved bid with a tender reference must remain readable';
  end if;

  perform pg_temp.record_expiry_check(failed.id, failed.deadline, 2, null, null, 'failed', 'GeM unavailable');
  if not exists (
    select 1 from pg_temp.expiry_checks e where e.tender_id = failed.id
      and e.deadline = failed.deadline and e.check_day = 2
      and e.checked_at = now() and e.observed_deadline is null
      and e.outcome = 'failed' and e.error = 'GeM unavailable'
  ) then
    raise exception 'Failed recheck must not refresh positive retirement proof';
  end if;
  if exists (
    select 1 from jsonb_array_elements(pg_temp.expiry_checks_due(20)) v
    where v->>'bid_number' in ('stale-proof', 'stale-failure')
  ) then
    raise exception 'Evidence renewal and failed retry must respect the next ordinary turn';
  end if;

  perform pg_temp.record_expiry_check(fresh.id, fresh.deadline, 2, null, null, 'missing');
  if not exists (
    select 1 from pg_temp.expiry_checks e where e.tender_id = fresh.id
      and e.deadline = fresh.deadline and e.check_day = 2
      and e.checked_at = now() - interval '35 hours' and e.outcome = 'unchanged'
  ) then
    raise exception 'A late failed retry cannot overwrite a recent successful observation';
  end if;

  begin
    perform pg_temp.record_expiry_check(failed.id, failed.deadline, 2, failed.deadline,
      'https://example.com/', 'unchanged');
    raise exception 'Expected official dated evidence';
  exception when raise_exception then
    if sqlerrm <> 'Official dated evidence required' then raise; end if;
  end;
  begin
    perform pg_temp.record_expiry_check(failed.id, failed.deadline, 2,
      failed.deadline + interval '1 day', source_url, 'unchanged');
    raise exception 'Expected current deadline';
  exception when raise_exception then
    if sqlerrm <> 'Deadline changed' then raise; end if;
  end;
end;
$tests$;
rollback;
