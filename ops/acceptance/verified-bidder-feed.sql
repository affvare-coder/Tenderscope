-- Run in one transaction in the existing project. All fixture data is rolled back.
begin;
do $test$
declare t public.tenders%rowtype; u text; h text:=repeat('a',64); n int;
begin
 select * into strict t from public.tenders where bid_number='GEM/2026/B/8270018';
 u:=t.source_url;
 if not exists(select from public.current_tender_buyer_reviews where tender_id=t.id and facts->'exemption'->>'page'='11') then raise exception 'Missing buyer ATC evidence';end if;
 -- Replace the document set for this transaction so additional future files do not affect the fixture.
 update public.tender_documents set availability='removed' where tender_id=t.id and official_url<>u;
 update public.tender_documents set content_hash=h,availability='available' where tender_id=t.id and official_url=u;
 if exists(select from public.current_tender_buyer_reviews where tender_id=t.id and facts is not null) then raise exception 'Superseded buyer facts leaked';end if;
 update public.tender_items set is_current=false where tender_id=t.id;
 insert into public.tender_items(tender_id,item_key,name,quantity,unit,specification,source_url,source_hash,observed_at)
 values(t.id,'qa-review','QA product',1,'piece','Length 10 mm',u,h,now());
 insert into public.tender_boq_reviews values(t.id,now(),1,u,h,'p. 1',jsonb_build_array(jsonb_build_object('url',u,'sha',h)),
 jsonb_build_array(jsonb_build_object('key','qa-review','name','QA product','quantity',1,'unit','piece','specification','Length 10 mm','number',null,'pack',null,
 'url',u,'sha',h,'spec_url',u,'spec_sha',h,'row_location','row 1','spec_location','p. 1','ordinal',1)));
 if not exists(select from public.verified_boq_bids where tender_id=t.id) then raise exception 'Complete fixture hidden';end if;
 if not (public.public_tender_feed('landing')->'rows' @> jsonb_build_array(jsonb_build_object('id',t.id))) then raise exception 'Verified landing missing fixture';end if;
 update public.tender_items set specification='Length 11 mm' where tender_id=t.id and item_key='qa-review';
 if exists(select from public.verified_boq_bids where tender_id=t.id) then raise exception 'Changed specification still certified';end if;
 if (public.public_tender_feed('allopen',t.bid_number)->>'total')::int<>1 then raise exception 'Exact open bid missing';end if;
end $test$;
rollback;
