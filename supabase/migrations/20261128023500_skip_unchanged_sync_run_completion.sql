-- Preserve the recorded finish time for runs whose terminal outcome is unchanged.
CREATE OR REPLACE FUNCTION public.reconcile_sync_runs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; total jsonb; next_status text;
begin
 perform public.recover_verified_document_jobs();
 for r in select id from public.sync_runs where status in ('queued','running','partial') loop
  select jsonb_build_object('records_scanned',coalesce(sum((stats->>'records_scanned')::int),0),'new_bids',coalesce(sum((stats->>'new_bids')::int),0),'updated_bids',coalesce(sum((stats->>'updated_bids')::int),0),'extended_bids',coalesce(sum((stats->>'extended_bids')::int),0),'documents_checked',coalesce(sum((stats->>'documents_checked')::int),0),'coverage_errors',coalesce(sum((stats->>'coverage_errors')::int),0),'completed_lanes',coalesce(max((stats->>'completed_lanes')::int),0),'total_lanes',coalesce(max((stats->>'total_lanes')::int),0),'failures',count(*) filter(where state in ('partial','failed') or last_error is not null)) into total from public.sync_jobs where run_id=r.id;
  update public.sync_runs set stats=total where id=r.id and stats is distinct from total;
  if not exists(select 1 from public.sync_jobs where (run_id=r.id or id in(select job_id from public.sync_job_dependencies where run_id=r.id)) and state in ('queued','running')) then
   next_status:=case when exists(select 1 from public.sync_jobs where (run_id=r.id or id in(select job_id from public.sync_job_dependencies where run_id=r.id)) and state in ('failed','partial')) then 'partial' else 'succeeded' end;
   update public.sync_runs set status=next_status,finished_at=now() where id=r.id
    and (status is distinct from next_status or finished_at is null);
  end if;
 end loop;
end $function$;
