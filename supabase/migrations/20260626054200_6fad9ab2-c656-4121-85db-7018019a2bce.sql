
-- 1) Defense-in-depth: block any user_roles writes from non-service_role sessions.
CREATE OR REPLACE FUNCTION public.guard_user_roles_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user IN ('postgres','supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'user_roles writes are restricted to service_role';
END;
$$;

DROP TRIGGER IF EXISTS guard_user_roles_writes ON public.user_roles;
CREATE TRIGGER guard_user_roles_writes
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_writes();

-- 2) Remove client-side profile creation. handle_new_user trigger is the only writer.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
REVOKE INSERT ON public.profiles FROM authenticated, anon, public;

-- 3) Prevent user_id mutation on profiles updates (belt + suspenders alongside RLS).
CREATE OR REPLACE FUNCTION public.guard_profiles_immutable_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'profiles.user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_immutable_user_id ON public.profiles;
CREATE TRIGGER guard_profiles_immutable_user_id
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_immutable_user_id();

-- 4) Lock down EXECUTE on the new guards.
REVOKE EXECUTE ON FUNCTION public.guard_user_roles_writes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.guard_profiles_immutable_user_id() FROM anon, public;
