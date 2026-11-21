insert into public.tender_boq_counts(tender_id,source_url,source_sha,expected_count,source_type,source_location,reviewed_at)
select t.id,v.url,v.hash,v.n,'official_boq_csv','Official BOQ CSV, all consignee item rows in source order, excluding header','2026-11-20 07:20+05:30'::timestamptz
from (values
('GEM/2026/B/8196754','https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqLineItemsDocument/2026/10/24/boq_item_sample_file_2026-10-24-12-05-06_82de7c7ae810dd91a22665ce41c5fa99.csv','3b422661bfb6cfe696d7c60942e59b72ce69bfcd03b991dae57cfbe0a9d3ad2b',94),
('GEM/2026/B/8261632','https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqLineItemsDocument/2026/11/11/boq_item_sample_file_2026-11-11-07-53-22_8e700dbd189b984cf0a6b5c7814a2fff.csv','6c6d9248d1a79b712f66c04f8c1f5438cfa9e34c86e83458bdf0e38023876998',23),
('GEM/2026/B/8291836','https://mkp.gem.gov.in/uploaded_documents/51/16/877/OrderItem/BoqLineItemsDocument/2026/11/19/boq_item_sample_file-5_2026-11-19-09-33-19_58d071352d8b6d7d77a0350447a51aa0.csv','3b0d08e3a72dc5298003555008d01184e077e4b6cd1dfb748f421d40bb4bb13b',15)) as v(bid,url,hash,n) join public.tenders t on t.bid_number=v.bid
join public.tender_documents d on d.tender_id=t.id and d.official_url=v.url and d.content_hash=v.hash and d.availability='available'
on conflict do nothing;
