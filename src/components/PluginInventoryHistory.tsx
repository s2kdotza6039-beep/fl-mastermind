import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Undo2, ChevronDown, ChevronUp, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

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
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Search by date, plugin name, 'create', 'update', 'complete'…"
              className="pl-9 h-8 text-xs"
            />
          </div>

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
