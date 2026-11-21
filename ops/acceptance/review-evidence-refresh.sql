-- Run in a transaction against the November 21 reviewed fixture, then roll back.
begin;
do $$
declare
 tender uuid := (select id from public.tenders where bid_number='GEM/2026/B/8304644');
 before_rows int; after_rows int;
begin
 select count(*) into before_rows from jsonb_array_elements(public.bid_pack_source(tender,false)->'items') i where i?'spec_url';
 if before_rows<>19 then raise exception 'Fixture source or lifecycle changed';end if;
 update public.tenders set location=coalesce(location,'')||' (test)' where id=tender;
 select count(*) into after_rows from jsonb_array_elements(public.bid_pack_source(tender,false)->'items') i where i?'spec_url';
 if after_rows<>before_rows then raise exception 'Location update invalidated a specification';end if;
 update public.tender_documents set content_hash=repeat('a',64) where tender_id=tender and kind='specification';
 if exists(select from jsonb_array_elements(public.bid_pack_source(tender,false)->'items') i where i?'spec_url') then raise exception 'Stale specification remained visible';end if;
end $$;
rollback;
