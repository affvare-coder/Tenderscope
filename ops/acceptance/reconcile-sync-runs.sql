-- Disposable database test after the sync-run reconciliation migration.
DO $test$
DECLARE
 stable_run uuid := gen_random_uuid();
 ready_run uuid := gen_random_uuid();
 waiting_run uuid := gen_random_uuid();
 missing_finish uuid := gen_random_uuid();
 job uuid := gen_random_uuid();
 stable_job uuid := gen_random_uuid();
 waiting_job uuid := gen_random_uuid();
 created_stamp timestamptz := now() - interval '3 days';
 parked_record record;
BEGIN
 INSERT INTO public.sync_runs(id,mode,status,finished_at) VALUES
   (stable_run,'daily','partial',created_stamp),
   (ready_run,'daily','running',NULL),
   (waiting_run,'daily','running',NULL),
   (missing_finish,'daily','partial',NULL);
 INSERT INTO public.sync_jobs(id,run_id,mode,dedupe_key,payload,state,stats) VALUES
   (job,ready_run,'daily',job::text,'{}','succeeded','{"records_scanned": 17}'),
   (stable_job,stable_run,'daily',stable_job::text,'{}','partial','{}'),
   (waiting_job,waiting_run,'daily',waiting_job::text,'{}','queued','{}');
 INSERT INTO public.sync_job_dependencies VALUES (missing_finish, stable_job), (waiting_run, job);
 PERFORM public.reconcile_sync_runs();
 IF (SELECT finished_at FROM public.sync_runs WHERE id=stable_run) IS DISTINCT FROM created_stamp
   OR (SELECT status FROM public.sync_runs WHERE id=ready_run) IS DISTINCT FROM 'succeeded'
   OR (SELECT status FROM public.sync_runs WHERE id=waiting_run) IS DISTINCT FROM 'running'
   OR NOT EXISTS (SELECT 1 FROM public.sync_runs WHERE id=missing_finish AND status='partial' AND finished_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Reconciliation changed a recorded finish time or failed to respect dependency state'; END IF;

 SELECT ctid,finished_at,stats INTO parked_record FROM public.sync_runs WHERE id=stable_run;
 PERFORM public.reconcile_sync_runs();
 IF NOT EXISTS (SELECT 1 FROM public.sync_runs WHERE id=stable_run AND ctid=parked_record.ctid AND finished_at=parked_record.finished_at AND stats=parked_record.stats)
 THEN RAISE EXCEPTION 'Unchanged closed partial run was rewritten'; END IF;

 UPDATE public.sync_jobs SET stats='{"records_scanned": 2}' WHERE id=stable_job;
 PERFORM public.reconcile_sync_runs();
 IF NOT EXISTS (SELECT 1 FROM public.sync_runs WHERE id=stable_run AND finished_at=created_stamp AND stats->>'records_scanned'='2')
 THEN RAISE EXCEPTION 'New counts or original finish time were lost'; END IF;

 UPDATE public.sync_jobs SET state='succeeded' WHERE id=stable_job;
 PERFORM public.reconcile_sync_runs();
 IF NOT EXISTS (SELECT 1 FROM public.sync_runs WHERE id=stable_run AND status='succeeded' AND finished_at>created_stamp)
   OR NOT EXISTS (SELECT 1 FROM public.sync_runs WHERE id=missing_finish AND status='succeeded')
 THEN RAISE EXCEPTION 'A recovered job failed to upgrade its owning or dependent run'; END IF;
END
$test$;
