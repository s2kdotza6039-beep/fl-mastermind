import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { allStepsResolved } from "@/lib/loop-guard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RepairPlanStep {
  id: string;
  step_order: number;
  instruction: string;
  expected_delta: string | null;
  status: "todo" | "done" | "skipped";
}

interface Props {
  planId: string | null;
  steps: RepairPlanStep[];
  onChange?: (steps: RepairPlanStep[]) => void;
}

export function RepairPlanCard({ planId, steps, onChange }: Props) {
  const [local, setLocal] = useState<RepairPlanStep[]>(steps);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(step: RepairPlanStep, done: boolean) {
    setBusyId(step.id);
    const next: RepairPlanStep = {
      ...step,
      status: done ? "done" : "todo",
    };
    const optimistic = local.map((s) => (s.id === step.id ? next : s));
    setLocal(optimistic);
    const { error } = await supabase
      .from("plan_steps")
      .update({ status: next.status, completed_at: done ? new Date().toISOString() : null })
      .eq("id", step.id);
    setBusyId(null);
    if (error) {
      setLocal(local);
      toast.error("Could not update step");
      return;
    }
    onChange?.(optimistic);
  }

  if (!planId || local.length === 0) {
    return (
      <Card className="studio-card p-6 mb-6 text-center text-sm text-muted-foreground">
        No repair plan yet. Upload a track and Sensei will generate one.
      </Card>
    );
  }

  const done = local.filter((s) => s.status === "done").length;

  return (
    <Card className="studio-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Repair plan</div>
          <h3 className="font-display text-lg font-bold">Fix these in order</h3>
        </div>
        <Badge variant="outline">{done}/{local.length}</Badge>
      </div>
      <ol className="space-y-3">
        {local.map((s) => (
          <li key={s.id} className="flex items-start gap-3">
            <Checkbox
              checked={s.status === "done"}
              disabled={busyId === s.id}
              onCheckedChange={(v) => toggle(s, !!v)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className={`text-sm ${s.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                <span className="text-primary font-semibold mr-1">{s.step_order}.</span>
                {s.instruction}
              </div>
              {s.expected_delta && (
                <div className="text-[11px] text-muted-foreground mt-0.5">→ {s.expected_delta}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
