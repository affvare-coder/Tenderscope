begin;
create temp table sync_jobs (like public.sync_jobs including defaults including constraints including indexes);
create temp table sync_state (like public.sync_state including defaults including constraints including indexes);
create temp table sync_runs (like public.sync_runs including defaults including constraints including indexes);
create temp table sync_job_failures (like public.sync_job_failures including defaults including constraints including indexes);
create temp table tenders (like public.tenders including defaults including constraints including indexes);
create temp table tender_items (like public.tender_items including defaults including constraints including indexes);
do $install$
declare definition text;
begin
 perform set_config('search_path','',true);
 definition:=pg_get_viewdef('public.queued_document_lanes'::regclass,true);
 execute 'create temp view queued_document_lanes as '||replace(definition,'public.','pg_temp.');
 execute replace(pg_get_functiondef('public.claim_sync_job(text,integer)'::regprocedure),'public.','pg_temp.');
end $install$;
insert into pg_temp.sync_state(key,state) values ('queue_dispatch','{"discovery_streak":12}');
insert into pg_temp.sync_runs(mode) values('hourly');
insert into pg_temp.sync_jobs(run_id,mode,dedupe_key,payload)
select r.id,'hourly',v.label,jsonb_build_object('kind','document','url','https://bidplus.gem.gov.in/showbidDocument/1','row',jsonb_build_object('bid_number',v.label,'published_at',now()-v.age,'closes_at',now()+v.to_close))
from pg_temp.sync_runs r cross join (values ('fresh-1',interval '1 hour',interval '8 days'),('fresh-2',interval '2 hours',interval '9 days'),('urgent',interval '2 days',interval '1 day'),('backlog',interval '3 days',interval '7 days'),('expired',interval '8 days',interval '-4 days')) v(label,age,to_close);
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
rollback;
