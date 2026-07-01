import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Row {
  id: string;
  kind: string;
  surface: string | null;
  retry_after_sec: number | null;
  session_kind_count: number | null;
  created_at: string;
}

const SURFACES = [
  { value: "all", label: "All surfaces" },
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Sign up" },
  { value: "password_reset", label: "Password reset" },
  { value: "email_confirm", label: "Email confirmation" },
];

const WINDOWS = [
  { value: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function AdminAuthRateEventsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [surface, setSurface] = useState("all");
  const [windowKey, setWindowKey] = useState("24h");

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - (WINDOWS.find((w) => w.value === windowKey)?.ms ?? WINDOWS[1].ms)).toISOString();
    let q = supabase
      .from("auth_rate_events")
      .select("id,kind,surface,retry_after_sec,session_kind_count,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (surface !== "all") q = q.eq("surface", surface);
    const { data, error } = await q;
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, windowKey]);

  const counts = useMemo(() => {
    const byKind: Record<string, number> = {};
    const bySurface: Record<string, number> = {};
    for (const r of rows) {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      const s = r.surface || "unknown";
      bySurface[s] = (bySurface[s] || 0) + 1;
    }
    return { byKind, bySurface, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Surface</label>
          <Select value={surface} onValueChange={setSurface}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SURFACES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Window</label>
          <Select value={windowKey} onValueChange={setWindowKey}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
          Refresh
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">Total events: <span className="font-semibold text-foreground">{counts.total}</span></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">By event kind</h3>
          {Object.keys(counts.byKind).length === 0 ? (
            <p className="text-xs text-muted-foreground">No events in this window.</p>
          ) : (
            <ul className="space-y-1">
              {Object.entries(counts.byKind)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{k}</span>
                    <Badge variant="secondary">{n}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">By surface</h3>
          {Object.keys(counts.bySurface).length === 0 ? (
            <p className="text-xs text-muted-foreground">No events in this window.</p>
          ) : (
            <ul className="space-y-1">
              {Object.entries(counts.bySurface)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span>{k}</span>
                    <Badge variant="secondary">{n}</Badge>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Recent events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="py-1 pr-3">When</th>
                <th className="py-1 pr-3">Kind</th>
                <th className="py-1 pr-3">Surface</th>
                <th className="py-1 pr-3">Retry (s)</th>
                <th className="py-1 pr-3">Session #</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3 font-mono">{r.kind}</td>
                  <td className="py-1 pr-3">{r.surface ?? "—"}</td>
                  <td className="py-1 pr-3">{r.retry_after_sec ?? "—"}</td>
                  <td className="py-1 pr-3">{r.session_kind_count ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">No events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
