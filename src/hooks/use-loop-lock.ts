import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deriveLoopState, type LoopState, type PlanStepStatus, type StoredIssue } from "@/lib/coaching-loop";
import { assessContinuation, isFlaggedForeign, isOverridden } from "@/lib/loop-guard";

export type LockKind = "rebounce" | "foreign" | null;

export interface LoopLock {
  loop: LoopState | null;
  /** Precedence: "foreign" (wrong beat) > "rebounce" (awaiting new bounce) > null. */
  lockKind: LockKind;
  reasons: string[];
  prevFileName: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * R9.7 — the single source of truth for "may Sensei keep chatting right now?"
 * - AWAITING_REUPLOAD locks the composer until a new bounce lands (Sensei never
 *   coaches from stale info — continuation is CONFIRMED by hearing the beat).
 * - A foreign newest upload locks it until the correct bounce / an override.
 * Zero AI. Pure queries + the tested loop-guard math.
 */
export function useLoopLock(projectId: string | null): LoopLock {
  const [loop, setLoop] = useState<LoopState | null>(null);
  const [lockKind, setLockKind] = useState<LockKind>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [prevFileName, setPrevFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setLoop(null);
      setLockKind(null);
      setReasons([]);
      setPrevFileName(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [scoreRes, issuesRes, planRes, reportsRes] = await Promise.all([
        supabase.from("project_scores").select("master_ready, breakdown").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("project_issues").select("id, detector_id, severity, title, metrics, status, first_seen_at, last_seen_at").eq("project_id", projectId).in("status", ["open", "fixing"]),
        supabase.from("repair_plans").select("id, status").eq("project_id", projectId).eq("status", "active").maybeSingle(),
        supabase.from("audio_analysis_reports")
          .select("id, file_name, bpm, detected_key, duration_sec, detected_issues")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(2),
      ]);
      let steps: { status: PlanStepStatus }[] = [];
      if (planRes.data?.id) {
        const stepsRes = await supabase.from("plan_steps").select("status").eq("plan_id", planRes.data.id);
        steps = (stepsRes.data ?? []) as { status: PlanStepStatus }[];
      }
      if (cancelled) return;

      // 1) SAME-BEAT GUARD — newest report flagged foreign and not overridden.
      const reports = (reportsRes.data ?? []) as any[];
      const latest = reports[0] ?? null;
      const prev = reports[1] ?? null;
      if (latest && isFlaggedForeign(latest.detected_issues) && !isOverridden(latest.detected_issues)) {
        const v = assessContinuation(prev ?? null, {
          bpm: latest.bpm,
          detected_key: latest.detected_key,
          duration_sec: latest.duration_sec,
        });
        setLoop(null);
        setLockKind("foreign");
        setReasons(v.reasons.length ? v.reasons : ["Song DNA changed."]);
        setPrevFileName(prev?.file_name ?? null);
        setLoading(false);
        return;
      }

      // 2) Classic loop state — AWAITING_REUPLOAD locks until the new bounce.
      if (!scoreRes.data) {
        setLoop(null);
        setLockKind(null);
        setReasons([]);
        setPrevFileName(null);
        setLoading(false);
        return;
      }
      const state = deriveLoopState({
        hasProject: true,
        hasAnalysis: true,
        latestScore: scoreRes.data as any,
        issues: (issuesRes.data ?? []) as StoredIssue[],
        plan: planRes.data as any,
        steps,
      });
      setLoop(state);
      setLockKind(state === "AWAITING_REUPLOAD" ? "rebounce" : null);
      setReasons([]);
      setPrevFileName(null);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setLoop(null);
        setLockKind(null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [projectId, nonce]);

  // Returning to this tab (after uploading elsewhere) re-checks automatically.
  useEffect(() => {
    const onFocus = () => setNonce((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return { loop, lockKind, reasons, prevFileName, loading, refresh };
}
