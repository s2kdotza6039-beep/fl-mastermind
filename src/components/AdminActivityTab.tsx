import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Loader2, RefreshCw, ChevronLeft, ChevronRight, X, Columns, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Activity, CheckCircle2, ArrowUpDown, AlertCircle, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LogRow {
  id: string;
  user_id: string | null;
  event_type: string;
  metadata: any;
  created_at: string;
}

interface UserLike {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

type EventFilter = "all" | "plugin_inventory_imported" | "plugin_inventory_restored" | "plugin_inventory_saved" | "plugin_inventory_exported";

const PAGE_SIZE = 25;
const SUMMARY_CAP = 5000;
const COLUMN_STORAGE_KEY = "studio-sensei.admin-activity-columns.v1";
const TZ_STORAGE_KEY = "studio-sensei.admin-activity-tz.v1";
const SHORTCUTS_STORAGE_KEY = "studio-sensei.admin-activity-shortcuts.v1";

// Export retry tuning. Keep this small — exports run interactively, so 4 attempts
// with exponential backoff (0.5s, 1s, 2s) gives ~3.5s of grace before surfacing.
const EXPORT_MAX_ATTEMPTS = 4;
const EXPORT_BACKOFF_BASE_MS = 500;

type ExportPhase = "idle" | "requesting" | "generating" | "downloading" | "done";
const PHASE_LABEL: Record<ExportPhase, string> = {
  idle: "",
  requesting: "Requesting data",
  generating: "Generating CSV",
  downloading: "Downloading",
  done: "Done",
};
const PHASE_PERCENT: Record<ExportPhase, number> = {
  idle: 0, requesting: 25, generating: 70, downloading: 90, done: 100,
};

type Tz = "local" | "utc";
const formatTs = (iso: string, tz: Tz) =>
  tz === "utc" ? new Date(iso).toISOString() : new Date(iso).toLocaleString();
const tzLabel = (tz: Tz) =>
  tz === "utc"
    ? "UTC"
    : `Local (${Intl.DateTimeFormat().resolvedOptions().timeZone || "browser"})`;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
  { value: "event_type:asc", label: "Event type A→Z" },
  { value: "event_type:desc", label: "Event type Z→A" },
  { value: "user_id:asc", label: "User id A→Z" },
  { value: "metadata->>added:desc", label: "Completion Δ (most added)" },
  { value: "metadata->>removed:desc", label: "Completion Δ (most removed)" },
];
const sortLabel = (v: string) => SORT_OPTIONS.find((s) => s.value === v)?.label ?? v;
const cycleSort = (current: string, dir: 1 | -1) => {
  const i = SORT_OPTIONS.findIndex((s) => s.value === current);
  const next = ((i < 0 ? 0 : i) + dir + SORT_OPTIONS.length) % SORT_OPTIONS.length;
  return SORT_OPTIONS[next].value;
};


const PRESETS: { label: string; days: number | null }[] = [
  { label: "All time", days: null },
  { label: "Last 24h", days: 1 },
  { label: "Last 7d", days: 7 },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

interface ColumnDef {
  key: string;
  label: string;
  resolve: (r: LogRow, info: UserLike | null) => string | number | boolean | null | undefined;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "id", label: "id", resolve: (r) => r.id },
  { key: "created_at", label: "created_at", resolve: (r) => r.created_at },
  { key: "event_type", label: "event_type", resolve: (r) => r.event_type },
  { key: "user_id", label: "user_id", resolve: (r) => r.user_id ?? "" },
  { key: "display_name", label: "display_name", resolve: (_r, info) => info?.display_name ?? "" },
  { key: "email", label: "email", resolve: (_r, info) => info?.email ?? "" },
  { key: "snapshot_id", label: "snapshot_id", resolve: (r) => r.metadata?.snapshot_id ?? "" },
  { key: "added", label: "added", resolve: (r) => r.metadata?.added ?? "" },
  { key: "removed", label: "removed", resolve: (r) => r.metadata?.removed ?? "" },
  { key: "skipped", label: "skipped", resolve: (r) => r.metadata?.skipped ?? "" },
  { key: "duplicate", label: "duplicate", resolve: (r) => r.metadata?.duplicate ?? "" },
  { key: "invalid", label: "invalid", resolve: (r) => r.metadata?.invalid ?? "" },
  { key: "rows_processed", label: "rows_processed", resolve: (r) => r.metadata?.rows_processed ?? "" },
  { key: "source_file", label: "source_file", resolve: (r) => r.metadata?.source_file ?? "" },
  { key: "inventory_completed", label: "inventory_completed", resolve: (r) => r.metadata?.inventory_completed ?? "" },
  { key: "metadata_json", label: "metadata_json", resolve: (r) => JSON.stringify(r.metadata ?? {}) },
];
const DEFAULT_COLUMN_KEYS = [
  "created_at", "event_type", "display_name", "email", "snapshot_id",
  "added", "removed", "skipped", "duplicate", "invalid",
  "source_file", "inventory_completed", "metadata_json",
];

function loadStoredColumns(): string[] {
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_KEYS;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
    return valid.length > 0 ? valid : DEFAULT_COLUMN_KEYS;
  } catch {
    return DEFAULT_COLUMN_KEYS;
  }
}

export function AdminActivityTab({ users }: { users: UserLike[] }) {
  // Page data
  const [rows, setRows] = useState<LogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Summary (separate query, bounded)
  const [summary, setSummary] = useState<LogRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryCapHit, setSummaryCapHit] = useState(false);

  // URL-backed filter state. Distinct `a_` prefix so we don't collide with SetupsTab params.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = (k: string, fallback = "") => searchParams.get(k) ?? fallback;

  const eventFilter = (param("a_event", "all") as EventFilter);
  const query = param("a_q");
  const snapshotId = param("a_snap");
  const userQuery = param("a_user");
  const preset = (() => {
    const idx = parseInt(param("a_preset", "0"), 10);
    return Number.isFinite(idx) && idx >= 0 && idx < PRESETS.length ? idx : 0;
  })();
  const from = param("a_from");
  const to = param("a_to");
  const sort = param("a_sort", "created_at:desc");

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v == null || v === "" || v === "all" || (k === "a_preset" && v === "0") || (k === "a_sort" && v === "created_at:desc")) {
        next.delete(k);
      } else {
        next.set(k, v);
      }
    });
    setSearchParams(next, { replace: true });
  };

  const setEventFilter = (v: EventFilter) => setParam({ a_event: v });
  const setQuery = (v: string) => setParam({ a_q: v });
  const setSnapshotId = (v: string) => setParam({ a_snap: v });
  const setUserQuery = (v: string) => setParam({ a_user: v });
  const setPreset = (v: number) => setParam({ a_preset: String(v), a_from: null, a_to: null });
  const setFrom = (v: string) => setParam({ a_from: v, a_preset: "0" });
  const setTo = (v: string) => setParam({ a_to: v, a_preset: "0" });
  const setSort = (v: string) => setParam({ a_sort: v });

  // Column picker
  const [columnKeys, setColumnKeys] = useState<string[]>(loadStoredColumns);
  useEffect(() => {
    try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnKeys)); } catch { /* ignore */ }
  }, [columnKeys]);

  // Keyboard shortcut targets
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const exportBtnRef = useRef<HTMLButtonElement | null>(null);

  // Export state (declared early so the keyboard-shortcut effect can reference it)
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportAttempt, setExportAttempt] = useState(0);
  // Last-failure diagnostics for the error banner
  const [exportLastFail, setExportLastFail] = useState<{ attempt: number; message: string; nextDelayMs: number | null } | null>(null);
  // Cooperative cancellation — flipped by the Cancel button; checked at every await boundary.
  const cancelRef = useRef(false);

  // CSV timestamp timezone — URL wins (shareable), then localStorage, then "local".
  const urlTz = searchParams.get("a_tz");
  const [tz, setTzLocal] = useState<Tz>(() => {
    if (urlTz === "utc" || urlTz === "local") return urlTz;
    try {
      const raw = localStorage.getItem(TZ_STORAGE_KEY);
      return raw === "utc" ? "utc" : "local";
    } catch { return "local"; }
  });
  // Keep state in sync with the URL on back/forward navigation.
  useEffect(() => {
    if ((urlTz === "utc" || urlTz === "local") && urlTz !== tz) setTzLocal(urlTz);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [urlTz]);
  const setTz = (v: Tz) => {
    setTzLocal(v);
    try { localStorage.setItem(TZ_STORAGE_KEY, v); } catch { /* ignore */ }
    // Drop the URL param when it matches the default to keep links clean.
    setParam({ a_tz: v === "local" ? null : v });
  };

  // Keyboard shortcuts on/off — URL wins (so it's shareable), else localStorage, else on.
  const urlKbd = searchParams.get("a_kbd");
  const [shortcutsEnabled, setShortcutsEnabledLocal] = useState<boolean>(() => {
    if (urlKbd === "0") return false;
    if (urlKbd === "1") return true;
    try { return localStorage.getItem(SHORTCUTS_STORAGE_KEY) !== "0"; } catch { return true; }
  });
  useEffect(() => {
    if (urlKbd === "0" && shortcutsEnabled) setShortcutsEnabledLocal(false);
    else if (urlKbd === "1" && !shortcutsEnabled) setShortcutsEnabledLocal(true);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [urlKbd]);
  const setShortcutsEnabled = (v: boolean) => {
    setShortcutsEnabledLocal(v);
    try { localStorage.setItem(SHORTCUTS_STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
    setParam({ a_kbd: v ? null : "0" });
  };

  const userMap = useMemo(() => {
    const m = new Map<string, UserLike>();
    users.forEach((u) => m.set(u.user_id, u));
    return m;
  }, [users]);

  // Resolve user search → list of ids if not a uuid prefix
  const resolvedUserIds = useMemo<string[] | null>(() => {
    const u = userQuery.trim().toLowerCase();
    if (!u) return null;
    const looksLikeUuid = /^[0-9a-f-]{6,}$/.test(u);
    if (looksLikeUuid) return null; // handled via ilike server-side
    const ids = users
      .filter((x) =>
        (x.display_name || "").toLowerCase().includes(u) ||
        (x.email || "").toLowerCase().includes(u),
      )
      .map((x) => x.user_id);
    return ids;
  }, [userQuery, users]);

  const buildBase = (selectCount: boolean) => {
    let q = supabase
      .from("activity_logs")
      .select("id, user_id, event_type, metadata, created_at", selectCount ? { count: "exact" } : {});

    if (eventFilter !== "all") q = q.eq("event_type", eventFilter);

    const presetDays = PRESETS[preset]?.days ?? null;
    if (presetDays != null) {
      const since = new Date(Date.now() - presetDays * 24 * 3600 * 1000).toISOString();
      q = q.gte("created_at", since);
    } else {
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); q = q.lte("created_at", end.toISOString()); }
    }

    if (snapshotId.trim()) {
      q = q.ilike("metadata->>snapshot_id", `${snapshotId.trim()}%`);
    }

    const u = userQuery.trim().toLowerCase();
    if (u) {
      const looksLikeUuid = /^[0-9a-f-]{6,}$/.test(u);
      if (looksLikeUuid) {
        q = q.ilike("user_id", `${u}%`);
      } else if (resolvedUserIds && resolvedUserIds.length > 0) {
        q = q.in("user_id", resolvedUserIds);
      } else {
        // No users matched the name/email — short-circuit by an impossible filter
        q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      }
    }

    return q;
  };

  // Free-text query is applied client-side over the current page only.
  // Surface a notice so the user knows.
  const freeTextActive = query.trim().length > 0;
  const filteredPage = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [r.event_type, r.user_id ?? "", JSON.stringify(r.metadata ?? {})].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query]);

  // Parse sort: "<column>:<dir>". JSON-path columns use "metadata->>key" — PostgREST
  // sorts those as text, which is fine for the small integer values we surface here.
  const applyOrder = (q: any) => {
    const [colRaw, dirRaw] = sort.split(":");
    const col = colRaw || "created_at";
    const ascending = dirRaw === "asc";
    // Always disambiguate ties with created_at desc for stable pagination.
    if (col === "created_at") return q.order("created_at", { ascending });
    return q.order(col, { ascending }).order("created_at", { ascending: false });
  };

  const loadPage = async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const q = applyOrder(buildBase(true))
        .range(targetPage * PAGE_SIZE, (targetPage + 1) * PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      setRows((data as LogRow[]) ?? []);
      setTotalCount(count ?? 0);
      setPage(targetPage);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load activity.");
      setRows([]); setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const q = applyOrder(buildBase(false)).limit(SUMMARY_CAP);
      const { data, error } = await q;
      if (error) throw error;
      const arr = (data as LogRow[]) ?? [];
      setSummary(arr);
      setSummaryCapHit(arr.length === SUMMARY_CAP);
    } catch {
      setSummary([]); setSummaryCapHit(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Re-fetch when server-side filters change.
  useEffect(() => {
    void loadPage(0);
    void loadSummary();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventFilter, preset, from, to, snapshotId, userQuery, sort, users.length]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Keyboard shortcuts:
  //   /            → focus free-text search
  //   Shift+S      → cycle sort forward · Shift+Alt+S → reverse
  //   Shift+E      → trigger export filtered results
  //   Shift+R      → reload page + summary
  //   ← / →        → previous / next page (when not typing)
  // We bail when the user is typing so we never hijack normal text entry.
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (tgt && (tgt as HTMLElement).isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
        return;
      }
      if (typing) return;
      if (e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        setSort(cycleSort(sort, e.altKey ? -1 : 1));
      } else if (e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        if (!exporting && !summaryLoading) void runExport();
      } else if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        if (!loading) { void loadPage(page); void loadSummary(); }
      } else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
        if (page > 0 && !loading) { e.preventDefault(); void loadPage(page - 1); }
      } else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
        if (page < totalPages - 1 && !loading) { e.preventDefault(); void loadPage(page + 1); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [sort, page, totalPages, loading, exporting, summaryLoading, shortcutsEnabled]);


  // Summary aggregates (over the bounded summary set, same filters)
  const stats = useMemo(() => {
    const out = {
      total: summary.length,
      imports: 0, restores: 0, saves: 0, exports: 0,
      completedSaves: 0,
      biggestImprovement: null as { row: LogRow; added: number } | null,
      biggestRegression: null as { row: LogRow; removed: number } | null,
    };
    summary.forEach((r) => {
      if (r.event_type === "plugin_inventory_imported") out.imports++;
      else if (r.event_type === "plugin_inventory_restored") out.restores++;
      else if (r.event_type === "plugin_inventory_saved") {
        out.saves++;
        if (r.metadata?.inventory_completed === true) out.completedSaves++;
      }
      else if (r.event_type === "plugin_inventory_exported") out.exports++;
      const added = Number(r.metadata?.added ?? 0);
      const removed = Number(r.metadata?.removed ?? 0);
      if (added > 0 && (!out.biggestImprovement || added > out.biggestImprovement.added)) {
        out.biggestImprovement = { row: r, added };
      }
      if (removed > 0 && (!out.biggestRegression || removed > out.biggestRegression.removed)) {
        out.biggestRegression = { row: r, removed };
      }
    });
    return out;
  }, [summary]);

  const completionRate = stats.saves > 0 ? Math.round((stats.completedSaves / stats.saves) * 100) : null;

  // Export pipeline with explicit retry + timeout + phased progress. We re-run
  // the same filtered query (not the cached `summary`) so the file matches the
  // live server state. Retries use exponential backoff and cap at EXPORT_MAX_ATTEMPTS.
  const EXPORT_TIMEOUT_MS = 20_000;

  const runExport = async () => {
    const cols = columnKeys.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter(Boolean) as ColumnDef[];
    if (cols.length === 0) {
      toast.error("Pick at least one column to export.");
      return;
    }
    setExporting(true);
    setExportError(null);
    setExportPhase("requesting");
    setExportAttempt(1);

    // Retry loop with exponential backoff. Surface the final error after the cap.
    let data: any = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= EXPORT_MAX_ATTEMPTS; attempt++) {
      setExportAttempt(attempt);
      setExportPhase("requesting");
      try {
        const queryPromise = applyOrder(buildBase(false)).limit(SUMMARY_CAP);
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`Export timed out after ${EXPORT_TIMEOUT_MS / 1000}s`)), EXPORT_TIMEOUT_MS),
        );
        const res = (await Promise.race([queryPromise, timeout])) as any;
        if (res?.error) throw res.error;
        data = res?.data ?? [];
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        if (attempt < EXPORT_MAX_ATTEMPTS) {
          const wait = EXPORT_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }

    if (lastErr) {
      const msg = `${lastErr?.message ?? "Export failed."} (after ${EXPORT_MAX_ATTEMPTS} attempts)`;
      setExportError(msg);
      toast.error(msg);
      setExportPhase("idle");
      setExporting(false);
      return;
    }

    try {
      setExportPhase("generating");
      const source: LogRow[] = (data as LogRow[]) ?? [];
      if (source.length === 0) {
        toast.error("No events match these filters.");
        setExporting(false);
        setExportPhase("idle");
        return;
      }

      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      // Prepend a metadata banner describing the export so opened CSVs are self-documenting.
      const presetLabel = PRESETS[preset]?.label ?? "All time";
      const dateRange = (from || to)
        ? `${from || "…"} → ${to || "…"}`
        : presetLabel;
      const now = new Date();
      const generatedTs = tz === "utc" ? now.toISOString() : now.toLocaleString();
      const filterLines = [
        `# Plugin inventory admin activity export`,
        `# Generated: ${generatedTs}`,
        `# Timezone: ${tzLabel(tz)}`,
        `# Total rows: ${source.length}${source.length === SUMMARY_CAP ? " (capped — narrow filters for full set)" : ""}`,
        `# Event filter: ${eventFilter}`,
        `# Date range: ${dateRange}`,
        `# Snapshot id: ${snapshotId || "(any)"}`,
        `# User query: ${userQuery || "(any)"}`,
        `# Free-text: ${query || "(none)"}`,
        `# Sort: ${sort}`,
        `# Columns: ${columnKeys.join(", ")}`,
        ``,
      ].map((l) => esc(l)).join("\n") + "\n";

      const header = cols.map((c) => c.label).join(",") + "\n";
      const body = source.map((r) => {
        const info = r.user_id ? userMap.get(r.user_id) ?? null : null;
        // Apply the timezone to created_at if that column is included
        return cols.map((c) => {
          if (c.key === "created_at") return esc(formatTs(r.created_at, tz));
          return esc(c.resolve(r, info));
        }).join(",");
      }).join("\n");

      setExportPhase("downloading");
      const blob = new Blob([filterLines + header + body], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin-activity-${eventFilter}-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);

      supabase.from("activity_logs").insert({
        user_id: null,
        event_type: "admin_activity_exported",
        metadata: {
          rows: source.length,
          columns: columnKeys,
          event_filter: eventFilter,
          snapshot_id: snapshotId,
          user_query: userQuery,
          preset: presetLabel,
          from, to, sort, tz,
          cap_hit: source.length === SUMMARY_CAP,
          attempts: exportAttempt,
        },
      }).then(() => {}, () => {});
      setExportPhase("done");
      toast.success(`Exported ${source.length} event${source.length === 1 ? "" : "s"}.`);
      // Fade the "Done" indicator after a beat.
      setTimeout(() => setExportPhase((p) => (p === "done" ? "idle" : p)), 1500);
    } catch (e: any) {
      const msg = e?.message ?? "Export failed during CSV generation.";
      setExportError(msg);
      toast.error(msg);
      setExportPhase("idle");
    } finally {
      setExporting(false);
    }
  };


  const clearAll = () => {
    // Reset every URL-backed filter at once.
    setParam({
      a_event: null, a_q: null, a_snap: null, a_user: null,
      a_preset: null, a_from: null, a_to: null, a_sort: null,
    });
  };

  const renderMeta = (r: LogRow) => {
    const m = r.metadata ?? {};
    const chips: string[] = [];
    if (m.snapshot_id) chips.push(`snap=${String(m.snapshot_id).slice(0, 8)}`);
    if (m.added != null) chips.push(`+${m.added}`);
    if (m.removed != null) chips.push(`−${m.removed}`);
    if (m.duplicate != null) chips.push(`dup ${m.duplicate}`);
    if (m.invalid != null) chips.push(`bad ${m.invalid}`);
    if (m.skipped != null) chips.push(`skip ${m.skipped}`);
    if (m.source_file) chips.push(String(m.source_file));
    return chips.length > 0 ? chips.join(" · ") : JSON.stringify(m);
  };

  const toggleColumn = (key: string) => {
    setColumnKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    setColumnKeys((prev) => {
      const i = prev.indexOf(key);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div className="space-y-3 mt-4">
      {/* Summary card */}
      <Card className="studio-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-display font-bold">Activity summary</h3>
            <p className="text-[10px] text-muted-foreground">
              {summaryLoading
                ? "Calculating…"
                : `${stats.total} event${stats.total === 1 ? "" : "s"} in range${summaryCapHit ? ` (capped at ${SUMMARY_CAP} — narrow date range for full numbers)` : ""}.`}
            </p>
          </div>
          {summaryLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <SummaryStat label="Imports" value={stats.imports} icon={<Activity className="w-3 h-3" />} />
          <SummaryStat label="Restores" value={stats.restores} icon={<RefreshCw className="w-3 h-3" />} />
          <SummaryStat label="Saves" value={stats.saves} icon={<CheckCircle2 className="w-3 h-3" />} />
          <SummaryStat
            label="Completion rate"
            value={completionRate == null ? "—" : `${completionRate}%`}
            icon={<CheckCircle2 className="w-3 h-3" />}
            sub={stats.saves > 0 ? `${stats.completedSaves}/${stats.saves}` : undefined}
          />
          <SummaryStat label="Exports" value={stats.exports} icon={<Download className="w-3 h-3" />} />
        </div>
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <BiggestCard
            kind="up"
            row={stats.biggestImprovement?.row ?? null}
            magnitude={stats.biggestImprovement?.added ?? 0}
            userMap={userMap}
          />
          <BiggestCard
            kind="down"
            row={stats.biggestRegression?.row ?? null}
            magnitude={stats.biggestRegression?.removed ?? 0}
            userMap={userMap}
          />
        </div>
      </Card>

      {/* Filters */}
      <Card className="studio-card p-4 space-y-3">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as EventFilter)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="plugin_inventory_imported">plugin_inventory_imported</SelectItem>
              <SelectItem value="plugin_inventory_restored">plugin_inventory_restored</SelectItem>
              <SelectItem value="plugin_inventory_saved">plugin_inventory_saved</SelectItem>
              <SelectItem value="plugin_inventory_exported">plugin_inventory_exported</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Free-text (current page) — press / to focus" className="pl-9 h-9 text-xs" />
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="User: name, email, id…" className="pl-9 h-9 text-xs" />
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} placeholder="Snapshot id…" className="pl-9 h-9 text-xs" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Select value={String(preset)} onValueChange={(v) => { setPreset(parseInt(v, 10)); setFrom(""); setTo(""); }}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p, i) => <SelectItem key={p.label} value={String(i)}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">or custom:</span>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(0); }} className="h-8 text-xs w-36" />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(0); }} className="h-8 text-xs w-36" />

          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-8 text-xs w-52" aria-label="Sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={clearAll}>
            <X className="w-3 h-3 mr-1" /> Clear
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { void loadPage(page); void loadSummary(); }} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Reload
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <Columns className="w-3 h-3 mr-1" /> Columns ({columnKeys.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Export columns</span>
                <button
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => setColumnKeys(DEFAULT_COLUMN_KEYS)}
                >Reset</button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {/* Selected (in order, with up/down) */}
                {columnKeys.map((k, i) => {
                  const c = ALL_COLUMNS.find((x) => x.key === k);
                  if (!c) return null;
                  return (
                    <div key={k} className="flex items-center gap-1 px-2 py-1 rounded bg-muted/40">
                      <Checkbox checked onCheckedChange={() => toggleColumn(k)} />
                      <span className="flex-1 text-xs font-mono truncate">{c.label}</span>
                      <span className="text-[9px] text-muted-foreground w-4 text-right">{i + 1}</span>
                      <button
                        onClick={() => moveColumn(k, -1)}
                        disabled={i === 0}
                        className="p-0.5 rounded hover:bg-background disabled:opacity-30"
                        aria-label="Move up"
                      ><ArrowUp className="w-3 h-3" /></button>
                      <button
                        onClick={() => moveColumn(k, 1)}
                        disabled={i === columnKeys.length - 1}
                        className="p-0.5 rounded hover:bg-background disabled:opacity-30"
                        aria-label="Move down"
                      ><ArrowDown className="w-3 h-3" /></button>
                    </div>
                  );
                })}
                {/* Available (unselected) */}
                {ALL_COLUMNS.filter((c) => !columnKeys.includes(c.key)).length > 0 && (
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2 mb-1 px-2">Available</div>
                )}
                {ALL_COLUMNS.filter((c) => !columnKeys.includes(c.key)).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={false} onCheckedChange={() => toggleColumn(c.key)} />
                    <span className="flex-1 text-xs font-mono truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Select value={tz} onValueChange={(v) => setTz(v as Tz)}>
            <SelectTrigger className="h-8 text-xs w-36" aria-label="CSV timestamp timezone" title="Timezone written into the CSV banner and created_at column">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local time</SelectItem>
              <SelectItem value="utc">UTC</SelectItem>
            </SelectContent>
          </Select>

          <Button
            ref={exportBtnRef}
            size="sm"
            className="h-8 text-xs"
            onClick={() => void runExport()}
            disabled={exporting || summaryLoading}
            title="Exports every event matching the current filters, sort, and column order (Shift+E)"
          >
            {exporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
            {exporting ? "Exporting…" : "Export filtered results"}
          </Button>
        </div>

        {(exporting || exportPhase === "done") && (
          <div className="rounded border border-border bg-muted/30 p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {PHASE_LABEL[exportPhase] || "Working"}
                {exportPhase === "requesting" && exportAttempt > 1 && (
                  <span className="text-muted-foreground"> · attempt {exportAttempt}/{EXPORT_MAX_ATTEMPTS}</span>
                )}
              </span>
              <span className="text-muted-foreground">{PHASE_PERCENT[exportPhase]}%</span>
            </div>
            <div className="h-1.5 w-full bg-background rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${PHASE_PERCENT[exportPhase]}%` }}
              />
            </div>
          </div>
        )}

        {exportError && (
          <div className="flex items-start gap-2 p-2 rounded border border-destructive/40 bg-destructive/10 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Export failed</div>
              <div className="text-[11px] opacity-90">{exportError}</div>
            </div>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void runExport()} disabled={exporting}>
              {exporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Retry
            </Button>
            <button onClick={() => setExportError(null)} className="text-destructive/60 hover:text-destructive" aria-label="Dismiss"><X className="w-3 h-3" /></button>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <Badge variant="outline" className="text-[10px]">{totalCount} total match{totalCount === 1 ? "" : "es"}</Badge>
          <Badge variant="secondary" className="text-[10px] gap-1" title="Active sort — Shift+S to cycle, Shift+Alt+S reverse">
            <ArrowUpDown className="w-3 h-3" /> Sort: {sortLabel(sort)}
          </Badge>
          <Badge variant="outline" className="text-[10px]" title="Applied to the CSV banner and created_at column">
            CSV tz: {tz === "utc" ? "UTC" : "Local"}
          </Badge>
          {freeTextActive && <span className="text-amber-500">Free-text only filters the current page.</span>}
          <label
            className="ml-auto inline-flex items-center gap-1 cursor-pointer select-none"
            title="Toggle keyboard shortcuts (/ , Shift+S, Shift+E, Shift+R, ←/→). Persisted in URL + localStorage."
          >
            <input
              type="checkbox"
              className="h-3 w-3 accent-primary"
              checked={shortcutsEnabled}
              onChange={(e) => setShortcutsEnabled(e.target.checked)}
            />
            <Keyboard className={`w-3 h-3 ${shortcutsEnabled ? "" : "opacity-40"}`} />
            <span className={shortcutsEnabled ? "" : "opacity-50 line-through"}>
              shortcuts {shortcutsEnabled ? "on" : "off"}
            </span>
          </label>
        </div>


        {error ? (
          <div className="p-4 text-xs text-destructive border border-destructive/30 bg-destructive/10 rounded">
            {error} <button className="underline ml-2" onClick={() => loadPage(page)}>Retry</button>
          </div>
        ) : loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-7 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredPage.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {totalCount === 0 ? "No events match these filters." : "No events on this page after free-text filter."}
          </p>
        ) : (
          <div className="max-h-[50vh] overflow-auto border border-border rounded">
            {filteredPage.map((l) => {
              const info = l.user_id ? userMap.get(l.user_id) : null;
              const userLabel = info?.display_name || info?.email || l.user_id?.slice(0, 8) || "—";
              return (
                <div key={l.id} className="text-xs border-b border-border/40 px-3 py-2 grid grid-cols-12 gap-2">
                  <span className="col-span-3 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  <span className="col-span-3 font-mono truncate" title={l.event_type}>{l.event_type}</span>
                  <span className="col-span-2 truncate" title={info?.email ?? l.user_id ?? ""}>{userLabel}</span>
                  <span className="col-span-4 truncate text-muted-foreground" title={JSON.stringify(l.metadata)}>{renderMeta(l)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {totalCount === 0
              ? "—"
              : `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={loading || page === 0} onClick={() => loadPage(Math.max(0, page - 1))}>
              <ChevronLeft className="w-3 h-3" /> Prev
            </Button>
            <span className="px-1">Page {page + 1} / {totalPages}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={loading || page >= totalPages - 1} onClick={() => loadPage(Math.min(totalPages - 1, page + 1))}>
              Next <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, icon, sub }: { label: string; value: number | string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="border border-border rounded p-2 bg-muted/20">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="text-base font-bold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BiggestCard({
  kind, row, magnitude, userMap,
}: {
  kind: "up" | "down";
  row: LogRow | null;
  magnitude: number;
  userMap: Map<string, UserLike>;
}) {
  const isUp = kind === "up";
  const color = isUp ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5" : "text-destructive border-destructive/30 bg-destructive/5";
  const icon = isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
  const title = isUp ? "Biggest improvement" : "Biggest regression";
  return (
    <div className={`border rounded p-2 text-xs ${color}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest mb-1">
        {icon}<span>{title}</span>
      </div>
      {row ? (
        <div>
          <div className="font-bold">
            {isUp ? "+" : "−"}{magnitude} plugin{magnitude === 1 ? "" : "s"}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {row.event_type} · {row.user_id ? (userMap.get(row.user_id)?.display_name || userMap.get(row.user_id)?.email || row.user_id.slice(0, 8)) : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground italic">None in this range.</div>
      )}
    </div>
  );
}
