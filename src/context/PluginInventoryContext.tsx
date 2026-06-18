import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface PluginInventory {
  native_plugins: string[];
  third_party_plugins: string[];
  custom_plugins: string[];
  inventory_completed: boolean;
}

interface Ctx {
  inventory: PluginInventory | null;
  loading: boolean;
  isComplete: boolean;
  refresh: () => Promise<void>;
  save: (i: Omit<PluginInventory, "inventory_completed">) => Promise<{ error: string | null }>;
}

const PluginInventoryContext = createContext<Ctx | null>(null);

export function PluginInventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<PluginInventory | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setInventory(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_plugin_inventory")
      .select("native_plugins, third_party_plugins, custom_plugins, inventory_completed")
      .eq("user_id", user.id)
      .maybeSingle();
    setInventory((data as PluginInventory | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save: Ctx["save"] = async (i) => {
    if (!user) return { error: "Not signed in" };
    const { error } = await supabase
      .from("user_plugin_inventory")
      .upsert(
        {
          user_id: user.id,
          native_plugins: i.native_plugins,
          third_party_plugins: i.third_party_plugins,
          custom_plugins: i.custom_plugins,
          inventory_completed: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  return (
    <PluginInventoryContext.Provider
      value={{ inventory, loading, isComplete: !!inventory?.inventory_completed, refresh, save }}
    >
      {children}
    </PluginInventoryContext.Provider>
  );
}

export function usePluginInventory() {
  const ctx = useContext(PluginInventoryContext);
  if (!ctx) throw new Error("usePluginInventory must be used within PluginInventoryProvider");
  return ctx;
}
