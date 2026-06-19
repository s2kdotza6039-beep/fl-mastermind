
CREATE TABLE public.user_active_track_session (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  audio_analysis_report_id UUID NOT NULL REFERENCES public.audio_analysis_reports(id) ON DELETE CASCADE,
  track_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_active_track_session TO authenticated;
GRANT ALL ON public.user_active_track_session TO service_role;

ALTER TABLE public.user_active_track_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own active session"
  ON public.user_active_track_session
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all active sessions"
  ON public.user_active_track_session
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_user_active_track_session_updated
  BEFORE UPDATE ON public.user_active_track_session
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_active_track_session_report ON public.user_active_track_session(audio_analysis_report_id);
