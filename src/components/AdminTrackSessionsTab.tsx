import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Music2 } from "lucide-react";

interface SessionRow {
  id: string;
  user_id: string;
  track_name: string | null;
  created_at: string;
  updated_at: string;
  audio_analysis_report_id: string;
  report?: {
    file_name: string;
    detected_key: string | null;
    bpm: number | null;
    detected_issues: any;
    created_at: string;
  } | null;
  user_email?: string | null;
}

export const AdminTrackSessionsTab = () => {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sessions } = await supabase
        .from("user_active_track_session")
        .select("*")
        .order("updated_at", { ascending: false });
      const list = (sessions ?? []) as SessionRow[];

      const reportIds = list.map((r) => r.audio_analysis_report_id);
      const { data: reports } = reportIds.length
        ? await supabase
            .from("audio_analysis_reports")
            .select("id, file_name, detected_key, bpm, detected_issues, created_at")
            .in("id", reportIds)
        : { data: [] as any[] };
      const reportMap = new Map((reports ?? []).map((r: any) => [r.id, r]));

      const { data: emails } = await supabase.rpc("admin_list_user_emails");
      const emailMap = new Map((emails ?? []).map((e: any) => [e.user_id, e.email]));

      setRows(
        list.map((r) => ({
          ...r,
          report: reportMap.get(r.audio_analysis_report_id) ?? null,
          user_email: emailMap.get(r.user_id) ?? null,
        })),
      );
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading active track sessions…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="studio-card p-8 text-center">
        <Music2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No active track sessions yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const issues = Array.isArray(r.report?.detected_issues) ? r.report!.detected_issues.length : 0;
        return (
          <Card key={r.id} className="studio-card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{r.user_email ?? r.user_id}</div>
                <div className="font-semibold text-sm">
                  {r.track_name ?? r.report?.file_name ?? "(unknown track)"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Selected {new Date(r.updated_at).toLocaleString()} · Analyzed{" "}
                  {r.report?.created_at ? new Date(r.report.created_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  Key · {r.report?.detected_key ?? "—"}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  BPM · {r.report?.bpm ?? "—"}
                </Badge>
                <Badge variant={issues > 0 ? "destructive" : "secondary"} className="text-[10px]">
                  {issues} issue{issues === 1 ? "" : "s"}
                </Badge>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
