// ============================================================================
// STUDIO SENSEI — LOOP GUARD (R9.7) — deterministic, zero AI.
// The bouncer for the coaching loop:
//   1) allStepsResolved — the Fix phase is complete → the user must re-bounce.
//   2) assessContinuation — same-beat guard. A mix re-bounce changes the song's
//      CLOTHING (EQ / loudness / dynamics) but never its DNA (key, tempo,
//      duration). If the DNA moved, a foreign beat entered the project and
//      coaching must pause until the correct bounce lands (or the owner
//      confirms the change was intentional).
//   3) isOverridden / isFlaggedForeign — persistent markers stored inside the
//      report's existing detected_issues JSONB column (zero migrations).
// ============================================================================

export interface StepLike {
  status: string;
}

/** True when the plan has steps and none remain todo (done or skipped all pass). */
export function allStepsResolved(steps: StepLike[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status !== "todo");
}

export const CONTINUITY_FLAG_ID = "continuity.different_beat";
export const CONTINUITY_OVERRIDE_ID = "continuity.override";

// Anchor tuneables — song DNA, not mix clothing.
export const DURATION_TOL_SEC = 2.0;
export const BPM_TOL = 2.5;
export const KEY_WEIGHT = 2; // owner doctrine: KEY is the primary flag
export const DURATION_WEIGHT = 2; // duration almost never changes between bounces
export const BPM_WEIGHT = 1;
export const FLAG_THRESHOLD = 3; // needs ≥ 2 anchors agreeing the song changed

export interface BeatAnchor {
  bpm?: number | null;
  detected_key?: string | null;
  duration_sec?: number | null;
}

export interface ContinuityVerdict {
  verdict: "first" | "match" | "mismatch";
  points: number;
  reasons: string[];
}

export interface MarkerIssue {
  detector_id: string;
  severity: string;
  title: string;
  detail: string;
  metrics: Record<string, number | string | null>;
}

function normKey(k: string | null | undefined): string | null {
  const t = (k ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
}

export function fmtDur(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return "?:??";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Compare the new upload's DNA against the project's previous confirmed report.
 * Key breaks are the primary signal (owner doctrine), but a flag needs points
 * from at least TWO anchors — single-anchor breaks forgive key-detector wobble
 * and legit tempo/arrangement edits made between bounces.
 * Missing anchors never count as evidence.
 */
export function assessContinuation(
  prev: BeatAnchor | null | undefined,
  next: BeatAnchor,
): ContinuityVerdict {
  if (!prev) return { verdict: "first", points: 0, reasons: [] };
  let points = 0;
  const reasons: string[] = [];

  const pk = normKey(prev.detected_key);
  const nk = normKey(next.detected_key);
  if (pk && nk && pk !== nk) {
    points += KEY_WEIGHT;
    reasons.push(`key changed (${prev.detected_key} → ${next.detected_key})`);
  }

  const pd = prev.duration_sec;
  const nd = next.duration_sec;
  if (pd != null && nd != null && Math.abs(nd - pd) > DURATION_TOL_SEC) {
    points += DURATION_WEIGHT;
    reasons.push(`duration changed (${fmtDur(pd)} → ${fmtDur(nd)})`);
  }

  const pb = prev.bpm;
  const nb = next.bpm;
  if (pb != null && nb != null && Math.abs(nb - pb) > BPM_TOL) {
    points += BPM_WEIGHT;
    reasons.push(`tempo changed (${Math.round(pb)} → ${Math.round(nb)} BPM)`);
  }

  return {
    verdict: points >= FLAG_THRESHOLD ? "mismatch" : "match",
    points,
    reasons,
  };
}

/** Owner-confirmed "it really is the same beat" marker (persisted on the report). */
export function isOverridden(detectedIssues: unknown): boolean {
  if (!Array.isArray(detectedIssues)) return false;
  return detectedIssues.some((i: any) => i?.detector_id === CONTINUITY_OVERRIDE_ID);
}

/** True when this report itself was flagged as a foreign beat. */
export function isFlaggedForeign(detectedIssues: unknown): boolean {
  if (!Array.isArray(detectedIssues)) return false;
  return detectedIssues.some((i: any) => i?.detector_id === CONTINUITY_FLAG_ID);
}

export function flagIssue(prevName: string | null, v: ContinuityVerdict): MarkerIssue {
  return {
    detector_id: CONTINUITY_FLAG_ID,
    severity: "warn",
    title: "This doesn't sound like the same beat",
    detail:
      (v.reasons.length ? v.reasons.join(" · ") : "Song DNA changed") +
      (prevName ? ` — expected a new bounce of "${prevName}". Coaching paused.` : ". Coaching paused."),
    metrics: {},
  };
}

export function overrideIssue(): MarkerIssue {
  return {
    detector_id: CONTINUITY_OVERRIDE_ID,
    severity: "info",
    title: "Same-beat continuity override",
    detail:
      "Producer confirmed this is the same song (key/tempo/arrangement edited on purpose). Coaching resumed.",
    metrics: {},
  };
}
