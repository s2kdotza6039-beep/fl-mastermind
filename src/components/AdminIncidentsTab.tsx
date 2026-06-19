import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Severity = "info" | "minor" | "major" | "critical";
type Status = "investigating" | "identified" | "monitoring" | "resolved";

interface Incident {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  status: Status;
  started_at: string;
  resolved_at: string | null;
}

export function AdminIncidentsTab() {
  const [rows, setRows] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<Severity>("minor");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("incidents")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);
    setRows((data as Incident[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    const { error } = await supabase.from("incidents").insert({
      title: title.trim(), body: body.trim(), severity, status: "investigating",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTitle(""); setBody(""); setSeverity("minor");
    toast.success("Incident posted");
    load();
  }

  async function update(id: string, patch: Partial<Incident>) {
    const payload: any = { ...patch };
    if (patch.status === "resolved" && !patch.resolved_at) payload.resolved_at = new Date().toISOString();
    if (patch.status && patch.status !== "resolved") payload.resolved_at = null;
    const { error } = await supabase.from("incidents").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this incident? This cannot be undone.")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Card className="studio-card p-4 mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Status Page Incidents</h3>
        <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
      </div>

      <Card className="p-3 border-dashed">
        <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Post new incident</h4>
        <div className="space-y-2">
          <Input placeholder="Title (e.g. AI chat degraded)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <Textarea placeholder="What's happening, what users may see, ETA…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} />
          <div className="flex gap-2">
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={create} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Post
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No incidents recorded.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((i) => (
            <Card key={i.id} className="p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={i.severity === "critical" || i.severity === "major" ? "destructive" : i.severity === "minor" ? "secondary" : "outline"} className="text-[10px] uppercase">{i.severity}</Badge>
                  <span className="font-semibold text-sm truncate">{i.title}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <Select value={i.status} onValueChange={(v) => update(i.id, { status: v as Status })}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investigating">Investigating</SelectItem>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="monitoring">Monitoring</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" onClick={() => remove(i.id)} aria-label="Delete incident">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {i.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{i.body}</p>}
              <div className="text-[10px] text-muted-foreground/60 mt-1">
                Started {new Date(i.started_at).toLocaleString()}
                {i.resolved_at && ` · Resolved ${new Date(i.resolved_at).toLocaleString()}`}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
