
-- Tighten security_alerts INSERT policy: forbid user_id IS NULL from client-side roles.
-- Edge functions use service_role which bypasses RLS entirely.
DROP POLICY IF EXISTS "Users insert own alerts" ON public.security_alerts;
CREATE POLICY "Users insert own alerts"
  ON public.security_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Revoke EXECUTE on SECURITY DEFINER functions from anon (and from authenticated where not needed via RLS).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_emails() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
-- has_role must stay callable by authenticated because RLS policies reference it.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
-- admin_list_user_emails has an internal admin gate; keep it callable by authenticated.
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails() TO authenticated;
