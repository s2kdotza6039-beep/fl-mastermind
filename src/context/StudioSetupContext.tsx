import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export interface StudioSetup {
  fl_version: string | null;
  fl_edition: string | null;
  main_use: string | null;
  main_genre: string | null;
  skill_level: string | null;
  setup_completed: boolean;
}

interface StudioSetupContextValue {
  setup: StudioSetup | null;
  loading: boolean;
  isComplete: boolean;
  refresh: () => Promise<void>;
  save: (s: Omit<StudioSetup, "setup_completed">) => Promise<{ error: string | null }>;
}

const StudioSetupContext = createContext<StudioSetupContextValue | null>(null);

export function StudioSetupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [setup, setSetup] = useState<StudioSetup | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSetup(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("user_studio_setup")
      .select("fl_version,fl_edition,main_use,main_genre,skill_level,setup_completed")
      .eq("user_id", user.id)
      .maybeSingle();
    setSetup(data ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save: StudioSetupContextValue["save"] = async (s) => {
    if (!user) return { error: "Not signed in" };
    const payload = {
      user_id: user.id,
      ...s,
      setup_completed: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("user_studio_setup")
      .upsert(payload, { onConflict: "user_id" });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  };

  return (
    <StudioSetupContext.Provider
      value={{ setup, loading, isComplete: !!setup?.setup_completed, refresh, save }}
    >
      {children}
    </StudioSetupContext.Provider>
  );
}

export function useStudioSetup() {
  const ctx = useContext(StudioSetupContext);
  if (!ctx) throw new Error("useStudioSetup must be used within StudioSetupProvider");
  return ctx;
}
