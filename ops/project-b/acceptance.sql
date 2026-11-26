-- Run after the Project B migration in an isolated PostgreSQL 17 fixture.
-- Test data and grant checks are rolled back.
begin;

do $$
begin
  assert not has_schema_privilege('anon', 'tenderscope_engine', 'usage');
  assert not has_schema_privilege('authenticated', 'tenderscope_engine', 'usage');
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname ~ '^tenderscope_.*_boq_v1$') = 6;
  assert not exists (
    select from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname ~ '^tenderscope_.*_boq_v1$'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or not has_function_privilege('service_role', p.oid, 'execute') or p.prosecdef)
  );
end;
$$;

set local role service_role;
do $$
declare
  document_id uuid := 'bdd0c2e9-7628-4961-9987-f82260357859';
  tender_id uuid := '149bd985-9ebb-4516-88c7-dfd6fc86e717';
  first_work uuid := '22780dcd-498a-422a-b9c3-b5b13dc4bda4';
  second_work uuid := 'de2462f7-3be5-44b7-a086-c6b7aaffa9f4';
  bid text := 'GEM/2026/B/1000000';
  url text := 'https://mkp.gem.gov.in/official.csv';
  manifest_hash text := repeat('a', 64);
  source_hash text := repeat('b', 64);
  parser text := 'gem-boq-csv-v4';
  rules text := 'fixture-1';
  deadline timestamptz := statement_timestamp() + interval '2 days';
  expires timestamptz := statement_timestamp() + interval '18 hours';
  result_hash text;
  step jsonb;
  result jsonb;
begin
  assert public.tenderscope_claim_boq_v1() is null, 'empty queue';
  begin
    perform public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
      'https://mkp.gem.gov.in.invalid/boq.csv', source_hash, parser, rules, deadline, expires);
    raise exception 'Non-GeM URL was admitted';
  exception when invalid_parameter_value then
    null;
  end;
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'admitted';
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'replay';
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
    url, repeat('c', 64), parser, rules, deadline, expires) = 'conflict';
  assert (public.tenderscope_claim_boq_v1()->>'generation')::integer = 1;
  assert public.tenderscope_claim_boq_v1() is null, 'live lease cannot be repeated';
  assert public.tenderscope_admit_boq_v1(document_id, second_work, tender_id, bid, 2, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'admitted';
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'superseded';
  assert public.tenderscope_finish_boq_v1(first_work, 1, 1, source_hash, '{}'::jsonb) = 'stale';
  assert (public.tenderscope_claim_boq_v1()->>'generation')::integer = 1;
  update tenderscope_engine.boq_work set lease_until = statement_timestamp() - interval '1 second'
  where work_id = second_work;
  assert (public.tenderscope_claim_boq_v1()->>'generation')::integer = 2, 'renewal fenced';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 1, source_hash, '{}'::jsonb) = 'stale';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, repeat('c', 64), '{}'::jsonb) = 'source_changed';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, source_hash, jsonb_build_object(
    'items', repeat('x', 131073))) = 'result_too_large';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, source_hash, jsonb_build_object(
    'items', jsonb_build_array(1), 'parser_version', parser)) = 'invalid_result';
  result := jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
    'item_key', url || '#row=1', 'item_number', '1', 'name', 'Test  product',
    'quantity', 5, 'unit', ' Box ', 'specification', E' exact,  text\r\nline 2 ',
    'source_url', url, 'source_hash', source_hash)), 'parser_version', parser);
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, source_hash, result || '{"tenant":true}') = 'invalid_result';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, source_hash, result) = 'ready';
  assert public.tenderscope_finish_boq_v1(second_work, 2, 2, source_hash, result) = 'replay';
  select value into strict step from public.tenderscope_ready_boq_v1(5) as q(value);
  assert step->'result' = result, 'verbatim official data and row keys survive';
  result_hash := step->>'result_sha256';
  assert result_hash ~ '^[0-9a-f]{64}$';
  assert public.tenderscope_ack_boq_v1(second_work, 1, result_hash) = 'stale';
  assert public.tenderscope_ack_boq_v1(second_work, 2, repeat('0', 64)) = 'stale';
  assert public.tenderscope_ack_boq_v1(second_work, 2, result_hash) = 'delivered';
  assert public.tenderscope_ack_boq_v1(second_work, 2, result_hash) = 'replay';
  assert not exists(select from public.tenderscope_ready_boq_v1());
  assert (select result_bytes = 0 from tenderscope_engine.boq_work where work_id = second_work);

  update tenderscope_engine.boq_work set dispatch_expires_at = statement_timestamp() - interval '15 days'
  where work_id = second_work;
  insert into tenderscope_engine.boq_work (
    document_id, work_id, tender_id, bid_number, revision, manifest_sha256, source_url, source_sha256,
    parser_version, rules_version, deadline, dispatch_expires_at, state, result, result_sha256
  ) values (gen_random_uuid(), gen_random_uuid(), tender_id, bid, 2, manifest_hash, url, source_hash,
    parser, rules, deadline, statement_timestamp() - interval '15 days', 'ready', result, result_hash);
  assert public.tenderscope_prune_boq_v1(1) = 1;
  assert public.tenderscope_prune_boq_v1(100) = 0, 'undelivered result cannot age out';
  assert (select count(*) from public.tenderscope_ready_boq_v1()) = 1;
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 1, manifest_hash,
    url, source_hash, parser, rules, deadline, statement_timestamp() - interval '15 days') = 'expired';

  -- Simulate an unavailable receiver holding B's result allowance.
  insert into tenderscope_engine.boq_work (
    document_id, work_id, tender_id, bid_number, revision, manifest_sha256, source_url, source_sha256,
    parser_version, rules_version, deadline, dispatch_expires_at, state, result, result_sha256
  )
  select gen_random_uuid(), gen_random_uuid(), tender_id, bid, 2, manifest_hash, url, source_hash,
    parser, rules, deadline, expires, 'ready', jsonb_build_object('fixture',repeat('a',100000)), result_hash
  from generate_series(1,500);
  assert public.tenderscope_admit_boq_v1(document_id, first_work, tender_id, bid, 3, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'admitted';
  assert (public.tenderscope_claim_boq_v1()->>'generation')::integer = 1;
  assert public.tenderscope_finish_boq_v1(first_work, 3, 1, source_hash, result) = 'capacity';
  assert (select count(*) from public.tenderscope_ready_boq_v1(50)) = 20;

  -- Compact pending metadata also has a bound independent of result bytes.
  insert into tenderscope_engine.boq_work (
    document_id, work_id, tender_id, bid_number, revision, manifest_sha256, source_url, source_sha256,
    parser_version, rules_version, deadline, dispatch_expires_at
  )
  select gen_random_uuid(), gen_random_uuid(), tender_id, bid, 1, manifest_hash, url, source_hash,
    parser, rules, deadline, expires
  from generate_series(1,9498);
  assert (select count(*) from tenderscope_engine.boq_work) = 10000;
  assert public.tenderscope_admit_boq_v1(gen_random_uuid(), gen_random_uuid(), tender_id, bid, 1, manifest_hash,
    url, source_hash, parser, rules, deadline, expires) = 'capacity';
end;
$$;

rollback;
