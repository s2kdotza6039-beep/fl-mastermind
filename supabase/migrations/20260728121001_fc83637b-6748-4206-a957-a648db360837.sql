CREATE OR REPLACE FUNCTION public.guard_user_roles_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- PostgREST sets request.jwt.claims as a JSON string; older versions also set request.jwt.claim.role.
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::json->>'role';
  EXCEPTION WHEN others THEN
    v_role := NULL;
  END;

  IF v_role = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'user_roles writes are restricted to service_role';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_user_roles_writes() FROM anon, public;