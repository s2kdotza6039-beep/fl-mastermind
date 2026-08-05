// ============================================================================
// STUDIO SENSEI — MASTERING CHAPTER (R10) — deterministic, zero AI.
// Judged on what ships: LUFS vs platform target, peak ceiling discipline,
// dynamics left alive, width sanity, zero criticals. True-peak breaches are
// read from the analysis issues (id "intersample_hot") — the 4x oversampled
// estimate already ran during analysis.
// ============================================================================

export interface PlatformTarget {
  id: string;
  label: string;
  lufs: number;
  ceilingDb: number;
  note: string;
}

/** Where the master is going. Louder than the target BUYS NOTHING on normalized
 *  platforms — they just turn you down (and the codec may clip what the limiter
 *  let through). */
export const PLATFORM_TARGETS: PlatformTarget[] = [
  {
    id: "spotify",
    label: "Spotify / Deezer",
    lufs: -14,
    ceilingDb: -1.0,
    note: "Normalization turns hotter masters down — past −14 LUFS buys nothing but distortion risk.",
  },
  {
    id: "apple",
    label: "Apple Music",
    lufs: -16,
    ceilingDb: -1.0,
    note: "Sound Check target −16 LUFS; the AAC codec needs true −1 dBTP headroom.",
  },
  {
    id: "youtube",
    label: "YouTube",
    lufs: -14,
    ceilingDb: -1.0,
    note: "Only ever turns DOWN, never up — a clean −14 travels best.",
  },
  {
    id: "boomplay",
    label: "Boomplay",
    lufs: -14,
    ceilingDb: -1.0,
    note: "Africa's biggest stage — treat it with the same −14 discipline as Spotify.",
  },
  {
    id: "club",
    label: "Club / DJ use",
    lufs: -7,
    ceilingDb: -0.3,
    note: "No normalization on the dancefloor — loud but clean wins; keep the dynamics alive.",
  },
];

export function getPlatform(id: string): PlatformTarget {
  return PLATFORM_TARGETS.find((p) => p.id === id) ?? PLATFORM_TARGETS[0];
}

export interface MasterReportLike {
  lufs_estimate: number | null;
  peak_db: number | null;
  dynamic_range_db: number | null;
  stereo_width: number | null;
  detected_issues?: unknown;
}

export interface MasterCheck {
  id: string;
  label: string;
  verdict: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}

export interface MasterVerdict {
  status: "platform-ready" | "ready-with-notes" | "not-yet";
  checks: MasterCheck[];
  headline: string;
}

const LUFS_WINDOW = 1.0;   // ±1 LU around the target is on-target
const QUIET_MARGIN = 2.0;  // more than 2 LU under target = leaving loudness on the table

function issuesArr(detected: unknown): any[] {
  return Array.isArray(detected) ? (detected as any[]) : [];
}

function hasIssue(detected: unknown, id: string): boolean {
  return issuesArr(detected).some((i) => i?.id === id || i?.detector_id === id);
}

function criticalCount(detected: unknown): number {
  return issuesArr(detected).filter((i) => (i?.severity ?? "").toLowerCase() === "critical").length;
}

export function assessMaster(
  report: MasterReportLike,
  platform: PlatformTarget,
  opts: { drMin?: number; widthMin?: number; widthMax?: number } = {},
): MasterVerdict {
  const checks: MasterCheck[] = [];
  const drMin = opts.drMin ?? (platform.id === "club" ? 5 : 6);
  const widthMin = opts.widthMin ?? 0.2;
  const widthMax = opts.widthMax ?? 0.9;

  // 1) LUFS vs platform target.
  if (report.lufs_estimate != null) {
    const diff = report.lufs_estimate - platform.lufs;
    if (Math.abs(diff) <= LUFS_WINDOW) {
      checks.push({
        id: "loudness",
        label: "Loudness on target",
        verdict: "pass",
        detail: `${report.lufs_estimate.toFixed(1)} LUFS sits in the ${platform.label} window (${platform.lufs} ± 1).`,
      });
    } else if (diff > LUFS_WINDOW) {
      checks.push({
        id: "loudness",
        label: "Master is TOO HOT for this platform",
        verdict: "fail",
        detail: `${report.lufs_estimate.toFixed(1)} LUFS is ${diff.toFixed(1)} LU over the ${platform.label} target (${platform.lufs}). Streaming turns you down — and the codec can clip what the limiter passed.`,
        fix: "Trim the Fruity Limiter output gain down until integrated loudness reads on target. Loudness beyond the platform target buys nothing.",
      });
    } else if (diff < -QUIET_MARGIN) {
      checks.push({
        id: "quiet",
        label: "Quieter than the platform norm",
        verdict: "warn",
        detail: `${report.lufs_estimate.toFixed(1)} LUFS leaves ${Math.abs(diff).toFixed(1)} LU on the table vs ${platform.label} (${platform.lufs}).`,
        fix: "Push Fruity Limiter input gain in small moves; watch gain reduction stay around 1–3 dB on the loudest section so the dynamics survive.",
      });
    } else {
      checks.push({
        id: "loudness",
        label: "Loudness close enough",
        verdict: "pass",
        detail: `${report.lufs_estimate.toFixed(1)} LUFS is just under the ${platform.label} target (${platform.lufs}) — safe side of the window.`,
      });
    }
  }

  // 2) Peak ceiling.
  if (report.peak_db != null) {
    if (report.peak_db > platform.ceilingDb) {
      checks.push({
        id: "ceiling",
        label: "Peak breaks the ceiling",
        verdict: "fail",
        detail: `Peak ${report.peak_db.toFixed(2)} dBFS vs the ${platform.ceilingDb} dBTP discipline — encoders and DACs will distort this.`,
        fix: `Fruity Limiter on the master: true-peak mode ON, ceiling ${platform.ceilingDb} dBTP. Do NOT solve this with the master fader alone.`,
      });
    } else if (report.peak_db > platform.ceilingDb - 0.2) {
      checks.push({
        id: "ceiling",
        label: "Ceiling margin is thin",
        verdict: "warn",
        detail: `Peak ${report.peak_db.toFixed(2)} dBFS is within 0.2 dB of the ${platform.ceilingDb} ceiling — inter-sample peaks can sneak past.`,
        fix: "Give it another 0.3 dB of ceiling room in Fruity Limiter.",
      });
    } else {
      checks.push({
        id: "ceiling",
        label: "Ceiling discipline",
        verdict: "pass",
        detail: `Peak ${report.peak_db.toFixed(2)} dBFS respects the ${platform.ceilingDb} dBTP ceiling.`,
      });
    }
  }

  // 3) Inter-sample truth (from the analysis run's 4x-oversampled estimate).
  if (hasIssue(report.detected_issues, "intersample_hot")) {
    checks.push({
      id: "intersample",
      label: "Inter-sample peaks detected",
      verdict: "fail",
      detail: "The 4x-oversampled true-peak estimate exceeds −1.0 dBTP even though sample-peak looks safe — DACs can clip on playback.",
      fix: "Fruity Limiter: enable true-peak mode, ceiling −1.0 dBTP, then re-check.",
    });
  }

  // 4) Dynamics alive.
  if (report.dynamic_range_db != null) {
    if (report.dynamic_range_db < drMin) {
      checks.push({
        id: "dynamics",
        label: "Dynamics squashed",
        verdict: "warn",
        detail: `Dynamic range ${report.dynamic_range_db.toFixed(1)} dB is under the ${drMin} dB floor — loudness won by choking the life out of it.`,
        fix: "Ease the limiter gain reduction back (aim 1–3 dB on the loudest part); if you need body, use Maximus gently before the limiter, not more limiter.",
      });
    } else {
      checks.push({
        id: "dynamics",
        label: "Dynamics alive",
        verdict: "pass",
        detail: `Dynamic range ${report.dynamic_range_db.toFixed(1)} dB — the groove still breathes.`,
      });
    }
  }

  // 5) Stereo sanity.
  if (report.stereo_width != null) {
    if (report.stereo_width < widthMin || report.stereo_width > widthMax) {
      checks.push({
        id: "width",
        label: "Stereo width needs attention",
        verdict: "warn",
        detail: `Stereo width ${report.stereo_width.toFixed(2)} is outside the sane window (${widthMin}–${widthMax}) — mono compatibility or a narrow master.`,
        fix: "Stereo Shaper on the master: keep everything under ~150 Hz mono, widen only the top end.",
      });
    } else {
      checks.push({
        id: "width",
        label: "Stereo field sane",
        verdict: "pass",
        detail: `Stereo width ${report.stereo_width.toFixed(2)} inside the window — safe on phones and club systems.`,
      });
    }
  }

  // 6) Zero-criticals law.
  const crits = criticalCount(report.detected_issues);
  if (crits > 0) {
    checks.push({
      id: "criticals",
      label: "Critical issues still open",
      verdict: "fail",
      detail: `${crits} critical issue${crits === 1 ? "" : "s"} detected on this bounce — a master never ships with open criticals.`,
      fix: "Resolve the criticals flagged in the Issues tab first (clipping, silence, DC), then re-bounce and re-check.",
    });
  }

  const fails = checks.filter((c) => c.verdict === "fail").length;
  const warns = checks.filter((c) => c.verdict === "warn").length;
  const status = fails > 0 ? "not-yet" : warns > 0 ? "ready-with-notes" : "platform-ready";
  const headline =
    status === "platform-ready"
      ? `PLATFORM-READY for ${platform.label} — ship it, champ. 👑`
      : status === "ready-with-notes"
        ? `READY with ${warns} note${warns === 1 ? "" : "s"} for ${platform.label} — shippable, but read the notes first.`
        : `NOT YET for ${platform.label} — ${fails} failing check${fails === 1 ? "" : "s"} to fix first.`;

  return { status, checks, headline };
}

/** One-shot prompt for the Ask-Sensei handoff (deterministic, zero AI to build). */
export function buildMasterAdvisePrompt(
  report: MasterReportLike,
  platform: PlatformTarget,
  verdict: MasterVerdict,
): string {
  const lines: string[] = [];
  lines.push(`MASTER CHECK — ${platform.label} (${report.lufs_estimate != null ? report.lufs_estimate.toFixed(1) + " LUFS" : "LUFS unmeasured"}, peak ${report.peak_db != null ? report.peak_db.toFixed(2) + " dBFS" : "unmeasured"}, DR ${report.dynamic_range_db != null ? report.dynamic_range_db.toFixed(1) + " dB" : "unmeasured"})`);
  lines.push(`Sensei verdict: ${verdict.headline}`);
  const open = verdict.checks.filter((c) => c.verdict !== "pass");
  if (open.length) {
    lines.push("Open checks:");
    for (const c of open) lines.push(`- (${c.verdict.toUpperCase()}) ${c.label}: ${c.detail}`);
  }
  lines.push("Coach me step by step in FL Studio (newest stock plugins first — Fruity Limiter / Maximus / Parametric EQ 2 / Stereo Shaper) to close every open check and make this master platform-ready.");
  return lines.join("\n");
}
