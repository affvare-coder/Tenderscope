-- Rechecks excluded by earlier rules waited four days behind continuous discovery.
-- Keep the existing daily head, expiry, document and hourly reservations.
do $migration$
declare sql text:=pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure);
 rank_anchor text:=$old$ case when payload->>'kind'='document' then case when streak>=source_limit$old$;
 state_anchor text:=$old$qs:=jsonb_build_object('document_turn',$old$;
begin
 if position(rank_anchor in sql)=0 or position(state_anchor in sql)=0 then raise exception 'Recheck the live claim function before applying this migration';end if;
 sql:=replace(sql,rank_anchor,$new$ case when sj.payload->>'kind'='listing_refresh' and jsonb_typeof(sj.payload->'rows')='array'
 and coalesce((qs->>'last_listing_refresh_at')::timestamptz,'-infinity'::timestamptz)<=now()-interval '1 hour' then 0 else 1 end,
$new$||rank_anchor);
 sql:=replace(sql,state_anchor,$new$qs:=jsonb_build_object('last_listing_refresh_at',case when j.payload->>'kind'='listing_refresh' then to_jsonb(now()) else qs->'last_listing_refresh_at' end,'document_turn',$new$);
 execute sql;
end $migration$;
