
-- =========================================================
-- ENUMS
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.project_status AS ENUM ('active', 'paused', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.advice_status AS ENUM ('pending', 'applied', 'ignored', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- TABLE: projects
-- =========================================================
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  genre text,
  status public.project_status NOT NULL DEFAULT 'active',
  last_opened_page text,
  last_opened_track_version_id uuid,
  last_opened_audio_report_id uuid,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects"
  ON public.projects FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_projects_user_activity ON public.projects(user_id, last_activity_at DESC);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TABLE: project_track_versions
-- =========================================================
CREATE TABLE public.project_track_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_name text NOT NULL,
  audio_report_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_track_versions TO authenticated;
GRANT ALL ON public.project_track_versions TO service_role;

ALTER TABLE public.project_track_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own track versions"
  ON public.project_track_versions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all track versions"
  ON public.project_track_versions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_track_versions_project ON public.project_track_versions(project_id, version_number DESC);

CREATE TRIGGER trg_track_versions_updated_at
  BEFORE UPDATE ON public.project_track_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TABLE: project_advice
-- =========================================================
CREATE TABLE public.project_advice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_version_id uuid REFERENCES public.project_track_versions(id) ON DELETE SET NULL,
  category text,
  title text NOT NULL,
  content text NOT NULL,
  source_page text,
  status public.advice_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_advice TO authenticated;
GRANT ALL ON public.project_advice TO service_role;

ALTER TABLE public.project_advice ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own advice"
  ON public.project_advice FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all advice"
  ON public.project_advice FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_advice_project_created ON public.project_advice(project_id, created_at DESC);
CREATE INDEX idx_advice_project_status ON public.project_advice(project_id, status);

CREATE TRIGGER trg_advice_updated_at
  BEFORE UPDATE ON public.project_advice
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TABLE: project_chat_messages
-- =========================================================
CREATE TABLE public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.chat_role NOT NULL,
  content text NOT NULL,
  parts jsonb,
  source_page text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;

ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat"
  ON public.project_chat_messages FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_chat_project_created ON public.project_chat_messages(project_id, created_at);

-- =========================================================
-- audio_analysis_reports: link to project + version (nullable)
-- =========================================================
ALTER TABLE public.audio_analysis_reports
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS track_version_id uuid REFERENCES public.project_track_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audio_reports_project ON public.audio_analysis_reports(project_id, created_at DESC);

-- =========================================================
-- Backfill: create Default Project per user, link existing reports
-- =========================================================
DO $$
DECLARE
  u record;
  new_project_id uuid;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
    FROM (
      SELECT user_id FROM public.audio_analysis_reports WHERE user_id IS NOT NULL
      UNION
      SELECT user_id FROM public.user_studio_setup WHERE user_id IS NOT NULL
      UNION
      SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL
    ) s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.projects p WHERE p.user_id = s.user_id
    )
  LOOP
    INSERT INTO public.projects (user_id, name, description, status)
    VALUES (u.user_id, 'Default Project', 'Auto-created to hold your existing tracks and advice.', 'active')
    RETURNING id INTO new_project_id;

    UPDATE public.audio_analysis_reports
       SET project_id = new_project_id
     WHERE user_id = u.user_id AND project_id IS NULL;
  END LOOP;
END $$;

-- =========================================================
-- Extend handle_new_user: auto-create Default Project
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Auto-create the producer's first project so memory works from day one.
  INSERT INTO public.projects (user_id, name, description, status)
  VALUES (new.id, 'My First Project', 'Sensei will remember this session for you.', 'active');

  RETURN new;
END;
$function$;

-- =========================================================
-- Touch project.last_activity_at when anything in it changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_project_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NOT NULL THEN
    UPDATE public.projects SET last_activity_at = now() WHERE id = pid;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_project_activity() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.touch_project_activity() TO service_role;

CREATE TRIGGER trg_advice_touch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.project_advice
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

CREATE TRIGGER trg_chat_touch_project
  AFTER INSERT ON public.project_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

CREATE TRIGGER trg_track_versions_touch_project
  AFTER INSERT OR UPDATE ON public.project_track_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();
