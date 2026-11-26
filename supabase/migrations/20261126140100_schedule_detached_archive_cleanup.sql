-- Project A's established authenticated maintenance endpoint.
CREATE OR REPLACE FUNCTION tenderscope_private.wake_detached_archive_cleanup()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  request_id bigint;
  maintenance_token text;
BEGIN
  SELECT decrypted_secret INTO maintenance_token
  FROM vault.decrypted_secrets
  WHERE name = 'tenderscope_sync_token';
  IF maintenance_token IS NULL THEN
    RAISE EXCEPTION 'Worker invocation secret missing';
  END IF;

  SELECT net.http_post(
    url := 'https://agdmlgbfxoqhztiormij.supabase.co/functions/v1/tenderscope-maintenance',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || maintenance_token),
    body := '{"scope":"detached-archives"}'::jsonb,
    timeout_milliseconds := 35000
  ) INTO request_id;
  RETURN request_id;
END
$function$;

REVOKE ALL ON FUNCTION tenderscope_private.wake_detached_archive_cleanup() FROM PUBLIC, anon, authenticated;

DO $schedule$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='tenderscope-detached-archive-cleanup') THEN
    PERFORM cron.schedule('tenderscope-detached-archive-cleanup', '17 19 * * *',
      'select tenderscope_private.wake_detached_archive_cleanup();');
  END IF;
END
$schedule$;
