-- Give mature bids with a day-1 confirmation a bounded day-2 turn.
-- Preserve the first ordinary check, the stale renewal, and the normal batch cap.
CREATE OR REPLACE FUNCTION public.expiry_checks_due(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with due as materialized (
    select t.id, t.bid_number, t.deadline, t.q2_hrk_status,
      case when c1.outcome = 'unchanged' then 2 else 1 end as check_day,
      row_number() over (
        order by case when t.deadline >= now() - interval '3 days' then 0 else 1 end,
          t.deadline desc, t.id
      ) as ordinary_rank,
      c2.checked_at as previous_day2_at,
      case
        when c1.outcome = 'unchanged'
          and t.deadline <= now() - interval '3 days'
          and t.lifecycle_state not in ('CANCELLED','OPENED','EXCLUDED')
          and not exists (
            select 1 from public.member_saved_bids s
            where s.tender_id=t.id or s.bid_number=t.bid_number
          )
        then case
          when c2.outcome = 'unchanged' then 'renewal'
          when c2.outcome is null or c2.outcome in ('missing', 'failed') then 'completion'
        end
      end as retirement_check
    from public.tenders t
    left join tenderscope_private.expiry_checks c1
      on c1.tender_id=t.id and c1.deadline=t.deadline and c1.check_day=1
    left join tenderscope_private.expiry_checks c2
      on c2.tender_id=t.id and c2.deadline=t.deadline and c2.check_day=2
    where t.deadline <= now() - interval '1 day'
      and lower(t.source)='gem'
      and t.status in ('published','expired')
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
  ), renewal as (
    select id from due
    where retirement_check = 'renewal' and p_limit > 1
    order by previous_day2_at, deadline, id
    limit 1
  ), completion as (
    select id from due
    where retirement_check = 'completion' and ordinary_rank > 1 and p_limit >= 4
    order by previous_day2_at nulls first, deadline desc, id
    limit 1
  ), selected as (
    select due.*, case
      when ordinary_rank=1 then 0
      when id=(select id from renewal) then 1
      when id=(select id from completion) then 2
      else 3
    end as priority
    from due
    order by priority, ordinary_rank
    limit least(greatest(p_limit, 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'bid_number', bid_number, 'deadline', deadline,
    'q2_hrk_status', q2_hrk_status, 'check_day', check_day
  ) order by priority, ordinary_rank), '[]')
  from selected;
$function$;
