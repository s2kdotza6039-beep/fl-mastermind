import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Info, Loader2, ArrowLeft } from "lucide-react";

interface Incident {
  id: string;
  title: string;
  body: string;
  severity: "info" | "minor" | "major" | "critical";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  started_at: string;
  resolved_at: string | null;
}

function sevTone(s: Incident["severity"]) {
  if (s === "critical") return "destructive" as const;
  if (s === "major") return "destructive" as const;
  if (s === "minor") return "secondary" as const;
  return "outline" as const;
}

export default function StatusPage() {
  const [rows, setRows] = useState<Incident[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("incidents")
        .select("id, title, body, severity, status, started_at, resolved_at")
        .order("started_at", { ascending: false })
        .limit(50);
      setRows((data as Incident[] | null) ?? []);
    })();
  }, []);

  const active = (rows ?? []).filter((r) => r.status !== "resolved");
  const past = (rows ?? []).filter((r) => r.status === "resolved");
  const allGreen = rows !== null && active.length === 0;

  return (
    <div className="container max-w-3xl py-10 px-4">
      <Link to="/" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> Studio Sensei Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Current operational status and recent incidents during beta. Maintained by the Studio Sensei team.
        </p>
      </header>

      {rows === null ? (
        <Card className="studio-card p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </Card>
      ) : (
        <>
          <Card
            className={`p-5 mb-6 border ${allGreen ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}
          >
            <div className="flex items-center gap-2">
              {allGreen ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
              <span className="font-semibold">
                {allGreen ? "All systems operational" : `${active.length} active incident${active.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </Card>

          {active.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display text-lg font-bold mb-3">Active</h2>
              <div className="space-y-2">
                {active.map((i) => <IncidentRow key={i.id} i={i} />)}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-display text-lg font-bold mb-3">History</h2>
            {past.length === 0 ? (
              <Card className="studio-card p-6 text-center text-sm text-muted-foreground">
                No past incidents recorded.
              </Card>
            ) : (
              <div className="space-y-2">
                {past.map((i) => <IncidentRow key={i.id} i={i} />)}
              </div>
            )}
          </section>
        </>
      )}

      <p className="text-[11px] text-muted-foreground/70 mt-10">
        This page is maintained by the Studio Sensei team to communicate beta outages and known issues.
        It is not an independent certification or uptime guarantee.
      </p>
    </div>
  );
}

function IncidentRow({ i }: { i: Incident }) {
  return (
    <Card className="studio-card p-4">
      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={sevTone(i.severity)} className="text-[10px] uppercase">{i.severity}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase">{i.status}</Badge>
          <span className="font-semibold text-sm">{i.title}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(i.started_at).toLocaleString()}
          {i.resolved_at && ` · resolved ${new Date(i.resolved_at).toLocaleString()}`}
        </span>
      </div>
      {i.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{i.body}</p>}
    </Card>
  );
}
