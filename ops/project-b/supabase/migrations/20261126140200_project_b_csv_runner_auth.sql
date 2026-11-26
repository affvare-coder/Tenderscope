-- Project B only. This runner pulls the bounded private queue with its own
-- credentials. Its invocation cannot supply a source URL or a work payload.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $install$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='tenderscope_boq_runner_token') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'tenderscope_boq_runner_token'
    );
  END IF;
END
$install$;

CREATE FUNCTION public.tenderscope_verify_boq_runner_v1(p_token_sha256 text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name='tenderscope_boq_runner_token'
      AND encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex')=p_token_sha256
  );
$function$;

CREATE FUNCTION tenderscope_engine.wake_boq_runner_v1()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT net.http_post(
    url := 'https://noeobaiuzhywneddekpn.supabase.co/functions/v1/tenderscope-boq-engine',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  FROM vault.decrypted_secrets
  WHERE name='tenderscope_boq_runner_token';
$function$;

REVOKE ALL ON FUNCTION public.tenderscope_verify_boq_runner_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenderscope_verify_boq_runner_v1(text) TO service_role;
REVOKE ALL ON FUNCTION tenderscope_engine.wake_boq_runner_v1() FROM PUBLIC, anon, authenticated, service_role;
