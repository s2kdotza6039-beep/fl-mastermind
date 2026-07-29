-- =========================================================
-- genre_target_profiles: per-genre mastering + spectral targets
-- =========================================================
CREATE TABLE public.genre_target_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  genre text UNIQUE NOT NULL,
  target_lufs numeric NOT NULL,
  dr_min numeric NOT NULL DEFAULT 6,
  width_min numeric NOT NULL DEFAULT 0.3,
  width_max numeric NOT NULL DEFAULT 0.85,
  curve jsonb NOT NULL,
  band_tolerance numeric NOT NULL DEFAULT 2,
  target_score int NOT NULL DEFAULT 85,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.genre_target_profiles TO authenticated;
GRANT ALL ON public.genre_target_profiles TO service_role;

ALTER TABLE public.genre_target_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view genre targets"
  ON public.genre_target_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage genre targets"
  ON public.genre_target_profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_genre_targets_updated_at
  BEFORE UPDATE ON public.genre_target_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.genre_target_profiles (genre, target_lufs, dr_min, curve, target_score) VALUES
  ('Amapiano', -9.5,  6, '{"low":2.5,"lowmid":0.0,"mid":0.5,"highmid":-0.5,"high":0.0}'::jsonb, 85),
  ('Hip-hop',  -9.0,  5, '{"low":2.0,"lowmid":0.5,"mid":0.0,"highmid":0.0,"high":0.5}'::jsonb, 85),
  ('Trap',     -8.5,  5, '{"low":2.5,"lowmid":0.0,"mid":-0.5,"highmid":0.5,"high":0.5}'::jsonb, 85),
  ('Afrobeat', -10.0, 7, '{"low":1.5,"lowmid":0.5,"mid":0.5,"highmid":0.0,"high":0.5}'::jsonb, 85),
  ('House',    -9.0,  6, '{"low":2.0,"lowmid":0.0,"mid":0.5,"highmid":0.5,"high":0.0}'::jsonb, 85),
  ('R&B',      -10.0, 7, '{"low":1.0,"lowmid":0.5,"mid":0.5,"highmid":0.5,"high":0.5}'::jsonb, 85),
  ('Drill',    -8.5,  5, '{"low":2.5,"lowmid":-0.5,"mid":0.0,"highmid":0.5,"high":0.5}'::jsonb, 85),
  ('Kwaito',   -9.5,  6, '{"low":2.0,"lowmid":0.5,"mid":0.0,"highmid":0.0,"high":0.0}'::jsonb, 85),
  ('Gospel',   -10.5, 8, '{"low":0.5,"lowmid":0.5,"mid":0.5,"highmid":0.5,"high":0.5}'::jsonb, 85),
  ('Pop',      -9.0,  6, '{"low":1.0,"lowmid":0.0,"mid":0.5,"highmid":0.5,"high":0.5}'::jsonb, 85);

-- =========================================================
-- project_scores
-- =========================================================
CREATE TABLE public.project_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_report_id uuid REFERENCES public.audio_analysis_reports(id) ON DELETE SET NULL,
  track_version_id uuid REFERENCES public.project_track_versions(id) ON DELETE SET NULL,
  mix_score int NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  master_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_scores TO authenticated;
GRANT ALL ON public.project_scores TO service_role;

ALTER TABLE public.project_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own scores"
  ON public.project_scores FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all scores"
  ON public.project_scores FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_project_scores_project_created ON public.project_scores(project_id, created_at DESC);

CREATE TRIGGER trg_project_scores_updated_at
  BEFORE UPDATE ON public.project_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- project_issues
-- =========================================================
CREATE TABLE public.project_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_report_id uuid REFERENCES public.audio_analysis_reports(id) ON DELETE SET NULL,
  detector_id text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warn','critical')),
  title text NOT NULL,
  detail text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','resolved','regressed')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, detector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_issues TO authenticated;
GRANT ALL ON public.project_issues TO service_role;

ALTER TABLE public.project_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own issues"
  ON public.project_issues FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all issues"
  ON public.project_issues FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_project_issues_project_status ON public.project_issues(project_id, status);

CREATE TRIGGER trg_project_issues_updated_at
  BEFORE UPDATE ON public.project_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- repair_plans
-- =========================================================
CREATE TABLE public.repair_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_report_id uuid NOT NULL REFERENCES public.audio_analysis_reports(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_plans TO authenticated;
GRANT ALL ON public.repair_plans TO service_role;

ALTER TABLE public.repair_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plans"
  ON public.repair_plans FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all plans"
  ON public.repair_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_repair_plans_project_status ON public.repair_plans(project_id, status);

CREATE TRIGGER trg_repair_plans_updated_at
  BEFORE UPDATE ON public.repair_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- plan_steps
-- =========================================================
CREATE TABLE public.plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.repair_plans(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  instruction text NOT NULL,
  detector_id text,
  expected_delta text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done','skipped')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, step_order)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_steps TO authenticated;
GRANT ALL ON public.plan_steps TO service_role;

ALTER TABLE public.plan_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plan steps"
  ON public.plan_steps FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all plan steps"
  ON public.plan_steps FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_plan_steps_project_status ON public.plan_steps(project_id, status);

CREATE TRIGGER trg_plan_steps_updated_at
  BEFORE UPDATE ON public.plan_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- projects: extra columns for the coaching loop
-- =========================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS session_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal text;