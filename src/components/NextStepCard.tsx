import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { deriveLoopState, type LoopState, type PlanStepStatus, type StoredIssue } from "@/lib/coaching-loop";

const LABELS: Record<LoopState, { label: string; instruction: string }> = {
  UPLOADED: { label: "Upload", instruction: "Upload a track to get your first score." },
  ANALYZED: { label: "Analyzed", instruction: "Review your mix score and detected issues." },
  PLAN_READY: { label: "Plan ready", instruction: "Start working through your repair plan." },
  COACHING: { label: "Coaching", instruction: "Keep checking off steps as you fix your mix." },
  AWAITING_REUPLOAD: { label: "Awaiting re-upload", instruction: "You've done the steps — re-upload to verify improvements." },
  DELTA_MEASURED: { label: "Delta measured", instruction: "Review the improvement and continue toward master-ready." },
  MASTER_READY: { label: "Master ready", instruction: "Your mix meets targets — head to mastering." },
};

export const NextStepCard = () => {
  const { activeProject } = useProject();
  const [state, setState] = useState<LoopState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!activeProject) { setState(null); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const projectId = activeProject.id;
      const [scoreRes, issuesRes, planRes] = await Promise.all([
        supabase.from("project_scores").select("master_ready, breakdown").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("project_issues").select("id, detector_id, severity, title, metrics, status, first_seen_at, last_seen_at").eq("project_id", projectId).in("status", ["open", "fixing"]),
        supabase.from("repair_plans").select("id, status").eq("project_id", projectId).eq("status", "active").maybeSingle(),
      ]);
      let steps: { status: PlanStepStatus }[] = [];
      if (planRes.data?.id) {
        const stepsRes = await supabase.from("plan_steps").select("status").eq("plan_id", planRes.data.id);
        steps = (stepsRes.data ?? []) as { status: PlanStepStatus }[];
      }
      if (cancelled) return;
      if (!scoreRes.data) { setState(null); setLoading(false); return; }
      const loop = deriveLoopState({
        hasProject: true,
        hasAnalysis: true,
        latestScore: scoreRes.data as any,
        issues: (issuesRes.data ?? []) as StoredIssue[],
        plan: planRes.data as any,
        steps,
      });
      setState(loop);
      setLoading(false);
    })().catch(() => { if (!cancelled) { setState(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeProject?.id]);

  if (!activeProject || loading || !state) return null;
  const { label, instruction } = LABELS[state];
  const rebounce = state === "AWAITING_REUPLOAD";
  const to = rebounce ? "/upload" : "/mixing";
  const cta = rebounce ? "Upload new bounce" : "Continue coaching";

  return (
    <Card className="studio-card-gold p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0">
          <Compass className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Next step</div>
          <h3 className="font-display text-lg font-bold text-gold">{label}</h3>
          <p className="text-xs text-muted-foreground">{instruction}</p>
        </div>
      </div>
      <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90 flex-shrink-0">
        <Link to={to}>{cta} <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
      </Button>
    </Card>
  );
};
