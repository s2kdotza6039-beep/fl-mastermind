import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/context/ProjectContext";
import { requestJourneyRefresh } from "@/lib/journey";
import { cn } from "@/lib/utils";

interface PlanStepRow {
  id: string;
  step_order: number;
  instruction: string;
  expected_delta: string | null;
  status: "todo" | "done" | "skipped";
}

export const PlanCard = () => {
  const { activeProject } = useProject();
  const [planId, setPlanId] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlanStepRow[]>([]);
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeProject?.id) {
      setPlanId(null);
      setSteps([]);
      return;
    }
    try {
      const { data: plan } = await supabase
        .from("repair_plans")
        .select("id")
        .eq("project_id", activeProject.id)
        .eq("status", "active")
        .maybeSingle();
      if (!plan?.id) {
        setPlanId(null);
        setSteps([]);
        return;
      }
      const { data: rows } = await supabase
        .from("plan_steps")
        .select("id, step_order, instruction, expected_delta, status")
        .eq("plan_id", plan.id)
        .order("step_order", { ascending: true });
      setPlanId(plan.id);
      setSteps((rows ?? []) as PlanStepRow[]);
    } catch {
      /* card is informational — never break chat */
    }
  }, [activeProject?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (step: PlanStepRow) => {
    if (busyId) return;
    const next = step.status === "done" ? "todo" : "done";
    setBusyId(step.id);
    // optimistic paint
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: next } : s)));
    const { error } = await supabase
      .from("plan_steps")
      .update({
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null,
      })
      .eq("id", step.id);
    if (error) {
      // revert on failure
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: step.status } : s)));
    } else {
      requestJourneyRefresh();
    }
    setBusyId(null);
  };

  if (!planId || steps.length === 0) return null;
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-primary/5 transition-colors"
      >
        <ListChecks className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold">Repair plan</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {done}/{steps.length} done
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          {steps.map((step) => {
            const isDone = step.status === "done";
            return (
              <div key={step.id}>
                <button
                  type="button"
                  disabled={busyId === step.id}
                  onClick={() => toggle(step)}
                  className={cn(
                    "w-full text-left flex items-start gap-2.5 p-2 rounded-md transition-colors hover:bg-primary/5",
                    isDone && "bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center text-[10px]",
                      isDone ? "border-primary text-primary" : "border-border",
                    )}
                  >
                    {isDone && "✓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-xs",
                        isDone ? "line-through text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.step_order}. {step.instruction}
                    </span>
                    {step.expected_delta && (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        Goal: {step.expected_delta}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
