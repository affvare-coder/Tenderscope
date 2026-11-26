-- Preserve the live observation, exclusion, dependency and requeue rules.

-- Identical retries can keep the existing MVCC row and its indexed/TOAST data.

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
 where excluded.verified_at>=sync_document_facts.verified_at
 and (excluded.verified_at,excluded.row_data)
  is distinct from (sync_document_facts.verified_at,sync_document_facts.row_data);
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
 and (excluded.observed_at,excluded.row_data,excluded.classification,excluded.source_lane,excluded.rules_version)
  is distinct from (sync_candidates.observed_at,sync_candidates.row_data,sync_candidates.classification,
   sync_candidates.source_lane,sync_candidates.rules_version)
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
end $function$;

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
   >=coalesce((payload#>>'{row,observed_at}')::timestamptz,'epoch')
  and (payload->'row' is distinct from p_row
   or payload->'lane' is distinct from coalesce(to_jsonb(p_lane),'null'::jsonb)
   or (reason is not null and payload->>'recovery_reason' is distinct from reason));
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
end $function$;

CREATE OR REPLACE FUNCTION public.reconcile_sync_runs()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; total jsonb;
begin
 perform public.recover_verified_document_jobs();
 for r in select id from public.sync_runs where status in ('queued','running','partial') loop
  select jsonb_build_object('records_scanned',coalesce(sum((stats->>'records_scanned')::int),0),'new_bids',coalesce(sum((stats->>'new_bids')::int),0),'updated_bids',coalesce(sum((stats->>'updated_bids')::int),0),'extended_bids',coalesce(sum((stats->>'extended_bids')::int),0),'documents_checked',coalesce(sum((stats->>'documents_checked')::int),0),'coverage_errors',coalesce(sum((stats->>'coverage_errors')::int),0),'completed_lanes',coalesce(max((stats->>'completed_lanes')::int),0),'total_lanes',coalesce(max((stats->>'total_lanes')::int),0),'failures',count(*) filter(where state in ('partial','failed') or last_error is not null)) into total from public.sync_jobs where run_id=r.id;
  update public.sync_runs set stats=total where id=r.id and stats is distinct from total;
  if not exists(select 1 from public.sync_jobs where (run_id=r.id or id in(select job_id from public.sync_job_dependencies where run_id=r.id)) and state in ('queued','running')) then
   update public.sync_runs set status=case when exists(select 1 from public.sync_jobs where (run_id=r.id or id in(select job_id from public.sync_job_dependencies where run_id=r.id)) and state in ('failed','partial')) then 'partial' else 'succeeded' end,finished_at=now() where id=r.id;
  end if;
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.checkpoint_sync_job(p_job_id uuid, p_lease_token uuid, p_cursor jsonb, p_stats jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare rid uuid;
begin
 update public.sync_jobs set cursor=p_cursor,stats=p_stats,updated_at=now()
 where id=p_job_id and lease_token=p_lease_token and state='running' and lease_until>now() returning run_id into rid;
 if rid is null then return false; end if;
 if p_stats ? 'last_gem_contact' then update public.sync_runs set last_gem_contact_at=greatest(last_gem_contact_at,(p_stats->>'last_gem_contact')::timestamptz) where id=rid
 and last_gem_contact_at is distinct from greatest(last_gem_contact_at,(p_stats->>'last_gem_contact')::timestamptz); end if;
 return true;
end $function$;
