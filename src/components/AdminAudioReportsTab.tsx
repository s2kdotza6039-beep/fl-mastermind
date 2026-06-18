import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AudioLines } from "lucide-react";

interface AudioReportRow {
  id: string;
  user_id: string;
  file_name: string;
  detected_key: string | null;
  bpm: number | null;
  lufs_estimate: number | null;
  peak_db: number | null;
  detected_issues: any;
  created_at: string;
}

export function AdminAudioReportsTab() {
  const [rows, setRows] = useState<AudioReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [reportsQ, emailsQ] = await Promise.all([
        supabase
          .from("audio_analysis_reports")
          .select("id, user_id, file_name, detected_key, bpm, lufs_estimate, peak_db, detected_issues, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.rpc("admin_list_user_emails"),
      ]);
      setRows((reportsQ.data as AudioReportRow[]) ?? []);
      const map: Record<string, string> = {};
      (emailsQ.data as Array<{ user_id: string; email: string | null }> | null)?.forEach((e) => {
        if (e.email) map[e.user_id] = e.email;
      });
      setEmails(map);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card className="studio-card p-8 mt-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className="studio-card p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <AudioLines className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Audio Analysis Reports</h3>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No reports yet.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-2">User</th>
                <th className="text-left py-2 pr-2">File</th>
                <th className="text-left py-2 pr-2">Date</th>
                <th className="text-right py-2 pr-2">Issues</th>
                <th className="text-right py-2 pr-2">LUFS</th>
                <th className="text-right py-2 pr-2">Peak</th>
                <th className="text-left py-2 pr-2">Key</th>
                <th className="text-right py-2">BPM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const issueCount = Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
                return (
                  <tr key={r.id} className="border-b border-border/40">
                    <td className="py-2 pr-2 truncate max-w-[180px]" title={r.user_id}>
                      {emails[r.user_id] ?? r.user_id.slice(0, 8)}
                    </td>
                    <td className="py-2 pr-2 truncate max-w-[220px]" title={r.file_name}>{r.file_name}</td>
                    <td className="py-2 pr-2 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-2 text-right">
                      <Badge variant={issueCount > 0 ? "destructive" : "secondary"} className="text-[10px]">{issueCount}</Badge>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.lufs_estimate ?? "—"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{r.peak_db ?? "—"}</td>
                    <td className="py-2 pr-2">{r.detected_key ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.bpm ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
