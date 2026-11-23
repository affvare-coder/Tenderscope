-- Take one additional existing start in eight for source-ready catalogue work.
-- Spare capacity can use the same lease. The hosted scheduler owns the daily budget.
create function public.claim_catalogue_source(p_spare boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n int; j record; lease_token uuid:=gen_random_uuid();
begin
 select (state->>'calls')::int into n from public.sync_state where key='daily_worker_budget';
 if n is null or (not p_spare and n%8<>2) or pg_database_size(current_database())>=485000000 then return null;end if;
 select t.id,t.bid_number,t.deadline,t.source_url,d.content_hash into j
 from public.tenders t join public.tender_documents d on d.tender_id=t.id and d.official_url=t.source_url
 left join tenderscope_private.bid_source_checks c on c.tender_id=t.id and c.url=d.official_url
 where t.status='published' and t.reviewed_at is not null and t.published_at<=now() and t.deadline>now()
 and (t.published_at>now()-interval '72 hours' or t.deadline<now()+interval '72 hours')
 and coalesce(t.ingestion_status,'')<>'excluded' and t.lifecycle_state not in ('CLOSED_PENDING_VERIFICATION','OPENED','EXPIRED','CANCELLED','EXCLUDED')
 and coalesce(d.availability,'')<>'removed' and t.source_url~'^https://bidplus\.gem\.gov\.in/showbidDocument/[0-9]+$'
 and t.title~*'(\(V[0-9]+\)|conforming to IS|[[:<:]](?:dental|orthodontic|surgical|medical)[[:>:]])'
 and t.title!~*'[,;]|\y(service|BOQ|schedule|items)\y'
 and not exists(select from public.tender_documents child where child.tender_id=t.id and child.id<>d.id and child.availability is distinct from 'removed')
 and not exists(select from public.tender_items i where i.tender_id=t.id and i.is_current)
 and (c.tender_id is null or c.retry_at<=now() or c.token is null and d.content_hash<>c.sha)
 order by case when t.published_at>now()-interval '24 hours' then 0
 when t.deadline<now()+interval '72 hours' then 1 else 2 end,
 (d.availability='available') desc nulls last,c.attempts nulls first,t.published_at desc,t.id
 limit 1 for update of t skip locked;
 if not found then return null;end if;
 insert into tenderscope_private.bid_source_checks(tender_id,url,token,started_at,retry_at)
 values(j.id,j.source_url,lease_token,now(),now()+interval '10 minutes')
 on conflict(tender_id,url) do update set token=excluded.token,started_at=excluded.started_at,retry_at=excluded.retry_at,attempts=bid_source_checks.attempts+1;
 return jsonb_build_object('id',j.id,'bid',j.bid_number,'deadline',j.deadline,'kind','bid','url',j.source_url,'token',lease_token);
end $$;
revoke all on function public.claim_catalogue_source(boolean) from public,anon,authenticated;
grant execute on function public.claim_catalogue_source(boolean) to service_role;
