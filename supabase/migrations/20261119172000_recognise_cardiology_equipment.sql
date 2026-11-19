-- Add only the equipment phrases confirmed in the buyer's two cardiology bids.
-- The sync worker reads the latest version on each invocation.
do $migration$
declare
  prior public.rules_versions%rowtype;
  revised jsonb;
  revised_digest text;
  group_path text[] := array['healthcare','groups','Medical & ICU equipment'];
  target_version constant text := '2026-11-19.1';
begin
  lock table public.rules_versions in share row exclusive mode;
  select * into strict prior from public.rules_versions where version = '2026-10-06.1';
  if prior.digest <> '7b7568d893b3bad1a0874fc499697cc77bfb24b1e22b848a47d94341efdcde48'
     or prior.digest <> encode(extensions.digest(prior.config::text, 'sha256'), 'hex')
     or jsonb_typeof(prior.config #> group_path) is distinct from 'array' then
    raise exception 'Unexpected source configuration for cardiology recognition';
  end if;
  revised := jsonb_set(prior.config, group_path,
    (prior.config #> group_path) || '["cardiac TMT machine","angio jet system"]'::jsonb);
  revised := jsonb_set(revised, '{version}', to_jsonb(target_version));
  revised := jsonb_set(revised, '{search,version}', to_jsonb(target_version));
  revised := jsonb_set(revised, '{healthcare,version}', to_jsonb(target_version));
  revised_digest := encode(extensions.digest(revised::text, 'sha256'), 'hex');
  if exists (select 1 from public.rules_versions where version = target_version
      and digest = revised_digest and config = revised) then
    return;
  end if;
  if (select version from public.rules_versions order by created_at desc limit 1)
      is distinct from prior.version then
    raise exception 'Another active rules version requires review';
  end if;
  insert into public.rules_versions(version, digest, config, description)
  values (target_version, revised_digest, revised,
    'Recognise cardiac TMT machines and Angio Jet systems from official product wording.');
end;
$migration$;
