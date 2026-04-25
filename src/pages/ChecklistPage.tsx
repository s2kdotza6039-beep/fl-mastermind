import { PageHeader } from "@/components/PageHeader";
import { useSession } from "@/context/SessionContext";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ListChecks, RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChecklistPage() {
  const { checklist, toggleChecklist, resetChecklist, progress } = useSession();
  const done = checklist.filter((c) => c.done).length;

  return (
    <div className="container max-w-3xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Track Your Session"
        title="Session Checklist"
        description="Stay disciplined. Move from idea to international standard, one box at a time."
        icon={<ListChecks className="w-6 h-6" />}
        action={
          <Button variant="outline" onClick={resetChecklist}>
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
            onClick={() => toggleChecklist(item.id)}
            className={cn(
              "studio-card p-4 cursor-pointer flex items-center gap-4 transition-all hover:border-primary/40",
              item.done && "border-primary/30 bg-gradient-gold-soft",
            )}
          >
            <div className="text-xs font-mono text-muted-foreground/60 w-6">{String(idx + 1).padStart(2, "0")}</div>
            <Checkbox checked={item.done} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />
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
