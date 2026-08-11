// R13 — Production chapter phases. Pure logic: no fetching, no side effects.
// The phase is stored in the EXISTING projects.session_notes JSONB column.

export type ProductionPhase = "BEAT" | "BODY" | "ARRANGE" | "DONE";

export interface ProductionPhaseMeta {
  id: ProductionPhase;
  index: number;
  label: string;
  blurb: string;
}

export const PRODUCTION_PHASES: ProductionPhaseMeta[] = [
  { id: "BEAT", index: 0, label: "Beat", blurb: "Rhythm first — drums, groove, bass. A sketch, not a song." },
  { id: "BODY", index: 1, label: "Body", blurb: "Give it harmony — chords, melody, counter-lines." },
  { id: "ARRANGE", index: 2, label: "Arrange", blurb: "Shape the story — intro, drop, breakdown, outro." },
  { id: "DONE", index: 3, label: "Done", blurb: "Production is finished — the Mixing chapter is open." },
];

const ORDER: ProductionPhase[] = ["BEAT", "BODY", "ARRANGE", "DONE"];

/** Read the phase out of a project's session_notes JSONB (defaults to BEAT). */
export function readProductionPhase(sessionNotes: unknown): ProductionPhase {
  if (sessionNotes && typeof sessionNotes === "object") {
    const raw = (sessionNotes as Record<string, unknown>).productionPhase;
    if (typeof raw === "string" && (ORDER as string[]).includes(raw)) {
      return raw as ProductionPhase;
    }
  }
  return "BEAT";
}

export function nextProductionPhase(phase: ProductionPhase): ProductionPhase {
  const i = ORDER.indexOf(phase);
  return ORDER[Math.min(ORDER.length - 1, (i < 0 ? 0 : i) + 1)];
}

export function prevProductionPhase(phase: ProductionPhase): ProductionPhase {
  const i = ORDER.indexOf(phase);
  return ORDER[Math.max(0, (i < 0 ? 0 : i) - 1)];
}

export type SketchGuess = "beat-only" | "partial" | "full" | "unknown";

export interface SketchInputs {
  /** 0..1 — how tonal/harmonically dense the material is. Omitted = unknown. */
  tonalFlatness?: number | null;
  /** Optional stereo width 0..1 — wide, tonal material leans "full". */
  stereoWidth?: number | null;
}

/**
 * HONEST heuristic. Never a verdict — the producer confirms it.
 * With no tonal information we say "unknown" rather than pretend certainty.
 */
export function detectSketch(inputs: SketchInputs = {}): SketchGuess {
  const t = inputs.tonalFlatness;
  if (t === undefined || t === null || Number.isNaN(t)) return "unknown";
  if (t >= 0.6) return "beat-only";
  if (t >= 0.35) return "partial";
  return "full";
}

export const SKETCH_LABEL: Record<SketchGuess, string> = {
  "beat-only": "Sounds beat-only (heuristic — confirm)",
  partial: "Sounds part-finished (heuristic — confirm)",
  full: "Sounds like a full arrangement (heuristic — confirm)",
  unknown: "Not enough signal to guess — tell me what stage this is",
};

// ---------------- Prompt builders ----------------

interface PromptCtx {
  projectName?: string | null;
  genre?: string | null;
  fileName?: string | null;
  guess?: SketchGuess;
}

function head(ctx: PromptCtx) {
  const bits = [
    ctx.projectName ? `Project: ${ctx.projectName}.` : "",
    ctx.genre ? `Genre: ${ctx.genre}.` : "",
    ctx.fileName ? `Current bounce: ${ctx.fileName}.` : "",
    ctx.guess ? `My rough guess about the stage: ${ctx.guess} (heuristic, please confirm with me).` : "",
  ].filter(Boolean);
  return bits.join(" ");
}

export function buildBeatPhasePrompt(ctx: PromptCtx = {}): string {
  return `${head(ctx)} I'm in the BEAT phase of production — this is a beat/sketch, NOT a finished song. Do not judge it as a final mix. Coach me on rhythm, drum selection, groove, swing and low-end foundation in FL Studio. Give me the single most important next move first, then two follow-ups.`.trim();
}

export function buildAddElementPrompt(ctx: PromptCtx = {}): string {
  return `${head(ctx)} Still in the BEAT phase — I want to add or improve one element (percussion layer, fill, 808 movement, texture) without leaving the beat stage. Suggest three concrete additions with exact FL Studio steps, ranked by impact.`.trim();
}

export function buildBodyPhasePrompt(ctx: PromptCtx = {}): string {
  return `${head(ctx)} I'm moving to the BODY phase — the beat works, now give it harmony. Coach chords, melody and counter-melody choices that fit this beat. Use the Chord Forge and the genre playbook conventions, and give me an actual progression to try with FL Studio steps.`.trim();
}

export function buildArrangePrompt(ctx: PromptCtx = {}): string {
  return `${head(ctx)} I'm in the ARRANGE phase — the beat and the body exist. Help me arrange the full song: intro, build, drop/chorus, breakdown, outro, plus transitions and energy management. Give me a bar-by-bar map I can lay out in the FL Studio playlist.`.trim();
}
