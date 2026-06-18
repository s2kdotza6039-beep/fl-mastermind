import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { Shield, Users, Activity, AlertTriangle, Crown, Loader2, Search, X, Sliders, Download } from "lucide-react";
import { toast } from "sonner";
import { editionToTier, tierLabel, eligiblePlugins, forbiddenPlugins, type FlEditionTier } from "@/lib/fl-plugin-eligibility";


interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
}
interface LogRow { id: string; user_id: string | null; event_type: string; metadata: any; created_at: string; }
interface AlertRow { id: string; user_id: string | null; severity: string; alert_type: string; message: string; resolved: boolean; created_at: string; }
interface SetupRow {
  user_id: string;
  fl_version: string | null;
  fl_edition: string | null;
  main_use: string | null;
  main_genre: string | null;
  skill_level: string | null;
  setup_completed: boolean;
  updated_at: string;
}
interface InventoryRow {
  user_id: string;
  native_plugins: string[];
  third_party_plugins: string[];
  custom_plugins: string[];
  inventory_completed: boolean;
  updated_at: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [setups, setSetups] = useState<SetupRow[]>([]);
  const [inventories, setInventories] = useState<InventoryRow[]>([]);
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
    const [profilesQ, rolesQ, logsQ, alertsQ, emailsQ, setupsQ, invQ] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").limit(500),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("security_alerts").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("admin_list_user_emails"),
      supabase.from("user_studio_setup").select("user_id, fl_version, fl_edition, main_use, main_genre, skill_level, setup_completed, updated_at").limit(500),
      supabase.from("user_plugin_inventory").select("user_id, native_plugins, third_party_plugins, custom_plugins, inventory_completed, updated_at").limit(500),
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
    if (setupsQ.data) setSetups(setupsQ.data as SetupRow[]);
    if (invQ.data) setInventories(invQ.data as InventoryRow[]);
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
          <TabsTrigger value="setups">FL Setups</TabsTrigger>
          <TabsTrigger value="inventories">Plugin Inventories</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="alerts">Alerts {unresolved > 0 && <Badge variant="destructive" className="ml-2">{unresolved}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="studio-card p-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search users by name, email, ID, or role…"
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
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
                <SelectTrigger className="sm:w-44" aria-label="Filter by role">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="none">No role</SelectItem>
                </SelectContent>
              </Select>
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

        <TabsContent value="setups">
          <SetupsTab setups={setups} users={users} loading={loading} />
        </TabsContent>

        <TabsContent value="inventories">
          <InventoriesTab inventories={inventories} users={users} loading={loading} />
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

function SetupsTab({
  setups, users, loading,
}: {
  setups: SetupRow[];
  users: UserRow[];
  loading: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const editionFilter = searchParams.get("edition") ?? "all";
  const tierFilter = (searchParams.get("tier") as "all" | "stock" | "advanced") ?? "all";
  const genreFilter = searchParams.get("genre") ?? "all";
  const skillFilter = searchParams.get("skill") ?? "all";

  const updateParam = (key: string, value: string, defaultValue = "all") => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const setQuery = (v: string) => updateParam("q", v, "");
  const setEditionFilter = (v: string) => updateParam("edition", v);
  const setTierFilter = (v: "all" | "stock" | "advanced") => updateParam("tier", v);
  const setGenreFilter = (v: string) => updateParam("genre", v);
  const setSkillFilter = (v: string) => updateParam("skill", v);

  const userMap = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  const rows = useMemo(() => {
    return setups.map((s) => {
      const u = userMap.get(s.user_id);
      const tier: FlEditionTier = editionToTier(s.fl_edition);
      return {
        ...s,
        display_name: u?.display_name ?? null,
        email: u?.email ?? null,
        tier,
      };
    });
  }, [setups, userMap]);

  const editionOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.fl_edition).filter(Boolean))) as string[],
    [rows],
  );
  const genreOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.main_genre).filter(Boolean))) as string[],
    [rows],
  );
  const skillOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.skill_level).filter(Boolean))) as string[],
    [rows],
  );

  const isStockOnly = (t: FlEditionTier) => t === "fruity" || t === "unknown";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (editionFilter !== "all" && r.fl_edition !== editionFilter) return false;
      if (tierFilter === "stock" && !isStockOnly(r.tier)) return false;
      if (tierFilter === "advanced" && isStockOnly(r.tier)) return false;
      if (genreFilter !== "all" && r.main_genre !== genreFilter) return false;
      if (skillFilter !== "all" && r.skill_level !== skillFilter) return false;
      if (!q) return true;
      return [r.display_name, r.email, r.user_id, r.fl_version, r.fl_edition, r.main_use, r.main_genre, r.skill_level]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, editionFilter, tierFilter, genreFilter, skillFilter]);

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };
  const filtersActive =
    editionFilter !== "all" || tierFilter !== "all" || genreFilter !== "all" || skillFilter !== "all" || !!query;

  const exportCsv = () => {
    const headers = ["user_id", "display_name", "email", "fl_version", "fl_edition", "tier", "main_use", "main_genre", "skill_level", "setup_completed", "updated_at", "allowed_plugins", "blocked_plugins"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const tierLabelFor = (t: FlEditionTier) => tierLabel(t);
    const dataRows = filtered.map((r) => {
      const allowed = eligiblePlugins(r.tier).join("; ");
      const blocked = forbiddenPlugins(r.tier).join("; ");
      return headers.map((h) => {
        if (h === "tier") return esc(tierLabelFor(r.tier));
        if (h === "allowed_plugins") return esc(allowed);
        if (h === "blocked_plugins") return esc(blocked);
        return esc((r as any)[h]);
      }).join(",");
    });

    // Filter metadata header (CSV comment lines starting with #)
    const meta = [
      `# Studio Sensei — FL Setups export`,
      `# Generated: ${new Date().toISOString()}`,
      `# Total rows: ${filtered.length} of ${rows.length}`,
      `# Filter — search: ${query || "(none)"}`,
      `# Filter — edition: ${editionFilter}`,
      `# Filter — tier: ${tierFilter}${tierFilter === "stock" ? " (Fruity / Unknown — stock-only)" : tierFilter === "advanced" ? " (Producer / Signature / All Plugins)" : ""}`,
      `# Filter — genre: ${genreFilter}`,
      `# Filter — skill: ${skillFilter}`,
      `# Eligibility columns reflect each user's edition tier (see fl-plugin-eligibility).`,
    ];

    const csv = [...meta, headers.join(","), ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fl-studio-setups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} setup${filtered.length === 1 ? "" : "s"}.`);
  };

  return (
    <Card className="studio-card p-4 mt-4">
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search setups by user, email, version, edition, genre…"
            aria-label="Search FL Studio setups"
            maxLength={100}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button onClick={exportCsv} disabled={filtered.length === 0} variant="outline" className="sm:w-auto">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Select value={editionFilter} onValueChange={setEditionFilter}>
          <SelectTrigger aria-label="Filter by edition"><SelectValue placeholder="Edition" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All editions</SelectItem>
            {editionOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as typeof tierFilter)}>
          <SelectTrigger aria-label="Filter by edition tier"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="stock">Stock-only (Fruity / Unknown)</SelectItem>
            <SelectItem value="advanced">Advanced (Producer+)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={genreFilter} onValueChange={setGenreFilter}>
          <SelectTrigger aria-label="Filter by genre"><SelectValue placeholder="Genre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genres</SelectItem>
            {genreOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={skillFilter} onValueChange={setSkillFilter}>
          <SelectTrigger aria-label="Filter by skill"><SelectValue placeholder="Skill" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skills</SelectItem>
            {skillOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtersActive && (
        <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
          <span>Showing {filtered.length} of {rows.length}</span>
          <button onClick={clearFilters} className="underline hover:text-foreground">Clear filters</button>
        </div>
      )}

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {setups.length === 0 ? "No users have completed setup yet." : `No setups match "${query}".`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-3 font-medium"><Sliders className="w-3 h-3 inline mr-1" />User</th>
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">Edition</th>
                <th className="py-2 pr-3 font-medium">Main Use</th>
                <th className="py-2 pr-3 font-medium">Genre</th>
                <th className="py-2 pr-3 font-medium">Skill</th>
                <th className="py-2 pr-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.user_id} className="border-b border-border/40">
                  <td className="py-2 pr-3 min-w-[160px]">
                    <div className="font-medium truncate">{r.display_name || r.user_id.slice(0, 8)}</div>
                    {r.email && <div className="text-muted-foreground truncate">{r.email}</div>}
                  </td>
                  <td className="py-2 pr-3">{r.fl_version || "—"}</td>
                  <td className="py-2 pr-3">{r.fl_edition || "—"}</td>
                  <td className="py-2 pr-3">{r.main_use || "—"}</td>
                  <td className="py-2 pr-3">{r.main_genre || "—"}</td>
                  <td className="py-2 pr-3">{r.skill_level || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

