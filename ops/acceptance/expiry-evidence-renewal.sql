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

-- More than one ordinary slot remains available while a mature day-2 check
-- joins an existing stale-confirmation renewal.
truncate pg_temp.tenders, pg_temp.member_saved_bids, pg_temp.expiry_checks;

insert into pg_temp.tenders(id, bid_number, deadline, source, status, lifecycle_state)
select gen_random_uuid(), bid, now() - age, 'GeM', 'expired', lifecycle
from (values
  ('ordinary-head', interval '26 hours', 'EXPIRED'),
  ('ordinary-two', interval '27 hours', 'EXPIRED'),
  ('ordinary-three', interval '28 hours', 'EXPIRED'),
  ('ordinary-four', interval '29 hours', 'EXPIRED'),
  ('saved-completion', interval '4 days', 'EXPIRED'),
  ('cancelled-completion', interval '5 days', 'CANCELLED'),
  ('failed-in-cooldown', interval '5 days 1 hour', 'EXPIRED'),
  ('day2-extension', interval '5 days 2 hours', 'EXPIRED'),
  ('mature-followup', interval '6 days', 'EXPIRED'),
  ('older-followup', interval '7 days', 'EXPIRED'),
  ('stale-renewal', interval '8 days', 'EXPIRED')
) as cases(bid, age, lifecycle);

insert into pg_temp.member_saved_bids
select null, bid_number from pg_temp.tenders where bid_number = 'saved-completion';
insert into pg_temp.expiry_checks(tender_id, deadline, check_day, checked_at, observed_deadline, source_url, outcome)
select id, deadline, 1, now() - interval '2 days', deadline,
  'https://bidplus.gem.gov.in/all-bids', 'unchanged'
from pg_temp.tenders where bid_number not like 'ordinary-%';
insert into pg_temp.expiry_checks(tender_id, deadline, check_day, checked_at, observed_deadline, source_url, outcome)
select id, deadline, 2,
  now() - case bid_number when 'failed-in-cooldown' then interval '2 hours' else interval '48 hours' end,
  case bid_number when 'stale-renewal' then deadline when 'day2-extension' then deadline + interval '1 day' end,
  'https://bidplus.gem.gov.in/all-bids',
  case bid_number when 'stale-renewal' then 'unchanged' when 'day2-extension' then 'extended' else 'failed' end
from pg_temp.tenders where bid_number in ('stale-renewal', 'day2-extension', 'failed-in-cooldown');

do $completion_tests$
declare
  actual text[];
  target pg_temp.tenders%rowtype;
begin
  select array_agg(x->>'bid_number' order by ord)
  into actual from jsonb_array_elements(pg_temp.expiry_checks_due(3)) with ordinality as j(x, ord);
  if actual is distinct from array['ordinary-head', 'stale-renewal', 'ordinary-two'] then
    raise exception 'Small expiry batches must preserve normal priority, got %', actual;
  end if;

  select array_agg((x->>'bid_number') || ':' || (x->>'check_day') order by ord)
  into actual from jsonb_array_elements(pg_temp.expiry_checks_due(5)) with ordinality as j(x, ord);
  if actual is distinct from array['ordinary-head:1', 'stale-renewal:2', 'mature-followup:2',
      'ordinary-two:1', 'ordinary-three:1'] then
    raise exception 'Expected an unsaved day-2 completion, one renewal and three ordinary checks, got %', actual;
  end if;

  select * into strict target from pg_temp.tenders where bid_number='mature-followup';
  if pg_temp.retirement_eligible(target.id) then
    raise exception 'Scheduling the missing proof must not authorize retirement';
  end if;

  perform pg_temp.record_expiry_check(target.id, target.deadline, 2, null, null, 'missing');
  if pg_temp.retirement_eligible(target.id) then
    raise exception 'Missing official response must not authorize retirement';
  end if;
  if pg_temp.expiry_checks_due(5)->2->>'bid_number' is distinct from 'older-followup' then
    raise exception 'A missing response on cooldown must not block the next day-2 follow-up';
  end if;

  select * into strict target from pg_temp.tenders where bid_number='older-followup';
  perform pg_temp.record_expiry_check(target.id, target.deadline, 2, target.deadline,
    'https://bidplus.gem.gov.in/all-bids', 'unchanged');
  if not pg_temp.retirement_eligible(target.id) then
    raise exception 'The original retirement gate should accept fresh, matching official evidence';
  end if;
end;
$completion_tests$;
rollback;
