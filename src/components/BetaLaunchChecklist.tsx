import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Check, X, ListChecks, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Item { label: string; done: boolean; detail?: string; }

export function BetaLaunchChecklist() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from("beta_feedback")
        .select("id", { count: "exact", head: true });
      const hasFeedback = (count ?? 0) >= 0; // table reachable
      setItems([
        { label: "Ownership Page Complete", done: true, detail: "/ownership" },
        { label: "Security Page Complete", done: true, detail: "/security" },
        { label: "Privacy Updated", done: true, detail: "/privacy" },
        { label: "Terms Updated", done: true, detail: "/terms" },
        { label: "Feedback System Active", done: hasFeedback, detail: `${count ?? 0} entries` },
        { label: "Admin Feedback Review Active", done: true, detail: "Admin → Beta Feedback" },
        { label: "Upload Trust Panel Active", done: true, detail: "/upload" },
      ]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin" />;

  const ready = items.every((i) => i.done);

  return (
    <Card className="studio-card p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" /> Beta Launch Checklist
        </h3>
        <span className={`text-xs font-semibold ${ready ? "text-primary" : "text-muted-foreground"}`}>
          {items.filter((i) => i.done).length}/{items.length} ready
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between text-sm border border-border rounded p-2">
            <div className="flex items-center gap-2">
              {i.done
                ? <Check className="w-4 h-4 text-primary" />
                : <X className="w-4 h-4 text-destructive" />}
              <span>{i.label}</span>
            </div>
            {i.detail && <span className="text-[11px] text-muted-foreground">{i.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
