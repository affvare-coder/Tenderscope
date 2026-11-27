-- Project B only. A signs the exact bounded public-source envelope.
alter table tenderscope_engine.boq_work alter column source_sha256 drop not null;
alter table tenderscope_engine.boq_work add constraint boq_first_fetch_lane
  check (source_sha256 is not null or rules_version = 'boq-first-fetch-v1');

create or replace function public.tenderscope_admit_boq_v1(
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
     or not (coalesce(p_source_sha256 ~ '^[0-9a-f]{64}$', false)
             or (p_source_sha256 is null and p_rules_version = 'boq-first-fetch-v1'))
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

create or replace function public.tenderscope_claim_boq_v1()
returns jsonb language sql security invoker set search_path = '' as $$
  with next_document as (
    select w.document_id from tenderscope_engine.boq_work w
    where w.dispatch_expires_at > statement_timestamp() and w.generation < 4
      and w.source_sha256 is not null
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

create or replace function public.tenderscope_finish_boq_v1(
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
  if not coalesce(p_source_sha256 ~ '^[0-9a-f]{64}$', false)
     or (w.source_sha256 is not null and w.source_sha256 <> p_source_sha256) then
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
         or item->>'source_hash' is distinct from p_source_sha256
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

create function public.tenderscope_verify_boq_bridge_v1(
  p_timestamp bigint, p_signature text, p_envelope jsonb
) returns boolean language sql stable security definer set search_path = '' as $$
  select case when coalesce(p_signature ~ '^[0-9a-f]{64}$', false)
     and p_timestamp between extract(epoch from statement_timestamp())::bigint-90
                         and extract(epoch from statement_timestamp())::bigint+10
     and jsonb_typeof(p_envelope) = 'object'
     and octet_length(p_envelope::text) <= 8192 then
    coalesce(sha256(decode(p_signature,'hex')) = (
      select sha256(extensions.hmac(
        convert_to('tenderscope-boq-first-fetch-v1' || chr(10) || p_timestamp || chr(10) || p_envelope::text,'UTF8'),
        decode(s.decrypted_secret,'hex'),'sha256'))
      from vault.decrypted_secrets s where s.name = 'tenderscope_boq_first_fetch_key'
    ),false)
  else false end;
$$;

create function public.tenderscope_claim_boq_bridge_v1(p_work_id uuid,p_revision bigint)
returns jsonb language sql set search_path = '' as $$
  update tenderscope_engine.boq_work w set
    state='leased',generation=w.generation+1,
    lease_until=least(w.dispatch_expires_at,statement_timestamp()+interval '2 minutes')
  where w.work_id=p_work_id and w.revision=p_revision and w.source_sha256 is null
    and w.rules_version='boq-first-fetch-v1' and w.dispatch_expires_at>statement_timestamp()
    and w.generation<4 and (w.state='queued' or (w.state='leased' and w.lease_until<=statement_timestamp()))
    and (select pg_database_size(current_database())) < 295000000
  returning jsonb_build_object('source_url',w.source_url,'generation',w.generation);
$$;

create function public.tenderscope_read_boq_bridge_v1(p_work_id uuid,p_revision bigint)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status','ready','work_id',w.work_id,'revision',w.revision,'manifest_sha256',w.manifest_sha256,
    'generation',w.generation,'source_sha256',w.result->'items'->0->>'source_hash',
    'result_sha256',w.result_sha256,'result',w.result,'ready_at',w.ready_at)
  from tenderscope_engine.boq_work w
  where w.work_id=p_work_id and w.revision=p_revision and w.source_sha256 is null
    and w.rules_version='boq-first-fetch-v1' and w.state='ready';
$$;

create function public.tenderscope_ack_boq_bridge_v1(p_work_id uuid,p_revision bigint,p_result_sha256 text)
returns text language sql set search_path = '' as $$
  select case when exists (
    select from tenderscope_engine.boq_work w
    where w.work_id=p_work_id and w.revision=p_revision and w.source_sha256 is null
      and w.rules_version='boq-first-fetch-v1'
  ) then public.tenderscope_ack_boq_v1(p_work_id,p_revision,p_result_sha256) else 'stale' end;
$$;

revoke all on function public.tenderscope_verify_boq_bridge_v1(bigint,text,jsonb),
  public.tenderscope_claim_boq_bridge_v1(uuid,bigint),
  public.tenderscope_read_boq_bridge_v1(uuid,bigint),
  public.tenderscope_ack_boq_bridge_v1(uuid,bigint,text)
  from public, anon, authenticated;
grant execute on function public.tenderscope_verify_boq_bridge_v1(bigint,text,jsonb),
  public.tenderscope_claim_boq_bridge_v1(uuid,bigint),
  public.tenderscope_read_boq_bridge_v1(uuid,bigint),
  public.tenderscope_ack_boq_bridge_v1(uuid,bigint,text)
  to service_role;
