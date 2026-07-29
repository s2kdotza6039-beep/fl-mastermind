// Deterministic coaching-loop logic. No AI calls. Pure functions the loop
// UI + upload flow use to score mixes, detect issues, plan repairs, and
// derive the current loop state.

export type Severity = "info" | "warn" | "critical";
export type IssueStatus = "open" | "fixing" | "resolved" | "regressed";
export type PlanStepStatus = "todo" | "done" | "skipped";
export type LoopState =
  | "UPLOADED"
  | "ANALYZED"
  | "PLAN_READY"
  | "COACHING"
  | "AWAITING_REUPLOAD"
  | "DELTA_MEASURED"
  | "MASTER_READY";

export type BandName = "low" | "lowmid" | "mid" | "highmid" | "high";
export const BANDS: BandName[] = ["low", "lowmid", "mid", "highmid", "high"];

export interface GenreTarget {
  genre: string;
  target_lufs: number;
  dr_min: number;
  width_min: number;
  width_max: number;
  curve: Record<BandName, number>;
  band_tolerance: number;
  target_score: number;
}

/** Slim view of an audio_analysis_reports row used by the loop math. */
export interface AudioReportLike {
  id?: string;
  file_name?: string | null;
  peak_db: number | null;
  lufs_estimate: number | null;
  dynamic_range_db: number | null;
  stereo_width: number | null;
  band_low_db: number | null;
  band_lowmid_db: number | null;
  band_mid_db: number | null;
  band_highmid_db: number | null;
  band_high_db: number | null;
  detected_issues?: any;
}

export interface DetectedIssue {
  detector_id: string;
  severity: Severity;
  title: string;
  detail?: string;
  metrics: Record<string, number | string | null>;
}

export interface StoredIssue extends DetectedIssue {
  id?: string;
  status: IssueStatus;
  first_seen_at?: string;
  last_seen_at?: string;
  resolved_at?: string | null;
}

export interface ScoreBreakdown {
  loudness: number;
  peakHot: number;
  peakCold: number;
  dynamics: number;
  bands: number;
  stereo: number;
  criticalIssues: number;
  target_lufs: number;
  actual_lufs: number | null;
  delta?: DeltaSummary;
}

export interface MixScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  master_ready: boolean;
}

export interface PlanStepDraft {
  step_order: number;
  instruction: string;
  detector_id: string | null;
  expected_delta: string;
}

export interface DeltaMetric {
  metric: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
  verdict: "improved" | "regressed" | "unchanged";
}

export interface DeltaSummary {
  metrics: DeltaMetric[];
  improved: number;
  regressed: number;
  unchanged: number;
}

function bandVal(r: AudioReportLike, b: BandName): number | null {
  switch (b) {
    case "low": return r.band_low_db;
    case "lowmid": return r.band_lowmid_db;
    case "mid": return r.band_mid_db;
    case "highmid": return r.band_highmid_db;
    case "high": return r.band_high_db;
  }
}

const BAND_LABEL: Record<BandName, string> = {
  low: "Low",
  lowmid: "Low-mid",
  mid: "Mid",
  highmid: "High-mid",
  high: "High",
};

const BAND_FREQ_HINT: Record<BandName, string> = {
  low: "60 Hz",
  lowmid: "250 Hz",
  mid: "1 kHz",
  highmid: "4 kHz",
  high: "10 kHz",
};

// ─────────────────────────────────────────────────────────────
// Score
// ─────────────────────────────────────────────────────────────
export function computeMixScore(report: AudioReportLike, target: GenreTarget): MixScoreResult {
  let score = 100;

  // Loudness — only deducts when we actually measured LUFS.
  let loudness = 0;
  if (report.lufs_estimate != null) {
    loudness = Math.min(25, 4 * Math.abs(report.lufs_estimate - target.target_lufs));
  }
  score -= loudness;

  // Peak headroom.
  let peakHot = 0, peakCold = 0;
  if (report.peak_db != null) {
    if (report.peak_db > -1) peakHot = 15;
    if (report.peak_db < -12) peakCold = 5;
  }
  score -= peakHot + peakCold;

  // Dynamics.
  let dynamics = 0;
  if (report.dynamic_range_db != null && report.dynamic_range_db < target.dr_min) {
    dynamics = Math.min(15, 3 * (target.dr_min - report.dynamic_range_db));
  }
  score -= dynamics;

  // Per-band deviations from curve.
  let bandTotal = 0;
  for (const b of BANDS) {
    const v = bandVal(report, b);
    if (v == null) continue;
    const dev = Math.abs(v - target.curve[b]);
    const over = Math.max(0, dev - target.band_tolerance);
    bandTotal += over * 2;
  }
  bandTotal = Math.min(25, bandTotal);
  score -= bandTotal;

  // Stereo width.
  let stereo = 0;
  if (report.stereo_width != null &&
      (report.stereo_width < target.width_min || report.stereo_width > target.width_max)) {
    stereo = 8;
  }
  score -= stereo;

  // Existing critical detected issues from the analyzer.
  let criticalIssues = 0;
  const arr = Array.isArray(report.detected_issues) ? report.detected_issues : [];
  const criticals = arr.filter((i: any) => (i?.severity ?? "").toLowerCase() === "critical").length;
  criticalIssues = Math.min(20, criticals * 10);
  score -= criticalIssues;

  score = Math.max(0, Math.round(score));

  const breakdown: ScoreBreakdown = {
    loudness: Math.round(loudness * 10) / 10,
    peakHot,
    peakCold,
    dynamics: Math.round(dynamics * 10) / 10,
    bands: Math.round(bandTotal * 10) / 10,
    stereo,
    criticalIssues,
    target_lufs: target.target_lufs,
    actual_lufs: report.lufs_estimate,
  };

  return {
    score,
    breakdown,
    master_ready: score >= target.target_score && criticals === 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Detect
// ─────────────────────────────────────────────────────────────
export function detectIssues(report: AudioReportLike, target: GenreTarget): DetectedIssue[] {
  const out: DetectedIssue[] = [];

  if (report.peak_db != null) {
    if (report.peak_db >= -0.1) {
      out.push({
        detector_id: "peak.clipping",
        severity: "critical",
        title: "Peaks are clipping the ceiling",
        detail: `True peak ${report.peak_db.toFixed(2)} dB — pull the master down before mastering.`,
        metrics: { peak_db: report.peak_db },
      });
    } else if (report.peak_db > -1) {
      out.push({
        detector_id: "peak.hot",
        severity: "warn",
        title: "Master peaks too hot",
        detail: `Peak ${report.peak_db.toFixed(2)} dB — leave at least 1 dB of headroom.`,
        metrics: { peak_db: report.peak_db },
      });
    } else if (report.peak_db < -12) {
      out.push({
        detector_id: "peak.cold",
        severity: "info",
        title: "Master is very quiet",
        detail: `Peak ${report.peak_db.toFixed(2)} dB — plenty of headroom to raise the level.`,
        metrics: { peak_db: report.peak_db },
      });
    }
  }

  if (report.lufs_estimate != null && Math.abs(report.lufs_estimate - target.target_lufs) > 1.5) {
    out.push({
      detector_id: "loudness.off_target",
      severity: "warn",
      title: `Loudness off ${target.genre} target`,
      detail: `Measured ${report.lufs_estimate.toFixed(1)} LUFS vs target ${target.target_lufs.toFixed(1)} LUFS.`,
      metrics: { actual: report.lufs_estimate, target: target.target_lufs },
    });
  }

  if (report.dynamic_range_db != null && report.dynamic_range_db < target.dr_min) {
    out.push({
      detector_id: "dynamics.squashed",
      severity: "warn",
      title: "Mix is squashed",
      detail: `Dynamic range ${report.dynamic_range_db.toFixed(1)} dB is below the ${target.dr_min} dB floor for ${target.genre}.`,
      metrics: { actual: report.dynamic_range_db, target: target.dr_min },
    });
  }

  for (const b of BANDS) {
    const v = bandVal(report, b);
    if (v == null) continue;
    const dev = v - target.curve[b];
    if (dev > target.band_tolerance + 0.5) {
      out.push({
        detector_id: `band.${b}.high`,
        severity: "warn",
        title: `${BAND_LABEL[b]} buildup vs ${target.genre} target`,
        detail: `${BAND_LABEL[b]} band is +${dev.toFixed(1)} dB above the curve.`,
        metrics: { actual: v, target: target.curve[b], deviation: dev },
      });
    } else if (dev < -(target.band_tolerance + 0.5)) {
      out.push({
        detector_id: `band.${b}.low`,
        severity: "warn",
        title: `${BAND_LABEL[b]} is under-represented`,
        detail: `${BAND_LABEL[b]} band is ${dev.toFixed(1)} dB below the curve.`,
        metrics: { actual: v, target: target.curve[b], deviation: dev },
      });
    }
  }

  if (report.stereo_width != null) {
    if (report.stereo_width < target.width_min) {
      out.push({
        detector_id: "stereo.narrow",
        severity: "info",
        title: "Stereo image feels narrow",
        detail: `Width ${report.stereo_width.toFixed(2)} vs target ≥ ${target.width_min}.`,
        metrics: { actual: report.stereo_width, target_min: target.width_min },
      });
    } else if (report.stereo_width > target.width_max) {
      out.push({
        detector_id: "stereo.wide",
        severity: "info",
        title: "Stereo image is unusually wide",
        detail: `Width ${report.stereo_width.toFixed(2)} vs target ≤ ${target.width_max}.`,
        metrics: { actual: report.stereo_width, target_max: target.width_max },
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Delta
// ─────────────────────────────────────────────────────────────
const TOL = {
  lufs_estimate: 0.3,
  peak_db: 0.3,
  dynamic_range_db: 0.5,
  band: 0.5,
  stereo_width: 0.02,
};

function verdictToward(target: number | null, prev: number | null, cur: number | null, tol: number): DeltaMetric["verdict"] {
  if (prev == null || cur == null) return "unchanged";
  if (Math.abs(cur - prev) < tol) return "unchanged";
  if (target == null) return cur > prev ? "improved" : "regressed";
  return Math.abs(cur - target) < Math.abs(prev - target) ? "improved" : "regressed";
}

export function computeDelta(
  previous: AudioReportLike,
  current: AudioReportLike,
  target?: GenreTarget,
): DeltaSummary {
  const rows: DeltaMetric[] = [];
  const push = (metric: string, prev: number | null, cur: number | null, tol: number, tgt: number | null) => {
    const delta = prev != null && cur != null ? cur - prev : null;
    rows.push({ metric, previous: prev, current: cur, delta, verdict: verdictToward(tgt, prev, cur, tol) });
  };
  push("lufs_estimate", previous.lufs_estimate, current.lufs_estimate, TOL.lufs_estimate, target?.target_lufs ?? null);
  push("peak_db", previous.peak_db, current.peak_db, TOL.peak_db, -1);
  push("dynamic_range_db", previous.dynamic_range_db, current.dynamic_range_db, TOL.dynamic_range_db, target?.dr_min ?? null);
  for (const b of BANDS) {
    push(`band_${b}_db`, bandVal(previous, b), bandVal(current, b), TOL.band, target?.curve[b] ?? null);
  }
  push("stereo_width", previous.stereo_width, current.stereo_width, TOL.stereo_width, null);

  const improved = rows.filter((r) => r.verdict === "improved").length;
  const regressed = rows.filter((r) => r.verdict === "regressed").length;
  const unchanged = rows.filter((r) => r.verdict === "unchanged").length;
  return { metrics: rows, improved, regressed, unchanged };
}

// ─────────────────────────────────────────────────────────────
// Reconcile
// ─────────────────────────────────────────────────────────────
export interface ReconciledIssue extends StoredIssue {}

export function reconcileIssues(
  existing: StoredIssue[],
  newDetected: DetectedIssue[],
): ReconciledIssue[] {
  const byId = new Map<string, StoredIssue>();
  for (const e of existing) byId.set(e.detector_id, e);
  const detectedIds = new Set(newDetected.map((d) => d.detector_id));
  const now = new Date().toISOString();
  const out: ReconciledIssue[] = [];

  for (const d of newDetected) {
    const prior = byId.get(d.detector_id);
    if (!prior) {
      out.push({ ...d, status: "open", first_seen_at: now, last_seen_at: now });
      continue;
    }
    // Was resolved but detected again → regressed.
    let status: IssueStatus = prior.status;
    if (prior.status === "resolved") status = "regressed";
    else if (prior.status === "fixing") status = "fixing";
    else status = "open";
    out.push({
      ...prior,
      ...d,
      status,
      first_seen_at: prior.first_seen_at ?? now,
      last_seen_at: now,
      resolved_at: status === "resolved" ? prior.resolved_at ?? null : null,
    });
  }

  // Anything previously open/fixing that we no longer detect → resolved.
  for (const prior of existing) {
    if (detectedIds.has(prior.detector_id)) continue;
    if (prior.status === "resolved") {
      out.push(prior);
      continue;
    }
    out.push({
      ...prior,
      status: "resolved",
      last_seen_at: now,
      resolved_at: now,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Loop state
// ─────────────────────────────────────────────────────────────
export interface LoopInputs {
  hasProject: boolean;
  hasAnalysis: boolean;
  latestScore?: { master_ready: boolean; breakdown?: ScoreBreakdown } | null;
  issues?: StoredIssue[];
  plan?: { status: string } | null;
  steps?: { status: PlanStepStatus }[];
}

export function deriveLoopState(inputs: LoopInputs): LoopState {
  if (!inputs.hasAnalysis) return "UPLOADED";
  if (inputs.latestScore?.master_ready) return "MASTER_READY";
  if (inputs.latestScore?.breakdown?.delta) return "DELTA_MEASURED";

  const steps = inputs.steps ?? [];
  const anyDone = steps.some((s) => s.status === "done");
  const allDone = steps.length > 0 && steps.every((s) => s.status !== "todo");

  if (allDone) return "AWAITING_REUPLOAD";
  if (anyDone) return "COACHING";
  if ((inputs.plan?.status ?? "") === "active" && steps.length > 0) return "PLAN_READY";
  return "ANALYZED";
}

// ─────────────────────────────────────────────────────────────
// Plan builder
// ─────────────────────────────────────────────────────────────
function deductionOf(issue: DetectedIssue, target: GenreTarget): number {
  const id = issue.detector_id;
  if (id === "peak.clipping" || id === "peak.hot") return 15;
  if (id === "loudness.off_target") {
    const a = Number(issue.metrics.actual);
    const t = Number(issue.metrics.target);
    if (!isNaN(a) && !isNaN(t)) return Math.min(25, 4 * Math.abs(a - t));
    return 8;
  }
  if (id === "dynamics.squashed") {
    const a = Number(issue.metrics.actual);
    return isNaN(a) ? 6 : Math.min(15, 3 * (target.dr_min - a));
  }
  if (id.startsWith("band.")) {
    const dev = Math.abs(Number(issue.metrics.deviation ?? 0));
    return Math.max(1, (dev - target.band_tolerance) * 2);
  }
  if (id.startsWith("stereo.")) return 4;
  return 2;
}

function instructionFor(issue: DetectedIssue, target: GenreTarget): { instruction: string; expected_delta: string } {
  const id = issue.detector_id;
  if (id === "peak.clipping" || id === "peak.hot") {
    return {
      instruction: "Pull the master fader down and add Fruity Limiter (Mixer → Master → Slot 8) with true-peak on and ceiling −1.0 dB.",
      expected_delta: "Peak below −1.0 dB",
    };
  }
  if (id === "loudness.off_target") {
    const a = Number(issue.metrics.actual);
    const t = Number(issue.metrics.target);
    const diff = a - t;
    const dir = diff > 0 ? "reduce" : "raise";
    return {
      instruction: `Stage gain across Fruity Limiter → Maximus (Mixer → Master → Slots 6–8) and ${dir} loudness ≈ ${Math.abs(diff).toFixed(1)} dB toward ${t.toFixed(1)} LUFS.`,
      expected_delta: `LUFS toward ${t.toFixed(1)}`,
    };
  }
  if (id === "dynamics.squashed") {
    return {
      instruction: "Back off Maximus master limiter (Mixer → Master) by 1–2 dB and reduce make-up gain on your bus compressors to give the mix breathing room.",
      expected_delta: `Dynamic range ≥ ${target.dr_min.toFixed(1)} dB`,
    };
  }
  if (id.startsWith("band.")) {
    const parts = id.split(".");
    const band = parts[1] as BandName;
    const dir = parts[2] as "high" | "low";
    const dev = Number(issue.metrics.deviation ?? 0);
    const amount = Math.min(6, Math.max(1, Math.abs(dev)));
    const action = dir === "high" ? `Reduce ${BAND_FREQ_HINT[band]} ≈ −${amount.toFixed(1)} dB` : `Boost ${BAND_FREQ_HINT[band]} ≈ +${amount.toFixed(1)} dB`;
    return {
      instruction: `${action} via Fruity Parametric EQ 2 (Mixer → Insert 1 → Slot 1) with Q ≈ 1.2 on the ${BAND_LABEL[band]} band.`,
      expected_delta: `${BAND_LABEL[band]} within ±${target.band_tolerance} dB of curve`,
    };
  }
  if (id === "stereo.narrow") {
    return {
      instruction: "Add Fruity Stereo Shaper (Mixer → Master → Slot 5) and widen the sides by +15%; keep mono below 120 Hz.",
      expected_delta: `Stereo width ≥ ${target.width_min.toFixed(2)}`,
    };
  }
  if (id === "stereo.wide") {
    return {
      instruction: "Add Fruity Stereo Shaper (Mixer → Master → Slot 5) and narrow the sides by −15% to tighten mono compatibility.",
      expected_delta: `Stereo width ≤ ${target.width_max.toFixed(2)}`,
    };
  }
  return {
    instruction: `Address: ${issue.title}. ${issue.detail ?? ""}`.trim(),
    expected_delta: "Issue resolved on re-analysis",
  };
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

export function buildPlanFromIssues(issues: DetectedIssue[], _report: AudioReportLike, target: GenreTarget): PlanStepDraft[] {
  const sorted = [...issues].sort((a, b) => {
    const s = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (s !== 0) return s;
    return deductionOf(b, target) - deductionOf(a, target);
  });
  return sorted.map((issue, i) => {
    const inst = instructionFor(issue, target);
    return {
      step_order: i + 1,
      instruction: inst.instruction,
      detector_id: issue.detector_id,
      expected_delta: inst.expected_delta,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Score tier label
// ─────────────────────────────────────────────────────────────
export function tierLabel(score: number, target_score: number): string {
  if (score >= target_score) return "Broadcast Ready";
  if (score >= 70) return "Nearly There";
  if (score >= 50) return "Getting There";
  return "Rough Draft";
}
