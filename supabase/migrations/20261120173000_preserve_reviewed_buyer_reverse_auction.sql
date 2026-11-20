-- The buyer PDFs in the published reviews explicitly enable bid-to-RA on page 2.
update public.tender_buyer_reviews set facts=jsonb_set(facts,'{ra,enabled}','true')
where (source_sha256,gem_url) in (
 ('b0f6fcc0ad6c13ad03a3ed4318377598251e391b5163667ebe2c8f62697c9fe1','https://bidplus.gem.gov.in/showbidDocument/10161134'),
 ('9908c0de9a3be27d13b87fed020b639d7a63d2668d727406658954b43c07ebc4','https://bidplus.gem.gov.in/showbidDocument/10145234'))
and facts->'ra'->>'page'='2';

-- Prevent a lower-confidence listing refresh from replacing a reviewed PDF term.
-- Preserve the existing procedure, grants and all its other field/identity handling.
do $migration$
declare previous text:=pg_get_functiondef('public.ingest_tender(jsonb,text,text,text,timestamptz,uuid)'::regprocedure);
 anchor text:=' newrow:=jsonb_populate_record(oldrow,patch);';
 fragment text:=$rule$
 if patch ? 'bid_to_ra' and coalesce(patch->>'source_url',oldrow.source_url)=oldrow.source_url
    and coalesce((patch->>'deadline')::timestamptz,oldrow.deadline)=oldrow.deadline
    and not exists(select from jsonb_array_elements(coalesce(p_row->'documents','[]'::jsonb)) as incoming(doc_value)
       where nullif(incoming.doc_value->>'content_hash','') is not null or lower(incoming.doc_value->>'kind') in ('corrigendum','amendment')) then
   patch:=patch||coalesce((select jsonb_build_object('bid_to_ra',case when (r.facts->'ra'->>'enabled')::boolean then 'Yes' else 'No' end)
     from public.current_tender_buyer_reviews r where r.tender_id=oldrow.id and jsonb_typeof(r.facts->'ra'->'enabled')='boolean'),'{}'::jsonb);
 end if;
$rule$;
begin
 if strpos(previous,fragment)>0 then return;end if;
 if strpos(previous,anchor)=0 then raise exception 'ingestion procedure changed: review the patch';end if;
 execute replace(previous,anchor,fragment||anchor);
end $migration$;

update public.tenders t set bid_to_ra=case when (r.facts->'ra'->>'enabled')::boolean then 'Yes' else 'No' end
from public.current_tender_buyer_reviews r where t.id=r.tender_id and jsonb_typeof(r.facts->'ra'->'enabled')='boolean'
and t.bid_to_ra is distinct from case when (r.facts->'ra'->>'enabled')::boolean then 'Yes' else 'No' end;
