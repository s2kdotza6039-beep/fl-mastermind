// ============================================================================
// STUDIO SENSEI — COACHING RUNNER (R10.5)
// The coaching machinery, shared by the Upload page AND the in-chat Option Knob:
//   runCoachingLoop      — moved here from UploadPage (verbatim behavior)
//   persistAnalyzedUpload — insert report → same-beat DNA guard → version log →
//                           score/delta/issues/plan (foreign beats never score)
//   pickConfirmedPrev    — the reference for the guard is the last CONFIRMED
//                          bounce; flagged-and-not-overridden reports are skipped
//   buildUploadAdvisePrompt — deterministic "tell me what improved" message
// Zero AI except the final chat message the user chooses to send.
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { addTrackVersion, touchLastOpened } from "@/lib/project-memory";
import {
  computeMixScore, detectIssues, reconcileIssues, buildPlanFromIssues, computeDelta,
  type AudioReportLike, type GenreTarget, type StoredIssue,
} from "@/lib/coaching-loop";
import { assessContinuation, flagIssue, isFlaggedForeign, isOverridden } from "@/lib/loop-guard";
import type { AudioAnalysisResult } from "@/lib/audio-analysis";

/** Map an analysis result onto the DNA anchors the guard compares. */
export function anchorFromResult(res: AudioAnalysisResult): {
  bpm: number | null;
  detected_key: string | null;
  duration_sec: number | null;
} {
  return {
    bpm: res.metrics.bpm,
    detected_key: res.metrics.detectedKey,
    duration_sec: res.metrics.durationSec,
  };
}

interface ReportRowLite {
  id: string;
  file_name?: string | null;
  bpm?: number | null;
  detected_key?: string | null;
  duration_sec?: number | null;
  detected_issues?: unknown;
}

/**
 * The guard's reference = the newest report that is NOT the inserted one and is
 * NOT an un-rejected foreign beat. An overridden foreign beat counts as confirmed
 * (the producer vouched for it — it's part of the song's story now).
 */
export function pickConfirmedPrev<T extends ReportRowLite>(reports: T[], excludeId: string): T | null {
  return (
    reports.find(
      (r) => r.id !== excludeId && !(isFlaggedForeign(r.detected_issues) && !isOverridden(r.detected_issues)),
    ) ?? null
  );
}

export interface PersistOutcome {
  kind: "coached" | "foreign";
  reportId: string | null;
  versionId: string | null;
  reasons: string[];
  prevFileName: string | null;
  error?: string;
  loopError?: string;
  linkError?: string;
  /** R12 — the continuation story from the coaching loop (confirmed bounces only). */
  story?: ContinuationStory;
}

/**
 * Persist a freshly-analyzed bounce and run the full loop — the SAME behavior the
 * Upload page has today, now callable from any surface (chat included):
 *   1. insert the report (always — truth is sacred)
 *   2. same-beat guard vs the last CONFIRMED report (foreign → flag marker, no score)
 *   3. activate the report as the session (skipped while foreign)
 *   4. log the track version + back-link + last-opened (project memory)
 *   5. run the coaching loop (skipped while foreign — scores stay clean)
 * Callers map the outcome to their own UI (holds / toasts / advise sends).
 */
export async function persistAnalyzedUpload(args: {
  userId: string;
  activeProject: { id: string; genre: string | null } | null;
  res: AudioAnalysisResult;
  setActiveReport?: (id: string) => Promise<unknown>;
}): Promise<PersistOutcome> {
  const { userId, activeProject, res, setActiveReport } = args;
  const out: PersistOutcome = {
    kind: "coached",
    reportId: null,
    versionId: null,
    reasons: [],
    prevFileName: null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("audio_analysis_reports")
    .insert({
      user_id: userId,
      project_id: activeProject?.id ?? null,
      file_name: res.metrics.fileName,
      file_format: res.metrics.fileFormat,
      file_size_bytes: res.metrics.fileSizeBytes,
      duration_sec: res.metrics.durationSec,
      sample_rate: res.metrics.sampleRate,
      bit_rate: res.metrics.bitRate,
      channels: res.metrics.channels,
      peak_db: res.metrics.peakDb,
      rms_db: res.metrics.rmsDb,
      lufs_estimate: res.metrics.lufsEstimate,
      dynamic_range_db: res.metrics.dynamicRangeDb,
      stereo_width: res.metrics.stereoWidth,
      bpm: res.metrics.bpm,
      detected_key: res.metrics.detectedKey,
      tonal_flatness: res.metrics.tonalFlatness,
      band_low_db: res.metrics.bands.low,
      band_lowmid_db: res.metrics.bands.lowMid,
      band_mid_db: res.metrics.bands.mid,
      band_highmid_db: res.metrics.bands.highMid,
      band_high_db: res.metrics.bands.high,
      detected_issues: res.issues as unknown as any,
      recommendations: res.recommendations as unknown as any,
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !inserted?.id) {
    out.error = insertErr?.message ?? "insert returned no row";
    return out;
  }
  out.reportId = inserted.id;

  // ── SAME-BEAT GUARD (R9.7) — exactly as the Upload page applies it, with the
  // confirmed-reference refinement: un-rejected foreign beats never become the
  // yardstick for the next correct bounce.
  let prevReport: ReportRowLite | null = null;
  if (activeProject) {
    const { data: recent } = await supabase
      .from("audio_analysis_reports")
      .select("id, file_name, bpm, detected_key, duration_sec, detected_issues")
      .eq("project_id", activeProject.id)
      .order("created_at", { ascending: false })
      .limit(5);
    prevReport = pickConfirmedPrev((recent ?? []) as ReportRowLite[], inserted.id);
  }
  const verdict = activeProject && prevReport
    ? assessContinuation(prevReport, anchorFromResult(res))
    : { verdict: "first" as const, points: 0, reasons: [] as string[] };
  const foreign = verdict.verdict === "mismatch";
  out.reasons = verdict.reasons;
  out.prevFileName = prevReport?.file_name ?? null;

  if (foreign) {
    out.kind = "foreign";
    await supabase
      .from("audio_analysis_reports")
      .update({ detected_issues: [...(res.issues as any[]), flagIssue(prevReport?.file_name ?? null, verdict)] as any })
      .eq("id", inserted.id);
  } else if (setActiveReport) {
    // Auto-activate this report as the coaching session (never while foreign).
    await setActiveReport(inserted.id);
  }

  // Project Memory + coaching loop (mirror of the Upload page's order).
  if (activeProject) {
    try {
      const version = await addTrackVersion(userId, activeProject.id, {
        file_name: res.metrics.fileName,
        audio_report_id: inserted.id,
      });
      await supabase
        .from("audio_analysis_reports")
        .update({ track_version_id: version.id })
        .eq("id", inserted.id);
      await touchLastOpened(activeProject.id, {
        trackVersionId: version.id,
        audioReportId: inserted.id,
      });
      out.versionId = version.id;

      if (!foreign) {
        try {
          out.story = await runCoachingLoop(userId, activeProject.id, activeProject.genre, inserted.id, version.id, res);
        } catch (loopErr: any) {
          out.loopError = loopErr?.message ?? String(loopErr);
        }
      }
    } catch (e: any) {
      out.linkError = e?.message ?? String(e);
    }
  }

  return out;
}

/**
 * R12 — what the loop learned this round, so Sensei can continue the story
 * instead of starting over on every bounce.
 */
export interface ContinuationStory {
  versionNumber: number;
  score: number;
  prevScore: number | null;
  delta: number | null;
  masterReady: boolean;
  resolvedThisRound: string[];
  regressedThisRound: string[];
  stillOpen: string[];
  nextFix: string | null;
}

/** Deterministic "Sensei, tell me what improved" message after a bounce. */
export function buildUploadAdvisePrompt(
  fileName: string,
  res: AudioAnalysisResult,
  story?: ContinuationStory | null,
): string {
  const m = res.metrics;
  const lufs = m.lufsEstimate != null ? `${m.lufsEstimate.toFixed(1)} LUFS` : "LUFS unmeasured";
  const bpm = m.bpm != null ? `${Math.round(m.bpm)} BPM` : "BPM unknown";
  const key = m.detectedKey ?? "key unknown";
  const peak = m.peakDb != null ? `${m.peakDb.toFixed(1)} dBFS` : "peak unmeasured";
  const head = `I just uploaded "${fileName}" for you to hear (${lufs}, ${bpm}, ${key}, ${peak}).`;

  if (!story) {
    return `${head} Tell me what improved, what's still off, and my next fix in FL Studio — newest stock plugins first.`;
  }

  const lines: string[] = [head];
  if (story.versionNumber > 1) {
    lines.push(`This is re-bounce v${story.versionNumber} — continue from where we left off.`);
  } else {
    lines.push(`This is my first bounce for this song — start the coaching chapter.`);
  }

  const deltaTxt =
    story.prevScore != null && story.delta != null
      ? ` (was ${story.prevScore}, ${story.delta >= 0 ? `up ${story.delta}` : `down ${Math.abs(story.delta)}`} points)`
      : "";
  lines.push(`Mix score: ${story.score}/100${deltaTxt}.`);

  if (story.resolvedThisRound.length) {
    lines.push(`✅ Fixed since last bounce: ${story.resolvedThisRound.join("; ")}.`);
  }
  if (story.regressedThisRound.length) {
    lines.push(`⚠️ Came back: ${story.regressedThisRound.join("; ")}.`);
  }
  if (story.nextFix) {
    lines.push(`🔧 Give me the SINGLE next fix first: ${story.nextFix}`);
  }
  if (story.stillOpen.length) {
    lines.push(`Still open after that: ${story.stillOpen.join("; ")}.`);
  }
  if (story.masterReady) {
    lines.push(`🏁 The mixing chapter is done — next is the Mastering chapter (/mastering).`);
  }
  lines.push(`Answer with exact FL Studio steps — newest stock plugins first.`);
  return lines.join("\n");
}


/**
 * Score a confirmed bounce and update the whole coaching surface:
 * mix score + delta, issue reconciliation, fresh repair plan.
 * (Moved verbatim from UploadPage — single source of truth now.)
 */
export async function runCoachingLoop(
  userId: string,
  projectId: string,
  projectGenre: string | null,
  audioReportId: string,
  trackVersionId: string,
  res: AudioAnalysisResult,
): Promise<ContinuationStory> {
  // 1. Load genre target (fallback: Pop).
  const wanted = (projectGenre ?? "").trim().toLowerCase();
  const { data: allTargets, error: gErr } = await supabase
    .from("genre_target_profiles")
    .select("*");
  if (gErr || !allTargets || allTargets.length === 0) throw new Error("Genre targets unavailable");
  const match = allTargets.find((t: any) => (t.genre ?? "").toLowerCase() === wanted);
  const fallback = allTargets.find((t: any) => (t.genre ?? "").toLowerCase() === "pop");
  const target = ((match ?? fallback) as unknown) as GenreTarget;

  // 2. Build audio report snapshot for math.
  const snapshot: AudioReportLike = {
    id: audioReportId,
    file_name: res.metrics.fileName,
    peak_db: res.metrics.peakDb,
    lufs_estimate: res.metrics.lufsEstimate,
    dynamic_range_db: res.metrics.dynamicRangeDb,
    stereo_width: res.metrics.stereoWidth,
    band_low_db: res.metrics.bands.low,
    band_lowmid_db: res.metrics.bands.lowMid,
    band_mid_db: res.metrics.bands.mid,
    band_highmid_db: res.metrics.bands.highMid,
    band_high_db: res.metrics.bands.high,
    detected_issues: res.issues,
  };

  // 3. Fetch previous score to compute delta.
  const { data: prevScores } = await supabase
    .from("project_scores")
    .select("id, audio_report_id, created_at, mix_score")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  let deltaBreakdown: Record<string, unknown> | undefined = undefined;
  const prevScore = prevScores?.[0];
  if (prevScore?.audio_report_id) {
    const { data: prevReport } = await supabase
      .from("audio_analysis_reports")
      .select("peak_db, lufs_estimate, dynamic_range_db, stereo_width, band_low_db, band_lowmid_db, band_mid_db, band_highmid_db, band_high_db")
      .eq("id", prevScore.audio_report_id)
      .maybeSingle();
    if (prevReport) {
      deltaBreakdown = { delta: computeDelta(prevReport as AudioReportLike, snapshot, target) };
    }
  }

  // 3b. Which bounce is this? (count of scored rounds so far + this one)
  const { count: priorRounds } = await supabase
    .from("project_scores")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  // 4. Score.
  const scored = computeMixScore(snapshot, target);
  const breakdown = { ...scored.breakdown, ...(deltaBreakdown ?? {}) };
  await supabase.from("project_scores").insert({
    user_id: userId,
    project_id: projectId,
    audio_report_id: audioReportId,
    track_version_id: trackVersionId,
    mix_score: scored.score,
    breakdown: breakdown as any,
    master_ready: scored.master_ready,
  });

  // 5. Detect + reconcile issues.
  const detected = detectIssues(snapshot, target);
  const { data: existingRows } = await supabase
    .from("project_issues")
    .select("*")
    .eq("project_id", projectId);
  const existing: StoredIssue[] = (existingRows ?? []).map((r: any) => ({
    id: r.id,
    detector_id: r.detector_id,
    severity: r.severity,
    title: r.title,
    detail: r.detail,
    metrics: r.metrics,
    status: r.status,
    first_seen_at: r.first_seen_at,
    last_seen_at: r.last_seen_at,
    resolved_at: r.resolved_at,
  }));
  const reconciled = reconcileIssues(existing, detected);
  const priorById = new Map(existing.map((e) => [e.detector_id, e]));
  const resolvedThisRound = reconciled
    .filter((i) => i.status === "resolved" && priorById.get(i.detector_id)?.status !== "resolved")
    .map((i) => i.title);
  const regressedThisRound = reconciled.filter((i) => i.status === "regressed").map((i) => i.title);
  const stillOpen = reconciled.filter((i) => i.status !== "resolved").map((i) => i.title);
  for (const iss of reconciled) {
    const payload = {
      user_id: userId,
      project_id: projectId,
      audio_report_id: audioReportId,
      detector_id: iss.detector_id,
      severity: iss.severity,
      title: iss.title,
      detail: iss.detail ?? null,
      metrics: iss.metrics as any,
      status: iss.status,
      last_seen_at: iss.last_seen_at ?? new Date().toISOString(),
      resolved_at: iss.resolved_at ?? null,
    };
    await supabase
      .from("project_issues")
      .upsert(payload, { onConflict: "project_id,detector_id" });
  }

  // 6. Supersede active plans, create a new one from detected issues.
  await supabase
    .from("repair_plans")
    .update({ status: "superseded" })
    .eq("project_id", projectId)
    .eq("status", "active");

  let nextFix: string | null = null;
  if (detected.length > 0) {
    const { data: newPlan } = await supabase
      .from("repair_plans")
      .insert({
        user_id: userId,
        project_id: projectId,
        audio_report_id: audioReportId,
        status: "active",
      })
      .select("id")
      .single();
    if (newPlan?.id) {
      const drafts = buildPlanFromIssues(detected, snapshot, target);
      nextFix = drafts[0]?.instruction ?? null;
      if (drafts.length > 0) {
        await supabase.from("plan_steps").insert(
          drafts.map((d) => ({
            plan_id: newPlan.id,
            project_id: projectId,
            user_id: userId,
            step_order: d.step_order,
            instruction: d.instruction,
            detector_id: d.detector_id,
            expected_delta: d.expected_delta,
          })),
        );
      }
    }
  }

  const prevScoreValue = typeof prevScore?.mix_score === "number" ? prevScore.mix_score : null;
  return {
    versionNumber: (priorRounds ?? 0) + 1,
    score: scored.score,
    prevScore: prevScoreValue,
    delta: prevScoreValue != null ? scored.score - prevScoreValue : null,
    masterReady: scored.master_ready,
    resolvedThisRound,
    regressedThisRound,
    stillOpen,
    nextFix,
  };
}
