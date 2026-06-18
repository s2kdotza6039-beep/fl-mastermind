import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert, RefreshCw, ExternalLink, Database, Plug, Globe, Bot } from "lucide-react";

export interface ScanFinding {
  id: string;
  level: "info" | "warn" | "error" | "critical";
  name: string;
  target?: string;
  target_type?: "table" | "function" | "route" | "edge_function" | "connector";
  status?: "open" | "fixed" | "accepted" | "ignored";
  note?: string;
  doc?: string;
}
interface ScanData {
  scanned_at: string;
  scanners: Record<string, { status: string; findings: ScanFinding[] }>;
}

const SCANNER_META: Record<string, { label: string; icon: any }> = {
  supabase: { label: "Supabase (DB)", icon: Database },
  supabase_lov: { label: "Supabase Lovable Review", icon: Database },
  connector_security_scan: { label: "Connector Scan (Wiz)", icon: Plug },
  trust_surface: { label: "Trust Surface", icon: Globe },
  agent_security: { label: "Agent Security", icon: Bot },
};

function levelVariant(l: ScanFinding["level"]) {
  if (l === "critical" || l === "error") return "destructive" as const;
  if (l === "warn") return "default" as const;
  return "secondary" as const;
}
function statusVariant(s?: ScanFinding["status"]) {
  if (s === "fixed") return "secondary" as const;
  if (s === "accepted" || s === "ignored") return "outline" as const;
  return "destructive" as const;
}

function targetHref(f: ScanFinding): string | null {
  if (!f.target) return null;
  if (f.target_type === "route") return f.target.startsWith("/") ? f.target : `/${f.target}`;
  return null;
}

export function SecurityIssuesPanel() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/security-scan.json?ts=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ScanData;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Failed to load scan results");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    if (!data) return { total: 0, open: 0, fixed: 0, accepted: 0, highOpen: 0 };
    let total = 0,
      open = 0,
      fixed = 0,
      accepted = 0,
      highOpen = 0;
    for (const s of Object.values(data.scanners)) {
      for (const f of s.findings) {
        total++;
        if (f.status === "fixed") fixed++;
        else if (f.status === "accepted" || f.status === "ignored") accepted++;
        else {
          open++;
          if (f.level === "error" || f.level === "critical") highOpen++;
        }
      }
    }
    return { total, open, fixed, accepted, highOpen };
  }, [data]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {summary.highOpen > 0 ? (
              <ShieldAlert className="h-6 w-6 text-destructive" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
            )}
            <div>
              <div className="font-semibold">Security scan snapshot</div>
              <div className="text-xs text-muted-foreground">
                {data ? `Last scanned: ${new Date(data.scanned_at).toLocaleString()}` : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Total {summary.total}</Badge>
            <Badge variant="destructive">Open {summary.open}</Badge>
            <Badge variant="secondary">Fixed {summary.fixed}</Badge>
            <Badge variant="outline">Accepted {summary.accepted}</Badge>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>
        {err && <div className="mt-3 text-xs text-destructive">Error: {err}</div>}
      </Card>

      {data &&
        Object.entries(data.scanners).map(([key, scanner]) => {
          const meta = SCANNER_META[key] || { label: key, icon: ShieldCheck };
          const Icon = meta.icon;
          return (
            <Card key={key} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">{meta.label}</h3>
                  <Badge variant="outline" className="text-xs">
                    {scanner.findings.length} finding{scanner.findings.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Badge variant={scanner.status === "success" ? "secondary" : "destructive"} className="text-xs">
                  {scanner.status}
                </Badge>
              </div>
              {scanner.findings.length === 0 ? (
                <div className="text-xs text-muted-foreground">No issues detected.</div>
              ) : (
                <ul className="space-y-2">
                  {scanner.findings.map((f, i) => {
                    const href = targetHref(f);
                    return (
                      <li key={`${f.id}-${i}`} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={levelVariant(f.level)} className="text-[10px] uppercase">
                                {f.level}
                              </Badge>
                              <Badge variant={statusVariant(f.status)} className="text-[10px] uppercase">
                                {f.status || "open"}
                              </Badge>
                              <span className="font-medium text-sm">{f.name}</span>
                            </div>
                            {f.target && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {f.target_type || "target"}:{" "}
                                {href ? (
                                  <a className="underline hover:text-foreground" href={href}>
                                    {f.target}
                                  </a>
                                ) : (
                                  <code className="font-mono">{f.target}</code>
                                )}
                              </div>
                            )}
                            {f.note && <div className="text-xs text-muted-foreground mt-1">{f.note}</div>}
                          </div>
                          {f.doc && (
                            <a
                              href={f.doc}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            >
                              Docs <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}

      <Card className="p-4 text-xs text-muted-foreground">
        Snapshot is generated from <code>public/security-scan.json</code> and updated by the security pipeline. CI gate
        (<code>.github/workflows/security-gate.yml</code>) fails deployments when new high/critical findings appear.
      </Card>
    </div>
  );
}
