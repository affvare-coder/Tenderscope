-- Isolate the real dispatch function and view in a local-only fixture.
BEGIN;
CREATE TEMP TABLE sync_jobs (LIKE public.sync_jobs INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE sync_state (LIKE public.sync_state INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE sync_runs (LIKE public.sync_runs INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE sync_job_failures (LIKE public.sync_job_failures INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE tenders (LIKE public.tenders INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE tender_documents (LIKE public.tender_documents INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE tender_events (LIKE public.tender_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TEMP TABLE tender_items (LIKE public.tender_items INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
DO $setup$
DECLARE
  claim_definition text;
  lanes_definition text;
BEGIN
  PERFORM set_config('search_path','',true);
  claim_definition:=pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure);
  lanes_definition:=pg_get_viewdef('public.queued_document_lanes'::regclass,true);
  EXECUTE 'CREATE TEMP VIEW queued_document_lanes AS '||replace(lanes_definition,'public.','pg_temp.');
  EXECUTE replace(replace(claim_definition,'public.','pg_temp.'),
    'tenderscope:single-worker','tenderscope:recovery-fixture:'||pg_backend_pid());
END $setup$;

INSERT INTO pg_temp.sync_runs(mode) VALUES ('daily');
INSERT INTO pg_temp.sync_jobs(run_id,mode,dedupe_key,payload,cursor,created_at,available_at)
SELECT run.id,run.mode,j.name,j.payload,j.cursor,now()-j.age,now()+j.wait
FROM pg_temp.sync_runs run
CROSS JOIN (VALUES
  ('new-daily','{"kind":"publication","coverage_mode":"daily_head"}'::jsonb,'{}'::jsonb,
    interval '1 hour',interval '0'),
  ('daily-continuation','{"kind":"publication","coverage_mode":"daily_head"}','{"publication":{"page":4}}',
    interval '26 hours',interval '0'),
  ('hourly-head','{"kind":"light_head"}','{}',interval '55 minutes',interval '0'),
  ('four-hour-subset','{"kind":"reconciliation_tick"}','{}',interval '50 minutes',interval '0'),
  ('current-discovery','{"kind":"discovery"}','{}',interval '25 hours',interval '0'),
  ('older-recovery','{"kind":"publication_recovery"}','{"publication":{"page":12,"ordered":false}}',
    interval '20 days',interval '0'),
  ('latest-due-recovery','{"kind":"publication_recovery"}','{"publication":{"page":42,"ordered":false}}',
    interval '3 days',interval '0'),
  ('backoff-recovery','{"kind":"publication_recovery"}','{"publication":{"page":30,"ordered":false}}',
    interval '2 days',interval '1 hour'),
  ('expiry','{"kind":"expiry_check"}','{}',interval '24 hours',interval '0'),
  ('fresh-document',jsonb_build_object('kind','document','url','https://bidplus.gem.gov.in/showbidDocument/1',
    'row',jsonb_build_object('bid_number','GEM/2026/B/100001','published_at',now()-interval '1 hour',
      'closes_at',now()+interval '8 days')),'{}',interval '60 minutes',interval '0')
) AS j(name,payload,cursor,age,wait);
INSERT INTO pg_temp.sync_state(key,state) VALUES ('queue_dispatch',jsonb_build_object(
  'discovery_streak',2,'mode_claims',jsonb_build_object('daily',now(),'publication_recovery',now()-interval '5 hours')
));

DO $test$
DECLARE
  selected jsonb;
  case_row record;
  reserved_at timestamptz;
BEGIN
  FOR case_row IN SELECT * FROM (VALUES
    ('new-daily',2),('hourly-head',2),('four-hour-subset',2),('expiry',3),
    ('fresh-document',4),('latest-due-recovery',2),('current-discovery',2),
    ('daily-continuation',0),('older-recovery',2)
  ) AS cases(expected,discovery_streak)
  LOOP
    UPDATE pg_temp.sync_state SET state=jsonb_set(state,'{discovery_streak}',to_jsonb(case_row.discovery_streak))
    WHERE key='queue_dispatch';
    IF case_row.expected='older-recovery' THEN
      UPDATE pg_temp.sync_jobs SET state='queued' WHERE dedupe_key IN ('current-discovery','daily-continuation');
      UPDATE pg_temp.sync_state SET state=jsonb_set(state,'{mode_claims,publication_recovery}',to_jsonb(now()-interval '4 hours'))
      WHERE key='queue_dispatch';
    END IF;

    selected:=pg_temp.claim_sync_job('fixture-publication-recovery',30);
    IF selected->>'dedupe_key' IS DISTINCT FROM case_row.expected THEN
      RAISE EXCEPTION 'Expected %, claimed %',case_row.expected,selected->>'dedupe_key';
    END IF;
    IF pg_temp.claim_sync_job('fixture-competing-lease',30) IS NOT NULL THEN
      RAISE EXCEPTION 'A second job was leased while a claim was still running';
    END IF;
    IF case_row.expected='latest-due-recovery' THEN
      IF selected->'cursor' IS DISTINCT FROM '{"publication":{"ordered":false,"page":42}}'::jsonb THEN
        RAISE EXCEPTION 'Saved cursor changed when the recovery was claimed';
      END IF;
      SELECT (state#>>'{mode_claims,publication_recovery}')::timestamptz INTO reserved_at
      FROM pg_temp.sync_state WHERE key='queue_dispatch';
      IF reserved_at IS DISTINCT FROM now() THEN
        RAISE EXCEPTION 'The existing per-mode claim timestamp did not advance';
      END IF;
    END IF;
    UPDATE pg_temp.sync_jobs SET state='succeeded' WHERE id=(selected->>'id')::uuid;
  END LOOP;
END $test$;
ROLLBACK;
