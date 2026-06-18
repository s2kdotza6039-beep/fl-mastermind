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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Shield, Users, Activity, AlertTriangle, Crown, Loader2, Search, X, Sliders, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { editionToTier, tierLabel, eligiblePlugins, forbiddenPlugins, type FlEditionTier } from "@/lib/fl-plugin-eligibility";
import { AdminActivityTab } from "@/components/AdminActivityTab";
import { SecurityIssuesPanel } from "@/components/SecurityIssuesPanel";
import { AdminAudioReportsTab } from "@/components/AdminAudioReportsTab";


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
    const [profilesQ, rolesQ, logsQ, alertsQ, emailsQ, setupsQ] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").limit(500),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("security_alerts").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("admin_list_user_emails"),
      supabase.from("user_studio_setup").select("user_id, fl_version, fl_edition, main_use, main_genre, skill_level, setup_completed, updated_at").limit(500),
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
          <TabsTrigger value="security">Security</TabsTrigger>
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
          <InventoriesTab users={users} />
        </TabsContent>




        <TabsContent value="activity">
          <AdminActivityTab users={users} />
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

        <TabsContent value="security">
          <div className="mt-4">
            <SecurityIssuesPanel />
          </div>
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


const INVENTORIES_PAGE_SIZE = 50;

type ExportKind = "summary" | "rules";
type ExportPreview = {
  kind: ExportKind;
  filename: string;
  headerComments: string[];
  columns: string[];
  rows: string[][];
};

function InventoriesTab({ users }: { users: UserRow[] }) {
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(0, parseInt(searchParams.get("inv_page") ?? "0", 10) || 0);
  const initialQuery = searchParams.get("inv_q") ?? "";

  const [page, setPage] = useState(initialPage);
  const [pageRows, setPageRows] = useState<InventoryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [reloadKey, setReloadKey] = useState(0);

  // Persist page + query to URL so refresh / tab return restores position
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (page > 0) next.set("inv_page", String(page));
    else next.delete("inv_page");
    if (query.trim()) next.set("inv_q", query.trim());
    else next.delete("inv_q");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const from = page * INVENTORIES_PAGE_SIZE;
      const to = from + INVENTORIES_PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from("user_plugin_inventory")
        .select("user_id, native_plugins, third_party_plugins, custom_plugins, inventory_completed, updated_at", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setPageRows([]);
        setLoading(false);
        return;
      }
      setPageRows((data as InventoryRow[]) ?? []);
      setTotalCount(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, reloadKey]);

  const userMap = useMemo(() => {
    const m = new Map<string, UserRow>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  const rows = useMemo(() => {
    return pageRows.map((i) => {
      const u = userMap.get(i.user_id);
      return { ...i, display_name: u?.display_name ?? null, email: u?.email ?? null };
    });
  }, [pageRows, userMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.display_name, r.email, r.user_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(totalCount / INVENTORIES_PAGE_SIZE));

  // Build a CSV payload preview (does NOT trigger download).
  const buildSummaryPreview = (): ExportPreview => {
    const columns = ["user_id", "display_name", "email", "native_count", "third_party_count", "custom_count", "native_plugins", "third_party_plugins", "custom_plugins", "updated_at"];
    const rows = filtered.map((r) => [
      r.user_id, r.display_name ?? "", r.email ?? "",
      String(r.native_plugins.length), String(r.third_party_plugins.length), String(r.custom_plugins.length),
      r.native_plugins.join("; "), r.third_party_plugins.join("; "), r.custom_plugins.join("; "),
      r.updated_at,
    ]);
    return {
      kind: "summary",
      filename: `plugin-inventories-p${page + 1}-${new Date().toISOString().slice(0, 10)}.csv`,
      headerComments: [
        `# Studio Sensei — Plugin Inventories export`,
        `# Generated: ${new Date().toISOString()}`,
        `# Page ${page + 1} of ${totalPages} · ${filtered.length} of ${totalCount} total rows`,
      ],
      columns,
      rows,
    };
  };

  const buildRulesPreview = (): ExportPreview => {
    const columns = ["user_id", "display_name", "email", "category", "plugin", "match_rule", "match_rule_snippet", "inventory_completed", "updated_at"];
    const ruleFor = (name: string) => (name.trim().length <= 3 ? "word-boundary" : "substring");
    const snippetFor = (name: string) => {
      const len = name.trim().length;
      return len <= 3
        ? `Whole-word match required because "${name}" is ${len} chars (avoids false positives in assistant text).`
        : `Case-insensitive substring match — flagged whenever "${name}" appears anywhere in the assistant response.`;
    };
    const rows: string[][] = [];
    filtered.forEach((r) => {
      const emit = (category: "native" | "third_party" | "custom", list: string[]) => {
        list.forEach((p) => rows.push([
          r.user_id, r.display_name ?? "", r.email ?? "",
          category, p, ruleFor(p), snippetFor(p),
          String(r.inventory_completed), r.updated_at,
        ]));
      };
      emit("native", r.native_plugins);
      emit("third_party", r.third_party_plugins);
      emit("custom", r.custom_plugins);
    });
    return {
      kind: "rules",
      filename: `plugin-inventory-rules-p${page + 1}-${new Date().toISOString().slice(0, 10)}.csv`,
      headerComments: [
        `# Studio Sensei — Plugin Inventories (with prioritized-badge match rules)`,
        `# Generated: ${new Date().toISOString()}`,
        `# Page ${page + 1} of ${totalPages} · ${filtered.length} users · ${rows.length} plugin rows`,
        `# Rule reference: names ≤3 chars use word-boundary matching, longer names use case-insensitive substring matching.`,
      ],
      columns,
      rows,
    };
  };

  const confirmDownload = async () => {
    if (!preview) return;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      ...preview.headerComments,
      preview.columns.join(","),
      ...preview.rows.map((r) => r.map(esc).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = preview.filename;
    a.click();
    URL.revokeObjectURL(url);

    // Admin-facing activity log
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from("activity_logs").insert({
          user_id: auth.user.id,
          event_type: "plugin_inventory_exported",
          metadata: {
            kind: preview.kind,
            filename: preview.filename,
            row_count: preview.rows.length,
            users_in_page: filtered.length,
            page: page + 1,
            total_pages: totalPages,
            total_users: totalCount,
            search_query: query || null,
          },
        });
      }
    } catch {
      // non-fatal
    }

    toast.success(
      preview.kind === "rules"
        ? `Exported ${preview.rows.length} plugin row${preview.rows.length === 1 ? "" : "s"} with match rules.`
        : `Exported ${preview.rows.length} inventor${preview.rows.length === 1 ? "y" : "ies"}.`,
    );
    setPreview(null);
  };


  return (
    <Card className="studio-card p-4 mt-4">
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email or name (current page)…"
            aria-label="Search plugin inventories"
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
        <Button onClick={() => setPreview(buildSummaryPreview())} disabled={filtered.length === 0 || loading || !!error} variant="outline" className="sm:w-auto">
          <Eye className="w-4 h-4 mr-2" /> Preview & export
        </Button>
        <Button onClick={() => setPreview(buildRulesPreview())} disabled={filtered.length === 0 || loading || !!error} variant="outline" className="sm:w-auto" title="One row per plugin with chat badge match rule + snippet">
          <Eye className="w-4 h-4 mr-2" /> Preview w/ rules
        </Button>


      </div>

      <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
        <span>Page {page + 1} of {totalPages} · {totalCount} total</span>
        <span className="italic">Search applies to current page</span>
      </div>

      {error ? (
        <div className="text-center py-8 space-y-3">
          <div className="flex items-center justify-center gap-2 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load page {page + 1}: {error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2" aria-label="Loading inventories">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40">
              <div className="h-8 flex-1 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-8 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-8 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-8 rounded bg-muted/60 animate-pulse" />
              <div className="h-4 w-20 rounded bg-muted/60 animate-pulse" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {totalCount === 0
            ? "No users have saved a plugin inventory yet."
            : query
              ? `No inventories on this page match "${query}".`
              : "No rows on this page."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Native</th>
                <th className="py-2 pr-3 font-medium">Third-party</th>
                <th className="py-2 pr-3 font-medium">Custom</th>
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
                  <td className="py-2 pr-3 tabular-nums">{r.native_plugins.length}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.third_party_plugins.length}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.custom_plugins.length}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= totalPages || loading || !!error} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export preview · {preview?.kind === "rules" ? "with match rules" : "summary"}</DialogTitle>
            <DialogDescription>
              {preview && (
                <>
                  Filename: <code className="text-foreground">{preview.filename}</code> · {preview.rows.length} row{preview.rows.length === 1 ? "" : "s"} · {preview.columns.length} column{preview.columns.length === 1 ? "" : "s"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded border border-border bg-muted/30 p-3 font-mono text-[11px] overflow-x-auto">
                {preview.headerComments.map((c, i) => (
                  <div key={i} className="text-muted-foreground">{c}</div>
                ))}
              </div>
              <div className="border border-border rounded overflow-auto max-h-[50vh]">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c} className="text-left px-2 py-1.5 font-medium border-b border-border whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 20).map((r, ri) => (
                      <tr key={ri} className="border-b border-border/40">
                        {r.map((cell, ci) => (
                          <td key={ci} className="px-2 py-1 align-top max-w-[260px] truncate text-muted-foreground" title={cell}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 20 && (
                  <div className="text-center text-[10px] text-muted-foreground py-2 border-t border-border/40">
                    Showing first 20 of {preview.rows.length} rows · all rows will be in the downloaded file.
                  </div>
                )}
                {preview.rows.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-6">No rows to export.</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
            <Button onClick={confirmDownload} disabled={!preview || preview.rows.length === 0} className="bg-gradient-gold text-primary-foreground">
              <Download className="w-4 h-4 mr-2" /> Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}



