import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import { useProductionPhase } from "@/hooks/use-production-phase";
import { GrooveEngineCard } from "@/components/GrooveEngineCard";
import { ChordGeneratorCard } from "@/components/ChordGeneratorCard";
import { GenrePlaybookCard } from "@/components/GenrePlaybookCard";
import { PlaybookChecklistCard } from "@/components/PlaybookChecklistCard";

interface LatestReport {
  detected_key: string | null;
  bpm: number | null;
}

/**
 * R14.3 — the body tools live inside the Production chapter, surfaced by phase:
 * BEAT → groove engine, BODY → chords + playbook, ARRANGE → playbook checklist.
 */
export const ProductionTools = () => {
  const { activeProject } = useProject();
  const { phase } = useProductionPhase();
  const [latest, setLatest] = useState<LatestReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeProject?.id) {
      setLatest(null);
      return;
    }
    supabase
      .from("audio_analysis_reports")
      .select("detected_key, bpm")
      .eq("project_id", activeProject.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setLatest((data?.[0] as LatestReport) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  const genre = activeProject?.genre ?? null;
  const projectName = activeProject?.name ?? null;

  if (phase === "DONE") return null;

  return (
    <div className="space-y-4 mb-6">
      {phase === "BEAT" && (
        <GrooveEngineCard genre={genre} bpm={latest?.bpm ?? null} projectName={projectName} />
      )}

      {phase === "BODY" && (
        <>
          <ChordGeneratorCard
            genre={genre}
            detectedKey={latest?.detected_key ?? null}
            bpm={latest?.bpm ?? null}
            projectName={projectName}
          />
          <GenrePlaybookCard genre={genre} />
        </>
      )}

      {phase === "ARRANGE" && (
        <PlaybookChecklistCard
          genre={genre}
          projectId={activeProject?.id ?? null}
          projectName={projectName}
        />
      )}
    </div>
  );
};
