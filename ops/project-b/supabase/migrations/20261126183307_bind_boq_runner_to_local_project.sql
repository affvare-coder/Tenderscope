-- The worker endpoint and its bearer token belong to the same Project B.
CREATE OR REPLACE FUNCTION tenderscope_engine.wake_boq_runner_v1()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  project_url text;
  runner_token text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'tenderscope_boq_runner_project_url';

  IF project_url IS NULL OR project_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co$' THEN
    RAISE EXCEPTION 'Set the Project B runner URL in its local Vault';
  END IF;

  SELECT decrypted_secret INTO runner_token
  FROM vault.decrypted_secrets
  WHERE name = 'tenderscope_boq_runner_token';

  IF runner_token IS NULL OR runner_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Project B runner invocation token is unavailable';
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/tenderscope-boq-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || runner_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) INTO request_id;
  RETURN request_id;
END
$function$;

REVOKE ALL ON FUNCTION tenderscope_engine.wake_boq_runner_v1()
  FROM PUBLIC, anon, authenticated, service_role;
