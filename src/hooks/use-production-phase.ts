// R13 — reads/writes the production phase on the active project's
// session_notes JSONB (no migration, optimistic with rollback).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import { readProductionPhase, type ProductionPhase } from "@/lib/production-phase";
import { toast } from "sonner";

export function useProductionPhase() {
  const { activeProject, refresh } = useProject();
  const stored = readProductionPhase((activeProject as any)?.session_notes);
  const [phase, setLocalPhase] = useState<ProductionPhase>(stored);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalPhase(stored);
  }, [stored, activeProject?.id]);

  const setPhase = useCallback(
    async (next: ProductionPhase) => {
      if (!activeProject) return;
      const prev = phase;
      setLocalPhase(next);
      setSaving(true);
      try {
        const existing = ((activeProject as any).session_notes ?? {}) as Record<string, unknown>;
        const merged = { ...(typeof existing === "object" ? existing : {}), productionPhase: next };
        const { error } = await supabase
          .from("projects")
          .update({ session_notes: merged as any })
          .eq("id", activeProject.id);
        if (error) throw error;
        await refresh();
      } catch (e: any) {
        setLocalPhase(prev);
        toast.error(e?.message ?? "Could not save the production phase");
      } finally {
        setSaving(false);
      }
    },
    [activeProject, phase, refresh],
  );

  return { phase, setPhase, saving };
}
