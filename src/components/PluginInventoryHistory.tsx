import { useEffect, useState } from "react";
import { History, Loader2, Undo2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface Props {
  onRestore: (snap: HistorySnapshot) => Promise<void> | void;
  reloadKey: number;
}

export function PluginInventoryHistory({ onRestore, reloadKey }: Props) {
  const { user } = useAuth();
  const [snaps, setSnaps] = useState<HistorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingRestore, setPendingRestore] = useState<HistorySnapshot | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_plugin_inventory_history" as any)
        .select("id, user_id, native_plugins, third_party_plugins, custom_plugins, inventory_completed, change_type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
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
            {loading ? "Loading snapshots…" : `${snaps.length} previous save${snaps.length === 1 ? "" : "s"} — restore any prior state.`}
          </p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
          ) : snaps.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No history yet — saves will appear here.</p>
          ) : (
            <ol className="space-y-2">
              {snaps.map((s, idx) => {
                const total = s.native_plugins.length + s.third_party_plugins.length + s.custom_plugins.length;
                const isCurrent = idx === 0;
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
                    <div className="sr-only">Total {total} plugins</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      <AlertDialog open={!!pendingRestore} onOpenChange={(o) => { if (!o) setPendingRestore(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current plugin inventory with the snapshot from{" "}
              <strong>{pendingRestore ? new Date(pendingRestore.created_at).toLocaleString() : ""}</strong>.
              Your current state will also be added to history, so you can undo this restore.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
