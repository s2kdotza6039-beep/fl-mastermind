
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_audio_reports() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_rotate_beta_codes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_emails() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.snapshot_user_studio_setup() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.snapshot_user_plugin_inventory() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_deleted_audio_reports() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_rotate_beta_codes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated, service_role;
