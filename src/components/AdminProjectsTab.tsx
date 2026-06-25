import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  genre: string | null;
  status: string;
  last_activity_at: string;
  created_at: string;
}

interface Stats {
  totalProjects: number;
  activeUsers: number;
  totalAdvice: number;
  totalCompleted: number;
  adviceCompletionRate: number;
  mostActive: Array<{ user_id: string; count: number }>;
}

export const AdminProjectsTab = () => {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pq, aq] = await Promise.all([
        supabase.from("projects").select("id, user_id, name, genre, status, last_activity_at, created_at").order("last_activity_at", { ascending: false }).limit(500),
        supabase.from("project_advice").select("user_id, status").limit(5000),
      ]);
      const proj = (pq.data ?? []) as ProjectRow[];
      const adv = (aq.data ?? []) as Array<{ user_id: string; status: string }>;
      setProjects(proj);

      const completed = adv.filter((a) => a.status === "applied" || a.status === "resolved").length;
      const counts: Record<string, number> = {};
      proj.forEach((p) => { counts[p.user_id] = (counts[p.user_id] ?? 0) + 1; });
      const mostActive = Object.entries(counts).map(([user_id, count]) => ({ user_id, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10);

      setStats({
        totalProjects: proj.length,
        activeUsers: new Set(proj.map((p) => p.user_id)).size,
        totalAdvice: adv.length,
        totalCompleted: completed,
        adviceCompletionRate: adv.length === 0 ? 0 : Math.round((completed / adv.length) * 100),
        mostActive,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loader2 className="w-5 h-5 animate-spin mt-4" />;

  return (
    <div className="mt-4 space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MiniStat label="Projects" value={stats.totalProjects} />
          <MiniStat label="Active users" value={stats.activeUsers} />
          <MiniStat label="Advice items" value={stats.totalAdvice} />
          <MiniStat label="Completed" value={stats.totalCompleted} />
          <MiniStat label="Completion rate" value={`${stats.adviceCompletionRate}%`} />
        </div>
      )}

      <Card className="studio-card p-4">
        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary" /> Most active producers
        </h4>
        <div className="space-y-1">
          {stats?.mostActive.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between text-xs p-2 rounded border border-border">
              <span className="font-mono truncate">{m.user_id.slice(0, 8)}…</span>
              <Badge variant="secondary">{m.count} project{m.count === 1 ? "" : "s"}</Badge>
            </div>
          ))}
          {(!stats || stats.mostActive.length === 0) && (
            <p className="text-xs text-muted-foreground">No projects yet.</p>
          )}
        </div>
      </Card>

      <Card className="studio-card p-4 max-h-[60vh] overflow-auto">
        <h4 className="font-semibold text-sm mb-3">All projects ({projects.length})</h4>
        <div className="space-y-1">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border text-xs">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{p.user_id.slice(0, 8)}… · {p.genre ?? "no genre"}</div>
              </div>
              <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
              <span className="text-[10px] text-muted-foreground">{new Date(p.last_activity_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

const MiniStat = ({ label, value }: { label: string; value: number | string }) => (
  <Card className="studio-card p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-lg font-bold text-foreground">{value}</div>
  </Card>
);
