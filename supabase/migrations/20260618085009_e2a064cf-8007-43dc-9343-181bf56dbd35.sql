-- Plugin inventory history (snapshots written by trigger)
CREATE TABLE public.user_plugin_inventory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  native_plugins text[] NOT NULL DEFAULT '{}',
  third_party_plugins text[] NOT NULL DEFAULT '{}',
  custom_plugins text[] NOT NULL DEFAULT '{}',
  inventory_completed boolean NOT NULL DEFAULT false,
  change_type text NOT NULL CHECK (change_type IN ('create','update')),
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_plugin_inventory_history TO authenticated;
GRANT ALL ON public.user_plugin_inventory_history TO service_role;

ALTER TABLE public.user_plugin_inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plugin inventory history"
  ON public.user_plugin_inventory_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all plugin inventory history"
  ON public.user_plugin_inventory_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX user_plugin_inventory_history_user_created_idx
  ON public.user_plugin_inventory_history (user_id, created_at DESC);

-- Snapshot trigger
CREATE OR REPLACE FUNCTION public.snapshot_user_plugin_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_plugin_inventory_history (
    user_id, native_plugins, third_party_plugins, custom_plugins,
    inventory_completed, change_type, changed_by
  ) VALUES (
    NEW.user_id,
    COALESCE(NEW.native_plugins, '{}'),
    COALESCE(NEW.third_party_plugins, '{}'),
    COALESCE(NEW.custom_plugins, '{}'),
    COALESCE(NEW.inventory_completed, false),
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_user_plugin_inventory ON public.user_plugin_inventory;
CREATE TRIGGER trg_snapshot_user_plugin_inventory
  AFTER INSERT OR UPDATE ON public.user_plugin_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_user_plugin_inventory();