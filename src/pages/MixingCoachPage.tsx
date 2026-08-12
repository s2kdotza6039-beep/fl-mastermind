import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Volume2, RefreshCcw, AlertTriangle, AlertCircle, Info, Lightbulb } from "lucide-react";
import { mixingTip } from "@/lib/phase-guidance";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SenseiChat } from "@/components/SenseiChat";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";
import { LoopProgressRail } from "@/components/LoopProgressRail";
import { MixScoreCard } from "@/components/MixScoreCard";
import { RepairPlanCard, type RepairPlanStep } from "@/components/RepairPlanCard";
import { useProject } from "@/context/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { deriveLoopState, type LoopState, type StoredIssue, type ScoreBreakdown } from "@/lib/coaching-loop";
import { resolveGenreTarget } from "@/lib/genre-target";

interface LatestScore { mix_score: number; breakdown: ScoreBreakdown; master_ready: boolean; target_score: number }

export default function MixingCoachPage() {
  const { activeProject } = useProject();
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<LatestScore | null>(null);
  const [issues, setIssues] = useState<StoredIssue[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [steps, setSteps] = useState<RepairPlanStep[]>([]);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [targetScore, setTargetScore] = useState(85);
  const [genericTarget, setGenericTarget] = useState(false);

  useEffect(() => {
    if (!activeProject) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [scoreRes, issuesRes, planRes, targetRes, reportRes] = await Promise.all([
        supabase.from("project_scores").select("mix_score, breakdown, master_ready")
          .eq("project_id", activeProject.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("project_issues").select("*")
          .eq("project_id", activeProject.id).neq("status", "resolved").order("severity"),
        supabase.from("repair_plans").select("id").eq("project_id", activeProject.id)
          .eq("status", "active").order("created_at", { ascending: false }).limit(1),
        supabase.from("genre_target_profiles").select("target_score, genre"),
        supabase.from("audio_analysis_reports").select("id").eq("project_id", activeProject.id).limit(1),
      ]);

      const resolved = resolveGenreTarget((targetRes.data ?? []) as any[], activeProject.genre);
      const tScore = resolved.profile?.target_score ?? 85;
      setGenericTarget(resolved.generic);
      setTargetScore(tScore);

      if (scoreRes.data?.[0]) {
        setLatest({
          mix_score: scoreRes.data[0].mix_score,
          breakdown: scoreRes.data[0].breakdown as unknown as ScoreBreakdown,
          master_ready: scoreRes.data[0].master_ready,
          target_score: tScore,
        });
      } else {
        setLatest(null);
      }

      setIssues(((issuesRes.data ?? []) as any[]).map((r) => ({
        id: r.id, detector_id: r.detector_id, severity: r.severity, title: r.title,
        detail: r.detail, metrics: r.metrics, status: r.status,
      })));

      const pid = planRes.data?.[0]?.id ?? null;
      setPlanId(pid);
      if (pid) {
        const { data: stepData } = await supabase.from("plan_steps")
          .select("id, step_order, instruction, expected_delta, status")
          .eq("plan_id", pid).order("step_order");
        setSteps((stepData ?? []) as RepairPlanStep[]);
      } else {
        setSteps([]);
      }

      setHasAnalysis((reportRes.data?.length ?? 0) > 0);
      setLoading(false);
    })();
  }, [activeProject?.id]);

  const state: LoopState = deriveLoopState({
    hasProject: !!activeProject,
    hasAnalysis,
    latestScore: latest ? { master_ready: latest.master_ready, breakdown: latest.breakdown } : null,
    issues,
    plan: planId ? { status: "active" } : null,
    steps,
  });

  const openIssues = issues.filter((i) => i.status !== "resolved");

  return (
    <div className="container max-w-5xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Engineer the Sound"
        title="Mixing Coach"
        description="Score → plan → fix → verify. Sensei walks the loop with you."
        icon={<Volume2 className="w-6 h-6" />}
      />
      <ActiveTrackChip />
      <LoopProgressRail state={state} />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !activeProject ? (
        <Card className="studio-card p-8 text-center text-sm text-muted-foreground">
          Open a project first — the coaching loop tracks progress per project.
        </Card>
      ) : (
        <>
          <MixScoreCard
            score={latest?.mix_score ?? null}
            breakdown={latest?.breakdown ?? null}
            master_ready={latest?.master_ready ?? false}
            target_score={targetScore}
          />
          {genericTarget && (
            <div className="-mt-4 mb-6">
              <span className="text-[10px] text-muted-foreground/70">Generic targets — custom-genre mapping coming</span>
            </div>
          )}

          <Card className="studio-card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Open issues</div>
                <h3 className="font-display text-lg font-bold">{openIssues.length} to address</h3>
              </div>
              <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                <Link to="/upload?recheck=1"><RefreshCcw className="w-4 h-4 mr-2" /> ✅ I did it — re-check my mix</Link>
              </Button>
            </div>
            {openIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open issues. Upload a new bounce to re-verify.</p>
            ) : (
              <ul className="space-y-2">
                {openIssues.map((i) => {
                  const Icon = i.severity === "critical" ? AlertCircle : i.severity === "warn" ? AlertTriangle : Info;
                  const color = i.severity === "critical" ? "text-destructive" : i.severity === "warn" ? "text-amber-400" : "text-muted-foreground";
                  return (
                    <li key={i.detector_id} className="flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{i.title}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{i.severity}</Badge>
                        </div>
                        {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <RepairPlanCard planId={planId} steps={steps} onChange={setSteps} />

          <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">{mixingTip(activeProject?.genre)}</p>
          </div>
        </>
      )}

      <div className="mt-8">
        <SenseiChat key={activeProject?.id ?? "none"} />
      </div>
    </div>
  );
}
