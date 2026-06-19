DROP POLICY IF EXISTS "Users manage own active session" ON public.user_active_track_session;

CREATE POLICY "Users select own active session"
  ON public.user_active_track_session
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own active session with owned report"
  ON public.user_active_track_session
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.audio_analysis_reports r
      WHERE r.id = audio_analysis_report_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own active session with owned report"
  ON public.user_active_track_session
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.audio_analysis_reports r
      WHERE r.id = audio_analysis_report_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own active session"
  ON public.user_active_track_session
  FOR DELETE
  USING (auth.uid() = user_id);