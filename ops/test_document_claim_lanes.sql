begin;
create temp table sync_jobs (like public.sync_jobs including defaults including constraints including indexes);
create temp table sync_state (like public.sync_state including defaults including constraints including indexes);
create temp table sync_runs (like public.sync_runs including defaults including constraints including indexes);
create temp table sync_job_failures (like public.sync_job_failures including defaults including constraints including indexes);
create temp table tenders (like public.tenders including defaults including constraints including indexes);
create temp table tender_documents (like public.tender_documents including defaults including constraints including indexes);
create temp table tender_events (like public.tender_events including defaults including constraints including indexes);
create temp table tender_items (like public.tender_items including defaults including constraints including indexes);
do $install$
declare definition text;
begin
 perform set_config('search_path','',true);
 definition:=pg_get_viewdef('public.queued_document_lanes'::regclass,true);
 execute 'create temp view queued_document_lanes as '||replace(definition,'public.','pg_temp.');
 execute replace(replace(pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure),
   'public.','pg_temp.'),'tenderscope:single-worker','tenderscope:claim-fixture:'||pg_backend_pid());
end $install$;
insert into pg_temp.sync_state(key,state) values ('queue_dispatch','{"discovery_streak":12}');
insert into pg_temp.sync_runs(mode) values('hourly');
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload)
select r.id,'hourly',v.label,jsonb_build_object('kind','document','url','https://bidplus.gem.gov.in/showbidDocument/1','row',jsonb_build_object('bid_number',v.label,'published_at',now()-v.age,'closes_at',now()+v.to_close))
from pg_temp.sync_runs r cross join (values ('fresh-1',interval '1 hour',interval '8 days'),('fresh-2',interval '2 hours',interval '9 days'),('urgent',interval '2 days',interval '1 day'),('backlog',interval '73 hours',interval '7 days'),('expired',interval '8 days',interval '-4 days')) v(label,age,to_close);
do $test$ declare chosen jsonb; item text; seq text[]:='{}'; begin
 if exists(select 1 from pg_temp.queued_document_lanes where closing<now()-interval '3 days') then raise exception 'expired candidate eligible'; end if;
 for i in 1..4 loop chosen:=pg_temp.claim_sync_job('fixture',30); item:=chosen->>'dedupe_key'; seq:=array_append(seq,item);
 if i in (1,3) and item not like 'fresh-%' or i=2 and item is distinct from 'urgent' or i=4 and item is distinct from 'backlog' then raise exception 'unexpected lane for %: %',i,seq; end if;
 if pg_temp.claim_sync_job('concurrent-fixture',30) is not null then raise exception 'concurrent lease'; end if;
 update pg_temp.sync_jobs set state='succeeded' where id=(chosen->>'id')::uuid;
 end loop;
 if pg_temp.claim_sync_job('fixture',30) is not null then raise exception 'claimed stale candidate'; end if;
end $test$;
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload)
 select id,'hourly','expiry-test','{"kind":"expiry_check"}'::jsonb from pg_temp.sync_runs;
do $test$ declare j jsonb; begin j:=pg_temp.claim_sync_job('fixture',30); if j->>'dedupe_key' is distinct from 'expiry-test' then raise exception 'expiry check starved'; end if;update pg_temp.sync_jobs set state='succeeded' where id=(j->>'id')::uuid; end $test$;
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload)
 select id,'hourly','daily-test','{"kind":"publication","coverage_mode":"daily_head"}' from pg_temp.sync_runs;
update pg_temp.sync_jobs set state='queued',available_at=now()+interval '1 hour' where dedupe_key='fresh-1';
update pg_temp.sync_jobs set state='queued',payload=jsonb_set(payload,'{row,closes_at}',to_jsonb(now()+interval '2 days')) where dedupe_key='expired';
do $test$ declare j jsonb; begin
 j:=pg_temp.claim_sync_job('fixture',30); if j->>'dedupe_key' is distinct from 'daily-test' then raise exception 'daily head not protected'; end if;
 update pg_temp.sync_jobs set state='succeeded' where id=(j->>'id')::uuid;
 j:=pg_temp.claim_sync_job('fixture',30); if j->>'dedupe_key' is distinct from 'expired' then raise exception 'confirmed extension did not re-enter'; end if;
 update pg_temp.sync_jobs set state='succeeded' where id=(j->>'id')::uuid;
 if pg_temp.claim_sync_job('fixture',30) is not null then raise exception 'claimed before retry time'; end if;
end $test$;
-- A newer child must be able to finish the BOQ before all fresh parents run.
update pg_temp.sync_jobs set state='succeeded';
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,created_at,payload)
 select r.id,'hourly',p.label,now()-p.queued_ago,
   jsonb_build_object('kind','document','url',p.url,'lane',p.lane,
     'row',jsonb_build_object('bid_number',p.bid,'published_at',now()-p.published_ago,'closes_at',now()+interval '7 days'))
 from pg_temp.sync_runs r cross join (values
   ('parent','new','normal','https://bidplus.gem.gov.in/showbidDocument/101',interval '7 hours',interval '10 hours'),
   ('csv','old','official-pdf-attachment','https://mkp.gem.gov.in/uploaded_documents/BoqLineItemsDocument/1.csv',interval '1 hour',interval '12 hours'),
   ('spec','old','official-pdf-attachment','https://mkp.gem.gov.in/uploaded_documents/BoqDocument/1.pdf',interval '2 hours',interval '12 hours'),
   ('next-csv','new','official-pdf-attachment','https://mkp.gem.gov.in/uploaded_documents/BoqLineItemsDocument/2.csv',interval '3 hours',interval '10 hours')
 ) p(label,bid,lane,url,queued_ago,published_ago);
do $test$ declare expected text; chosen jsonb; begin
 foreach expected in array array['parent','csv','spec','next-csv'] loop
  update pg_temp.sync_state set state=jsonb_build_object('document_turn',case when expected='parent' then 0 else 2 end,'discovery_streak',12) where key='queue_dispatch';
  chosen:=pg_temp.claim_sync_job('attachment-fixture',30);
  if chosen->>'dedupe_key' is distinct from expected then raise exception 'Expected %, got %',expected,chosen->>'dedupe_key'; end if;
  update pg_temp.sync_jobs set state='succeeded' where id=(chosen->>'id')::uuid;
 end loop;
end $test$;

-- A main PDF can have source links before the ordinary parent worker runs.
-- Mix existing children, a parent with no child and a child waiting for retry.
update pg_temp.sync_jobs set state='succeeded';
insert into pg_temp.tenders (source,bid_number,title,category,buyer,location,published_at,deadline,
  status,source_url,value_basis,reviewed_at)
select 'gem',label,'Consumables','medical','Test buyer','Test location',now()-age,now()+interval '10 days',
  'published','https://bidplus.gem.gov.in/showbidDocument/'||n,'unavailable',now()
from (values ('paired',101,interval '8 hours'),('orphan',102,interval '9 hours'),
             ('backoff',103,interval '12 hours'),('newest',104,interval '1 hour'),
             ('unpaired',105,interval '10 hours')) v(label,n,age);

insert into pg_temp.tender_documents(tender_id,kind,title,official_url,document_key,availability,content_hash)
select id,'bid','Main bid',source_url,'bid','available',repeat('a',64) from pg_temp.tenders
union all
select id,'boq','BOQ','https://mkp.gem.gov.in/'||bid_number||'.csv','boq','unverified',null
from pg_temp.tenders where bid_number <> 'newest'
union all
select id,'specification','Buyer specification','https://mkp.gem.gov.in/'||bid_number||'.pdf',
  'specification','available',repeat('b',64) from pg_temp.tenders where bid_number='paired';

-- Give the normal fallback a distinct queue age from the paired-job fixtures.
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,created_at,available_at,payload)
select r.id,r.mode,t.bid_number||'-'||d.kind,
  case when t.bid_number='newest' then now()-interval '1 minute' else now() end,
  case when t.bid_number='backoff' and d.kind='boq' then now()+interval '2 hours' else now() end,
  jsonb_build_object('kind','document','url',d.official_url,
    'lane',case when d.kind='bid' then 'ordinary-parent' else 'official-pdf-attachment' end,
    'row',jsonb_build_object('bid_number',t.bid_number))
from pg_temp.sync_runs r cross join pg_temp.tenders t
join pg_temp.tender_documents d on d.tender_id=t.id
where d.kind='bid' or (d.kind='boq' and t.bid_number<>'orphan');

do $test$ declare expected text; chosen jsonb; begin
 foreach expected in array array['paired-boq','unpaired-boq','orphan-bid','newest-bid'] loop
  update pg_temp.sync_state set state='{"document_turn":0,"discovery_streak":12}' where key='queue_dispatch';
  chosen:=pg_temp.claim_sync_job('fresh-boq-fixture',30);
  if chosen->>'dedupe_key' is distinct from expected then
    raise exception 'Expected %, got %',expected,chosen->>'dedupe_key';
  end if;
  if pg_temp.claim_sync_job('overlapping-worker',30) is not null then raise exception 'Concurrent lease'; end if;
  update pg_temp.sync_jobs set state='succeeded' where id=(chosen->>'id')::uuid;
  -- A successful child normally writes its hash and availability.
  if chosen->>'dedupe_key' like '%-boq' then
   update pg_temp.tender_documents set availability='available',content_hash=repeat('c',64)
   where official_url=chosen#>>'{payload,url}';
  end if;
 end loop;
end $test$;
rollback;
