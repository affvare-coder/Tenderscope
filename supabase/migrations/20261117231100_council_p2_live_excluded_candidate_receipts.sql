-- Exact live production function snapshots plus verified receipt DDL.
-- Historical replays handled idempotently; original missing source hashes stay untrusted.
CREATE TABLE IF NOT EXISTS tenderscope_private.excluded_candidate_receipts (
 bid_number text NOT NULL,
 listing_fingerprint text NOT NULL CHECK(listing_fingerprint ~ '^[0-9a-f]{64}$'),
 source_fingerprint text CHECK(source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$'),
 rules_version text NOT NULL,
 source_deadline timestamptz,
 archive_object_key text NOT NULL,
 verified_at timestamptz NOT NULL,
 legacy_reconstructed boolean NOT NULL DEFAULT false,
 CONSTRAINT excluded_candidate_receipts_pkey PRIMARY KEY(bid_number,listing_fingerprint)
);
REVOKE ALL ON tenderscope_private.excluded_candidate_receipts FROM PUBLIC;
GRANT SELECT,UPDATE ON tenderscope_private.excluded_candidate_receipts TO service_role;
CREATE INDEX IF NOT EXISTS excluded_candidate_receipts_source_idx ON tenderscope_private.excluded_candidate_receipts USING btree (bid_number, rules_version, source_fingerprint, source_deadline) WHERE (source_fingerprint IS NOT NULL);

CREATE OR REPLACE FUNCTION tenderscope_private.excluded_source_fingerprint(p_row jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT encode(extensions.digest(
  (coalesce(p_row,'{}'::jsonb) - ARRAY[
   'observed_at','source_provenance','document_verified_at',
   'document_listing_signature','document_refresh_reason',
   '__archived','__listing_fingerprint','__source_fingerprint',
   '__fingerprint_quality'
  ])::text,'sha256'),'hex');
$function$
;


REVOKE ALL ON FUNCTION tenderscope_private.excluded_source_fingerprint(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenderscope_private.excluded_source_fingerprint(jsonb) TO service_role;
-- The 43 legacy compact rows were backfilled with a reconstructed
-- SHA256; reconstructed metadata is never treated as complete source evidence.
UPDATE public.sync_candidates c
SET row_data=c.row_data || jsonb_build_object('__listing_fingerprint',
 encode(extensions.digest(jsonb_build_object(
 'legacy_compact_row',c.row_data-ARRAY['__archived','__listing_fingerprint'],
 'classification',c.classification,'rules_version',c.rules_version
 )::text,'sha256'),'hex'),'__fingerprint_quality','legacy_compact')
WHERE c.classification->>'status'='excluded' AND c.row_data?'__archived'
 AND NOT c.row_data?'__listing_fingerprint';

INSERT INTO tenderscope_private.excluded_candidate_receipts(
 bid_number,listing_fingerprint,source_fingerprint,rules_version,
 source_deadline,archive_object_key,verified_at,legacy_reconstructed)
SELECT c.bid_number,c.row_data->>'__listing_fingerprint',
 CASE WHEN c.row_data->>'__source_fingerprint' ~ '^[0-9a-f]{64}$'
 THEN c.row_data->>'__source_fingerprint' ELSE NULL END,
 c.rules_version,
 CASE WHEN pg_input_is_valid(c.row_data->>'closes_at','timestamptz')
 THEN (c.row_data->>'closes_at')::timestamptz ELSE NULL END,
 a.object_key,a.verified_at,
 coalesce(c.row_data->>'__fingerprint_quality'='legacy_compact',false)
FROM public.sync_candidates c
JOIN tenderscope_private.cold_archives a ON a.object_key=c.row_data->>'__archived'
 AND c.bid_number=ANY(a.ids) AND a.scope='candidates'
JOIN storage.objects o ON o.bucket_id='tenderscope-cold-archive' AND o.name=a.object_key
WHERE c.classification->>'status'='excluded' AND c.row_data?'__archived'
 AND a.verified_at IS NOT NULL
 AND c.row_data->>'__listing_fingerprint' ~ '^[0-9a-f]{64}$'
ON CONFLICT (bid_number,listing_fingerprint) DO NOTHING;

CREATE OR REPLACE FUNCTION public.stage_sync_candidates(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 insert into public.sync_document_facts(bid_number,row_data,verified_at)
 select x.bid_number,x.row_data,(x.row_data->>'document_verified_at')::timestamptz
 from jsonb_to_recordset(p_rows) x(bid_number text,row_data jsonb)
 where x.row_data->>'document_verification_status'='VERIFIED' and x.row_data->>'document_verified_at' is not null
 on conflict(bid_number) do update set row_data=excluded.row_data,verified_at=excluded.verified_at
 where excluded.verified_at>=sync_document_facts.verified_at;
 insert into public.sync_candidates(bid_number,row_data,classification,source_lane,rules_version,observed_at)
 select x.bid_number,x.row_data,x.classification,x.source_lane,x.rules_version,x.observed_at
 from jsonb_to_recordset(p_rows) x(bid_number text,row_data jsonb,classification jsonb,source_lane text,rules_version text,observed_at timestamptz)
 where not (
  x.classification->>'status'='excluded'
  and exists(select 1 from tenderscope_private.excluded_candidate_receipts r
   where r.bid_number=x.bid_number and r.rules_version=x.rules_version
   and r.source_fingerprint IS NOT NULL
   and r.source_fingerprint=tenderscope_private.excluded_source_fingerprint(x.row_data)
   -- Re-evaluate when classification reasons/evidence changes despite the
   -- same listing text and rules; fingerprint includes classification.
   and r.listing_fingerprint=encode(extensions.digest(
     jsonb_build_object('row',x.row_data-array['observed_at','source_provenance','document_verified_at'],
      'classification',x.classification,'rules_version',x.rules_version)::text,
     'sha256'),'hex')
   and r.source_deadline IS NOT DISTINCT FROM
    case when pg_input_is_valid(x.row_data->>'closes_at','timestamptz')
     then (x.row_data->>'closes_at')::timestamptz else null end
  )
 )
 on conflict(bid_number) do update set row_data=case when public.sync_candidates.row_data ? '__archived'
  and excluded.classification->>'status'='excluded'
  and public.sync_candidates.row_data->>'__listing_fingerprint'=encode(extensions.digest((jsonb_build_object('row',excluded.row_data-array['observed_at','source_provenance','document_verified_at'],'classification',excluded.classification,'rules_version',excluded.rules_version))::text,'sha256'),'hex')
  then case when public.sync_candidates.row_data ? '__source_fingerprint'
 then public.sync_candidates.row_data
 else public.sync_candidates.row_data || jsonb_build_object(
 '__source_fingerprint',tenderscope_private.excluded_source_fingerprint(excluded.row_data))
 end else excluded.row_data end,classification=excluded.classification,source_lane=excluded.source_lane,rules_version=excluded.rules_version,observed_at=case when public.sync_candidates.row_data ? '__archived'
 and excluded.classification->>'status'='excluded'
 and public.sync_candidates.row_data->>'__listing_fingerprint'=encode(extensions.digest((jsonb_build_object('row',excluded.row_data-array['observed_at','source_provenance','document_verified_at'],'classification',excluded.classification,'rules_version',excluded.rules_version))::text,'sha256'),'hex')
 then public.sync_candidates.observed_at else excluded.observed_at end
 where excluded.observed_at>=sync_candidates.observed_at
 and not (
  public.sync_candidates.row_data ? '__archived'
  and excluded.classification->>'status'='excluded'
  and public.sync_candidates.row_data ? '__source_fingerprint'
  and public.sync_candidates.row_data->>'__listing_fingerprint'=encode(extensions.digest(
   jsonb_build_object('row',excluded.row_data-array['observed_at','source_provenance','document_verified_at'],
    'classification',excluded.classification,'rules_version',excluded.rules_version)::text,'sha256'),'hex')
 );

 update tenderscope_private.excluded_candidate_receipts r
 set source_fingerprint=c.row_data->>'__source_fingerprint'
 from public.sync_candidates c
 where c.bid_number=r.bid_number
 and c.bid_number in (
  select x.bid_number from jsonb_to_recordset(p_rows) x(bid_number text)
 )
 and r.listing_fingerprint=c.row_data->>'__listing_fingerprint'
 and r.rules_version=c.rules_version
 and r.source_fingerprint IS NULL
 and c.row_data->>'__source_fingerprint' ~ '^[0-9a-f]{64}$';
end $function$
;


CREATE OR REPLACE FUNCTION public.enqueue_document_job(p_run_id uuid, p_row jsonb, p_url text, p_lane text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare jid uuid; m text; reason text:=p_row->>'document_refresh_reason';
begin
 if p_url !~* '^https://([a-z0-9-]+\.)*gem\.gov\.in/' then raise exception 'Unofficial document'; end if;
 -- Excluded source receipts only block identical evidence under the
 -- active rules version. An explicit source refresh bypasses this guard.
 if reason is null and p_row->>'bid_number' is not null and exists (
  select 1 from tenderscope_private.excluded_candidate_receipts r
  where r.bid_number=p_row->>'bid_number'
    -- Never suppress newly eligible or reclassified candidates.
    and not exists(select 1 from public.sync_candidates c
      where c.bid_number=r.bid_number and
        (c.classification->>'status' is distinct from 'excluded'
         or c.rules_version is distinct from r.rules_version
         or (not (c.row_data ? '__archived')
             and tenderscope_private.excluded_source_fingerprint(c.row_data)
                 is distinct from r.source_fingerprint)))
   and r.source_fingerprint IS NOT NULL
   and r.source_fingerprint=tenderscope_private.excluded_source_fingerprint(p_row)
   and r.source_deadline IS NOT DISTINCT FROM
    case when pg_input_is_valid(p_row->>'closes_at','timestamptz')
     then (p_row->>'closes_at')::timestamptz else null end
   and r.rules_version=(
    select rv.version from public.rules_versions rv
    order by rv.created_at desc limit 1
   )
 ) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('document:'||(p_row->>'bid_number')||p_url,0));
 select id into jid from public.sync_jobs where payload->>'kind'='document' and payload->>'url'=p_url
 and payload#>>'{row,bid_number}'=p_row->>'bid_number' and state in ('queued','running') order by created_at limit 1;
 if jid is not null then
  insert into public.sync_job_dependencies values(p_run_id,jid) on conflict do nothing;
  update public.sync_jobs set payload=payload||jsonb_build_object('row',p_row,'lane',p_lane)
   ||case when reason is not null then jsonb_build_object('recovery_reason',reason) else '{}'::jsonb end
  where id=jid and state='queued' and coalesce((p_row->>'observed_at')::timestamptz,'epoch')
   >=coalesce((payload#>>'{row,observed_at}')::timestamptz,'epoch');
  return jid;
 end if;
 select mode into m from public.sync_runs where id=p_run_id;
 insert into public.sync_jobs(run_id,mode,dedupe_key,payload)
 values(p_run_id,m,'doc:'||p_run_id||':'||encode(extensions.digest((p_row->>'bid_number')||p_url,'sha256'),'hex'),
  jsonb_build_object('kind','document','row',p_row,'url',p_url,'lane',p_lane)
  ||case when reason is not null then jsonb_build_object('recovery_reason',reason) else '{}'::jsonb end)
 -- A resumed run can last several days. Its completed document job must be
 -- eligible for another daily check, or an explicitly observed source change.
 -- Keep cumulative stats, historical failures and the prior parse cursor.
 on conflict(mode,dedupe_key) do update
 set state='queued',payload=excluded.payload,available_at=now(),updated_at=now()
 where public.sync_jobs.state='succeeded'
 and coalesce((excluded.payload#>>'{row,observed_at}')::timestamptz,'epoch')
   >=coalesce((public.sync_jobs.payload#>>'{row,observed_at}')::timestamptz,'epoch')
 and (public.sync_jobs.updated_at<=now()-interval '24 hours'
   or (reason in('deadline_changed','listing_content_changed')
    and (excluded.payload#>>'{row,observed_at}')::timestamptz>public.sync_jobs.updated_at))
 returning id into jid;
 -- A non-due conflict returns no row from the UPDATE; retain the existing ID.
 if jid is null then
  select id into jid from public.sync_jobs
  where mode=m and dedupe_key='doc:'||p_run_id||':'||encode(extensions.digest((p_row->>'bid_number')||p_url,'sha256'),'hex');
 end if;
 insert into public.sync_job_dependencies values(p_run_id,jid) on conflict do nothing;
 return jid;
end $function$
;


CREATE OR REPLACE FUNCTION public.commit_retention_archive(p_scope text, p_ids text[], p_hash text, p_object_key text, p_compressed_bytes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '12s'
AS $function$
declare body text; t public.tenders%rowtype; n integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:retention',0)) then return jsonb_build_object('status','busy'); end if;
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:single-worker',0)) or exists(select 1 from public.sync_jobs where state='running' and lease_until>now()) then return jsonb_build_object('status','worker_busy'); end if;
 if cardinality(p_ids) not between 1 and 500 or p_object_key<>p_scope||'/'||p_hash||'.json.gz' then raise exception 'Invalid archive receipt'; end if;
 if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id where o.bucket_id='tenderscope-cold-archive' and not b.public and o.name=p_object_key and (o.metadata->>'size')::bigint=p_compressed_bytes) then raise exception 'Private archive object missing'; end if;
 if exists(select 1 from tenderscope_private.cold_archives where object_key=p_object_key) then return jsonb_build_object('status','already_committed'); end if;
 if p_scope='jobs' then
  perform 1 from public.sync_jobs where id=any(p_ids::uuid[]) for update;
  if exists(select 1 from public.sync_jobs where id=any(p_ids::uuid[]) and (state<>'succeeded' or updated_at>=now()-interval '2 days')) then raise exception 'Job became active'; end if;
 elsif p_scope='candidates' then
  perform 1 from public.sync_candidates where bid_number=any(p_ids) for update;
  if exists(select 1 from public.sync_candidates where bid_number=any(p_ids) and (classification->>'status'<>'excluded' or observed_at>=now()-interval '2 days')) then raise exception 'Candidate changed'; end if;
 elsif p_scope='bid' and cardinality(p_ids)=1 then
  select * into t from public.tenders where id=p_ids[1]::uuid for update;
  if not tenderscope_private.retirement_eligible(t.id) then return jsonb_build_object('status','not_eligible'); end if;
  -- Serialize new download references with retirement; retain member history below.
  perform 1 from public.tender_documents where tender_id=t.id for update;
 else raise exception 'Invalid archive scope'; end if;
 body:=tenderscope_private.archive_body(p_scope,p_ids);
 if encode(extensions.digest(body,'sha256'),'hex')<>p_hash then return jsonb_build_object('status','changed_retry'); end if;
 insert into tenderscope_private.cold_archives(object_key,sha256,scope,ids,compressed_bytes) values(p_object_key,p_hash,p_scope,p_ids,p_compressed_bytes);
 if p_scope='jobs' then
  update public.sync_jobs set payload=jsonb_build_object('kind',payload->>'kind','row',jsonb_build_object('bid_number',payload#>>'{row,bid_number}'),'url',payload->>'url','__archived',p_object_key),cursor='{}' where id=any(p_ids::uuid[]);
 elsif p_scope='candidates' then
  -- The private cold archive has been verified above in this transaction.
  -- Register stable evidence before the source JSON is compacted.
  insert into tenderscope_private.excluded_candidate_receipts(
   bid_number,listing_fingerprint,source_fingerprint,rules_version,
   source_deadline,archive_object_key,verified_at,legacy_reconstructed)
  select c.bid_number,
   encode(extensions.digest(jsonb_build_object(
    'row',c.row_data-array['observed_at','source_provenance','document_verified_at'],
    'classification',c.classification,'rules_version',c.rules_version
   )::text,'sha256'),'hex'),
   tenderscope_private.excluded_source_fingerprint(c.row_data),
   c.rules_version,
   case when pg_input_is_valid(c.row_data->>'closes_at','timestamptz')
    then (c.row_data->>'closes_at')::timestamptz else null end,
   a.object_key,a.verified_at,false
  from public.sync_candidates c
  join tenderscope_private.cold_archives a on a.object_key=p_object_key
  where c.bid_number=any(p_ids) and c.classification->>'status'='excluded'
  on conflict (bid_number,listing_fingerprint) do update
   set source_fingerprint=excluded.source_fingerprint,
    verified_at=excluded.verified_at,archive_object_key=excluded.archive_object_key;
  update public.sync_candidates set row_data=jsonb_build_object('bid_number',bid_number,'closes_at',row_data->>'closes_at','q2_status',row_data->>'q2_status','__archived',p_object_key,'__source_fingerprint',tenderscope_private.excluded_source_fingerprint(row_data),'__listing_fingerprint',encode(extensions.digest((jsonb_build_object('row',row_data-array['observed_at','source_provenance','document_verified_at'],'classification',classification,'rules_version',rules_version))::text,'sha256'),'hex')) where bid_number=any(p_ids);
 else
  -- The permission exists only in this transaction, after a verified copy receipt.
  insert into tenderscope_private.archive_purge_permits values(t.id,txid_current(),p_object_key);
  insert into tenderscope_private.retired_bids values(t.bid_number,t.id,t.deadline,p_object_key,now()) on conflict(bid_number) do update set tender_id=excluded.tender_id,deadline=excluded.deadline,object_key=excluded.object_key,retired_at=now();
  delete from public.channel_update_outbox where tender_id=t.id;
  delete from public.tender_alert_outbox where tender_id=t.id;
  delete from public.tender_product_extractions where tender_id=t.id;
  delete from public.tender_item_history where tender_id=t.id;
  delete from public.tender_items where tender_id=t.id;
  delete from public.tender_document_versions where tender_id=t.id;
  delete from public.tender_versions where tender_id=t.id;
  delete from public.tender_events where tender_id=t.id;
  -- Keep each member's usage/audit row and exact archived document identity.
  update public.member_download_events e
  set archived_document_ref=jsonb_build_object('document_id',d.id,'tender_id',t.id,
      'bid_number',t.bid_number,'archive_object_key',p_object_key),
      document_id=null
  from public.tender_documents d
  where e.document_id=d.id and d.tender_id=t.id;
  delete from public.tenders where id=t.id;
  delete from tenderscope_private.archive_purge_permits where tender_id=t.id;
  perform tenderscope_private.complete_retired_document_jobs(t.bid_number,500);
 end if;
 return jsonb_build_object('status','committed','scope',p_scope,'count',cardinality(p_ids));
end $function$
;


CREATE OR REPLACE FUNCTION tenderscope_private.prune_verified_archive_metadata(p_candidate_limit integer DEFAULT 250, p_job_limit integer DEFAULT 50)
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
   and exists(select 1 from tenderscope_private.excluded_candidate_receipts r
    where r.bid_number=c.bid_number
     and r.listing_fingerprint=c.row_data->>'__listing_fingerprint'
     and r.source_fingerprint IS NOT NULL and r.verified_at IS NOT NULL)
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
end $function$
;

