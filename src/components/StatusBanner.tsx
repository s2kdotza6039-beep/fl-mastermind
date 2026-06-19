import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Incident {
  id: string;
  title: string;
  severity: "info" | "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
}

const DISMISS_KEY = "sensei:dismissedIncidents";

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"); } catch { return []; }
}

export function StatusBanner() {
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("incidents")
        .select("id, title, severity, status")
        .neq("status", "resolved")
        .order("started_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const top = (data?.[0] as Incident | undefined) ?? null;
      if (!top) return setIncident(null);
      if (getDismissed().includes(top.id)) return setIncident(null);
      setIncident(top);
    }
    load();
    const i = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  if (!incident) return null;

  const isCritical = incident.severity === "critical" || incident.severity === "major";
  const Icon = isCritical ? AlertTriangle : Info;
  const tone = isCritical
    ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
    : "border-amber-500/40 bg-amber-500/5 text-amber-200";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-md border p-3 text-sm flex items-start gap-2 ${tone}`}
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold uppercase text-[10px] tracking-widest mr-2">
          {incident.severity} · {incident.status}
        </span>
        <span className="font-medium">{incident.title}</span>{" "}
        <Link to="/status" className="underline opacity-90 hover:opacity-100">View status</Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss incident banner"
        onClick={() => {
          const list = Array.from(new Set([...getDismissed(), incident.id]));
          localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
          setIncident(null);
        }}
        className="p-1 rounded hover:bg-background/30"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
