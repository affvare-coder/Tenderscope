create or replace view public.queued_document_lanes with (security_invoker = true) as
with jobs as (
 select sj.id,sj.created_at,sj.available_at,sj.failure_streak,
        coalesce(t.published_at,case when pg_input_is_valid(sj.payload#>>'{row,published_at}','timestamptz') then (sj.payload#>>'{row,published_at}')::timestamptz end,
                 t.first_seen_at,sj.created_at) as published,
        coalesce(t.deadline,case when pg_input_is_valid(sj.payload#>>'{row,closes_at}','timestamptz') then (sj.payload#>>'{row,closes_at}')::timestamptz end) as closing,
        sj.payload->>'recovery_reason' as reason,sj.payload->>'url' as url,
        sj.payload->>'lane' as lane,t.reviewed_at,sj.payload#>>'{row,document_verification_status}' as document_status
 from public.sync_jobs sj
 left join public.tenders t on t.bid_number=sj.payload#>>'{row,bid_number}'
 where sj.state='queued' and sj.payload->>'kind'='document'
)
select id,created_at,available_at,failure_streak,closing,published,
 case when (closing>now() and closing<=now()+interval '72 hours')
        or ((closing is null or closing>now()) and
            (reason in ('deadline_changed','listing_content_changed','corrigendum')
             or lane='expiry-extension-check' or url ~* '(corrigendum|showcorr|bidding-corr)')) then 'urgent'
      when published between now()-interval '24 hours' and now() and (closing is null or closing>now()) then 'fresh'
      else 'backlog' end as lane
from jobs
where (closing is null or closing>=now()-interval '3 days'
       or reviewed_at is not null or document_status='VERIFIED');
revoke all on public.queued_document_lanes from public, anon, authenticated;
grant select on public.queued_document_lanes to service_role;

CREATE OR REPLACE FUNCTION public.claim_sync_job(p_worker_id text, p_lease_seconds integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.sync_jobs%rowtype; selected_id uuid; qs jsonb; streak int; documents_in_burst int; burst_limit int; publication_pending boolean; source_limit int; cadence_hour text; doc_turn int; head_claims int; reconciliation_claims int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:single-worker',0)) then return null; end if;
 if exists(select 1 from public.sync_jobs where state='running' and lease_until>now()) then return null; end if;
 with expired as (
  update public.sync_jobs set state='queued',lease_token=null,lease_until=null,attempts=attempts+1,
  failure_streak=failure_streak+1,last_error='lease_expired',updated_at=now(),
  available_at=now()+make_interval(secs=>least(3600,(60*power(2,least(failure_streak,6)))::int))
  where state='running' and lease_until<now() returning *
 ) insert into public.sync_job_failures(job_id,attempt,error,disposition,retry_at)
 select id,attempts,'lease_expired','retry',available_at from expired on conflict(job_id,attempt) do nothing;
 -- Attempts count lifetime failures; transient failures never silently discard a cursor.
 select state into qs from public.sync_state where key='queue_dispatch';
 select exists(select 1 from public.sync_jobs where state='queued' and available_at<=now() and payload->>'kind'='publication') into publication_pending;
 burst_limit:=case when publication_pending then 3 else 7 end;
 source_limit:=case when publication_pending then 4 else 2 end;
 qs:=coalesce(qs,'{}');cadence_hour:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24');
 head_claims:=case when qs#>>'{cadence,window}'=cadence_hour then coalesce((qs#>>'{cadence,light_head}')::int,0) else 0 end;
 reconciliation_claims:=case when qs#>>'{cadence,window}'=cadence_hour then coalesce((qs#>>'{cadence,reconciliation_tick}')::int,0) else 0 end;
 doc_turn:=coalesce((qs->>'document_turn')::int,0)%4;
 streak:=coalesce((qs->>'discovery_streak')::int,0);documents_in_burst:=coalesce((qs->>'document_streak')::int,0);

 -- Preserve daily publication, hourly reconciliation and expiry reservations.
 if streak>=source_limit and documents_in_burst<2
   and not exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now()
       and x.payload->>'kind'='publication' and x.payload->>'coverage_mode'='daily_head'
       and not (x.cursor ? 'publication') and x.created_at>now()-interval '26 hours'
   )
   and not (head_claims<4 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='light_head'
   ))
   and not (reconciliation_claims<2 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='reconciliation_tick'
   ))
   and not (publication_pending and streak=3 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='expiry_check'
   ))

 then
  select id into selected_id from public.queued_document_lanes where available_at<=now() limit 1; end if;
 if selected_id is null then
 select sj.id into selected_id from public.sync_jobs sj where sj.state='queued' and sj.available_at<=now()
 and (sj.payload->>'kind'<>'document' or exists (select 1 from public.queued_document_lanes eligible where eligible.id=sj.id))
 and (sj.payload->>'kind'<>'light_head' or head_claims<4)
 and (sj.payload->>'kind'<>'reconciliation_tick' or reconciliation_claims<2)
 order by case when payload->>'kind'='publication' and payload->>'coverage_mode'='daily_head'
 and not (sj.cursor ? 'publication') and sj.created_at>now()-interval '26 hours'
 then 0 else 1 end,
 -- Bounded hourly reservations sit below a fresh daily publication head.
 -- At most four light-head and two rotating-reconciliation claims/hour;
 -- the remaining paced invocations retain the existing discovery/document fairness.
 case when payload->>'kind' in ('light_head','reconciliation_tick') then 0 else 1 end,
 case when payload->>'kind'='light_head' then 0 when payload->>'kind'='reconciliation_tick' then 1 else 2 end,
 case when payload->>'kind'='expiry_check' then case when (publication_pending and streak=3) or (not publication_pending and streak=0) then -1 else 2 end else 0 end,
 case when payload->>'kind'='document' then case when streak>=source_limit then 0 else 1 end else case when streak>=source_limit then 1 else 0 end end,
 -- While a publication is pending: two publication slices, one saved
 -- discovery slice and one expiry slice, then a short document burst.
 case when publication_pending and payload->>'kind' not in ('document','expiry_check') then
 case when (streak<2 and payload->>'kind'='publication') or (streak>=2 and payload->>'kind'='discovery') then 0 else 1 end else 0 end,
 -- Fresh publication starts before unfinished previous-day scans.
 case when payload->>'kind'='publication' then sj.created_at end desc nulls last,
 case when payload->>'kind' in ('discovery','publication_recovery') then coalesce((qs->'mode_claims'->>(case when payload->>'kind'='publication_recovery' then 'publication_recovery' else mode end))::timestamptz,'1970-01-01'::timestamptz) else '1970-01-01'::timestamptz end,case when payload->>'kind'='document' and documents_in_burst>=burst_limit then sj.created_at else sj.updated_at end,sj.created_at limit 1;
 end if;
 if selected_id is null then return null; end if;
 -- Retain source cadence and the single-worker lease. Rotate only document claims.
 if exists(select 1 from public.sync_jobs where id=selected_id and payload->>'kind'='document') then
  select id into selected_id from public.queued_document_lanes
  where available_at<=now()
  order by case when lane=(array['fresh','urgent','fresh','backlog'])[doc_turn+1] then 0
                when lane='fresh' then 1 when lane='urgent' then 2 else 3 end,
           case when lane in ('fresh','urgent') and failure_streak>=3 then 1 else 0 end,
           case when lane='urgent' then closing end nulls last,created_at,id
  limit 1;
 end if;
 -- Only the selected row is fetched and locked; never sort full JSON payloads.
 select * into j from public.sync_jobs where id=selected_id and state='queued' and available_at<=now() for update skip locked;
 if j.id is null then return null; end if;
 update public.sync_jobs set state='running',worker_id=p_worker_id,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,180))),updated_at=now()
 where id=j.id returning * into j;
 qs:=jsonb_build_object('document_turn',case when j.payload->>'kind'='document' then (doc_turn+1)%4 else doc_turn end,'cadence',jsonb_build_object('window',cadence_hour,'light_head',head_claims+case when j.payload->>'kind'='light_head' then 1 else 0 end,'reconciliation_tick',reconciliation_claims+case when j.payload->>'kind'='reconciliation_tick' then 1 else 0 end),'discovery_streak',case when j.payload->>'kind'='document' then case when streak>=source_limit and documents_in_burst<burst_limit then streak else 0 end else streak+1 end,
 'document_streak',case when j.payload->>'kind'='document' and streak>=source_limit and documents_in_burst<burst_limit then documents_in_burst+1 else 0 end,
 -- Expiry checks share the daily run, but must not consume daily discovery's turn.
 'mode_claims',case when j.payload->>'kind' in ('discovery','publication_recovery') then coalesce(qs->'mode_claims','{}')||jsonb_build_object(case when j.payload->>'kind'='publication_recovery' then 'publication_recovery' else j.mode end,now()) else coalesce(qs->'mode_claims','{}') end);
 insert into public.sync_state(key,state) values('queue_dispatch',qs) on conflict(key) do update set state=excluded.state,updated_at=now();
 update public.sync_runs set status='running',finished_at=null where id=j.run_id;
 return to_jsonb(j);
end $function$
;
