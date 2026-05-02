import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { Shield, Users, Activity, AlertTriangle, Crown, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";


interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
}
interface LogRow { id: string; user_id: string | null; event_type: string; metadata: any; created_at: string; }
interface AlertRow { id: string; user_id: string | null; severity: string; alert_type: string; message: string; resolved: boolean; created_at: string; }

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "paid" | "free" | "none">("all");

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "none") {
          if (u.roles.length > 0) return false;
        } else if (!u.roles.includes(roleFilter)) {
          return false;
        }
      }
      if (!q) return true;
      const name = (u.display_name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const id = u.user_id.toLowerCase();
      const roles = u.roles.join(" ").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q) || roles.includes(q);
    });
  }, [users, userQuery, roleFilter]);

  async function load() {
    setLoading(true);
    const [profilesQ, rolesQ, logsQ, alertsQ, emailsQ] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").limit(500),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("security_alerts").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("admin_list_user_emails"),
    ]);
    if (profilesQ.data && rolesQ.data) {
      const emailMap = new Map<string, string>();
      (emailsQ.data as Array<{ user_id: string; email: string | null }> | null)?.forEach((e) => {
        if (e.email) emailMap.set(e.user_id, e.email);
      });
      const map = new Map<string, UserRow>();
      profilesQ.data.forEach((p: any) =>
        map.set(p.user_id, {
          user_id: p.user_id,
          display_name: p.display_name,
          email: emailMap.get(p.user_id) ?? null,
          roles: [],
        }),
      );
      rolesQ.data.forEach((r: any) => {
        const row = map.get(r.user_id) || {
          user_id: r.user_id,
          display_name: null,
          email: emailMap.get(r.user_id) ?? null,
          roles: [],
        };
        row.roles.push(r.role);
        map.set(r.user_id, row);
      });
      setUsers(Array.from(map.values()));
    }
    if (logsQ.data) setLogs(logsQ.data as LogRow[]);
    if (alertsQ.data) setAlerts(alertsQ.data as AlertRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setRole(userId: string, role: "paid" | "free" | "admin", action: "add" | "remove") {
    if (action === "add") {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
    }
    toast.success("Updated");
    load();
  }

  async function resolveAlert(id: string) {
    await supabase.from("security_alerts").update({ resolved: true }).eq("id", id);
    load();
  }

  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="container max-w-7xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Admin"
        title="Studio Sensei Admin"
        description="Manage users, roles, activity and security alerts."
        icon={<Shield className="w-6 h-6" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Users" value={users.length} icon={<Users className="w-4 h-4" />} />
        <Stat label="Paid" value={users.filter(u => u.roles.includes("paid")).length} icon={<Crown className="w-4 h-4" />} />
        <Stat label="Activity (100)" value={logs.length} icon={<Activity className="w-4 h-4" />} />
        <Stat label="Open Alerts" value={unresolved} icon={<AlertTriangle className="w-4 h-4" />} highlight={unresolved > 0} />
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="alerts">Alerts {unresolved > 0 && <Badge variant="destructive" className="ml-2">{unresolved}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="studio-card p-4 mt-4">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search users by name, ID, or role…"
                aria-label="Search users"
                maxLength={100}
                className="pl-9 pr-9"
              />
              {userQuery && (
                <button
                  type="button"
                  onClick={() => setUserQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <div className="space-y-2">
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No users match "{userQuery}".
                  </p>
                )}
                {filteredUsers.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between gap-3 p-3 rounded border border-border">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.display_name || u.user_id.slice(0, 8)}</div>
                      {u.email && (
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      )}
                      <div className="flex gap-1 mt-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant={r === "admin" ? "default" : r === "paid" ? "secondary" : "outline"}>{r}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {u.user_id !== user?.id && (
                        <>
                          {u.roles.includes("paid") ? (
                            <Button size="sm" variant="outline" onClick={() => setRole(u.user_id, "paid", "remove")}>Remove Paid</Button>
                          ) : (
                            <Button size="sm" onClick={() => setRole(u.user_id, "paid", "add")}>Make Paid</Button>
                          )}
                          {u.roles.includes("admin") ? (
                            <Button size="sm" variant="outline" onClick={() => setRole(u.user_id, "admin", "remove")}>Remove Admin</Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => setRole(u.user_id, "admin", "add")}>Make Admin</Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card className="studio-card p-4 mt-4 max-h-[60vh] overflow-auto">
            {logs.map((l) => (
              <div key={l.id} className="text-xs border-b border-border/40 py-2 grid grid-cols-12 gap-2">
                <span className="col-span-3 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                <span className="col-span-2 font-mono">{l.event_type}</span>
                <span className="col-span-3 truncate text-muted-foreground">{l.user_id?.slice(0, 8) || "—"}</span>
                <span className="col-span-4 truncate">{JSON.stringify(l.metadata)}</span>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="studio-card p-4 mt-4 max-h-[60vh] overflow-auto space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className={`p-3 rounded border ${a.resolved ? "border-border/40 opacity-60" : "border-destructive/40 bg-destructive/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.severity === "critical" || a.severity === "high" ? "destructive" : "secondary"}>{a.severity}</Badge>
                    <span className="text-sm font-medium">{a.alert_type}</span>
                  </div>
                  {!a.resolved && <Button size="sm" variant="outline" onClick={() => resolveAlert(a.id)}>Resolve</Button>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.message}</p>
                <div className="text-[10px] text-muted-foreground/60 mt-1">{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No alerts. All quiet.</p>}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={`studio-card p-4 ${highlight ? "border-destructive/50" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="text-primary/70">{icon}</span>
      </div>
      <div className={`text-xl font-bold ${highlight ? "text-destructive" : "text-foreground"}`}>{value}</div>
    </Card>
  );
}
