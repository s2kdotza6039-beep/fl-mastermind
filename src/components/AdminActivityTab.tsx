import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Loader2, RefreshCw, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogRow {
  id: string;
  user_id: string | null;
  event_type: string;
  metadata: any;
  created_at: string;
}

interface UserLike {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

type EventFilter = "all" | "plugin_inventory_imported" | "plugin_inventory_restored" | "plugin_inventory_saved" | "plugin_inventory_exported";

const PAGE_SIZE = 25;
const PRESETS: { label: string; days: number | null }[] = [
  { label: "All time", days: null },
  { label: "Last 24h", days: 1 },
  { label: "Last 7d", days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

export function AdminActivityTab({ users }: { users: UserLike[] }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filters
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [query, setQuery] = useState("");
  const [snapshotId, setSnapshotId] = useState("");
  const [userQuery, setUserQuery] = useState(""); // matches display name / email / id substring
  const [preset, setPreset] = useState<number>(0); // index in PRESETS
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>("");

  const userMap = useMemo(() => {
    const m = new Map<string, UserLike>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("activity_logs")
        .select("id, user_id, event_type, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (eventFilter !== "all") q = q.eq("event_type", eventFilter);

      const presetDays = PRESETS[preset]?.days ?? null;
      if (presetDays != null) {
        const since = new Date(Date.now() - presetDays * 24 * 3600 * 1000).toISOString();
        q = q.gte("created_at", since);
      } else {
        if (from) q = q.gte("created_at", new Date(from).toISOString());
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          q = q.lte("created_at", end.toISOString());
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      setRows((data as LogRow[]) ?? []);
      setPage(0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load activity.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch on filter changes that affect the server query.
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventFilter, preset, from, to]);

  // Client-side narrowing: snapshot id, user search, free-text query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const snap = snapshotId.trim().toLowerCase();
    const u = userQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (snap) {
        const id = String(r.metadata?.snapshot_id ?? "").toLowerCase();
        if (!id.includes(snap)) return false;
      }
      if (u) {
        const info = r.user_id ? userMap.get(r.user_id) : null;
        const blob = [
          r.user_id ?? "",
          info?.display_name ?? "",
          info?.email ?? "",
        ].join(" ").toLowerCase();
        if (!blob.includes(u)) return false;
      }
      if (q) {
        const blob = [
          r.event_type,
          r.user_id ?? "",
          JSON.stringify(r.metadata ?? {}),
        ].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, snapshotId, userQuery, userMap]);

  useEffect(() => {
    const max = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    if (page > max) setPage(max);
  }, [filtered.length, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCsv = () => {
    if (filtered.length === 0) return toast.error("No events match these filters.");
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "id","created_at","event_type","user_id","display_name","email",
      "snapshot_id","added","removed","skipped","duplicate","invalid",
      "rows_processed","source_file","inventory_completed","metadata_json",
    ].join(",") + "\n";
    const body = filtered.map((r) => {
      const m = r.metadata ?? {};
      const info = r.user_id ? userMap.get(r.user_id) : null;
      return [
        r.id, r.created_at, r.event_type,
        r.user_id ?? "",
        esc(info?.display_name ?? ""), esc(info?.email ?? ""),
        esc(m.snapshot_id ?? ""),
        m.added ?? "", m.removed ?? "",
        m.skipped ?? "", m.duplicate ?? "", m.invalid ?? "",
        m.rows_processed ?? "", esc(m.source_file ?? ""),
        m.inventory_completed ?? "",
        esc(JSON.stringify(m)),
      ].join(",");
    }).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-activity-${eventFilter}-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    // Best-effort audit of the export itself
    supabase.from("activity_logs").insert({
      user_id: null,
      event_type: "admin_activity_exported",
      metadata: { rows: filtered.length, event_filter: eventFilter, query, snapshot_id: snapshotId, user_query: userQuery, preset: PRESETS[preset]?.label, from, to },
    }).then(() => {}, () => {});
    toast.success(`Exported ${filtered.length} event${filtered.length === 1 ? "" : "s"}.`);
  };

  const clearAll = () => {
    setEventFilter("all"); setQuery(""); setSnapshotId(""); setUserQuery("");
    setPreset(0); setFrom(""); setTo("");
  };

  const renderMeta = (r: LogRow) => {
    const m = r.metadata ?? {};
    const chips: string[] = [];
    if (m.snapshot_id) chips.push(`snap=${String(m.snapshot_id).slice(0, 8)}`);
    if (m.added != null) chips.push(`+${m.added}`);
    if (m.removed != null) chips.push(`−${m.removed}`);
    if (m.duplicate != null) chips.push(`dup ${m.duplicate}`);
    if (m.invalid != null) chips.push(`bad ${m.invalid}`);
    if (m.skipped != null) chips.push(`skip ${m.skipped}`);
    if (m.source_file) chips.push(String(m.source_file));
    return chips.length > 0 ? chips.join(" · ") : JSON.stringify(m);
  };

  return (
    <Card className="studio-card p-4 mt-4 space-y-3">
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2">
        <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as EventFilter)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            <SelectItem value="plugin_inventory_imported">plugin_inventory_imported</SelectItem>
            <SelectItem value="plugin_inventory_restored">plugin_inventory_restored</SelectItem>
            <SelectItem value="plugin_inventory_saved">plugin_inventory_saved</SelectItem>
            <SelectItem value="plugin_inventory_exported">plugin_inventory_exported</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search metadata, event…" className="pl-9 h-9 text-xs" />
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="User: name, email, id…" className="pl-9 h-9 text-xs" />
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} placeholder="Snapshot id…" className="pl-9 h-9 text-xs" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Select value={String(preset)} onValueChange={(v) => { setPreset(parseInt(v, 10)); setFrom(""); setTo(""); }}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESETS.map((p, i) => <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">or custom:</span>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(0); }} className="h-8 text-xs w-36" />
        <span className="text-muted-foreground">→</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(0); }} className="h-8 text-xs w-36" />

        <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={clearAll}>
          <X className="w-3 h-3 mr-1" /> Clear
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Reload
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={exportCsv} disabled={loading || filtered.length === 0}>
          <Download className="w-3 h-3 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px]">{filtered.length} match{filtered.length === 1 ? "" : "es"}</Badge>
        {rows.length === 1000 && <span className="text-amber-500">Server cap of 1000 rows hit — narrow the date range for older events.</span>}
      </div>

      {error ? (
        <div className="p-4 text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded">
          {error} <button className="underline ml-2" onClick={load}>Retry</button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : pageItems.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No events match these filters.</p>
      ) : (
        <div className="max-h-[50vh] overflow-auto border border-border rounded">
          {pageItems.map((l) => {
            const info = l.user_id ? userMap.get(l.user_id) : null;
            const userLabel = info?.display_name || info?.email || l.user_id?.slice(0, 8) || "—";
            return (
              <div key={l.id} className="text-xs border-b border-border/40 px-3 py-2 grid grid-cols-12 gap-2">
                <span className="col-span-3 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                <span className="col-span-3 font-mono truncate" title={l.event_type}>{l.event_type}</span>
                <span className="col-span-2 truncate" title={info?.email ?? l.user_id ?? ""}>{userLabel}</span>
                <span className="col-span-4 truncate text-muted-foreground" title={JSON.stringify(l.metadata)}>{renderMeta(l)}</span>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="w-3 h-3" /> Prev
            </Button>
            <span className="px-1">Page {page + 1} / {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              Next <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
