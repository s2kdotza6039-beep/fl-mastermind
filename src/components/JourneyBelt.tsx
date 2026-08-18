import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, Lock, Sliders, SlidersHorizontal, Gauge, Rocket, Mic2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import {
  deriveJourney,
  journeyGuidance,
  JOURNEY_REFRESH_EVENT,
  MIX_STAGES,
  type JourneyState,
} from "@/lib/journey";
import { PRODUCTION_PHASES } from "@/lib/production-phase";
import { useProductionPhase } from "@/hooks/use-production-phase";
import type { LoopInputs } from "@/lib/coaching-loop";
import { cn } from "@/lib/utils";

type ChapterId = "PRODUCTION" | "MIXING" | "MASTERING" | "PUBLISH";

const CHAPTERS: { id: ChapterId; label: string; href: string; icon: typeof Sliders }[] = [
  { id: "PRODUCTION", label: "Production", href: "/production", icon: Sliders },
  { id: "MIXING", label: "Mixing", href: "/mixing", icon: SlidersHorizontal },
  { id: "MASTERING", label: "Mastering", href: "/mastering", icon: Gauge },
  { id: "PUBLISH", label: "Publish", href: "/publish", icon: Rocket },
];

export const JourneyBelt = () => {
  const { activeProject } = useProject();
  const location = useLocation();
  const [journey, setJourney] = useState<JourneyState | null>(null);

  const { phase, setPhase, saving: phaseSaving } = useProductionPhase();

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

  const masterReady = journey.reachedMixReady;
  const productionDone = phase === "DONE" || masterReady;

  const chapterState = (id: ChapterId): "done" | "current" | "locked" => {
    if (id === "PRODUCTION") return productionDone ? "done" : "current";
    if (id === "MIXING") {
      if (!productionDone) return "locked";
      return masterReady ? "done" : "current";
    }
    return masterReady ? "current" : "locked";
  };

  const onProduction = location.pathname.startsWith("/production");
  const activeChapter: ChapterId = onProduction
    ? "PRODUCTION"
    : location.pathname.startsWith("/mastering")
      ? "MASTERING"
      : "MIXING";

  const phaseIndex = PRODUCTION_PHASES.findIndex((p) => p.id === phase);

  const senseiLine = onProduction
    ? phase === "DONE"
      ? "Production is finished — step into the Mixing chapter when you're ready."
      : `${PRODUCTION_PHASES[Math.max(0, phaseIndex)].blurb}`
    : journeyGuidance(journey);

  return (
    <div className="border-b border-border bg-card/20 px-4 py-2 space-y-1">
      {/* Chapters */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {CHAPTERS.map((c, i) => {
          const state = chapterState(c.id);
          const isActive = c.id === activeChapter && state !== "locked";
          const Icon = c.icon;
          return (
            <div key={c.id} className="flex items-center gap-1">
              {i > 0 && <span className="w-3 h-px bg-border" />}
              <Link
                to={c.href}
                aria-current={isActive ? "step" : undefined}
                onClick={(e) => {
                  if (state === "locked") e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap",
                  isActive && "bg-gradient-gold text-primary-foreground shadow-sm glow-gold",
                  !isActive && state === "done" && "bg-primary/15 text-primary hover:bg-primary/25",
                  !isActive && state === "current" && "text-foreground hover:bg-primary/10",
                  state === "locked" && "text-muted-foreground/50 cursor-not-allowed",
                )}
              >
                {state === "locked" ? (
                  <Lock className="w-3 h-3" />
                ) : state === "done" ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                {c.label}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Within-chapter steps — R15 Vocals: VOCALS is optional, shown with dashed style */}
      {onProduction ? (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {PRODUCTION_PHASES.filter((p) => p.id !== "DONE").map((p, i) => {
            const isDone = phase === "DONE" || p.index < phaseIndex;
            const isCurrent = p.id === phase;
            const isVocals = p.id === "VOCALS";
            return (
              <div key={p.id} className="flex items-center gap-1">
                {i > 0 && <span className="w-3 h-px bg-border" />}
                <button
                  type="button"
                  title={p.blurb + (isVocals ? " — Optional. Skip if instrumental." : "")}
                  disabled={phaseSaving}
                  onClick={() => { void setPhase(p.id as any); }}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors hover:opacity-90 disabled:opacity-50",
                    isDone && !isVocals && "bg-primary/15 text-primary",
                    isDone && isVocals && "bg-primary/10 text-primary border border-dashed border-primary/30",
                    isCurrent && !isVocals && "bg-gradient-gold text-primary-foreground shadow-sm glow-gold",
                    isCurrent && isVocals && "bg-gradient-gold text-primary-foreground shadow-sm glow-gold ring-1 ring-amber-400/30",
                    !isDone && !isCurrent && !isVocals && "text-muted-foreground/50",
                    !isDone && !isCurrent && isVocals && "text-amber-600 border border-dashed border-amber-400/40 bg-amber-500/5",
                  )}
                >
                  {isVocals ? (
                    <Mic2 className="w-3 h-3" />
                  ) : isDone ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                  {p.label}
                  {isVocals && !isDone && !isCurrent && <span className="text-[8px] opacity-70 ml-0.5">OPT</span>}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
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
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        <span className="text-primary font-semibold">Sensei:</span> {senseiLine}
        {onProduction && phase === "ARRANGE" && <span className="ml-2 text-amber-600">· Vocals is optional — click Vocals if you have leads to lay, or Finish to go Mixing.</span>}
      </p>
    </div>
  );
};
