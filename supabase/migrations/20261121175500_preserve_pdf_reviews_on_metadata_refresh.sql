-- A delivery-location enrichment changes the version of a vendor pack, but the
-- row comparison is still valid when all source and schedule evidence agrees.
alter table public.tender_specification_reviews add column evidence_digest text;
create function public.specification_review_digest(b jsonb) returns text
language sql immutable strict set search_path='' as $$
 select case when jsonb_typeof(b->'items')='array' then md5(jsonb_build_array(
  b->'deadline',b->'amendment',b->'document_versions',b->'expected',
  (select jsonb_agg(i - 'observed_at' - 'id' order by i->>'item_key') from jsonb_array_elements(b->'items') i)
 )::text) end
$$;
revoke all on function public.specification_review_digest(jsonb) from public;
grant execute on function public.specification_review_digest(jsonb) to anon,authenticated,service_role;
create function tenderscope_private.bind_specification_review() returns trigger
language plpgsql set search_path='' as $$
declare b jsonb := public.bid_pack_extracted_source(new.tender_id,false);
begin
 new.evidence_digest:=case when new.base_version=b->>'version' then public.specification_review_digest(b) end;
 return new;
end $$;
create trigger bind_specification_review before insert or update of base_version,source_sha,rows on public.tender_specification_reviews
for each row execute function tenderscope_private.bind_specification_review();
update public.tender_specification_reviews r set evidence_digest=public.specification_review_digest(public.bid_pack_extracted_source(r.tender_id,false))
where r.base_version=public.bid_pack_extracted_source(r.tender_id,true)->>'version';

do $migration$
declare
 src text:=pg_get_functiondef('public.bid_pack_reviewed_source(uuid,boolean)'::regprocedure);
 old text:=$fragment$r.base_version=raw.b->>'version'$fragment$;
 oldend text:=$fragment$d->>4='available')$fragment$;
 newend text:=$fragment$d->>4='available')
 order by (r.base_version=raw.b->>'version') desc,r.reviewed_at desc limit 1$fragment$;
begin
 if strpos(src,old)=0 or strpos(src,oldend)=0 then raise exception 'Review wrapper differs from expected revision';end if;
 src:=replace(src,old,'('||old||' or r.evidence_digest=public.specification_review_digest(raw.b))');
 src:=replace(src,oldend,newend);
 src:=replace(src,'md5(r.base_version||r.source_sha','md5((b->>''version'')||r.source_sha');
 execute src;
end $migration$;
