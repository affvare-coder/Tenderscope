-- Run the setup, capacity migration, and assertions on a disposable database.
CREATE SCHEMA extensions;
CREATE SCHEMA tenderscope_private;
CREATE FUNCTION extensions.digest(text, text) RETURNS bytea LANGUAGE sql IMMUTABLE
AS $$ SELECT sha256(convert_to($1, 'UTF8')) $$;
CREATE FUNCTION tenderscope_private.excluded_source_fingerprint(jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to($1::text, 'UTF8')), 'hex') $$;
CREATE TABLE tenderscope_private.excluded_candidate_receipts (
 bid_number text, listing_fingerprint text, source_fingerprint text,
 rules_version text, source_deadline timestamptz
);
CREATE TABLE public.sync_document_facts (
 bid_number text PRIMARY KEY, row_data jsonb NOT NULL, verified_at timestamptz NOT NULL
);
CREATE TABLE public.sync_candidates (
 bid_number text PRIMARY KEY, row_data jsonb NOT NULL, classification jsonb NOT NULL,
 source_lane text, rules_version text NOT NULL, observed_at timestamptz NOT NULL
);
CREATE TABLE public.rules_versions (version text, created_at timestamptz);
CREATE TABLE public.sync_runs (
 id uuid PRIMARY KEY, mode text NOT NULL, status text NOT NULL DEFAULT 'running',
 stats jsonb, finished_at timestamptz, last_gem_contact_at timestamptz
);
CREATE TABLE public.sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL,
 mode text NOT NULL, dedupe_key text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued', created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(), available_at timestamptz DEFAULT now(),
 lease_until timestamptz, lease_token uuid, cursor jsonb, stats jsonb, last_error text,
 UNIQUE(mode, dedupe_key)
);
CREATE TABLE public.sync_job_dependencies (
 run_id uuid, job_id uuid, PRIMARY KEY (run_id, job_id)
);
CREATE FUNCTION public.recover_verified_document_jobs()
RETURNS void LANGUAGE sql AS $$ SELECT $$;

-- Apply capacity migration here.
DO $test$
DECLARE
 bid text := 'GEM/2026/B/123';
 url text := 'https://bidplus.gem.gov.in/showbidDocument/123';
 observed timestamptz := '2026-11-26 09:00+00';
 doc jsonb := jsonb_build_object(
   'bid_number', bid, 'observed_at', observed,
   'document_verification_status', 'VERIFIED', 'document_verified_at', observed);
 candidate jsonb := jsonb_build_object(
   'bid_number', bid, 'row_data', doc, 'classification', '{"status":"eligible"}'::jsonb,
   'source_lane', 'daily', 'rules_version', '1', 'observed_at', observed);
 run_id uuid := gen_random_uuid();
 other_run_id uuid := gen_random_uuid();
 lease uuid := gen_random_uuid();
 job uuid;
 same_job uuid;
 job_before tid;
 run_before tid;
 candidate_before tid;
 facts_before tid;
BEGIN
 PERFORM public.stage_sync_candidates(jsonb_build_array(candidate));
 SELECT ctid INTO candidate_before FROM public.sync_candidates WHERE bid_number=bid;
 SELECT ctid INTO facts_before FROM public.sync_document_facts WHERE bid_number=bid;
 PERFORM public.stage_sync_candidates(jsonb_build_array(candidate));
 IF (SELECT ctid FROM public.sync_candidates WHERE bid_number=bid) IS DISTINCT FROM candidate_before
  OR (SELECT ctid FROM public.sync_document_facts WHERE bid_number=bid) IS DISTINCT FROM facts_before
 THEN RAISE EXCEPTION 'An identical replay rewrote the candidate or document facts'; END IF;

 PERFORM public.stage_sync_candidates(jsonb_build_array(candidate ||
  jsonb_build_object('observed_at', observed + interval '1 hour')));
 IF (SELECT observed_at FROM public.sync_candidates WHERE bid_number=bid) <> observed + interval '1 hour'
 THEN RAISE EXCEPTION 'New observation was lost'; END IF;
 PERFORM public.stage_sync_candidates(jsonb_build_array(candidate ||
  jsonb_build_object('classification', '{"status":"excluded"}'::jsonb)));
 IF (SELECT classification->>'status' FROM public.sync_candidates WHERE bid_number=bid) <> 'eligible'
 THEN RAISE EXCEPTION 'Older observation overwrote classification'; END IF;

 INSERT INTO public.sync_runs(id, mode) VALUES (run_id,'daily'), (other_run_id,'daily');
 job:=public.enqueue_document_job(run_id,doc,url,'daily');
 SELECT ctid INTO job_before FROM public.sync_jobs WHERE id=job;
 same_job:=public.enqueue_document_job(other_run_id,doc,url,'daily');
 IF same_job IS DISTINCT FROM job
  OR (SELECT ctid FROM public.sync_jobs WHERE id=job) IS DISTINCT FROM job_before
  OR (SELECT count(*) FROM public.sync_job_dependencies WHERE job_id=job) <> 2
 THEN RAISE EXCEPTION 'Identical requeue rewrote the job or lost its dependency'; END IF;
 PERFORM public.enqueue_document_job(other_run_id,doc || '{"document_refresh_reason":"deadline_changed"}'::jsonb,url,'hourly');
 IF (SELECT payload->>'lane' FROM public.sync_jobs WHERE id=job) <> 'hourly'
  OR (SELECT payload->>'recovery_reason' FROM public.sync_jobs WHERE id=job) <> 'deadline_changed'
 THEN RAISE EXCEPTION 'Changed queue payload was suppressed'; END IF;

 PERFORM public.reconcile_sync_runs();
 SELECT ctid INTO run_before FROM public.sync_runs WHERE id=run_id;
 PERFORM public.reconcile_sync_runs();
 IF (SELECT ctid FROM public.sync_runs WHERE id=run_id) IS DISTINCT FROM run_before
 THEN RAISE EXCEPTION 'Unchanged run aggregate was rewritten'; END IF;
 UPDATE public.sync_jobs SET state='running',lease_token=lease,lease_until=now()+interval '1 min' WHERE id=job;
 PERFORM public.checkpoint_sync_job(job,lease,'{}',jsonb_build_object('last_gem_contact',observed));
 SELECT ctid INTO run_before FROM public.sync_runs WHERE id=run_id;
 PERFORM public.checkpoint_sync_job(job,lease,'{"page":2}',jsonb_build_object('last_gem_contact',observed));
 IF (SELECT ctid FROM public.sync_runs WHERE id=run_id) IS DISTINCT FROM run_before
  OR (SELECT cursor->>'page' FROM public.sync_jobs WHERE id=job) <> '2'
 THEN RAISE EXCEPTION 'Repeated contact rewrote run or prevented worker checkpoint'; END IF;
END
$test$;
