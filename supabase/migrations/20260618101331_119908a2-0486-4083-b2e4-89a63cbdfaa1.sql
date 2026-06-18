-- Tighten activity_logs INSERT: disallow client-supplied ip_address / user_agent
DROP POLICY IF EXISTS "Authenticated users insert own logs" ON public.activity_logs;
CREATE POLICY "Authenticated users insert own logs"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND ip_address IS NULL
    AND user_agent IS NULL
  );

-- Lock studio setup history to trigger-only writes
DROP POLICY IF EXISTS "Users insert their own setup history" ON public.user_studio_setup_history;
REVOKE INSERT ON public.user_studio_setup_history FROM authenticated;