import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";

interface Run {
  id: string;
  ran_at: string;
  purged_count: number;
  source: string;
  triggered_by: string | null;
}

export function AdminPurgeAuditTab() {
  const [rows, setRows] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("audio_purge_runs")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(200);
    setRows((data as Run[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runPurge() {
    setBusy(true);
    const { data, error } = await supabase.rpc("purge_deleted_audio_reports");
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Purged ${data ?? 0} report${data === 1 ? "" : "s"}`);
    load();
  }

  const total = rows.reduce((sum, r) => sum + r.purged_count, 0);

  return (
    <Card className="studio-card p-4 mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Audio Purge Audit</h3>
          <Badge variant="outline" className="text-[10px]">{rows.length} runs</Badge>
          <Badge variant="secondary" className="text-[10px]">{total} purged</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={runPurge} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Run purge now
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Soft-deleted audio reports are permanently removed after 7 days. Each call to the purge routine
        records a row here showing how many reports were deleted.
      </p>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No purge runs recorded yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[60vh] overflow-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant={r.purged_count > 0 ? "default" : "outline"} className="text-[10px]">
                  {r.purged_count} purged
                </Badge>
                <span className="text-muted-foreground truncate">{r.source}</span>
              </div>
              <span className="text-[10px] text-muted-foreground/70">
                {new Date(r.ran_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
