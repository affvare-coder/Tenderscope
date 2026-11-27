-- Give each eligibility request one snapshot of the existing source-backed review.
-- Preserve source checks and the public response schema without persisting a cache.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.public_tender_feed(text,text,jsonb,text,integer,integer)'::regprocedure);
  old_block constant text := $old$), matched_eligibility as materialized (
 -- The review view withholds facts if the buyer source has changed.
 -- Classify only known buyer wording with a page and digest. Unknowns remain
 -- in the ordinary feed and cannot satisfy a selected eligibility filter.
 select r.tender_id from public.current_tender_buyer_reviews r
 where exists (select from requested_eligibility) and r.facts is not null and r.reviewed_at<=now()
   and r.source_sha256 ~ '^[a-f0-9]{64}$'
   and r.source_url ~* '^https://([a-z0-9-]+\.)+(gov|edu|ac)\.in/'
   and exists (select from public.tender_documents d where d.tender_id=r.tender_id
     and d.official_url=r.source_url and d.content_hash=r.source_sha256 and d.availability='available')$old$;
  new_block constant text := $new$), eligibility_reviews as materialized (
 -- The review view withholds facts if the buyer source has changed.
 -- Classify only known buyer wording with a page and digest. Unknowns remain
 -- in the ordinary feed and cannot satisfy a selected eligibility filter.
 select r.tender_id,r.facts from public.current_tender_buyer_reviews r
 where exists (select from requested_eligibility) and r.reviewed_at<=now()
   and r.source_sha256 ~ '^[a-f0-9]{64}$'
   and r.source_url ~* '^https://([a-z0-9-]+\.)+(gov|edu|ac)\.in/'
   and exists (select from public.tender_documents d where d.tender_id=r.tender_id
     and d.official_url=r.source_url and d.content_hash=r.source_sha256 and d.availability='available')
), matched_eligibility as materialized (
 select r.tender_id from eligibility_reviews r
 where r.facts is not null$new$;
BEGIN
  IF strpos(definition,new_block)>0 THEN RETURN; END IF;
  IF length(definition)-length(replace(definition,old_block,''))<>length(old_block) THEN
    RAISE EXCEPTION 'The production eligibility query changed';
  END IF;
  EXECUTE replace(definition,old_block,new_block);
END
$migration$;
