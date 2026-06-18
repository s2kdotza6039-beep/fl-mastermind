import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Undo2, ChevronDown, ChevronUp, Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export interface HistorySnapshot {
  id: string;
  user_id: string;
  native_plugins: string[];
  third_party_plugins: string[];
  custom_plugins: string[];
  inventory_completed: boolean;
  change_type: "create" | "update";
  created_at: string;
}

interface CurrentState {
  native: string[];
  third: string[];
  custom: string[];
}

interface Props {
  onRestore: (snap: HistorySnapshot) => Promise<void> | void;
  reloadKey: number;
  current: CurrentState;
}

const PAGE_SIZE = 8;

const ciDiff = (current: string[], target: string[]) => {
  const cur = new Set(current.map((x) => x.toLowerCase()));
  const tar = new Set(target.map((x) => x.toLowerCase()));
  const added = target.filter((x) => !cur.has(x.toLowerCase()));
  const removed = current.filter((x) => !tar.has(x.toLowerCase()));
  return { added, removed };
};

export function PluginInventoryHistory({ onRestore, reloadKey, current }: Props) {
  const { user } = useAuth();
  const [snaps, setSnaps] = useState<HistorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingRestore, setPendingRestore] = useState<HistorySnapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_plugin_inventory_history" as any)
        .select("id, user_id, native_plugins, third_party_plugins, custom_plugins, inventory_completed, change_type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && data) setSnaps(data as unknown as HistorySnapshot[]);
      setLoading(false);
    })();
  }, [user, reloadKey]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Filter snapshots by date string, change type, completion state, or plugin name match.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return snaps;
    return snaps.filter((s) => {
      const date = new Date(s.created_at).toLocaleString().toLowerCase();
      if (date.includes(q)) return true;
      if (s.change_type.includes(q)) return true;
      if (q === "complete" && s.inventory_completed) return true;
      if (q === "incomplete" && !s.inventory_completed) return true;
      const all = [...s.native_plugins, ...s.third_party_plugins, ...s.custom_plugins];
      return all.some((p) => p.toLowerCase().includes(q));
    });
  }, [snaps, query]);

  // Clamp page when filter shrinks the list.
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Diff vs current edit state — only meaningful for non-current rows.
  const restoreDiff = useMemo(() => {
    if (!pendingRestore) return null;
    const native = ciDiff(current.native, pendingRestore.native_plugins);
    const third = ciDiff(current.third, pendingRestore.third_party_plugins);
    const custom = ciDiff(current.custom, pendingRestore.custom_plugins);
    const totalCurrent = current.native.length + current.third.length + current.custom.length;
    const totalTarget =
      pendingRestore.native_plugins.length +
      pendingRestore.third_party_plugins.length +
      pendingRestore.custom_plugins.length;
    return { native, third, custom, totalCurrent, totalTarget };
  }, [pendingRestore, current]);

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    await onRestore(pendingRestore);
    setRestoring(false);
    setPendingRestore(null);
  };

  const exportHistory = () => {
    const source = filtered;
    if (source.length === 0) {
      toast.error("No snapshots to export.");
      return;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      "snapshot_id","created_at","change_type","inventory_completed",
      "native_count","third_party_count","custom_count","total_count",
      "added_vs_previous","removed_vs_previous",
      "native_plugins","third_party_plugins","custom_plugins",
    ].join(",") + "\n";
    // Snapshots are newest-first; compare each row against the next (older) one for added/removed.
    const ordered = [...source].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const body = ordered.map((s, i) => {
      const prev = i > 0 ? ordered[i - 1] : null;
      const ciSetDiff = (cur: string[], tgt: string[]) => {
        const c = new Set(cur.map((x) => x.toLowerCase()));
        const t = new Set(tgt.map((x) => x.toLowerCase()));
        return {
          added: tgt.filter((x) => !c.has(x.toLowerCase())).length,
          removed: cur.filter((x) => !t.has(x.toLowerCase())).length,
        };
      };
      const dN = prev ? ciSetDiff(prev.native_plugins, s.native_plugins) : { added: s.native_plugins.length, removed: 0 };
      const dT = prev ? ciSetDiff(prev.third_party_plugins, s.third_party_plugins) : { added: s.third_party_plugins.length, removed: 0 };
      const dC = prev ? ciSetDiff(prev.custom_plugins, s.custom_plugins) : { added: s.custom_plugins.length, removed: 0 };
      const total = s.native_plugins.length + s.third_party_plugins.length + s.custom_plugins.length;
      return [
        s.id,
        s.created_at,
        s.change_type,
        s.inventory_completed,
        s.native_plugins.length,
        s.third_party_plugins.length,
        s.custom_plugins.length,
        total,
        dN.added + dT.added + dC.added,
        dN.removed + dT.removed + dC.removed,
        esc(s.native_plugins.join("; ")),
        esc(s.third_party_plugins.join("; ")),
        esc(s.custom_plugins.join("; ")),
      ].join(",");
    }).join("\n");

    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plugin-inventory-history-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${source.length} snapshot${source.length === 1 ? "" : "s"}.`);
  };

  return (
    <Card className="studio-card p-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
        aria-expanded={open}
      >
        <History className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <h2 className="font-display text-lg font-bold">Save history</h2>
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading snapshots…" : `${snaps.length} previous save${snaps.length === 1 ? "" : "s"} — search, paginate, and restore any prior state.`}
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder="Search by date, plugin name, 'create', 'update', 'complete'…"
                className="pl-9 h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={exportHistory}
              disabled={loading || filtered.length === 0}
              title="Download a CSV of these snapshots with per-row added/removed counts"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export history
            </Button>
          </div>

          <CompletenessChart
            snaps={filtered}
            onPointClick={(s, prev) => setPointDetail({ snap: s, prev })}
          />


          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {snaps.length === 0 ? "No history yet — saves will appear here." : "No snapshots match your search."}
            </p>
          ) : (
            <>
              <ol className="space-y-2">
                {pageItems.map((s) => {
                  // "current" badge tracks the most-recent snapshot from the original list, not the filtered page.
                  const isCurrent = s.id === snaps[0]?.id;
                  const isExp = expanded.has(s.id);
                  return (
                    <li key={s.id} className="border border-border rounded-md p-3 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{new Date(s.created_at).toLocaleString()}</span>
                        <Badge variant={s.change_type === "create" ? "default" : "secondary"} className="text-[10px]">
                          {s.change_type}
                        </Badge>
                        {isCurrent && <Badge variant="outline" className="text-[10px]">current</Badge>}
                        {s.inventory_completed && <Badge variant="outline" className="text-[10px]">complete</Badge>}
                        <span className="text-muted-foreground ml-auto">
                          {s.native_plugins.length} native · {s.third_party_plugins.length} third · {s.custom_plugins.length} custom
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => toggle(s.id)} className="text-[10px] text-primary hover:underline">
                          {isExp ? "Hide contents" : "Show contents"}
                        </button>
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] ml-auto"
                            onClick={() => setPendingRestore(s)}
                          >
                            <Undo2 className="w-3 h-3 mr-1" /> Restore
                          </Button>
                        )}
                      </div>
                      {isExp && (
                        <div className="mt-2 grid sm:grid-cols-3 gap-2">
                          {([
                            ["Native", s.native_plugins],
                            ["Third-party", s.third_party_plugins],
                            ["Custom", s.custom_plugins],
                          ] as const).map(([label, list]) => (
                            <div key={label}>
                              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label} ({list.length})</div>
                              {list.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground/60">—</p>
                              ) : (
                                <ul className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                                  {list.map((p) => <li key={p} className="truncate text-[11px]">· {p}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                <span>
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                  {query && ` (filtered from ${snaps.length})`}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </Button>
                  <span className="px-1">Page {page + 1} / {totalPages}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <AlertDialog open={!!pendingRestore} onOpenChange={(o) => { if (!o) setPendingRestore(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Snapshot from{" "}
              <strong>{pendingRestore ? new Date(pendingRestore.created_at).toLocaleString() : ""}</strong>.
              Your current state will also be saved to history, so this restore is undoable.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {restoreDiff && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded border border-border bg-muted/30">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Current</div>
                  <div className="font-medium">{restoreDiff.totalCurrent} plugin{restoreDiff.totalCurrent === 1 ? "" : "s"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">After restore</div>
                  <div className="font-medium">{restoreDiff.totalTarget} plugin{restoreDiff.totalTarget === 1 ? "" : "s"}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {([
                  ["Native", restoreDiff.native],
                  ["Third-party", restoreDiff.third],
                  ["Custom", restoreDiff.custom],
                ] as const).map(([label, d]) => (
                  <div key={label} className="border border-border rounded p-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
                    <div className="text-emerald-500 text-[11px]">
                      +{d.added.length} added{d.added.length > 0 && `: ${d.added.slice(0, 3).join(", ")}${d.added.length > 3 ? `, +${d.added.length - 3}` : ""}`}
                    </div>
                    <div className="text-destructive text-[11px]">
                      −{d.removed.length} removed{d.removed.length > 0 && `: ${d.removed.slice(0, 3).join(", ")}${d.removed.length > 3 ? `, +${d.removed.length - 3}` : ""}`}
                    </div>
                  </div>
                ))}
              </div>

              {restoreDiff.native.added.length + restoreDiff.native.removed.length +
                restoreDiff.third.added.length + restoreDiff.third.removed.length +
                restoreDiff.custom.added.length + restoreDiff.custom.removed.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic text-center">
                  No differences — restoring won't change your inventory.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmRestore(); }} disabled={restoring}>
              {restoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CompletenessChart({
  snaps,
  onPointClick,
}: {
  snaps: HistorySnapshot[];
  onPointClick?: (s: HistorySnapshot, prev: HistorySnapshot | null) => void;
}) {
  // Snapshots arrive newest-first; reverse so time runs left → right.
  const ordered = [...snaps].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  if (ordered.length < 2) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        Inventory trend chart appears once you have 2+ snapshots.
      </p>
    );
  }

  const W = 600, H = 90, P = 8;
  const totals = ordered.map(
    (s) => s.native_plugins.length + s.third_party_plugins.length + s.custom_plugins.length,
  );
  const maxTotal = Math.max(1, ...totals);
  const stepX = (W - P * 2) / Math.max(1, ordered.length - 1);
  const yFor = (v: number) => H - P - (v / maxTotal) * (H - P * 2);

  const pathD = ordered
    .map((_, i) => `${i === 0 ? "M" : "L"} ${P + i * stepX} ${yFor(totals[i])}`)
    .join(" ");
  const areaD = `${pathD} L ${P + (ordered.length - 1) * stepX} ${H - P} L ${P} ${H - P} Z`;

  const first = ordered[0], last = ordered[ordered.length - 1];
  const firstTotal = totals[0], lastTotal = totals[totals.length - 1];
  const delta = lastTotal - firstTotal;

  return (
    <div className="border border-border rounded-md p-3 bg-muted/10">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span className="uppercase tracking-widest">Plugin count over time {onPointClick && <span className="normal-case tracking-normal">· click a point for details</span>}</span>
        <span>
          {firstTotal} → {lastTotal}{" "}
          <span className={delta > 0 ? "text-emerald-500" : delta < 0 ? "text-destructive" : ""}>
            ({delta >= 0 ? "+" : ""}{delta})
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none" role="img" aria-label="Plugin count over time">
        <path d={areaD} fill="hsl(var(--primary) / 0.15)" />
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
        {ordered.map((s, i) => (
          <g key={s.id}>
            {/* Invisible larger hit target for easier clicking */}
            <circle
              cx={P + i * stepX}
              cy={yFor(totals[i])}
              r={8}
              fill="transparent"
              className={onPointClick ? "cursor-pointer" : undefined}
              onClick={onPointClick ? () => onPointClick(s, i > 0 ? ordered[i - 1] : null) : undefined}
            />
            <circle
              cx={P + i * stepX}
              cy={yFor(totals[i])}
              r={s.inventory_completed ? 2.5 : 1.5}
              fill={s.inventory_completed ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              pointerEvents="none"
            >
              <title>
                {new Date(s.created_at).toLocaleString()} — {totals[i]} plugins
                {s.inventory_completed ? " (complete)" : " (incomplete)"}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
        <span>{new Date(first.created_at).toLocaleDateString()}</span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" /> complete
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" /> draft
          </span>
        </span>
        <span>{new Date(last.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

