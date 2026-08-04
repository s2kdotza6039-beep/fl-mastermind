import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import {
  deriveJourney,
  journeyGuidance,
  JOURNEY_REFRESH_EVENT,
  MIX_STAGES,
  type JourneyState,
} from "@/lib/journey";
import type { LoopInputs } from "@/lib/coaching-loop";
import { cn } from "@/lib/utils";

export const JourneyBelt = () => {
  const { activeProject } = useProject();
  const location = useLocation();
  const [journey, setJourney] = useState<JourneyState | null>(null);

  const refresh = useCallback(async () => {
    if (!activeProject?.id) {
      setJourney(deriveJourney({ hasProject: false, hasAnalysis: false }));
      return;
    }
    try {
      const projectId = activeProject.id;
      const [reportRes, scoreRes, planRes] = await Promise.all([
        supabase
          .from("audio_analysis_reports")
          .select("id")
          .eq("project_id", projectId)
          .limit(1),
        supabase
          .from("project_scores")
          .select("master_ready, breakdown")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("repair_plans")
          .select("id, status")
          .eq("project_id", projectId)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      let steps: { status: "todo" | "done" | "skipped" }[] = [];
      if (planRes.data?.id) {
        const stepsRes = await supabase
          .from("plan_steps")
          .select("status")
          .eq("plan_id", planRes.data.id);
        steps = (stepsRes.data ?? []) as typeof steps;
      }
      const inputs: LoopInputs = {
        hasProject: true,
        hasAnalysis: (reportRes.data ?? []).length > 0,
        // Row shape includes master_ready + breakdown; cast is what NextStepCard-style code needs.
        latestScore: (scoreRes.data ?? null) as unknown as LoopInputs["latestScore"],
        plan: planRes.data ? { status: planRes.data.status } : null,
        steps,
      };
      setJourney(deriveJourney(inputs));
    } catch {
      /* belt is decorative — never block the page on its failure */
    }
  }, [activeProject?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    const onFocus = () => void refresh();
    window.addEventListener(JOURNEY_REFRESH_EVENT, onRefresh);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(JOURNEY_REFRESH_EVENT, onRefresh);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!journey) return null;

  return (
    <div className="border-b border-border bg-card/20 px-4 py-2">
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {MIX_STAGES.map((stage) => {
          const isDone = journey.reachedMixReady || stage.index < journey.currentIndex;
          const isCurrent = stage.index === journey.currentIndex;
          return (
            <div key={stage.id} className="flex items-center gap-1">
              {stage.index > 0 && <span className="w-3 h-px bg-border" />}
              <Link
                to={stage.ctaHref}
                title={stage.caption}
                aria-current={isCurrent ? "step" : undefined}
                onClick={(e) => {
                  if (!isDone && !isCurrent) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
                  isDone && "bg-primary/15 text-primary hover:bg-primary/25",
                  isCurrent && "bg-gradient-gold text-primary-foreground shadow-sm glow-gold",
                  !isDone && !isCurrent && "text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                {isDone ? (
                  <Check className="w-3 h-3" />
                ) : !isCurrent ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
                {stage.label}
              </Link>
            </div>
          );
        })}

        <span className="w-3 h-px bg-border" />
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground/50 whitespace-nowrap">
          <Lock className="w-3 h-3" /> Mastering
        </span>
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground/50 whitespace-nowrap">
          <Lock className="w-3 h-3" /> Publish
        </span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        <span className="text-primary font-semibold">Sensei:</span>{" "}
        {journeyGuidance(journey)}
      </p>
    </div>
  );
};
