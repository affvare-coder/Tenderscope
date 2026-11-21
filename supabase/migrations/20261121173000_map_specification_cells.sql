-- Automatic extraction remains pending review. Multiple possible PDF rows or
-- repeated schedules never acquire a specification through this path.
alter function public.bid_pack_source(uuid,boolean) rename to bid_pack_reviewed_source;
create function public.bid_pack_source(p_tender_id uuid,p_summary boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
with raw as materialized(select public.bid_pack_reviewed_source(p_tender_id,false) b),
rows as materialized(select i from raw cross join lateral jsonb_array_elements(b->'items') i),
cells as materialized(
 select d->>'url' url,d->>'sha' sha,(p->>'page')::int pg,c from jsonb_array_elements(public.representation_sources(p_tender_id)) d
 cross join lateral jsonb_array_elements(nullif(d->'checked_pages','null'::jsonb)) p
 cross join lateral jsonb_array_elements(p->'spec_rows') c where d->>'kind'='specification'
 and d->>'sha'~'^[0-9a-f]{64}$' and length(c->>'wording') between 1 and 6000
), matches as materialized(
 select j.i->>'item_key' k,min(url) url,min(sha) sha,min(pg) pg,min(c->>'wording') wording
 from rows j join cells on c->>'n'=j.i->>'item_number'
 and lower(regexp_replace(trim(c->>'name'),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(j.i->>'name'),'[[:space:]]+',' ','g'))
 where j.i->>'spec_url' is null and j.i->>'source_url'~*'\.csv([?#]|$)'
 and not exists(select from rows r where r.i->>'item_number'=j.i->>'item_number' and r.i->>'item_key'<>j.i->>'item_key')
 group by j.i->>'item_key' having count(*)=1
), result as(select jsonb_agg(case when k is null then i else i||jsonb_build_object('boq_specification',i->'specification','specification',wording,
 'spec_url',url,'spec_sha',sha,'spec_page',pg,'pdf_extracted',true,'reviewed_specification',false) end order by i->>'item_key') items from rows left join matches on k=i->>'item_key'),
digest as(select md5(string_agg(to_jsonb(matches)::text,'|' order by k)) h from matches)
select (case when p_summary then b-'bid'-'documents'-'items'-'expected'-'certified_rows' else b||jsonb_build_object('items',coalesce(items,'[]'::jsonb)) end)
 ||jsonb_build_object('version',case when h is null then b->>'version' else md5((b->>'version')||h) end)
from raw,result,digest where b is not null
$$;
revoke all on function public.bid_pack_source(uuid,boolean) from public;
grant execute on function public.bid_pack_source(uuid,boolean) to anon,authenticated,service_role;
