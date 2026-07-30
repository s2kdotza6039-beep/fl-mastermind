import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { useProject } from "@/context/ProjectContext";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListChecks, RotateCcw, Check, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "1", label: "Beat ready", done: false },
  { id: "2", label: "Vocals recorded", done: false },
  { id: "3", label: "Gain staging done", done: false },
  { id: "4", label: "EQ cleanup done", done: false },
  { id: "5", label: "Compression done", done: false },
  { id: "6", label: "Effects balanced", done: false },
  { id: "7", label: "Stereo space created", done: false },
  { id: "8", label: "Master ready", done: false },
];

function parseChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c: any) => c && typeof c.id === "string" && typeof c.label === "string")
    .map((c: any) => ({ id: c.id, label: c.label, done: !!c.done }));
}

export default function ChecklistPage() {
  const { activeProject } = useProject();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  const projectId = activeProject?.id ?? null;

  // Persist the full array on the active project (fire-and-forget).
  const persist = (items: ChecklistItem[]) => {
    if (!projectId) return;
    supabase
      .from("projects")
      .update({ checklist: items as any })
      .eq("id", projectId)
      .then(({ error }) => {
        if (error) toast.error("Could not save checklist");
      });
  };

  useEffect(() => {
    if (!activeProject) {
      setChecklist([]);
      return;
    }
    const stored = parseChecklist((activeProject as any).checklist);
    if (stored.length === 0) {
      setChecklist(DEFAULT_CHECKLIST);
      persist(DEFAULT_CHECKLIST);
    } else {
      setChecklist(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const done = checklist.filter((c) => c.done).length;
  const progress = useMemo(
    () => (checklist.length ? Math.round((done / checklist.length) * 100) : 0),
    [done, checklist.length],
  );

  const toggle = (id: string) => {
    const next = checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c));
    setChecklist(next);
    persist(next);
  };

  const reset = () => {
    const next = (checklist.length ? checklist : DEFAULT_CHECKLIST).map((c) => ({ ...c, done: false }));
    setChecklist(next);
    persist(next);
  };

  if (!activeProject) {
    return (
      <div className="container max-w-3xl py-8 px-4 md:px-8">
        <PageHeader
          eyebrow="Track Your Session"
          title="Session Checklist"
          description="Each project keeps its own checklist."
          icon={<ListChecks className="w-6 h-6" />}
        />
        <Card className="studio-card p-12 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No active project — select or create one to start your checklist.</p>
          <Button asChild>
            <Link to="/projects">Go to projects</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Track Your Session"
        title="Session Checklist"
        description="Stay disciplined. Move from idea to international standard, one box at a time."
        icon={<ListChecks className="w-6 h-6" />}
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
        }
      />

      <Card className="studio-card-gold p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Progress</div>
            <div className="font-display text-3xl font-bold text-gold">{done} / {checklist.length}</div>
          </div>
          <div className="text-5xl font-display font-bold text-gold tabular-nums">{progress}%</div>
        </div>
        <Progress value={progress} className="h-2" />
      </Card>

      <div className="space-y-2">
        {checklist.map((item, idx) => (
          <Card
            key={item.id}
            onClick={() => toggle(item.id)}
            className={cn(
              "studio-card p-4 cursor-pointer flex items-center gap-4 transition-all hover:border-primary/40",
              item.done && "border-primary/30 bg-gradient-gold-soft",
            )}
          >
            <div className="text-xs font-mono text-muted-foreground/60 w-6">{String(idx + 1).padStart(2, "0")}</div>
            <div className="pointer-events-none">
              <Checkbox checked={item.done} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />
            </div>
            <span className={cn("flex-1 font-medium", item.done && "text-primary line-through decoration-primary/40")}>
              {item.label}
            </span>
            {item.done && <Check className="w-4 h-4 text-primary" />}
          </Card>
        ))}
      </div>
    </div>
  );
}
