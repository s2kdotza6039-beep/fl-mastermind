
REVOKE ALL ON FUNCTION public.purge_deleted_audio_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_audio_reports() TO service_role;

REVOKE ALL ON FUNCTION public.admin_rotate_beta_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rotate_beta_codes() TO authenticated, service_role;
