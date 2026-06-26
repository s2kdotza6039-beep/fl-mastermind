
-- 1) user_roles: prevent privilege escalation. Restrict insert/update/delete to service_role only.
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon, public;

-- 2) security_alerts: revoke user inserts; only service_role may insert.
DROP POLICY IF EXISTS "Users insert own alerts" ON public.security_alerts;
REVOKE INSERT ON public.security_alerts FROM authenticated, anon, public;

-- 3) check_beta_invite: revoke anon EXECUTE on SECURITY DEFINER function.
REVOKE EXECUTE ON FUNCTION public.check_beta_invite(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_beta_invite(text, text) TO authenticated, service_role;
