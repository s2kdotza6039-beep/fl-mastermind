// ============================================================================
// STUDIO SENSEI — PUBLISH CHAPTER (R11) — deterministic, zero AI.
// The final chapter: the Mixing chapter's master-ready stamp, the Mastering
// desk's verdict (reused, never re-implemented), release metadata, and the
// export doctrine — one checklist that must read clean before the song meets
// the world. Computed from rows Sensei already measured; no new tables.
// ============================================================================

import { assessMaster, getPlatform, type MasterReportLike, type MasterVerdict, type PlatformTarget } from "@/lib/mastering";

export interface ReleaseGate {
  id: string;
  label: string;
  verdict: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}

export interface ReleasePlan {
  platform: PlatformTarget;
  gates: ReleaseGate[];
  fails: number;
  warns: number;
  ready: boolean; // no failing gates — shippable (notes may remain)
  clean: boolean; // every gate passes outright
  headline: string;
  master: MasterVerdict | null;
}

export interface ReleaseInputs {
  report: MasterReportLike | null;
  masterReady: boolean; // the Mixing chapter's stamp (project_scores.master_ready)
  mixScore: number | null;
  platformId: string;
  projectName?: string | null;
  genre?: string | null;
  genreOpts?: { drMin?: number; widthMin?: number; widthMax?: number };
}

const MIX_SCORE_FLOOR = 80; // belt doctrine: 80+ is a true pass; under it the stamp carries a note

export function buildReleasePlan(inp: ReleaseInputs): ReleasePlan {
  const platform = getPlatform(inp.platformId);
  const gates: ReleaseGate[] = [];

  // 1) Sensei must have HEARD it — nothing ships unheard.
  if (!inp.report) {
    gates.push({
      id: "analyzed",
      label: "No bounce analyzed",
      verdict: "fail",
      detail: "Sensei has not heard a bounce on this project yet — nothing ships unheard.",
      fix: "Upload the final master bounce on the Upload page (or the 📎 knob in chat), then come back.",
    });
  } else {
    gates.push({
      id: "analyzed",
      label: "Latest bounce heard",
      verdict: "pass",
      detail: "The newest confirmed bounce is on record — the gates are measured from it.",
    });
  }

  // 2) The Mixing chapter's stamp.
  if (!inp.masterReady) {
    gates.push({
      id: "scored",
      label: "Mix chapter not complete",
      verdict: "fail",
      detail: "No master-ready stamp on record — the belt only advances on a mix Sensei scored past the bar.",
      fix: "Run the mixing loop until the score crosses the bar and the Master desk lights up.",
    });
  } else if (inp.mixScore != null && inp.mixScore < MIX_SCORE_FLOOR) {
    gates.push({
      id: "scored",
      label: "Mix score under the belt bar",
      verdict: "warn",
      detail: `Latest mix score ${inp.mixScore}/100 is under the ${MIX_SCORE_FLOOR} bar the belt doctrine expects — stamped, but Sensei heard room to grow.`,
      fix: "Optional: one more mix pass on the weakest band before you lock this release.",
    });
  } else {
    gates.push({
      id: "scored",
      label: "Mix chapter complete",
      verdict: "pass",
      detail: inp.mixScore != null ? `Stamped master-ready with a ${inp.mixScore}/100 mix score.` : "Stamped master-ready.",
    });
  }

  // 3) The Mastering desk's verdict — reuse the desk, never re-implement it.
  let master: MasterVerdict | null = null;
  if (inp.report) {
    master = assessMaster(inp.report, platform, inp.genreOpts ?? {});
    for (const c of master.checks) {
      gates.push({ id: c.id, label: c.label, verdict: c.verdict, detail: c.detail, fix: c.fix });
    }
  }

  // 4) Release identity — stores read the metadata before they read the music.
  const name = (inp.projectName ?? "").trim();
  const genre = (inp.genre ?? "").trim();
  if (name && genre) {
    gates.push({
      id: "metadata",
      label: "Release identity set",
      verdict: "pass",
      detail: `"${name}" (${genre}) — clean metadata travels; blank metadata gets buried.`,
    });
  } else {
    gates.push({
      id: "metadata",
      label: "Release identity incomplete",
      verdict: "warn",
      detail: `Missing ${!name && !genre ? "title and genre" : !name ? "title" : "genre"} — distributors reject blank metadata, and search buries it.`,
      fix: "Set the project name and genre on the Projects page before distribution.",
    });
  }

  const fails = gates.filter((g) => g.verdict === "fail").length;
  const warns = gates.filter((g) => g.verdict === "warn").length;
  const ready = fails === 0;
  const clean = ready && warns === 0;
  const headline = clean
    ? `RELEASE-READY for ${platform.label} — every gate open, ship it champ. 🏁`
    : ready
      ? `READY WITH NOTES for ${platform.label} — shippable, but read the ${warns} note${warns === 1 ? "" : "s"} first.`
      : `NOT RELEASE-READY for ${platform.label} — ${fails} gate${fails === 1 ? "" : "s"} still closed.`;

  return { platform, gates, fails, warns, ready, clean, headline, master };
}

/** One-shot prompt for the Ask-Sensei handoff (deterministic, zero AI to build). */
export function buildReleaseAdvisePrompt(plan: ReleasePlan, report: MasterReportLike | null): string {
  const lines: string[] = [];
  lines.push(
    `RELEASE READINESS — ${plan.platform.label} (${
      report?.lufs_estimate != null ? report.lufs_estimate.toFixed(1) + " LUFS" : "LUFS unmeasured"
    }, peak ${report?.peak_db != null ? report.peak_db.toFixed(2) + " dBFS" : "unmeasured"})`,
  );
  lines.push(`Sensei verdict: ${plan.headline}`);
  const open = plan.gates.filter((g) => g.verdict !== "pass");
  if (open.length) {
    lines.push("Open gates:");
    for (const g of open) lines.push(`- (${g.verdict.toUpperCase()}) ${g.label}: ${g.detail}`);
  } else {
    lines.push("Every gate passes — this one is ready for the world.");
  }
  lines.push(
    `Walk me to release one step at a time: first close any open gates in FL Studio (newest stock plugins first — Fruity Limiter / Maximus / Parametric EQ 2 / Stereo Shaper), then the final export doctrine: File → Export → Wave, 24-bit, 44.1 kHz, true-peak ceiling ${plan.platform.ceilingDb} dBTP (if I say "show me export wav", walk that procedure), then metadata and the distributor door (DistroKid / TuneCore / AWAL — and Boomplay matters at home).`,
  );
  return lines.join("\n");
}
