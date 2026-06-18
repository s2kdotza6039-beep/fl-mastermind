import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface PluginInventory {
  native_plugins: string[];
  third_party_plugins: string[];
  custom_plugins: string[];
  inventory_completed: boolean;
}

interface SaveResult {
  error: string | null;
  diff?: {
    added: number;
    removed: number;
    total: number;
    native_count: number;
    third_party_count: number;
    custom_count: number;
    inventory_completed: boolean;
    previous_inventory_completed: boolean;
    completed_changed: boolean;
  };
}

interface Ctx {
  inventory: PluginInventory | null;
  loading: boolean;
  isComplete: boolean;
  refresh: () => Promise<void>;
  save: (i: Omit<PluginInventory, "inventory_completed">) => Promise<SaveResult>;
}

const PluginInventoryContext = createContext<Ctx | null>(null);

const lower = (a: string[]) => a.map((x) => x.toLowerCase());
const diffCount = (prev: string[], cur: string[]) => {
  const p = new Set(lower(prev));
  const c = new Set(lower(cur));
  let added = 0, removed = 0;
  c.forEach((x) => { if (!p.has(x)) added++; });
  p.forEach((x) => { if (!c.has(x)) removed++; });
  return { added, removed };
};

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

    const prev = inventory;
    const prevCompleted = !!prev?.inventory_completed;
    const dN = diffCount(prev?.native_plugins ?? [], i.native_plugins);
    const dT = diffCount(prev?.third_party_plugins ?? [], i.third_party_plugins);
    const dC = diffCount(prev?.custom_plugins ?? [], i.custom_plugins);
    const added = dN.added + dT.added + dC.added;
    const removed = dN.removed + dT.removed + dC.removed;

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

    const diff = {
      added,
      removed,
      total: i.native_plugins.length + i.third_party_plugins.length + i.custom_plugins.length,
      native_count: i.native_plugins.length,
      third_party_count: i.third_party_plugins.length,
      custom_count: i.custom_plugins.length,
      inventory_completed: true,
      previous_inventory_completed: prevCompleted,
      completed_changed: !prevCompleted,
    };

    // Best-effort admin-facing activity log. RLS allows users to insert their own logs.
    try {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        event_type: "plugin_inventory_saved",
        metadata: diff,
      });
    } catch {
      // non-fatal
    }

    await refresh();
    return { error: null, diff };
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
