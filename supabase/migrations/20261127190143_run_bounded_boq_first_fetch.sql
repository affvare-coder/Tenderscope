-- Project A only. A bounded pilot for official CSV links awaiting first retrieval.
-- Enrollment is explicit. The existing discovery and document queues remain available.
create table tenderscope_private.boq_first_fetch_pilot (
  document_id uuid primary key references public.tender_documents(id) on delete cascade,
  work_id uuid not null unique default gen_random_uuid(),
  revision bigint not null default nextval('tenderscope_private.boq_dispatch_revision'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stage text not null default 'run' check (stage in ('run','ack','delivered','stopped')),
  request_id bigint,
  attempts integer not null default 0 check (attempts between 0 and 4),
  next_attempt_at timestamptz not null default now(),
  last_status text,
  result_sha256 text,
  imported_rows integer,
  check (expires_at > created_at and expires_at <= created_at+interval '30 minutes')
);
alter table tenderscope_private.boq_first_fetch_pilot enable row level security;
revoke all on tenderscope_private.boq_first_fetch_pilot from public, anon, authenticated, service_role;

create function tenderscope_private.boq_first_fetch_source(p_document_id uuid)
returns uuid language sql stable set search_path = '' as $$
  select t.id from public.tender_documents d join public.tenders t on t.id=d.tender_id
  where d.id=p_document_id and d.kind='boq' and d.availability='unverified' and d.content_hash is null
    and d.official_url ~ '^https://mkp[.]gem[.]gov[.]in/uploaded_documents/[^?#[:space:]]+[.]csv$'
    and position(chr(92) in d.official_url)=0 and octet_length(d.official_url)<=2048
    and t.status='published' and lower(t.source)='gem' and t.reviewed_at is not null
    and t.deadline>now() and coalesce(t.ingestion_status,'')<>'excluded'
    and coalesce(t.lifecycle_state,'') not in ('EXPIRED','CANCELLED','EXCLUDED','OPENED','CLOSED_PENDING_VERIFICATION')
    and exists (
      select from public.tender_documents parent
      where parent.tender_id=t.id and parent.kind='bid' and parent.availability='available'
        and parent.content_hash ~ '^[0-9a-f]{64}$'
    );
$$;

create function tenderscope_private.publish_boq_first_fetch(
  p_job tenderscope_private.boq_first_fetch_pilot, p_reply jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare
  raw_tender public.tenders%rowtype;
  source public.tender_documents%rowtype;
  source_sha text := p_reply->>'source_sha256';
  result_sha text := p_reply->>'result_sha256';
  fetched_at timestamptz;
  current_manifest text;
  recorded jsonb;
begin
  if p_reply->>'work_id' is distinct from p_job.work_id::text or
     p_reply->>'revision' is distinct from p_job.revision::text or
     p_reply->>'manifest_sha256' is distinct from p_job.manifest_sha256 or
     not coalesce(source_sha ~ '^[0-9a-f]{64}$' and result_sha ~ '^[0-9a-f]{64}$',false) then
    return '{"status":"invalid_result"}';
  end if;
  fetched_at := (p_reply->>'ready_at')::timestamptz;
  if not coalesce(fetched_at between p_job.created_at and least(p_job.expires_at,clock_timestamp()+interval '10 seconds'),false) then
    return '{"status":"invalid_result"}';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:boq-engine-dispatch',0)) then
    return '{"status":"busy"}';
  end if;
  select t.* into raw_tender from public.tenders t
  where t.id=tenderscope_private.boq_first_fetch_source(p_job.document_id);
  if not found then return '{"status":"stale_source"}'; end if;
  -- Match ingest_tender's lock order before consulting current document evidence.
  if not pg_try_advisory_xact_lock(hashtextextended('gem:'||raw_tender.bid_number,0)) then
    return '{"status":"busy"}';
  end if;
  select t.* into raw_tender from public.tenders t where t.id=raw_tender.id for update;
  perform d.id from public.tender_documents d where d.tender_id=raw_tender.id order by d.id for update;
  if tenderscope_private.boq_first_fetch_source(p_job.document_id) is distinct from raw_tender.id
     or tenderscope_private.boq_source_manifest(raw_tender.id,p_job.document_id,raw_tender.deadline)
        is distinct from p_job.manifest_sha256 then
    return '{"status":"stale_source"}';
  end if;
  if clock_timestamp()>=p_job.expires_at or pg_database_size(current_database())>=480000000 or
     (select count(*) from tenderscope_private.boq_dispatch_receipts)>=256 then
    return '{"status":"capacity_or_expired"}';
  end if;
  if exists (select from tenderscope_private.boq_dispatch_receipts where document_id=p_job.document_id) then
    return '{"status":"existing_dispatch"}';
  end if;

  select d.* into strict source from public.tender_documents d where d.id=p_job.document_id;
  recorded:=public.ingest_tender(jsonb_build_object('bid_number',raw_tender.bid_number,
    'documents',jsonb_build_array(jsonb_build_object('kind','boq','document_key',source.document_key,
      'official_url',source.official_url,'content_hash',source_sha,'availability','available','link_status','verified'))),
    'gem','project-b-boq-first-fetch',null,fetched_at,null);
  if recorded->>'tender_id' is distinct from raw_tender.id::text
     or not exists (select from public.tender_documents d where d.id=source.id
                   and d.official_url=source.official_url and d.content_hash=source_sha and d.availability='available') then
    raise exception 'BOQ observation did not commit';
  end if;
  current_manifest:=tenderscope_private.boq_source_manifest(raw_tender.id,p_job.document_id,raw_tender.deadline);
  insert into tenderscope_private.boq_dispatch_receipts
    (document_id,work_id,revision,manifest_sha256,source_sha256,dispatch_expires_at)
  values(p_job.document_id,p_job.work_id,p_job.revision,current_manifest,source_sha,p_job.expires_at);
  recorded:=public.accept_boq_engine_result(p_job.work_id,p_job.revision,(p_reply->>'generation')::integer,
    current_manifest,source_sha,result_sha,p_reply->'result');
  if recorded->>'status' is distinct from 'accepted' then
    raise exception 'Result failed canonical BOQ acceptance';
  end if;
  return jsonb_build_object('status','accepted','rows',jsonb_array_length(p_reply->'result'->'items'));
end;
$$;

create function tenderscope_private.tick_boq_first_fetch()
returns text language plpgsql set search_path = '' as $$
declare
  job tenderscope_private.boq_first_fetch_pilot%rowtype;
  reply jsonb;
  status_code integer;
  body text;
  outcome text;
  published jsonb;
  envelope jsonb;
  request_key text;
  signed_at bigint;
  signature text;
  sent_request bigint;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:boq-first-fetch-pilot',0)) then
    return 'locked';
  end if;
  -- Bound the entire pilot, including retries and the time spent polling.
  if (select count(*) from tenderscope_private.boq_first_fetch_pilot)>3 then return 'pilot_limit'; end if;
  update tenderscope_private.boq_first_fetch_pilot set stage='stopped',last_status='pilot_expired'
  where stage in ('run','ack') and expires_at<=now();
  select p.* into job from tenderscope_private.boq_first_fetch_pilot p
  where p.stage in ('run','ack')
  order by (p.request_id is not null) desc,(p.stage='ack') desc,p.next_attempt_at,p.created_at,p.document_id
  limit 1 for update;
  if not found then return 'idle'; end if;

  if job.request_id is not null then
    select r.status_code,r.content into status_code,body from net._http_response r where r.id=job.request_id;
    if not found and job.next_attempt_at>now() then return 'awaiting_response'; end if;
    if status_code=200 and octet_length(body)<=140000 then
      begin
        reply:=body::jsonb;
      exception when invalid_text_representation then reply:=null;
      end;
    end if;
    outcome:=coalesce(reply->>'status','no_successful_response');
    if job.stage='run' and outcome='ready' then
      begin
        published:=tenderscope_private.publish_boq_first_fetch(job,reply);
        outcome:=published->>'status';
      exception when raise_exception or data_exception then
        outcome:='publication_rejected';
      end;
      if outcome='accepted' then
        update tenderscope_private.boq_first_fetch_pilot set stage='ack',request_id=null,attempts=0,
          result_sha256=reply->>'result_sha256',imported_rows=(published->>'rows')::integer,
          last_status=outcome,next_attempt_at=now() where document_id=job.document_id;
        return outcome;
      end if;
    end if;
    if job.stage='ack' and outcome in ('delivered','replay') and reply->>'work_id'=job.work_id::text
       and reply->>'revision'=job.revision::text then
      update tenderscope_private.boq_first_fetch_pilot set stage='delivered',request_id=null,last_status='delivered'
      where document_id=job.document_id;
      return 'delivered';
    end if;
    update tenderscope_private.boq_first_fetch_pilot set request_id=null,last_status=
      case when outcome in ('busy','pending','stale_source','needs_review','result_too_large','capacity',
           'capacity_or_expired','invalid_result','publication_rejected','existing_dispatch','conflict','superseded')
           then outcome else 'no_successful_response' end,
      next_attempt_at=now()+interval '60 seconds',
      stage=case when attempts>=4 or outcome in ('stale_source','needs_review','result_too_large','capacity',
          'capacity_or_expired','invalid_result','publication_rejected','existing_dispatch','conflict','superseded')
          then 'stopped' else stage end
    where document_id=job.document_id;
    return 'processed_response';
  end if;

  if job.next_attempt_at>now() then return 'retry_backoff'; end if;

  if job.stage='run' then
    select jsonb_build_object('operation','run','document_id',job.document_id,'work_id',job.work_id,
      'revision',job.revision,'manifest_sha256',job.manifest_sha256,'tender_id',t.id,'bid_number',t.bid_number,
      'source_url',d.official_url,'deadline',t.deadline,'dispatch_expires_at',job.expires_at)
    into envelope from public.tender_documents d join public.tenders t on t.id=d.tender_id
    where d.id=job.document_id and t.id=tenderscope_private.boq_first_fetch_source(d.id)
      and pg_database_size(current_database())<480000000
      and tenderscope_private.boq_source_manifest(t.id,d.id,t.deadline)=job.manifest_sha256;
  else
    -- pg_net sends this request only after the accepted A receipt commits.
    select jsonb_build_object('operation','ack','work_id',job.work_id,'revision',job.revision,
      'result_sha256',job.result_sha256) into envelope from tenderscope_private.boq_dispatch_receipts r
    where r.work_id=job.work_id and r.revision=job.revision and r.accepted_sha256=job.result_sha256;
  end if;
  if envelope is null then
    update tenderscope_private.boq_first_fetch_pilot set stage='stopped',last_status='source_or_capacity_gate'
      where document_id=job.document_id;
    return 'source_or_capacity_gate';
  end if;

  select decrypted_secret into request_key from vault.decrypted_secrets where name='tenderscope_boq_first_fetch_key';
  if not coalesce(request_key ~ '^[0-9a-f]{64}$',false) then return 'missing_bridge_key'; end if;
  signed_at:=extract(epoch from statement_timestamp())::bigint;
  signature:=encode(extensions.hmac(
    convert_to('tenderscope-boq-first-fetch-v1'||chr(10)||signed_at||chr(10)||envelope::text,'UTF8'),
    decode(request_key,'hex'),'sha256'),'hex');
  sent_request:=net.http_post(url:='https://xwxexchtbviiyxcmuvnn.supabase.co/functions/v1/tenderscope-boq-first-fetch',
    headers:=jsonb_build_object('Content-Type','application/json','x-tenderscope-timestamp',signed_at::text,
      'x-tenderscope-signature',signature),body:=envelope,timeout_milliseconds:=25000);
  update tenderscope_private.boq_first_fetch_pilot p set request_id=sent_request,
    next_attempt_at=now()+interval '35 seconds',attempts=attempts+1,last_status='request_sent'
  where p.document_id=job.document_id;
  return 'request_sent';
end;
$$;

revoke all on function tenderscope_private.boq_first_fetch_source(uuid),
 tenderscope_private.publish_boq_first_fetch(tenderscope_private.boq_first_fetch_pilot,jsonb),
 tenderscope_private.tick_boq_first_fetch()
 from public, anon, authenticated, service_role;
