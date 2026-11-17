-- TenderScope: reserve one fast, bounded open-bid document turn per existing fair burst.
-- Read-only EXPLAIN ANALYZE benchmark on 17 Nov: broad search 1286ms; tender-first lookup 18ms.
-- Does not change worker caps, lease locks, history, payload, document versions or tender classification.
CREATE OR REPLACE FUNCTION public.claim_sync_job(p_worker_id text, p_lease_seconds integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.sync_jobs%rowtype; selected_id uuid; qs jsonb; streak int; documents_in_burst int; burst_limit int; publication_pending boolean; source_limit int; cadence_hour text; head_claims int; reconciliation_claims int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('tenderscope:single-worker',0)) then return null; end if;
 if exists(select 1 from public.sync_jobs where state='running' and lease_until>now()) then return null; end if;
 with expired as (
  update public.sync_jobs set state='queued',lease_token=null,lease_until=null,attempts=attempts+1,
  failure_streak=failure_streak+1,last_error='lease_expired',updated_at=now(),
  available_at=now()+make_interval(secs=>least(3600,(60*power(2,least(failure_streak,6)))::int))
  where state='running' and lease_until<now() returning *
 ) insert into public.sync_job_failures(job_id,attempt,error,disposition,retry_at)
 select id,attempts,'lease_expired','retry',available_at from expired on conflict(job_id,attempt) do nothing;
 -- Attempts count lifetime failures; transient failures never silently discard a cursor.
 select state into qs from public.sync_state where key='queue_dispatch';
 select exists(select 1 from public.sync_jobs where state='queued' and available_at<=now() and payload->>'kind'='publication') into publication_pending;
 burst_limit:=case when publication_pending then 3 else 7 end;
 source_limit:=case when publication_pending then 4 else 2 end;
 qs:=coalesce(qs,'{}');cadence_hour:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24');
 head_claims:=case when qs#>>'{cadence,window}'=cadence_hour then coalesce((qs#>>'{cadence,light_head}')::int,0) else 0 end;
 reconciliation_claims:=case when qs#>>'{cadence,window}'=cadence_hour then coalesce((qs#>>'{cadence,reconciliation_tick}')::int,0) else 0 end;
 streak:=coalesce((qs->>'discovery_streak')::int,0);documents_in_burst:=coalesce((qs->>'document_streak')::int,0);

 -- Fast-path exactly one reserved document turn per fair scheduling burst.
 -- Main bid PDFs must be prioritized as well as already-discovered BOQ CSVs:
 -- the PDF is the source that reveals missing BOQ/ATC links for most live bids.
 -- Preserve any fresh daily publication, hourly head, reconciliation or due
 -- high-priority expiry turn before taking this reservation.
 if streak>=source_limit and documents_in_burst=0
   and not exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now()
       and x.payload->>'kind'='publication' and x.payload->>'coverage_mode'='daily_head'
       and not (x.cursor ? 'publication') and x.created_at>now()-interval '26 hours'
   )
   and not (head_claims<4 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='light_head'
   ))
   and not (reconciliation_claims<2 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='reconciliation_tick'
   ))
   and not (publication_pending and streak=3 and exists(
     select 1 from public.sync_jobs x where x.state='queued' and x.available_at<=now() and x.payload->>'kind'='expiry_check'
   ))
 then
  with live_missing as materialized (
   select t.bid_number,t.deadline from public.tenders t
   where t.status='published' and t.deadline>now()
     and coalesce(t.ingestion_status,'')<>'excluded'
     and not exists(select 1 from public.tender_items i where i.tender_id=t.id and i.is_current)
  )
  select j.id into selected_id
  from live_missing t
  join lateral (
   select sj.id,sj.created_at,sj.payload->>'url' as url
   from public.sync_jobs sj
   where sj.state='queued' and sj.available_at<=now()
    and sj.payload->>'kind'='document'
    and sj.payload#>>'{row,bid_number}'=t.bid_number
    and (sj.payload->>'url' ~* '(\.csv([?#]|$)|BoqLineItemsDocument)'
      or sj.payload->>'url' ~ '/showbidDocument/')
   order by case when sj.payload->>'url' ~* '(\.csv([?#]|$)|BoqLineItemsDocument)' then 0 else 1 end,sj.created_at
   limit 1
  ) j on true
  order by case when j.url ~* '(\.csv([?#]|$)|BoqLineItemsDocument)' then 0 else 1 end,
    case when t.deadline<now()+interval '48 hours' then 0 else 1 end,
    t.deadline,j.created_at limit 1;
 end if;
 if selected_id is null then
 select sj.id into selected_id from public.sync_jobs sj left join public.tenders t on t.bid_number=sj.payload#>>'{row,bid_number}' where sj.state='queued' and sj.available_at<=now()
 and (sj.payload->>'kind'<>'light_head' or head_claims<4)
 and (sj.payload->>'kind'<>'reconciliation_tick' or reconciliation_claims<2)
 order by case when payload->>'kind'='publication' and payload->>'coverage_mode'='daily_head'
 and not (sj.cursor ? 'publication') and sj.created_at>now()-interval '26 hours'
 then 0 else 1 end,
 -- Bounded hourly reservations sit below a fresh daily publication head.
 -- At most four light-head and two rotating-reconciliation claims/hour;
 -- the remaining paced invocations retain the existing discovery/document fairness.
 case when payload->>'kind' in ('light_head','reconciliation_tick') then 0 else 1 end,
 case when payload->>'kind'='light_head' then 0 when payload->>'kind'='reconciliation_tick' then 1 else 2 end,
 case when payload->>'kind'='expiry_check' then case when (publication_pending and streak=3) or (not publication_pending and streak=0) then -1 else 2 end else 0 end,
 case when payload->>'kind'='document' then case when streak>=source_limit then 0 else 1 end else case when streak>=source_limit then 1 else 0 end end,
 -- While a publication is pending: two publication slices, one saved
 -- discovery slice and one expiry slice, then a short document burst.
 case when publication_pending and payload->>'kind' not in ('document','expiry_check') then
 case when (streak<2 and payload->>'kind'='publication') or (streak>=2 and payload->>'kind'='discovery') then 0 else 1 end else 0 end,
 -- Reserve the first document slot for a due open-bid BOQ with no verified items.
 -- This does not consume source/expiry turns or the last location/oldest-job slot.
 case when payload->>'kind'='document' and streak>=source_limit and documents_in_burst=0
  and t.deadline>now() and t.status='published'
  and coalesce(t.ingestion_status,'')<>'excluded'
  and payload->>'url' ~* '(\.csv([?#]|$)|BoqLineItemsDocument)'
  and not exists(select 1 from public.tender_items i join public.tender_documents d
   on d.tender_id=i.tender_id and d.official_url=i.source_url and d.content_hash=i.source_hash
   where i.tender_id=t.id and i.is_current and d.availability='available')
 then 0 else 1 end,
 -- A reserved document slot advances location verification; the burst is
 -- shorter while a fresh publication pass is pending.
 -- Missing-bid verification retains the other priority slots; the last
 -- document still recovers the oldest queued job. No eligible location job
 -- means the existing ordering is used without an idle reservation.
 case when payload->>'kind'='document' and streak>=source_limit and documents_in_burst=burst_limit-1 then
  case when payload->>'recovery_reason'='location_parser_upgrade'
   and payload->>'url' ~ '/showbidDocument/' and t.deadline>now()
   and t.status='published' and t.reviewed_at is not null
   and (t.location_class='UNKNOWN' or coalesce(t.location_evidence->>'verification','')<>'OFFICIAL_FACT'
    or coalesce(t.location_evidence->>'parser_version','')<>'gem-consignee-address-v2')
   and coalesce(t.ingestion_status,'')<>'excluded'
  then 0 else 1 end else 0 end,
 case when payload->>'kind'='document' and streak>=source_limit and documents_in_burst=burst_limit-1
 then case when t.location_includes_delhi then 0 else 1 end else 0 end,
 case when payload->>'kind'='document' and streak>=source_limit and documents_in_burst=burst_limit-1
 then case when t.category='dental' or t.subcategory='Dental' then 0 else 1 end else 0 end,
 -- Verify missing live healthcare bids before repeating checks of known bids.
 -- The last document slot still recovers the oldest queued work.
 case when payload->>'kind'='document' and documents_in_burst<burst_limit then case
 when t.id is null and payload->>'url' ~ '/showbidDocument/' and (payload#>>'{row,closes_at}')::timestamptz>now() then 0 else 1 end else 0 end,
 case when payload->>'kind'='document' and documents_in_burst<burst_limit and payload->>'recovery_reason' is not null then 0 else 1 end,
 case when payload->>'kind'='document' and documents_in_burst<burst_limit then case
 when coalesce(t.deadline,(payload#>>'{row,closes_at}')::timestamptz)>now() and coalesce(t.deadline,(payload#>>'{row,closes_at}')::timestamptz)<=now()+interval '48 hours' then 0
 when coalesce(t.deadline,(payload#>>'{row,closes_at}')::timestamptz)>now() then 1
 when coalesce(t.deadline,(payload#>>'{row,closes_at}')::timestamptz)>=now()-interval '14 days' then 2 else 3 end else 0 end,
 case when payload->>'kind'='document' and documents_in_burst<burst_limit and coalesce(t.deadline,(payload#>>'{row,closes_at}')::timestamptz)>now() and (payload->>'url' ~* '(\.csv([?#]|$)|BoqLineItemsDocument)') then 0 else 1 end,
 -- Fresh publication starts before unfinished previous-day scans.
 case when payload->>'kind'='publication' then sj.created_at end desc nulls last,
 case when payload->>'kind' in ('discovery','publication_recovery') then coalesce((qs->'mode_claims'->>(case when payload->>'kind'='publication_recovery' then 'publication_recovery' else mode end))::timestamptz,'1970-01-01'::timestamptz) else '1970-01-01'::timestamptz end,case when payload->>'kind'='document' and documents_in_burst>=burst_limit then sj.created_at else sj.updated_at end,sj.created_at limit 1;
 end if;
 if selected_id is null then return null; end if;
 -- Only the selected row is fetched and locked; never sort full JSON payloads.
 select * into j from public.sync_jobs where id=selected_id and state='queued' and available_at<=now() for update skip locked;
 if j.id is null then return null; end if;
 update public.sync_jobs set state='running',worker_id=p_worker_id,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,180))),updated_at=now()
 where id=j.id returning * into j;
 qs:=jsonb_build_object('cadence',jsonb_build_object('window',cadence_hour,'light_head',head_claims+case when j.payload->>'kind'='light_head' then 1 else 0 end,'reconciliation_tick',reconciliation_claims+case when j.payload->>'kind'='reconciliation_tick' then 1 else 0 end),'discovery_streak',case when j.payload->>'kind'='document' then case when streak>=source_limit and documents_in_burst<burst_limit then streak else 0 end else streak+1 end,
 'document_streak',case when j.payload->>'kind'='document' and streak>=source_limit and documents_in_burst<burst_limit then documents_in_burst+1 else 0 end,
 -- Expiry checks share the daily run, but must not consume daily discovery's turn.
 'mode_claims',case when j.payload->>'kind' in ('discovery','publication_recovery') then coalesce(qs->'mode_claims','{}')||jsonb_build_object(case when j.payload->>'kind'='publication_recovery' then 'publication_recovery' else j.mode end,now()) else coalesce(qs->'mode_claims','{}') end);
 insert into public.sync_state(key,state) values('queue_dispatch',qs) on conflict(key) do update set state=excluded.state,updated_at=now();
 update public.sync_runs set status='running',finished_at=null where id=j.run_id;
 return to_jsonb(j);
end $function$
;
