CREATE TABLE IF NOT EXISTS public.chat_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  questions_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_usage TO authenticated;
GRANT ALL ON public.chat_usage TO service_role;

ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own chat usage" ON public.chat_usage;
CREATE POLICY "Users view own chat usage"
ON public.chat_usage
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.bump_chat_questions(_user_id uuid)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.chat_usage (user_id, questions_used)
  VALUES (_user_id, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET questions_used = public.chat_usage.questions_used + 1,
                updated_at = now()
  RETURNING questions_used;
$$;

REVOKE ALL ON FUNCTION public.bump_chat_questions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_chat_questions(uuid) TO service_role;