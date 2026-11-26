-- A completed second check expires after 36 hours under retirement_eligible.
-- Offer it again when stale so missed archive turns cannot strand closed bids.
CREATE OR REPLACE FUNCTION public.expiry_checks_due(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]')
  from (
    select t.id, t.bid_number, t.deadline, t.q2_hrk_status,
      case when c1.outcome = 'unchanged' then 2 else 1 end as check_day
    from public.tenders t
    left join tenderscope_private.expiry_checks c1
      on c1.tender_id = t.id and c1.deadline = t.deadline and c1.check_day = 1
    left join tenderscope_private.expiry_checks c2
      on c2.tender_id = t.id and c2.deadline = t.deadline and c2.check_day = 2
    where t.deadline <= now() - interval '1 day'
      and lower(t.source) = 'gem'
      and t.status in ('published', 'expired')
      and (
        c1.outcome is distinct from 'unchanged'
        or (
          t.deadline <= now() - interval '2 days'
          and (
            c2.outcome is distinct from 'unchanged'
            or c2.checked_at <= now() - interval '36 hours'
          )
          and (c1.checked_at at time zone 'Asia/Kolkata')::date
            < (now() at time zone 'Asia/Kolkata')::date
        )
      )
      and greatest(
        coalesce(c1.checked_at, '1970-01-01'),
        coalesce(c2.checked_at, '1970-01-01')
      ) < now() - interval '6 hours'
    order by case when t.deadline >= now() - interval '3 days' then 0 else 1 end,
      t.deadline desc, t.id
    limit least(greatest(p_limit, 1), 20)
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.record_expiry_check(
  p_id uuid,
  p_deadline timestamptz,
  p_day integer,
  p_observed_deadline timestamptz,
  p_source_url text,
  p_outcome text,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if p_day not in (1, 2)
    or p_outcome not in ('unchanged', 'extended', 'missing', 'failed')
  then
    raise exception 'Invalid expiry observation';
  end if;
  if p_outcome in ('unchanged', 'extended')
    and (p_observed_deadline is null
      or coalesce(p_source_url, '') !~ '^https://([a-zA-Z0-9-]+\.)*gem\.gov\.in/')
  then
    raise exception 'Official dated evidence required';
  end if;
  if p_outcome = 'unchanged' and p_observed_deadline is distinct from p_deadline then
    raise exception 'Deadline changed';
  end if;

  insert into tenderscope_private.expiry_checks(
    tender_id, deadline, check_day, observed_deadline, source_url, outcome, error
  )
  values(
    p_id, p_deadline, p_day, p_observed_deadline, p_source_url, p_outcome, left(p_error, 300)
  )
  on conflict(tender_id, deadline, check_day) do update
    set checked_at = now(), observed_deadline = excluded.observed_deadline,
      source_url = excluded.source_url, outcome = excluded.outcome, error = excluded.error
  where expiry_checks.outcome not in ('unchanged', 'extended')
    or excluded.outcome = 'extended'
    -- A failed or missing fresh observation replaces stale evidence and
    -- restarts the retry delay without becoming proof for retirement.
    or (
      expiry_checks.check_day = 2
      and expiry_checks.outcome = 'unchanged'
      and expiry_checks.checked_at <= now() - interval '36 hours'
    );
  return true;
end;
$function$;

-- The commit function locks the tender row before it repeats this check.
-- The saved-bid foreign key serializes a concurrent save of that tender.
CREATE OR REPLACE FUNCTION tenderscope_private.retirement_eligible(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  select exists(
    select 1
    from public.tenders t
    where t.id=p_id and t.deadline<=now()-interval '3 days'
      and t.status in ('published','expired')
      and t.lifecycle_state not in ('CANCELLED','OPENED','EXCLUDED')
      and not exists(
        select 1 from public.member_saved_bids s
        where s.tender_id=t.id or s.bid_number=t.bid_number
      )
      and exists(
        select 1 from tenderscope_private.expiry_checks c
        where c.tender_id=t.id and c.deadline=t.deadline
          and c.check_day=1 and c.outcome='unchanged'
      )
      and exists(
        select 1 from tenderscope_private.expiry_checks c
        where c.tender_id=t.id and c.deadline=t.deadline
          and c.check_day=2 and c.outcome='unchanged'
          and c.checked_at>now()-interval '36 hours'
      )
  );
$function$;
