
-- Audit log for purge runs
CREATE TABLE IF NOT EXISTS public.audio_purge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  purged_count integer NOT NULL DEFAULT 0,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual'
);

GRANT SELECT ON public.audio_purge_runs TO authenticated;
GRANT ALL ON public.audio_purge_runs TO service_role;

ALTER TABLE public.audio_purge_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read purge runs"
  ON public.audio_purge_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Update purge function to log every run
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

  INSERT INTO public.audio_purge_runs (purged_count, triggered_by, source)
  VALUES (n, auth.uid(), COALESCE(current_setting('app.purge_source', true), 'manual'));

  RETURN n;
END;
$$;

-- Admin-only: revoke all unused beta invite codes, return fresh replacement code
CREATE OR REPLACE FUNCTION public.admin_rotate_beta_codes()
RETURNS TABLE(revoked_count integer, new_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revoked integer := 0;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH d AS (
    DELETE FROM public.beta_invites
    WHERE used_at IS NULL
      AND code IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_revoked FROM d;

  v_code := '';
  FOR i IN 1..10 LOOP
    v_code := v_code || substr(v_alphabet, 1 + (floor(random() * length(v_alphabet)))::int, 1);
  END LOOP;

  INSERT INTO public.beta_invites (code) VALUES (v_code);

  RETURN QUERY SELECT v_revoked, v_code;
END;
$$;
