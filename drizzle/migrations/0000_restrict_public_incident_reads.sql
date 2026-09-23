ALTER TABLE public.incidents
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.incidents.is_public IS 'Controls whether an incident is visible on the public status surfaces.';

DROP POLICY IF EXISTS "Anyone reads incidents" ON public.incidents;

CREATE POLICY "Public reads published incidents"
ON public.incidents
FOR SELECT
TO anon, authenticated
USING (
  is_public = true
  OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role))
);