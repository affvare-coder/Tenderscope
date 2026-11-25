-- Reserve a preference on at most one existing urgent document turn per hour.
-- Preserve the publication, expiry, fresh-attachment, and worker lease rules.
do $migration$
declare
  definition text := pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure);
  declare_at constant text := 'selected_id uuid;';
  read_state_at constant text := 'select state into qs from public.sync_state where key=''queue_dispatch'';';
  choose_at constant text := '  select id into selected_id from public.queued_document_lanes' || chr(10) || '  where available_at<=now()';
  lane_at constant text := 'order by case when lane=(array[';
  retry_at constant text := 'case when lane in (''fresh'',''urgent'') and failure_streak>=3 then 1 else 0 end,';
  save_state_at constant text := 'insert into public.sync_state(key,state) values(''queue_dispatch'',qs)';
  anchor text;
begin
  if position('recent_change_job uuid;' in definition) > 0 then return; end if;

  foreach anchor in array array[declare_at,read_state_at,choose_at,lane_at,retry_at,save_state_at] loop
    if array_length(string_to_array(definition,anchor),1) <> 2 then
      raise exception 'Unexpected document claim definition at %', anchor;
    end if;
  end loop;

  definition := replace(definition,declare_at,declare_at || ' recent_change_job uuid; last_change_turn_at timestamptz;');
  definition := replace(definition,read_state_at,read_state_at || chr(10) ||
    ' last_change_turn_at:=(qs->>''last_change_turn_at'')::timestamptz;');

  definition := replace(definition,choose_at,$choose$
  if doc_turn=1 and coalesce(last_change_turn_at,'-infinity'::timestamptz)<=now()-interval '1 hour' then
    with recent_changes as materialized (
      select tender_id,event_code,source_url,detected_at,old_deadline,new_deadline,new_value,previous_value
      from public.tender_events
      where detected_at between now()-interval '24 hours' and now()
        and source='GeM' and event_code in ('CLOSING_DATE_CHANGED','EXTENDED','CORRIGENDUM')
        and source_url ~* '^https://([a-z0-9-]+\.)*gem\.gov\.in/'
    )
    select job.id into recent_change_job
    from recent_changes e
    join public.tenders t on t.id=e.tender_id
    join public.sync_jobs job on job.payload#>>'{row,bid_number}'=t.bid_number and job.payload->>'url'=e.source_url
    where lower(t.source)='gem'
      and t.status='published' and t.reviewed_at is not null and t.published_at<=now()
      and t.closing_time_verified and t.deadline>now()
      and coalesce(t.ingestion_status,'')<>'excluded'
      and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
      and job.payload->>'kind'='document' and job.state='queued' and job.available_at<=now() and job.failure_streak<3
      and (
        (e.event_code in ('CLOSING_DATE_CHANGED','EXTENDED') and e.source_url=t.source_url
          and e.new_deadline=t.deadline and e.old_deadline<>e.new_deadline
          and job.payload->>'recovery_reason'='deadline_changed'
          and (case when pg_input_is_valid(job.payload#>>'{row,closes_at}','timestamptz')
                    then (job.payload#>>'{row,closes_at}')::timestamptz end)=t.deadline)
        or (e.event_code='CORRIGENDUM' and exists (
          select 1 from public.tender_documents d
          where d.tender_id=t.id and d.official_url=e.source_url and d.kind in ('corrigendum','amendment')
            and e.new_value->>'id'=d.id::text and e.new_value->>'version_no'=d.version_no::text
            and (
              (d.availability='unverified' and d.content_hash is null)
              or (d.availability='available' and d.content_hash ~ '^[0-9a-f]{64}$'
                and e.new_value->>'content_hash'=d.content_hash
                and e.previous_value->>'content_hash' ~ '^[0-9a-f]{64}$'
                and e.previous_value->>'content_hash'<>d.content_hash)
            )
        ))
      )
    order by t.deadline,e.detected_at,job.created_at,job.id
    limit 1;
  end if;
$choose$ || choose_at);

  definition := replace(definition,lane_at,'order by case when id=recent_change_job then 0 when lane=(array[');
  definition := replace(definition,retry_at,retry_at || $rank$
           case when recent_change_job is null then 1
                when lane='urgent' and closing<=now()+interval '6 hours' then 0
                when id=recent_change_job then 1 else 2 end,$rank$);
  definition := replace(definition,save_state_at,$save$
 if j.id=recent_change_job then last_change_turn_at:=now(); end if;
 qs:=qs||jsonb_build_object('last_change_turn_at',last_change_turn_at);
 $save$ || save_state_at);
  execute definition;
end $migration$;
