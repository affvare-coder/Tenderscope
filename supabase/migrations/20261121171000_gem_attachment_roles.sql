-- GeM's OrderItem/BoqDocument PDF is the "Specification Document" link on its
-- BOQ template. OrderItem/BoqLineItemsDocument CSV is "BOQ Detail Document".
create or replace function tenderscope_private.gem_attachment_role(url text)
returns text language sql immutable strict set search_path='' as $$
 select case
  when path ~ '^https://([a-z0-9-]+\.)*gem\.gov\.in/([^?#]*/)?(orderitem/boqdocument|specificationdocument)/[^?#]+\.pdf$' then 'specification'
  when path ~ '^https://([a-z0-9-]+\.)*gem\.gov\.in/([^?#]*/)?(orderitem/)?boqlineitemsdocument/[^?#]+\.csv$' then 'boq'
 end from (select lower(split_part(split_part(url,'?',1),'#',1)) path) u
$$;

create or replace function tenderscope_private.set_gem_attachment_role()
returns trigger language plpgsql set search_path='' as $$
declare role_name text := tenderscope_private.gem_attachment_role(new.official_url);
begin
 if role_name='specification' then
  new.title:=case when new.kind='atc' or new.title='Specification Document (PDF, includes ATC)' then 'Specification Document (PDF, includes ATC)' else 'Specification Document (PDF)' end;
  new.kind:='specification';
 elsif role_name='boq' then
  new.kind:='boq';
  new.title:='BOQ Detail Document (CSV)';
 end if;
 return new;
end $$;

create trigger gem_attachment_roles before insert or update of official_url,kind,title
on public.tender_documents for each row execute function tenderscope_private.set_gem_attachment_role();

-- Keep source hashes, availability, observations, row IDs, version history, and
-- saved links intact. An editorial role correction is not a buyer amendment.
update public.tender_documents
set title=title
where tenderscope_private.gem_attachment_role(official_url) is not null;

-- Correct the kind used to emit events too. Match the deployed implementation
-- explicitly so another implementation cannot silently receive a partial edit.
do $migration$
declare
 fn regprocedure := 'public.ingest_tender(jsonb,text,text,text,timestamptz,uuid)'::regprocedure;
 oldbody text:=pg_get_functiondef(fn);
 marker text:=$line$kind:=lower(coalesce(d->>'kind','attachment'));$line$;
 replacement text:=$line$kind:=coalesce(tenderscope_private.gem_attachment_role(u),lower(coalesce(d->>'kind','attachment')));$line$;
begin
 if strpos(oldbody,marker)=0 then raise exception 'Unexpected ingest_tender implementation';end if;
 execute replace(oldbody,marker,replacement);
end $migration$;
