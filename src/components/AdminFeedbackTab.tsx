import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FeedbackRow {
  id: string;
  user_id: string;
  type: "bug" | "feature" | "general";
  rating: number | null;
  message: string;
  status: "open" | "in_progress" | "resolved";
  page_url: string | null;
  created_at: string;
}

interface UserLite { user_id: string; display_name: string | null; email: string | null; }

export function AdminFeedbackTab({ users }: { users: UserLite[] }) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackRow["status"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | FeedbackRow["type"]>("all");

  const userMap = useMemo(() => {
    const m = new Map<string, UserLite>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("beta_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data as FeedbackRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: FeedbackRow["status"]) {
    const { error } = await supabase.from("beta_feedback").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  const filtered = rows.filter(
    (r) => (statusFilter === "all" || r.status === statusFilter) && (typeFilter === "all" || r.type === typeFilter),
  );

  return (
    <Card className="studio-card p-4 mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Beta Feedback ({rows.length})</span>
        <div className="ml-auto flex gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No feedback matches your filters.</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-auto">
          {filtered.map((f) => {
            const u = userMap.get(f.user_id);
            return (
              <div key={f.id} className="p-3 rounded border border-border">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="outline" className="capitalize">{f.type}</Badge>
                  {f.rating && <span className="text-xs text-primary">{"★".repeat(f.rating)}</span>}
                  <span className="text-xs text-muted-foreground truncate">
                    {u?.display_name || u?.email || f.user_id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">{new Date(f.created_at).toLocaleString()}</span>
                  <div className="ml-auto">
                    <Select value={f.status} onValueChange={(v) => updateStatus(f.id, v as FeedbackRow["status"])}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{f.message}</p>
                {f.page_url && <div className="text-[10px] text-muted-foreground/60 mt-1 truncate">{f.page_url}</div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
