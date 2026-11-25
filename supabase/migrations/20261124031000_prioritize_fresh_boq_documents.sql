-- A header review can discover the official BOQ before the document worker
-- reaches its parent. Use one existing fresh document turn to finish that work.
do $migration$
declare
  definition text := pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure);
  declaration_anchor constant text := 'selected_id uuid; qs jsonb;';
  selection_anchor constant text := '  select id into selected_id from public.queued_document_lanes' || chr(10) || '  where available_at<=now()';
  order_anchor constant text := 'case when lane in (''fresh'',''urgent'') and failure_streak>=3 then 1 else 0 end,';
begin
  if position(declaration_anchor in definition) = 0
     or position(selection_anchor in definition) = 0
     or position(order_anchor in definition) = 0 then
    raise exception 'Unexpected document claim definition; review the current scheduler';
  end if;

  definition := replace(definition, declaration_anchor, 'selected_id uuid; fresh_boq_job uuid; qs jsonb;');
  definition := replace(definition, selection_anchor, $rank$
  if doc_turn = 0 then
    select job.id into fresh_boq_job
    from public.tenders t
    join public.tender_documents main on main.tender_id = t.id
      and main.official_url = t.source_url and main.availability = 'available'
      and main.content_hash ~ '^[0-9a-f]{64}$'
    join public.tender_documents doc on doc.tender_id = t.id
      and doc.kind in ('boq','specification') and doc.availability = 'unverified'
    left join lateral (
      select queued_job.id from public.sync_jobs queued_job
      where queued_job.payload->>'kind' = 'document' and queued_job.state in ('queued','running')
        and queued_job.payload->>'url' = doc.official_url and queued_job.payload#>>'{row,bid_number}' = t.bid_number
      order by (queued_job.state = 'running') desc, queued_job.available_at, queued_job.id
      limit 1
    ) child on true
    -- If a child already exists, its own lease and backoff govern when it can run.
    -- Otherwise the ordinary parent worker validates and enqueues its attachments.
    join lateral (
      select queued_job.id, queued_job.created_at from public.sync_jobs queued_job
      where queued_job.payload->>'kind' = 'document' and queued_job.state = 'queued' and queued_job.available_at <= now()
        and queued_job.failure_streak < 3 and queued_job.payload#>>'{row,bid_number}' = t.bid_number
        and queued_job.payload->>'url' = case when child.id is null then t.source_url else doc.official_url end
        and (child.id is null or queued_job.id = child.id)
      order by queued_job.created_at, queued_job.id
      limit 1
    ) job on true
    where t.status = 'published' and t.reviewed_at is not null
      and t.published_at between now() - interval '24 hours' and now()
      and t.deadline > now() + interval '72 hours'
      and t.ingestion_status <> 'excluded'
      and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
    order by case
      when child.id is null then 2
      when exists (
        select from public.tender_documents other where other.tender_id = t.id
          and other.kind = case doc.kind when 'boq' then 'specification' else 'boq' end
          and other.availability = 'available' and other.content_hash ~ '^[0-9a-f]{64}$'
      ) then 0 else 1 end,
      t.published_at, case when doc.kind = 'boq' then 0 else 1 end,
      job.created_at, job.id
    limit 1;
  end if;
$rank$ || selection_anchor);
  -- Lane selection and retry fairness still precede the preference.
  definition := replace(definition, order_anchor, order_anchor ||
    chr(10) || '           case when id = fresh_boq_job then 0 else 1 end,');
  execute definition;
end $migration$;
