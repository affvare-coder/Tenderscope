-- Run after the recent-official-change migration on a disposable database.
begin;
create temp table sync_jobs (like public.sync_jobs including defaults including constraints including indexes);
create temp table sync_state (like public.sync_state including defaults including constraints including indexes);
create temp table sync_runs (like public.sync_runs including defaults including constraints including indexes);
create temp table sync_job_failures (like public.sync_job_failures including defaults including constraints including indexes);
create temp table tenders (like public.tenders including defaults including constraints including indexes);
create temp table tender_documents (like public.tender_documents including defaults including constraints including indexes);
create temp table tender_events (like public.tender_events including defaults including constraints including indexes);

do $install$
begin
  perform set_config('search_path','',true);
  execute 'create temp view queued_document_lanes as ' ||
    replace(pg_get_viewdef('public.queued_document_lanes'::regclass,true),'public.','pg_temp.');
  execute replace(replace(pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure),
    'public.','pg_temp.'),'tenderscope:single-worker','tenderscope:change-fixture:'||pg_backend_pid());
end $install$;

insert into pg_temp.sync_state(key,state) values('queue_dispatch','{}');
insert into pg_temp.sync_runs(mode) values('hourly');
insert into pg_temp.tenders(source,bid_number,title,category,buyer,location,published_at,deadline,
  status,source_url,value_basis,reviewed_at,lifecycle_state,closing_time_verified,ingestion_status)
select 'GeM',label,'Consumables','medical','Test buyer','Test location',now()-age,now()+closing,
  'published','https://bidplus.gem.gov.in/showbidDocument/'||n,'unavailable',now(),'ACTIVE',true,ingestion
from (values
  ('imminent',101,interval '7 days',interval '1 hour','verified'),
  ('ordinary',102,interval '7 days',interval '12 hours','verified'),
  ('extension',103,interval '7 days',interval '4 days','verified'),
  ('corrigendum',104,interval '7 days',interval '8 days','verified'),
  ('wrong-hash',105,interval '7 days',interval '7 days','verified'),
  ('repeat-failure',106,interval '7 days',interval '3 days 1 hour','verified'),
  ('retry-delay',107,interval '7 days',interval '3 days 2 hours','verified'),
  ('old-extension',108,interval '7 days',interval '3 days 3 hours','verified'),
  ('different-deadline',109,interval '7 days',interval '3 days 4 hours','verified'),
  ('excluded-change',110,interval '7 days',interval '3 days 5 hours','excluded'),
  ('fresh-parent',111,interval '2 hours',interval '10 days','verified'),
  ('fresh-pair',112,interval '3 hours',interval '10 days','verified')
) v(label,n,age,closing,ingestion);

insert into pg_temp.tender_documents(tender_id,kind,title,official_url,document_key,availability,content_hash,version_no)
select id,'corrigendum','Buyer amendment','https://mkp.gem.gov.in/uploaded_documents/revised-'||bid_number||'.pdf',
  'amendment','unverified',null,1 from pg_temp.tenders where bid_number='corrigendum'
union all
select id,'corrigendum','Buyer amendment','https://mkp.gem.gov.in/uploaded_documents/revised-'||bid_number||'.pdf',
  'amendment','available',repeat('b',64),2 from pg_temp.tenders where bid_number='wrong-hash'
union all
select id,'bid','Bid',source_url,'bid','available',repeat('a',64),1 from pg_temp.tenders where bid_number='fresh-pair'
union all
select id,'boq','BOQ','https://mkp.gem.gov.in/BoqLineItemsDocument/fixture.csv','boq','unverified',null,1
from pg_temp.tenders where bid_number='fresh-pair'
union all
select id,'specification','Specification','https://mkp.gem.gov.in/BoqDocument/fixture.pdf','specification','available',repeat('c',64),1
from pg_temp.tenders where bid_number='fresh-pair';

insert into pg_temp.tender_events(tender_id,event_code,event_type,old_deadline,new_deadline,source_url,source,detected_at)
select id,'EXTENDED','deadline_extended',deadline-interval '3 days',deadline,source_url,'GeM',
  now()-case when bid_number='old-extension' then interval '25 hours' else interval '10 minutes' end
from pg_temp.tenders where bid_number in ('extension','repeat-failure','retry-delay','old-extension','different-deadline','excluded-change');
insert into pg_temp.tender_events(tender_id,event_code,event_type,source_url,source,detected_at,new_value,previous_value)
select d.tender_id,'CORRIGENDUM','corrigendum',d.official_url,'GeM',now()-interval '10 minutes',
  to_jsonb(d)||case when t.bid_number='wrong-hash' then jsonb_build_object('content_hash',repeat('d',64)) else '{}'::jsonb end,
  case when t.bid_number='wrong-hash' then jsonb_build_object('content_hash',repeat('a',64)) end
from pg_temp.tender_documents d join pg_temp.tenders t on t.id=d.tender_id where d.kind='corrigendum';

insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload,failure_streak,available_at)
select r.id,r.mode,t.bid_number,jsonb_build_object('kind','document','url',coalesce(d.official_url,t.source_url),
  'lane',case when d.kind is not null then 'official-pdf-attachment' else 'fixture' end,
  'recovery_reason',case when e.tender_id is not null then 'deadline_changed' end,
  'row',jsonb_build_object('bid_number',t.bid_number,'closes_at',
    t.deadline-case when t.bid_number='different-deadline' then interval '1 hour' else interval '0' end)),
  case when t.bid_number='repeat-failure' then 3 else 0 end,
  now()+case when t.bid_number='retry-delay' then interval '1 hour' else interval '0' end
from pg_temp.sync_runs r cross join pg_temp.tenders t
left join pg_temp.tender_documents d on d.tender_id=t.id and d.kind in ('boq','corrigendum')
left join pg_temp.tender_events e on e.tender_id=t.id and e.event_code='EXTENDED';
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload)
select id,mode,v.name,v.payload::jsonb from pg_temp.sync_runs cross join (values
 ('daily-head','{"kind":"publication","coverage_mode":"daily_head"}'),('expiry','{"kind":"expiry_check"}')
) v(name,payload);

create function pg_temp.expect_claim(expected text, turn int, streak int) returns void
language plpgsql set search_path='' as $$
declare claimed jsonb;
begin
  update pg_temp.sync_state set state=state||jsonb_build_object('document_turn',turn,'discovery_streak',streak,'document_streak',0)
  where key='queue_dispatch';
  claimed:=pg_temp.claim_sync_job('change-fixture',30);
  if claimed->>'dedupe_key' is distinct from expected then
    raise exception 'Expected %, got %',expected,claimed->>'dedupe_key';
  end if;
  if claimed->>'lease_token' is null or pg_temp.claim_sync_job('overlap',30) is not null then
    raise exception 'Expected one active document lease';
  end if;
  update pg_temp.sync_jobs set state='succeeded' where id=(claimed->>'id')::uuid;
end $$;

select pg_temp.expect_claim('daily-head',1,12);
select pg_temp.expect_claim('expiry',1,0);
select pg_temp.expect_claim('fresh-pair',0,12);
select pg_temp.expect_claim('imminent',1,12);
select pg_temp.expect_claim('extension',1,12);
select pg_temp.expect_claim('ordinary',1,12);

update pg_temp.sync_state set state=state||jsonb_build_object('last_change_turn_at',now()-interval '2 hours')
where key='queue_dispatch';
select pg_temp.expect_claim('corrigendum',1,12);

-- A real revision can use the same URL. Require the current and replaced digests.
update pg_temp.tender_events set new_value=new_value||jsonb_build_object('content_hash',repeat('b',64))
where new_value->>'content_hash'=repeat('d',64);
update pg_temp.sync_state set state=state||jsonb_build_object('last_change_turn_at',now()-interval '2 hours')
where key='queue_dispatch';
select pg_temp.expect_claim('wrong-hash',1,12);
rollback;
