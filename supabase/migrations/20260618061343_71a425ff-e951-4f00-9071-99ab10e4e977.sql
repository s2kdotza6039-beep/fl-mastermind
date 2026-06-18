CREATE TABLE public.user_studio_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  fl_version text,
  fl_edition text,
  main_use text,
  main_genre text,
  skill_level text,
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_studio_setup TO authenticated;
GRANT ALL ON public.user_studio_setup TO service_role;

ALTER TABLE public.user_studio_setup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own studio setup"
  ON public.user_studio_setup FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own studio setup"
  ON public.user_studio_setup FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own studio setup"
  ON public.user_studio_setup FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all studio setups"
  ON public.user_studio_setup FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_user_studio_setup_updated_at
  BEFORE UPDATE ON public.user_studio_setup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
