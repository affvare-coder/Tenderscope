-- A continuously due daily publication sweep can starve saved recovery cursors.
-- Prefer the latest saved recovery window on at most one existing source turn
-- per four hours.
-- Leave daily starts, cadence, expiry, listing refresh, document lanes and pacing unchanged.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure);
  source_rank constant text := $old$ case when publication_pending and payload->>'kind' not in ('document','expiry_check') then$old$;
  recovery_rank constant text := $new$ -- Bounded publication recovery uses the last existing recovery claim timestamp.
 case when publication_pending and streak>=2 and payload->>'kind'='publication_recovery'
       and coalesce((qs#>>'{mode_claims,publication_recovery}')::timestamptz,'-infinity'::timestamptz)
           <=now()-interval '4 hours' then sj.created_at end desc nulls last,
$new$;
BEGIN
  IF strpos(definition,recovery_rank) > 0 THEN
    RETURN;
  END IF;
  IF array_length(string_to_array(definition,source_rank),1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Unexpected source preference in public.claim_sync_job';
  END IF;
  EXECUTE replace(definition,source_rank,recovery_rank || source_rank);
END $migration$;
