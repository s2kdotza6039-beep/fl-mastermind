
CREATE TABLE public.auth_rate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  surface text,
  retry_after_sec integer,
  session_kind_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_rate_events_created_at_idx ON public.auth_rate_events (created_at DESC);
CREATE INDEX auth_rate_events_kind_idx ON public.auth_rate_events (kind);
CREATE INDEX auth_rate_events_surface_idx ON public.auth_rate_events (surface);

GRANT INSERT ON public.auth_rate_events TO anon, authenticated;
GRANT SELECT ON public.auth_rate_events TO authenticated;
GRANT ALL ON public.auth_rate_events TO service_role;

ALTER TABLE public.auth_rate_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) may insert, but only if payload is sanitized:
-- kind must be one of the allow-listed values, surface is optional but constrained,
-- retry_after_sec bounded, no other fields exist to leak PII.
CREATE POLICY "sanitized inserts allowed"
ON public.auth_rate_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  kind IN (
    'signin_rate_limited','signup_rate_limited',
    'password_reset_rate_limited','email_confirm_rate_limited',
    'signin_captcha_failed','signup_captcha_failed',
    'password_reset_captcha_failed','email_confirm_captcha_failed'
  )
  AND (surface IS NULL OR surface IN ('signin','signup','password_reset','email_confirm','reset_password'))
  AND (retry_after_sec IS NULL OR (retry_after_sec >= 0 AND retry_after_sec <= 3600))
  AND (session_kind_count IS NULL OR session_kind_count BETWEEN 0 AND 100000)
);

CREATE POLICY "admins can read events"
ON public.auth_rate_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
