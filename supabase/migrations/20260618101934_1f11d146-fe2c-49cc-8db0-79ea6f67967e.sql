CREATE TABLE public.audio_analysis_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_format TEXT,
  file_size_bytes BIGINT,
  duration_sec NUMERIC,
  sample_rate INTEGER,
  bit_rate INTEGER,
  channels INTEGER,
  peak_db NUMERIC,
  rms_db NUMERIC,
  lufs_estimate NUMERIC,
  dynamic_range_db NUMERIC,
  stereo_width NUMERIC,
  bpm NUMERIC,
  detected_key TEXT,
  band_low_db NUMERIC,
  band_lowmid_db NUMERIC,
  band_mid_db NUMERIC,
  band_highmid_db NUMERIC,
  band_high_db NUMERIC,
  detected_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_analysis_reports TO authenticated;
GRANT ALL ON public.audio_analysis_reports TO service_role;

ALTER TABLE public.audio_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own audio reports"
  ON public.audio_analysis_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins view all audio reports"
  ON public.audio_analysis_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users insert own audio reports"
  ON public.audio_analysis_reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own audio reports"
  ON public.audio_analysis_reports FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own audio reports"
  ON public.audio_analysis_reports FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_audio_analysis_reports_updated_at
  BEFORE UPDATE ON public.audio_analysis_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_audio_analysis_reports_user_created
  ON public.audio_analysis_reports (user_id, created_at DESC);