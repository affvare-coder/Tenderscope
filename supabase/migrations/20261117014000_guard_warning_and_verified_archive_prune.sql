-- TenderScope permanent safety controls: early DB warning and archive-proof-only retirement.
-- Existing custom 485M guard, bounded worker cap and 1-worker restriction are retained.
CREATE OR REPLACE FUNCTION tenderscope_private.pump_bounded_sync()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb; day text:=to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD'); request_id bigint;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:pump',0)) then return null; end if;
 if exists(select 1 from public.sync_state where key='retention_budget' and (state->>'lease_until')::timestamptz>now()) or extract(minute from now())::int%5=4 then return null; end if;
 select state into s from public.sync_state where key='daily_worker_budget';
 if s->>'date' is distinct from day then s:=jsonb_build_object('date',day,'calls',0); end if;
 if coalesce((s->>'calls')::int,0)>=360 then return null; end if;
 -- Release one invocation every four minutes across the IST day.
 -- Never reset counters or borrow tomorrow's allowance to recover today's backlog.
 if coalesce((s->>'calls')::int,0)>=tenderscope_private.sync_budget_allowance(now()) then return null; end if;

 -- Warn before the existing hard circuit breaker. Pruning verified archive
 -- metadata runs separately and cannot override the 485 MB ingestion cap.
 if pg_database_size(current_database())>=420000000 then
  insert into public.system_alerts(code,mode,message,metadata)
  values('DATABASE_CAPACITY_WARNING','daily','Database approaching custom 485 MB ingestion guard; inspect cold-archive retention and billing usage',
   jsonb_build_object('bytes',pg_database_size(current_database()),'warning_at',420000000,'guard_at',485000000))
  on conflict(code,mode) where resolved_at is null do update
  set last_detected_at=now(),metadata=excluded.metadata;
 else
  update public.system_alerts set resolved_at=now()
  where code='DATABASE_CAPACITY_WARNING' and mode='daily' and resolved_at is null;
 end if;
 if pg_database_size(current_database())>=485000000 then
  insert into public.system_alerts(code,mode,message,metadata) values('DATABASE_BUDGET_GUARD','daily','Scraping paused before database quota; maintenance remains active',jsonb_build_object('bytes',pg_database_size(current_database())))
  on conflict(code,mode) where resolved_at is null do update set last_detected_at=now(),metadata=excluded.metadata;
  return null;
 end if;

 update public.system_alerts set resolved_at=now() where code='DATABASE_BUDGET_GUARD' and mode='daily' and resolved_at is null;
 request_id:=tenderscope_private.wake_sync();
 if request_id is not null then
  insert into public.sync_state(key,state) values('daily_worker_budget',s||jsonb_build_object('calls',coalesce((s->>'calls')::int,0)+1,'last_request_id',request_id))
  on conflict(key) do update set state=excluded.state,updated_at=now();
 end if;
 return request_id;
end $function$
;

-- Bounded two-stage retirement. Original records are already compressed and
-- SHA-256 verified by the existing private Storage archive workflow.
-- Never purge unverified candidates, a known tender, a future-deadline item,
-- a queued/running document, active run data, or a job referenced by child FKs.
CREATE OR REPLACE FUNCTION tenderscope_private.prune_verified_archive_metadata(
 p_candidate_limit integer DEFAULT 250,
 p_job_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
SET statement_timeout TO '10s'
AS $function$
declare candidates_removed integer:=0; jobs_removed integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:retention',0))
    or not pg_try_advisory_xact_lock(hashtextextended('tenderscope:single-worker',0))
    or exists(select 1 from public.sync_jobs where state='running' and lease_until>now())
 then return jsonb_build_object('status','busy'); end if;
 with candidate_target as materialized (
   select c.bid_number from public.sync_candidates c
   where c.classification->>'status'='excluded'
   and c.row_data ? '__archived'
   and c.observed_at<now()-interval '14 days'
   and case when pg_input_is_valid(c.row_data->>'closes_at','timestamptz')
    then (c.row_data->>'closes_at')::timestamptz<now()-interval '3 days'
    else false end
   and not exists(select 1 from public.tenders t where t.bid_number=c.bid_number)
   and not exists(select 1 from public.sync_jobs j
     where j.state in ('queued','running') and j.payload->>'kind'='document'
       and j.payload#>>'{row,bid_number}'=c.bid_number)
   and exists(select 1 from tenderscope_private.cold_archives a
     join storage.objects o on o.bucket_id='tenderscope-cold-archive' and o.name=a.object_key
     where a.scope='candidates' and a.object_key=c.row_data->>'__archived'
       and a.verified_at is not null and c.bid_number=any(a.ids))
   limit least(greatest(p_candidate_limit,0),250)
   for update of c skip locked
 ), deleted_candidates as (
   delete from public.sync_candidates c using candidate_target q
   where c.bid_number=q.bid_number returning 1
 )
 select count(*) into candidates_removed from deleted_candidates;
 with job_target as materialized (
   select j.id from public.sync_jobs j
   join public.sync_runs r on r.id=j.run_id
   where j.state='succeeded' and j.payload ? '__archived'
    and j.updated_at<now()-interval '14 days'
    and r.status in ('succeeded','partial','failed') and r.finished_at is not null
    and not exists(select 1 from public.sync_job_dependencies d where d.job_id=j.id)
    and not exists(select 1 from public.sync_job_failures f where f.job_id=j.id)
    and exists(select 1 from tenderscope_private.cold_archives a
     join storage.objects o on o.bucket_id='tenderscope-cold-archive' and o.name=a.object_key
     where a.scope='jobs' and a.object_key=j.payload->>'__archived'
      and a.verified_at is not null and j.id::text=any(a.ids))
   limit least(greatest(p_job_limit,0),50)
   for update of j skip locked
 ), deleted_jobs as (
   delete from public.sync_jobs j using job_target q
   where j.id=q.id returning 1
 )
 select count(*) into jobs_removed from deleted_jobs;
 return jsonb_build_object('status','pruned','archived_excluded_candidates',candidates_removed,'verified_terminal_jobs',jobs_removed,'bytes_after',pg_database_size(current_database()));
end $function$;
REVOKE ALL ON FUNCTION tenderscope_private.prune_verified_archive_metadata(integer,integer) FROM PUBLIC;
DO $schedule$
begin
 if not exists(select 1 from cron.job where jobname='tenderscope-verified-archive-prune')
 then
   perform cron.schedule('tenderscope-verified-archive-prune','11,41 * * * *',
     'select tenderscope_private.prune_verified_archive_metadata(250,50);');
 end if;
end $schedule$;
