-- A listing enrichment can advance latest_change_at without changing the
-- reviewed bid PDF. Retain only that PDF's header evidence through a proved
-- metadata-only update. Attached terms and actual revisions remain separate.
create or replace view public.current_tender_buyer_reviews with (security_invoker=true) as
select r.tender_id,r.reviewed_at,r.source_url,r.source_sha256,
 case
  when t.source_url is distinct from r.gem_url
    or exists (select from public.tender_documents d where d.tender_id=r.tender_id and
       ((d.official_url=r.gem_url and (d.availability='removed' or
          (d.content_hash is not null and d.content_hash<>r.source_sha256)))
        or (d.first_detected_at>r.reviewed_at and lower(d.kind) in ('corrigendum','amendment','atc','boq','specification'))
        or (d.version_no>1 and d.observed_at>r.reviewed_at)))
    or exists (select from public.tender_events e where e.tender_id=r.tender_id and e.detected_at>r.reviewed_at
       and upper(coalesce(e.event_code,e.event_type,'')) in
       ('CORRIGENDUM','ATC_CHANGED','BOQ_CHANGED','SPECIFICATION_CHANGED','BID_DOCUMENT_CHANGED',
        'DOCUMENT_ADDED','DOCUMENT_CHANGED','DOCUMENT_REMOVED','DOCUMENT_UPDATED'))
    then null
  when t.latest_change_at>r.reviewed_at or (r.source_url=r.gem_url and exists (
    select from public.tender_documents a where a.tender_id=r.tender_id
    and lower(a.kind) in ('atc','amendment','corrigendum') and a.official_url<>r.gem_url
    and a.availability is distinct from 'removed'
    and (a.availability is distinct from 'available' or a.content_hash is null)))
   then case when r.source_url=r.gem_url
    and exists (select from public.tender_documents d where d.tender_id=r.tender_id
      and d.official_url=r.gem_url and d.content_hash=r.source_sha256 and d.availability='available')
    and not exists (select from public.tender_documents a where a.tender_id=r.tender_id
      and lower(a.kind) in ('amendment','corrigendum') and a.availability is distinct from 'removed')
    and (t.latest_change_at is null or t.latest_change_at<=r.reviewed_at or exists (
      select from public.tender_events e where e.tender_id=r.tender_id and e.detected_at=t.latest_change_at))
    and not exists (
      select from public.tender_events e where e.tender_id=r.tender_id and e.detected_at>r.reviewed_at
      and (upper(coalesce(e.event_code,e.event_type,''))<>'UPDATED'
        or e.source_url is distinct from r.gem_url
        or jsonb_typeof(e.previous_value) is distinct from 'object'
        or jsonb_typeof(e.new_value) is distinct from 'object'
        or (e.previous_value - array['department','ingestion_status','location','location_class','location_evidence',
               'location_includes_delhi','matched_keywords','search_text','source_category','verification_note'])
           is distinct from
           (e.new_value - array['department','ingestion_status','location','location_class','location_evidence',
               'location_includes_delhi','matched_keywords','search_text','source_category','verification_note'])))
    then (select jsonb_object_agg(key,value) from jsonb_each(r.facts)
      where key in ('bidder','oem','turnover_method','mse','startup','ra','h1','evaluation','emd','epbg','mii')
      and value->>'page' ~ '^[1-5]$'
      and nullif(btrim(value->>'quote'),'') is not null
      and nullif(btrim(value->>'section'),'') is not null)
   end
  else r.facts end as facts
from (select distinct on (tender_id) * from public.tender_buyer_reviews order by tender_id,reviewed_at desc) r
join public.tenders t on t.id=r.tender_id and t.status='published' and t.reviewed_at is not null;
