-- Project B only. Public GeM BOQ CSV processing. A owns document revisions,
-- result acceptance and all publication.
create schema tenderscope_engine;
revoke all on schema tenderscope_engine from public, anon, authenticated;
grant usage on schema tenderscope_engine to service_role;

create table tenderscope_engine.boq_work (
  document_id uuid primary key,
  work_id uuid not null unique,
  tender_id uuid not null,
  bid_number text not null,
  revision bigint not null check (revision > 0),
  manifest_sha256 text not null,
  source_url text not null,
  source_sha256 text not null,
  parser_version text not null,
  rules_version text not null,
  deadline timestamptz not null,
  dispatch_expires_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued','leased','ready','delivered')),
  generation integer not null default 0 check (generation between 0 and 4),
  lease_until timestamptz,
  ready_at timestamptz,
  result jsonb,
  result_sha256 text,
  result_bytes integer generated always as (coalesce(octet_length(result::text), 0)) stored,
  check ((state = 'ready') = (result is not null)),
  check ((state in ('ready','delivered')) = (result_sha256 is not null)),
  check ((state = 'leased') = (lease_until is not null)),
  check (result_bytes <= 131072)
);
alter table tenderscope_engine.boq_work enable row level security;
revoke all on tenderscope_engine.boq_work from public, anon, authenticated;
grant select, insert, update, delete on tenderscope_engine.boq_work to service_role;

create function public.tenderscope_admit_boq_v1(
  p_document_id uuid, p_work_id uuid, p_tender_id uuid, p_bid_number text,
  p_revision bigint, p_manifest_sha256 text, p_source_url text, p_source_sha256 text,
  p_parser_version text, p_rules_version text, p_deadline timestamptz,
  p_dispatch_expires_at timestamptz
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  existing tenderscope_engine.boq_work%rowtype;
begin
  if p_document_id is null or p_work_id is null or p_tender_id is null
     or not coalesce(p_bid_number ~ '^GEM/[0-9]{4}/B/[0-9]{1,12}$', false)
     or coalesce(p_revision, 0) <= 0
     or not coalesce(p_manifest_sha256 ~ '^[0-9a-f]{64}$', false)
     or not coalesce(p_source_sha256 ~ '^[0-9a-f]{64}$', false)
     or not coalesce(p_source_url ~ '^https://([a-z0-9-]+[.])*gem[.]gov[.]in/[^[:cntrl:][:space:]#]+$'
                    and position(chr(92) in p_source_url) = 0
                    and octet_length(p_source_url) <= 2048, false)
     or not coalesce(p_parser_version ~ '^gem-boq-csv-v[0-9]{1,6}$', false)
     or not coalesce(p_rules_version ~ '^[A-Za-z0-9_.-]{1,64}$', false)
     or not coalesce(isfinite(p_deadline), false)
     or p_dispatch_expires_at is null
     or p_dispatch_expires_at > statement_timestamp() + interval '7 days' then
    raise exception 'Invalid public BOQ work order' using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('tenderscope-engine:boq-capacity', 0)) then
    return 'busy';
  end if;
  select w.* into existing from tenderscope_engine.boq_work w
  where w.document_id = p_document_id for update;
  if found then
    if (existing.tender_id, existing.bid_number) is distinct from (p_tender_id, p_bid_number) then
      return 'conflict';
    end if;
    if p_revision < existing.revision then
      return 'superseded';
    end if;
    if p_revision = existing.revision then
      if (existing.work_id, existing.manifest_sha256, existing.source_url, existing.source_sha256,
          existing.parser_version, existing.rules_version, existing.deadline, existing.dispatch_expires_at)
         is not distinct from
         (p_work_id, p_manifest_sha256, p_source_url, p_source_sha256,
          p_parser_version, p_rules_version, p_deadline, p_dispatch_expires_at) then
        return 'replay';
      end if;
      return 'conflict';
    end if;
  end if;
  if p_dispatch_expires_at <= statement_timestamp() then
    return 'expired';
  end if;
  if exists (select 1 from tenderscope_engine.boq_work where work_id = p_work_id) then
    return 'conflict';
  end if;
  -- Leave a margin below B's 300 MB routine ceiling for receipts and maintenance.
  if pg_database_size(current_database()) >= 295000000
     or (existing.document_id is null and (select count(*) from tenderscope_engine.boq_work) >= 10000) then
    return 'capacity';
  end if;

  insert into tenderscope_engine.boq_work (
    document_id, work_id, tender_id, bid_number, revision, manifest_sha256, source_url,
    source_sha256, parser_version, rules_version, deadline, dispatch_expires_at
  ) values (
    p_document_id, p_work_id, p_tender_id, p_bid_number, p_revision, p_manifest_sha256,
    p_source_url, p_source_sha256, p_parser_version, p_rules_version, p_deadline, p_dispatch_expires_at
  ) on conflict (document_id) do update set
    work_id = excluded.work_id, revision = excluded.revision, manifest_sha256 = excluded.manifest_sha256,
    source_url = excluded.source_url, source_sha256 = excluded.source_sha256,
    parser_version = excluded.parser_version, rules_version = excluded.rules_version,
    deadline = excluded.deadline, dispatch_expires_at = excluded.dispatch_expires_at,
    state = 'queued', generation = 0, lease_until = null, ready_at = null,
    result = null, result_sha256 = null;
  return 'admitted';
end;
$$;

create function public.tenderscope_claim_boq_v1()
returns jsonb language sql security invoker set search_path = '' as $$
  with next_document as (
    select w.document_id from tenderscope_engine.boq_work w
    where w.dispatch_expires_at > statement_timestamp() and w.generation < 4
      and (w.state = 'queued' or (w.state = 'leased' and w.lease_until <= statement_timestamp()))
      and (select pg_database_size(current_database())) < 295000000
    order by (w.deadline < statement_timestamp()), w.deadline, w.document_id
    for update skip locked limit 1
  )
  update tenderscope_engine.boq_work w set state = 'leased', generation = w.generation + 1,
    lease_until = least(w.dispatch_expires_at, statement_timestamp() + interval '2 minutes')
  from next_document n where w.document_id = n.document_id
  returning to_jsonb(w) - array['result','result_bytes','result_sha256','ready_at'];
$$;

create function public.tenderscope_finish_boq_v1(
  p_work_id uuid, p_revision bigint, p_generation integer, p_source_sha256 text, p_result jsonb
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  w tenderscope_engine.boq_work%rowtype;
  bytes integer;
  digest text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('tenderscope-engine:boq-capacity', 0)) then
    return 'busy';
  end if;
  select * into w from tenderscope_engine.boq_work where work_id = p_work_id for update;
  if not found or (w.revision, w.generation) is distinct from (p_revision, p_generation) then
    return 'stale';
  end if;
  if w.source_sha256 is distinct from p_source_sha256 then
    return 'source_changed';
  end if;
  bytes := coalesce(octet_length(p_result::text), 0);
  if bytes > 131072 then
    return 'result_too_large';
  end if;
  digest := encode(sha256(convert_to(p_result::text, 'UTF8')), 'hex');
  if w.state in ('ready','delivered') then
    return case when w.result_sha256 = digest then 'replay' else 'conflict' end;
  end if;
  if w.state <> 'leased' or w.lease_until <= clock_timestamp() then
    return 'stale';
  end if;
  if jsonb_typeof(p_result) is distinct from 'object'
     or jsonb_typeof(p_result->'items') is distinct from 'array'
     or p_result->>'parser_version' is distinct from w.parser_version then
    return 'invalid_result';
  end if;
  if p_result - array['items','parser_version'] <> '{}'::jsonb
     or jsonb_array_length(p_result->'items') = 0
     or exists (
       select from jsonb_array_elements(p_result->'items') with ordinality as r(item, row_no)
       where case when jsonb_typeof(item) = 'object' then
         item - array['item_key','item_number','name','quantity','unit','pack','pvms','niv',
                      'specification','source_url','source_hash'] <> '{}'::jsonb
         or item->>'source_url' is distinct from w.source_url
         or item->>'source_hash' is distinct from w.source_sha256
         or item->>'item_key' is distinct from (w.source_url || '#row=' || row_no)
         or jsonb_typeof(item->'name') is distinct from 'string'
         or nullif(btrim(item->>'name'), '') is null
         or exists (
           select from jsonb_each(item) field
           where case when field.key = 'quantity'
             then jsonb_typeof(field.value) not in ('number','null')
             else jsonb_typeof(field.value) not in ('string','null') end
         )
       else true end
     ) then
    return 'invalid_result';
  end if;
  if pg_database_size(current_database()) >= 295000000
     or (select coalesce(sum(result_bytes), 0) from tenderscope_engine.boq_work) + bytes > 50000000 then
    return 'capacity';
  end if;
  update tenderscope_engine.boq_work set state = 'ready', lease_until = null, ready_at = clock_timestamp(),
    result = p_result, result_sha256 = digest
  where document_id = w.document_id and lease_until > clock_timestamp();
  return case when found then 'ready' else 'stale' end;
end;
$$;

create function public.tenderscope_ready_boq_v1(p_limit integer default 5)
returns setof jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(w) - array['result_bytes','lease_until']
  from tenderscope_engine.boq_work w where w.state = 'ready'
  order by w.ready_at, w.document_id limit least(20, greatest(1, coalesce(p_limit, 5)));
$$;

create function public.tenderscope_ack_boq_v1(p_work_id uuid, p_revision bigint, p_result_sha256 text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  -- The caller sends this only after Project A commits an acceptance receipt.
  update tenderscope_engine.boq_work set state = 'delivered', result = null
  where work_id = p_work_id and revision = p_revision and result_sha256 = p_result_sha256 and state = 'ready';
  if found then return 'delivered'; end if;
  if exists (
    select from tenderscope_engine.boq_work where work_id = p_work_id and revision = p_revision
      and result_sha256 = p_result_sha256 and state = 'delivered'
  ) then return 'replay'; end if;
  return 'stale';
end;
$$;

create function public.tenderscope_prune_boq_v1(p_limit integer default 100)
returns bigint language sql security invoker set search_path = '' as $$
  -- Keep the latest revision fence for longer than the dispatch replay window.
  with expired as (
    select w.document_id from tenderscope_engine.boq_work w
    where w.state <> 'ready' and w.dispatch_expires_at < statement_timestamp() - interval '14 days'
    order by w.dispatch_expires_at, w.document_id
    for update skip locked limit least(250, greatest(1, coalesce(p_limit, 100)))
  ), removed as (
    delete from tenderscope_engine.boq_work w using expired e where w.document_id = e.document_id
    returning 1
  )
  select count(*) from removed;
$$;

revoke all on function public.tenderscope_admit_boq_v1(uuid,uuid,uuid,text,bigint,text,text,text,text,text,timestamptz,timestamptz),
  public.tenderscope_claim_boq_v1(), public.tenderscope_finish_boq_v1(uuid,bigint,integer,text,jsonb),
  public.tenderscope_ready_boq_v1(integer), public.tenderscope_ack_boq_v1(uuid,bigint,text),
  public.tenderscope_prune_boq_v1(integer)
  from public, anon, authenticated;
grant execute on function public.tenderscope_admit_boq_v1(uuid,uuid,uuid,text,bigint,text,text,text,text,text,timestamptz,timestamptz),
  public.tenderscope_claim_boq_v1(), public.tenderscope_finish_boq_v1(uuid,bigint,integer,text,jsonb),
  public.tenderscope_ready_boq_v1(integer), public.tenderscope_ack_boq_v1(uuid,bigint,text),
  public.tenderscope_prune_boq_v1(integer)
  to service_role;
