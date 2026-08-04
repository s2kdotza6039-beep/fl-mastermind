// Journey Belt — maps the existing coaching-loop state to user-facing Mix
// Chapter stages. Pure derivation: NO fetching, NO side effects (unit-testable).
import { deriveLoopState, type LoopInputs, type LoopState } from "./coaching-loop";

export type MixStageId =
  | "LOAD"
  | "ANALYZE"
  | "PLAN"
  | "FIX"
  | "REBOUNCE"
  | "SCORE"
  | "MIX_READY";

export interface JourneyStage {
  id: MixStageId;
  index: number;
  label: string;
  caption: string;
  ctaLabel: string;
  ctaHref: string;
}

export const MIX_STAGES: JourneyStage[] = [
  { id: "LOAD",      index: 0, label: "Load",      caption: "Upload your bounce",            ctaLabel: "Load track",    ctaHref: "/upload" },
  { id: "ANALYZE",   index: 1, label: "Analyze",   caption: "Sensei listens",                ctaLabel: "Analyze",       ctaHref: "/upload" },
  { id: "PLAN",      index: 2, label: "Plan",      caption: "Sensei maps the fixes",         ctaLabel: "Open plan",     ctaHref: "/mixing" },
  { id: "FIX",       index: 3, label: "Fix",       caption: "Work the steps in FL Studio",   ctaLabel: "Fix steps",     ctaHref: "/chat" },
  { id: "REBOUNCE",  index: 4, label: "Re-bounce", caption: "Export & upload again",         ctaLabel: "Re-upload",     ctaHref: "/upload" },
  { id: "SCORE",     index: 5, label: "Score",     caption: "Sensei re-rates your mix",      ctaLabel: "See score",     ctaHref: "/" },
  { id: "MIX_READY", index: 6, label: "Mix Ready", caption: "Mastering chapter unlocks",     ctaLabel: "Continue",      ctaHref: "/" },
];

export interface JourneyState {
  loopState: LoopState;
  currentIndex: number;
  current: JourneyStage;
  /** completed stages before currentIndex */
  doneCount: number;
  /** 0..1 — MIX_READY reached = 1 */
  progress: number;
  reachedMixReady: boolean;
  planStepsTotal: number;
  planStepsDone: number;
}

export const LOOP_TO_STAGE: Record<LoopState, MixStageId> = {
  UPLOADED: "LOAD",
  ANALYZED: "ANALYZE",
  PLAN_READY: "PLAN",
  COACHING: "FIX",
  AWAITING_REUPLOAD: "REBOUNCE",
  DELTA_MEASURED: "SCORE",
  MASTER_READY: "MIX_READY",
};

export function deriveJourney(inputs: LoopInputs): JourneyState {
  const loopState = deriveLoopState(inputs);
  if (!inputs.hasProject) {
    return {
      loopState,
      currentIndex: -1,
      current: MIX_STAGES[0],
      doneCount: 0,
      progress: 0,
      reachedMixReady: false,
      planStepsTotal: 0,
      planStepsDone: 0,
    };
  }
  const stageId = LOOP_TO_STAGE[loopState];
  const idx = MIX_STAGES.findIndex((s) => s.id === stageId);
  const currentIndex = idx < 0 ? 0 : idx;
  const steps = inputs.steps ?? [];
  const planStepsTotal = steps.length;
  const planStepsDone = steps.filter((s) => s.status === "done").length;
  const doneCount =
    stageId === "MIX_READY" ? MIX_STAGES.length - 1 : currentIndex;
  const progress = (doneCount + (stageId === "MIX_READY" ? 1 : 0)) / MIX_STAGES.length;
  return {
    loopState,
    currentIndex,
    current: MIX_STAGES[currentIndex],
    doneCount,
    progress: Math.min(1, Math.max(0, progress)),
    reachedMixReady: stageId === "MIX_READY",
    planStepsTotal,
    planStepsDone,
  };
}

/** Short Sensei-style guidance line shown under the belt. */
export function journeyGuidance(j: JourneyState): string {
  if (j.currentIndex < 0) return "Pick a project — your journey starts at Load.";
  switch (j.current.id) {
    case "LOAD":
      return "Load your bounced track so I can listen.";
    case "ANALYZE":
      return "Analysis ready soon — when it lands, I'll draw your repair map.";
    case "PLAN":
      return "Your repair map is ready. Know the plan before you touch a fader.";
    case "FIX":
      return j.planStepsTotal > 0
        ? `Work the steps in FL Studio, then tick them off — ${j.planStepsDone}/${j.planStepsTotal} done.`
        : "Work the fixes in FL Studio, then tick them off.";
    case "REBOUNCE":
      return "All steps ticked. Bounce the mix again and upload the new version.";
    case "SCORE":
      return "I've measured the delta. Check your score — if it's not master-ready yet, we loop again.";
    case "MIX_READY":
      return "Master-ready. Well fought — the mastering chapter opens next.";
  }
}

/** Custom event the Belt listens to in order to refetch (dispatched by PlanCard toggles and future modules). */
export const JOURNEY_REFRESH_EVENT = "studio-sensei:journey-refresh";
export function requestJourneyRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(JOURNEY_REFRESH_EVENT));
  }
}
