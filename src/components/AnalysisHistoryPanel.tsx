import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  History, Check, Trash2, MessageCircle, Music2, UploadCloud, Eye, Keyboard,
  Search, X, Play, Pause,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTrackSession, type TrackReport } from "@/context/TrackSessionContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function issueCount(r: TrackReport) {
  return Array.isArray(r.detected_issues) ? r.detected_issues.length : 0;
}

const ANCHOR_ID = "analysis-history-panel";
const HELP_ID = "analysis-history-help";
const LIVE_ID = "analysis-history-live";

// Ignore shortcuts while user is typing in an editable element.
function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

// ---- Heuristic stage / genre inference from file_name (DB has no column for these)
const STAGE_TOKENS: { key: string; label: string; match: RegExp }[] = [
  { key: "master", label: "Master", match: /\b(master|mastered|mstr)\b/i },
  { key: "mix",    label: "Mix",    match: /\b(mix|mixed|mixdown)\b/i },
  { key: "rough",  label: "Rough",  match: /\b(rough|wip|draft|sketch)\b/i },
  { key: "demo",   label: "Demo",   match: /\b(demo|bounce|stem|stems)\b/i },
];
const GENRE_TOKENS: { key: string; label: string; match: RegExp }[] = [
  { key: "house",   label: "House",         match: /\b(house|deep\s*house|tech\s*house)\b/i },
  { key: "techno",  label: "Techno",        match: /\btechno\b/i },
  { key: "trap",    label: "Trap",          match: /\btrap\b/i },
  { key: "hiphop",  label: "Hip-Hop / Rap", match: /\b(hip[-_\s]?hop|rap)\b/i },
  { key: "pop",     label: "Pop",           match: /\bpop\b/i },
  { key: "rock",    label: "Rock",          match: /\brock\b/i },
  { key: "edm",     label: "EDM",           match: /\b(edm|dance)\b/i },
  { key: "dnb",     label: "Drum & Bass",   match: /\b(dnb|d&b|drum\s*(?:and|n|&)\s*bass)\b/i },
  { key: "ambient", label: "Ambient",       match: /\bambient\b/i },
  { key: "lofi",    label: "Lo-Fi",         match: /\b(lofi|lo-fi)\b/i },
  { key: "jazz",    label: "Jazz",          match: /\bjazz\b/i },
];
function inferStage(name: string) { return STAGE_TOKENS.find((s) => s.match.test(name))?.key ?? null; }
function inferGenre(name: string) { return GENRE_TOKENS.find((g) => g.match.test(name))?.key ?? null; }

// ---- Tiny SVG thumbnail derived from 5 band levels
function BandThumb({ r }: { r: TrackReport }) {
  const raw = [r.band_low_db, r.band_lowmid_db, r.band_mid_db, r.band_highmid_db, r.band_high_db]
    .map((v) => (typeof v === "number" ? v : -60));
  const min = Math.min(-60, ...raw);
  const max = Math.max(0, ...raw);
  const norm = raw.map((v) => (max === min ? 0.4 : (v - min) / (max - min)));
  const w = 56, h = 28, bw = (w - 4) / 5;
  return (
    <svg
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 rounded bg-muted/40"
      role="img" aria-label={`Frequency band thumbnail for ${r.file_name}`}
    >
      {norm.map((n, i) => {
        const bh = Math.max(2, n * (h - 4));
        return (
          <rect
            key={i}
            x={2 + i * bw}
            y={h - 2 - bh}
            width={bw - 2}
            height={bh}
            rx={1}
            className="fill-primary/70"
          />
        );
      })}
    </svg>
  );
}

// ---- Tone preview using Web Audio (no stored file). Single instance.
type PreviewState = { id: string; stop: () => void };
let currentPreview: PreviewState | null = null;
const NOTE_HZ: Record<string, number> = {
  C: 261.63, "C#": 277.18, Db: 277.18, D: 293.66, "D#": 311.13, Eb: 311.13,
  E: 329.63, F: 349.23, "F#": 369.99, Gb: 369.99, G: 392.0, "G#": 415.30,
  Ab: 415.30, A: 440.0, "A#": 466.16, Bb: 466.16, B: 493.88,
};
function keyToHz(k: string | null | undefined): number {
  if (!k) return 220;
  const root = k.replace(/\s*(maj(or)?|min(or)?|m)\s*$/i, "").trim();
  return NOTE_HZ[root] ?? NOTE_HZ[root[0]?.toUpperCase()] ?? 220;
}
async function playPreview(r: TrackReport, onEnd: () => void): Promise<PreviewState | null> {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const dur = 1.6;
    const hz = keyToHz(r.detected_key);
    const bpm = Math.max(40, Math.min(220, r.bpm ?? 100));
    const beat = 60 / bpm;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.25, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    // pitched tone (root + fifth)
    [hz, hz * 1.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : 0.2;
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + dur);
    });
    // bpm pulse clicks
    for (let t = 0; t < dur; t += beat) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.15, now + t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.05);
      o.connect(g).connect(master);
      o.start(now + t);
      o.stop(now + t + 0.06);
    }
    const state: PreviewState = {
      id: r.id,
      stop: () => {
        try { master.gain.cancelScheduledValues(ctx.currentTime); } catch {}
        try { master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05); } catch {}
        setTimeout(() => { ctx.close().catch(() => {}); }, 80);
      },
    };
    setTimeout(() => {
      if (currentPreview?.id === state.id) {
        currentPreview = null;
        onEnd();
      }
      ctx.close().catch(() => {});
    }, dur * 1000 + 50);
    return state;
  } catch {
    return null;
  }
}

export const AnalysisHistoryPanel = ({ className }: { className?: string }) => {
  const { recent, active, setActiveReport, clearActive, refreshRecent, loading } = useTrackSession();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<TrackReport | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [liveMessage, setLiveMessage] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("any"); // any | 7d | 30d | 90d
  const [stageFilter, setStageFilter] = useState<string>("any");
  const [genreFilter, setGenreFilter] = useState<string>("any");

  const sectionRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const restoredScrollRef = useRef(false);
  const navigate = useNavigate();

  // Persistence keys are user-scoped so multiple accounts on one browser don't collide.
  const persistKey = useMemo(
    () => (user ? `studio-sensei-history-ui:${user.id}` : "studio-sensei-history-ui:anon"),
    [user],
  );

  // Restore persisted UI state on mount / when user changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.query === "string") setQuery(s.query);
      if (typeof s.dateRange === "string") setDateRange(s.dateRange);
      if (typeof s.stageFilter === "string") setStageFilter(s.stageFilter);
      if (typeof s.genreFilter === "string") setGenreFilter(s.genreFilter);
      if (typeof s.highlightId === "string") {
        // Wait until list resolves to find by id (handled by effect below)
        (sectionRef as any)._pendingHighlightId = s.highlightId;
      }
      if (typeof s.scrollTop === "number") {
        (sectionRef as any)._pendingScrollTop = s.scrollTop;
      }
    } catch {/* ignore */}
  }, [persistKey]);

  // Derived filtered list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff =
      dateRange === "7d" ? Date.now() - 7 * 864e5 :
      dateRange === "30d" ? Date.now() - 30 * 864e5 :
      dateRange === "90d" ? Date.now() - 90 * 864e5 : 0;
    return recent.filter((r) => {
      if (q && !r.file_name.toLowerCase().includes(q)) return false;
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (stageFilter !== "any" && inferStage(r.file_name) !== stageFilter) return false;
      if (genreFilter !== "any" && inferGenre(r.file_name) !== genreFilter) return false;
      return true;
    });
  }, [recent, query, dateRange, stageFilter, genreFilter]);

  // After list resolves, restore the previously highlighted row id + scroll position once.
  useEffect(() => {
    if (restoredScrollRef.current) return;
    if (loading || filtered.length === 0) return;
    const pendingId = (sectionRef as any)._pendingHighlightId as string | undefined;
    const pendingScroll = (sectionRef as any)._pendingScrollTop as number | undefined;
    if (pendingId) {
      const idx = filtered.findIndex((r) => r.id === pendingId);
      if (idx >= 0) setHighlightIdx(idx);
    }
    if (typeof pendingScroll === "number" && listRef.current) {
      // Defer to next frame so layout is ready.
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = pendingScroll;
      });
    }
    restoredScrollRef.current = true;
  }, [loading, filtered]);

  // Clamp highlight when filtered list changes.
  useEffect(() => {
    if (filtered.length === 0) { setHighlightIdx(0); return; }
    setHighlightIdx((i) => Math.min(i, filtered.length - 1));
  }, [filtered.length]);

  // Persist filter + highlight + scroll
  useEffect(() => {
    if (!restoredScrollRef.current && loading) return;
    const highlightId = filtered[highlightIdx]?.id ?? null;
    const scrollTop = listRef.current?.scrollTop ?? 0;
    try {
      localStorage.setItem(
        persistKey,
        JSON.stringify({ query, dateRange, stageFilter, genreFilter, highlightId, scrollTop }),
      );
    } catch {/* ignore quota */}
  }, [persistKey, query, dateRange, stageFilter, genreFilter, highlightIdx, filtered, loading]);

  // Save scroll on scroll (throttled via rAF)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          const raw = localStorage.getItem(persistKey);
          const s = raw ? JSON.parse(raw) : {};
          s.scrollTop = el.scrollTop;
          localStorage.setItem(persistKey, JSON.stringify(s));
        } catch {/* ignore */}
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [persistKey]);

  // Announce active selection changes for screen readers
  useEffect(() => {
    if (!active) return;
    setLiveMessage(`Active coaching track is now ${active.file_name}.`);
  }, [active?.id, active?.file_name]);

  // Announce highlight changes
  useEffect(() => {
    const row = filtered[highlightIdx];
    if (!row) return;
    setLiveMessage((m) => m === `Highlighted ${row.file_name}` ? m : `Highlighted ${row.file_name}`);
  }, [highlightIdx, filtered]);

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        sectionRef.current?.focus({ preventScroll: true });
        setLiveMessage("Analysis History panel focused. Use Arrow Up and Arrow Down to move, Enter to activate the highlighted analysis.");
        toast("Analysis History — ↑/↓ to move, Enter to activate");
        return;
      }
      const sec = sectionRef.current;
      if (!sec) return;
      const within = sec.contains(document.activeElement) || document.activeElement === sec;
      if (!within) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const row = filtered[highlightIdx];
        if (!row) return;
        if (active?.id === row.id) {
          toast(`Already coaching about ${row.file_name}`);
          return;
        }
        e.preventDefault();
        setConfirmActivate(row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, highlightIdx, active]);

  // Keep highlight in view
  useEffect(() => {
    rowRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

  // Stop any preview on unmount
  useEffect(() => () => { currentPreview?.stop(); currentPreview = null; }, []);

  const togglePreview = async (r: TrackReport) => {
    if (currentPreview?.id === r.id) {
      currentPreview.stop();
      currentPreview = null;
      setPlayingId(null);
      return;
    }
    currentPreview?.stop();
    currentPreview = null;
    setPlayingId(r.id);
    const state = await playPreview(r, () => setPlayingId(null));
    if (!state) {
      setPlayingId(null);
      toast.error("Preview unavailable in this browser");
      return;
    }
    currentPreview = state;
  };

  const clearFilters = () => {
    setQuery(""); setDateRange("any"); setStageFilter("any"); setGenreFilter("any");
  };
  const hasFilters = query !== "" || dateRange !== "any" || stageFilter !== "any" || genreFilter !== "any";

  return (
    <Card
      ref={sectionRef as any}
      id={ANCHOR_ID}
      tabIndex={-1}
      role="region"
      aria-label="Analysis History"
      aria-describedby={HELP_ID}
      className={cn("studio-card p-5 mb-8 outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}
    >
      {/* Screen-reader live region */}
      <div id={LIVE_ID} aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      {/* Screen-reader help text (also referenced from kbd hint via aria-describedby) */}
      <p id={HELP_ID} className="sr-only">
        Press H to focus this panel. Use Arrow Up and Arrow Down to move the highlight between
        analyses. Press Enter to activate the highlighted analysis as your Sensei coaching track.
        Shortcuts are ignored while you are typing in a search or text input.
      </p>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold">Analysis History</h2>
          {!loading && (
            <Badge variant="secondary" className="text-[10px]">
              {filtered.length} of {recent.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            aria-describedby={HELP_ID}
          >
            <Keyboard className="w-3 h-3" aria-hidden="true" />
            press <kbd className="px-1 rounded bg-muted" aria-label="H key">H</kbd> ·{" "}
            <kbd className="px-1 rounded bg-muted" aria-label="Arrow keys">↑/↓</kbd> ·{" "}
            <kbd className="px-1 rounded bg-muted" aria-label="Enter key">Enter</kbd>
          </span>
          <Button size="sm" variant="ghost" onClick={() => refreshRecent()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Search + filter UI */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
        <div className="sm:col-span-5 relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file name…"
            className="h-9 pl-8 text-sm"
            aria-label="Search analysis history by file name"
          />
        </div>
        <div className="sm:col-span-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-9 text-xs" aria-label="Filter by date range">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any date</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 text-xs" aria-label="Filter by production stage">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any stage</SelectItem>
              {STAGE_TOKENS.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Select value={genreFilter} onValueChange={setGenreFilter}>
            <SelectTrigger className="h-9 text-xs" aria-label="Filter by genre">
              <SelectValue placeholder="Genre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any genre</SelectItem>
              {GENRE_TOKENS.map((g) => (
                <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-full"
            onClick={clearFilters}
            disabled={!hasFilters}
            aria-label="Clear all filters"
            title="Clear filters"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {hasFilters && (
        <p className="text-[10px] text-muted-foreground mb-2">
          Stage and Genre are inferred from file names — rename your uploads with hints like
          “mix”, “master”, or a genre word to improve filtering.
        </p>
      )}

      {loading ? (
        <div className="space-y-2" aria-label="Loading analysis history">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
            <Music2 className="w-6 h-6 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-sm mb-1">No analyses yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            Upload a track on the Upload page and Sensei will analyze it, save the report, and
            keep it available here for cross-surface coaching.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/upload")}>
            <UploadCloud className="w-3 h-3 mr-1" /> Upload audio
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-border rounded-lg">
          <p className="text-xs text-muted-foreground mb-3">
            No analyses match your filters.
          </p>
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <div
          ref={listRef}
          className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1"
          role="listbox"
          aria-label="Past audio analyses"
          aria-activedescendant={filtered[highlightIdx] ? `history-row-${filtered[highlightIdx].id}` : undefined}
        >
          {filtered.map((r, idx) => {
            const issues = issueCount(r);
            const isActive = active?.id === r.id;
            const isHighlighted = idx === highlightIdx;
            const isPlaying = playingId === r.id;
            const stage = inferStage(r.file_name);
            const stageLabel = STAGE_TOKENS.find((s) => s.key === stage)?.label;
            return (
              <div
                key={r.id}
                id={`history-row-${r.id}`}
                ref={(el) => (rowRefs.current[idx] = el)}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => setHighlightIdx(idx)}
                className={cn(
                  "rounded-lg border p-3 flex items-start justify-between gap-3 flex-wrap transition-colors",
                  isActive ? "border-primary/60 bg-primary/5" : "border-border",
                  isHighlighted && !isActive && "ring-1 ring-primary/40",
                )}
              >
                <div className="min-w-0 flex-1 flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant={isPlaying ? "default" : "outline"}
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); togglePreview(r); }}
                      aria-label={
                        isPlaying
                          ? `Stop preview of ${r.file_name}`
                          : `Play short tonal preview of ${r.file_name} at detected key and BPM`
                      }
                      title={isPlaying ? "Stop preview" : "Preview key + BPM"}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <BandThumb r={r} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{r.file_name}</span>
                      {stageLabel && (
                        <Badge variant="outline" className="text-[10px]">{stageLabel}</Badge>
                      )}
                      {isActive && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Check className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                    <div className="flex gap-2 mt-1.5 flex-wrap text-[11px] text-muted-foreground">
                      <span>Key · {r.detected_key ?? "—"}</span>
                      <span>BPM · {r.bpm ?? "—"}</span>
                      <span>Dur · {r.duration_sec ? `${r.duration_sec.toFixed(0)}s` : "—"}</span>
                      <span>LUFS · {r.lufs_estimate?.toFixed(1) ?? "—"}</span>
                      <span className={issues > 0 ? "text-destructive" : ""}>
                        {issues} issue{issues === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success(`Chat loaded with ${r.file_name} as context`);
                        navigate("/chat");
                      }}
                      title="Open Chat — Sensei already has this track loaded as context"
                    >
                      <Eye className="w-3 h-3 mr-1" /> View details
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmActivate(r);
                      }}
                    >
                      Set active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!isActive}
                    title={
                      isActive
                        ? "Remove this track from the active coaching session"
                        : "Only the currently active session can be removed"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isActive) {
                        toast.info(
                          active
                            ? `This row isn't active. Currently coaching about "${active.file_name}". Set this row active first if you want to remove its reference.`
                            : "No active session — nothing to remove.",
                        );
                        return;
                      }
                      setConfirmRemove(true);
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Remove reference
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Activate confirm */}
      <AlertDialog open={!!confirmActivate} onOpenChange={(o) => !o && setConfirmActivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch active coaching session?</AlertDialogTitle>
            <AlertDialogDescription>
              {active ? (
                <>
                  Sensei will stop coaching about{" "}
                  <span className="font-semibold">{active.file_name}</span> and switch to{" "}
                  <span className="font-semibold">{confirmActivate?.file_name}</span> across every
                  page (Chat, Mixing, Mastering, Quick Fix, Problems, Genre).
                </>
              ) : (
                <>
                  Sensei will use{" "}
                  <span className="font-semibold">{confirmActivate?.file_name}</span> as the active
                  track on every page until you change or clear it.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = confirmActivate;
                setConfirmActivate(null);
                if (!target) return;
                setBusyId(target.id);
                await setActiveReport(target.id);
                setBusyId(null);
                toast.success(`Sensei is now coaching about ${target.file_name}`);
              }}
            >
              <MessageCircle className="w-3 h-3 mr-1" /> Switch active track
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove reference confirm */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove active track reference?</AlertDialogTitle>
            <AlertDialogDescription>
              Sensei will stop coaching about{" "}
              <span className="font-semibold">{active?.file_name}</span> and return to general
              mode. The analysis report itself stays in your history and can be reactivated anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await clearActive();
                toast("Active track reference removed");
              }}
            >
              Remove reference
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
