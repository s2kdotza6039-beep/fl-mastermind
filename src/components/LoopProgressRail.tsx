import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import type { LoopState } from "@/lib/coaching-loop";

const STEPS: { key: LoopState[]; label: string }[] = [
  { key: ["UPLOADED"], label: "Upload" },
  { key: ["ANALYZED"], label: "Analyze" },
  { key: ["PLAN_READY"], label: "Plan" },
  { key: ["COACHING"], label: "Fix" },
  { key: ["AWAITING_REUPLOAD", "DELTA_MEASURED"], label: "Verify" },
  { key: ["MASTER_READY"], label: "Master" },
];

const ORDER: LoopState[] = ["UPLOADED", "ANALYZED", "PLAN_READY", "COACHING", "AWAITING_REUPLOAD", "DELTA_MEASURED", "MASTER_READY"];

export function LoopProgressRail({ state }: { state: LoopState }) {
  const idx = ORDER.indexOf(state);
  return (
    <div className="w-full mb-6">
      <div className="flex items-center justify-between gap-1 md:gap-3">
        {STEPS.map((s, i) => {
          const stepIdx = ORDER.indexOf(s.key[0]);
          const isCurrent = s.key.includes(state);
          const isDone = !isCurrent && stepIdx < idx;
          const isFuture = !isCurrent && stepIdx > idx;
          const Icon = isDone ? CheckCircle2 : isCurrent ? Loader2 : Circle;
          return (
            <div key={s.label} className="flex-1 flex items-center gap-1 md:gap-2 min-w-0">
              <div
                className={[
                  "flex items-center justify-center rounded-full w-7 h-7 md:w-8 md:h-8 border shrink-0",
                  isCurrent && "bg-gradient-gold border-transparent glow-gold text-primary-foreground",
                  isDone && "bg-primary/20 border-primary/40 text-primary",
                  isFuture && "bg-muted/30 border-border text-muted-foreground",
                ].filter(Boolean).join(" ")}
              >
                <Icon className={`w-4 h-4 ${isCurrent ? "animate-spin" : ""}`} />
              </div>
              <div className="min-w-0">
                <div className={`text-[10px] uppercase tracking-widest ${isFuture ? "text-muted-foreground/60" : isCurrent ? "text-gold" : "text-muted-foreground"}`}>Step {i + 1}</div>
                <div className={`text-xs font-semibold truncate ${isCurrent ? "text-gold" : isFuture ? "text-muted-foreground/70" : "text-foreground"}`}>{s.label}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`hidden md:block flex-1 h-px ${isDone ? "bg-primary/60" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
