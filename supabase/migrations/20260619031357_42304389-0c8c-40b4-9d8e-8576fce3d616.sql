
-- 1. Soft-delete column for audio reports (7-day retention)
ALTER TABLE public.audio_analysis_reports
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_audio_reports_deleted_at
  ON public.audio_analysis_reports (deleted_at)
  WHERE deleted_at IS NOT NULL;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='audio_analysis_reports' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audio_analysis_reports', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users view own non-deleted reports"
ON public.audio_analysis_reports FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Admins view all reports"
ON public.audio_analysis_reports FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.purge_deleted_audio_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.audio_analysis_reports
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO n FROM d;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_deleted_audio_reports() FROM public;
GRANT EXECUTE ON FUNCTION public.purge_deleted_audio_reports() TO service_role;

-- 2. Incidents
DO $$ BEGIN
  CREATE TYPE public.incident_severity AS ENUM ('info','minor','major','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_status AS ENUM ('investigating','identified','monitoring','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  severity public.incident_severity NOT NULL DEFAULT 'minor',
  status public.incident_status NOT NULL DEFAULT 'investigating',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.incidents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads incidents" ON public.incidents;
CREATE POLICY "Anyone reads incidents"
ON public.incidents FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins insert incidents" ON public.incidents;
CREATE POLICY "Admins insert incidents"
ON public.incidents FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update incidents" ON public.incidents;
CREATE POLICY "Admins update incidents"
ON public.incidents FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete incidents" ON public.incidents;
CREATE POLICY "Admins delete incidents"
ON public.incidents FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS incidents_updated_at ON public.incidents;
CREATE TRIGGER incidents_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Beta invites (allowlist + codes) — store lowercased TEXT emails
CREATE TABLE IF NOT EXISTS public.beta_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  code TEXT UNIQUE,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR code IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_invites_email_unique
  ON public.beta_invites (lower(email))
  WHERE email IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_invites TO authenticated;
GRANT ALL ON public.beta_invites TO service_role;

ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own invite" ON public.beta_invites;
CREATE POLICY "Users view own invite"
ON public.beta_invites FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR lower(email) = lower((SELECT (auth.jwt() ->> 'email')))
);

DROP POLICY IF EXISTS "Admins insert invites" ON public.beta_invites;
CREATE POLICY "Admins insert invites"
ON public.beta_invites FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update invites" ON public.beta_invites;
CREATE POLICY "Admins update invites"
ON public.beta_invites FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete invites" ON public.beta_invites;
CREATE POLICY "Admins delete invites"
ON public.beta_invites FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS beta_invites_updated_at ON public.beta_invites;
CREATE TRIGGER beta_invites_updated_at
BEFORE UPDATE ON public.beta_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Pending admin emails
CREATE TABLE IF NOT EXISTS public.pending_admin_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.pending_admin_emails TO authenticated;
GRANT ALL ON public.pending_admin_emails TO service_role;

ALTER TABLE public.pending_admin_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pending admins" ON public.pending_admin_emails;
CREATE POLICY "Admins manage pending admins"
ON public.pending_admin_emails FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pending_admin_emails (email)
VALUES ('studiosensei@s2kdotza.com')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.beta_invites (email)
VALUES ('studiosensei@s2kdotza.com')
ON CONFLICT DO NOTHING;

-- 5. Public check helper (used at signup to validate invites without exposing the table)
CREATE OR REPLACE FUNCTION public.check_beta_invite(_email TEXT, _code TEXT DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beta_invites
    WHERE used_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (email IS NOT NULL AND lower(email) = lower(_email))
        OR (_code IS NOT NULL AND code = _code)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.check_beta_invite(TEXT, TEXT) TO anon, authenticated;

-- 6. handle_new_user: consume invite + auto-grant admin for seeded emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(new.email);
  v_is_admin boolean := false;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  IF EXISTS (SELECT 1 FROM public.pending_admin_emails WHERE lower(email) = v_email) THEN
    v_is_admin := true;
    DELETE FROM public.pending_admin_emails WHERE lower(email) = v_email;
  END IF;

  IF v_is_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'free')
  ON CONFLICT DO NOTHING;

  UPDATE public.beta_invites
  SET used_at = now(), used_by = new.id
  WHERE used_at IS NULL
    AND (
      (email IS NOT NULL AND lower(email) = v_email)
      OR code = (new.raw_user_meta_data->>'invite_code')
    );

  RETURN new;
END;
$$;
