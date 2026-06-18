-- Setup history audit table
CREATE TABLE public.user_studio_setup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fl_version text,
  fl_edition text,
  main_use text,
  main_genre text,
  skill_level text,
  setup_completed boolean NOT NULL DEFAULT false,
  change_type text NOT NULL DEFAULT 'update',
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_studio_setup_history TO authenticated;
GRANT ALL ON public.user_studio_setup_history TO service_role;

ALTER TABLE public.user_studio_setup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own setup history"
  ON public.user_studio_setup_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all setup history"
  ON public.user_studio_setup_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users insert their own setup history"
  ON public.user_studio_setup_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_studio_setup_history_user_changed
  ON public.user_studio_setup_history (user_id, changed_at DESC);

-- Trigger function to snapshot user_studio_setup changes
CREATE OR REPLACE FUNCTION public.snapshot_user_studio_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_studio_setup_history (
    user_id, fl_version, fl_edition, main_use, main_genre, skill_level,
    setup_completed, change_type, changed_by
  ) VALUES (
    NEW.user_id, NEW.fl_version, NEW.fl_edition, NEW.main_use, NEW.main_genre, NEW.skill_level,
    NEW.setup_completed,
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_user_studio_setup
AFTER INSERT OR UPDATE ON public.user_studio_setup
FOR EACH ROW EXECUTE FUNCTION public.snapshot_user_studio_setup();