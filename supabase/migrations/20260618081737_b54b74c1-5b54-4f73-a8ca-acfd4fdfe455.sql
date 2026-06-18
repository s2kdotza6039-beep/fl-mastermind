CREATE TABLE public.user_plugin_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  native_plugins text[] NOT NULL DEFAULT '{}',
  third_party_plugins text[] NOT NULL DEFAULT '{}',
  custom_plugins text[] NOT NULL DEFAULT '{}',
  inventory_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_plugin_inventory TO authenticated;
GRANT ALL ON public.user_plugin_inventory TO service_role;

ALTER TABLE public.user_plugin_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own plugin inventory"
  ON public.user_plugin_inventory FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users insert own plugin inventory"
  ON public.user_plugin_inventory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own plugin inventory"
  ON public.user_plugin_inventory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own plugin inventory"
  ON public.user_plugin_inventory FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_plugin_inventory_updated_at
  BEFORE UPDATE ON public.user_plugin_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();