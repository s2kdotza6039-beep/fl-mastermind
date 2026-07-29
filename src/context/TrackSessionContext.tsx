import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { ChatContext } from "@/lib/sensei-api";
import { announceTrackActivated, EVT_ACTIVATE_TRACK, EVT_CLEAR_TRACK } from "@/lib/project-track-events";

export interface TrackReport {
  id: string;
  file_name: string;
  file_format: string | null;
  file_size_bytes: number | null;
  duration_sec: number | null;
  sample_rate: number | null;
  bit_rate: number | null;
  channels: number | null;
  peak_db: number | null;
  rms_db: number | null;
  lufs_estimate: number | null;
  dynamic_range_db: number | null;
  stereo_width: number | null;
  bpm: number | null;
  detected_key: string | null;
  band_low_db: number | null;
  band_lowmid_db: number | null;
  band_mid_db: number | null;
  band_highmid_db: number | null;
  band_high_db: number | null;
  detected_issues: any;
  recommendations: any;
  created_at: string;
}

interface TrackSessionContextValue {
  active: TrackReport | null;
  loading: boolean;
  recent: TrackReport[];
  refreshRecent: () => Promise<void>;
  setActiveReport: (reportId: string) => Promise<void>;
  clearActive: () => Promise<void>;
  toChatAudio: () => ChatContext["audio"] | undefined;
}

const REPORT_FIELDS =
  "id, file_name, file_format, file_size_bytes, duration_sec, sample_rate, bit_rate, channels, peak_db, rms_db, lufs_estimate, dynamic_range_db, stereo_width, bpm, detected_key, band_low_db, band_lowmid_db, band_mid_db, band_highmid_db, band_high_db, detected_issues, recommendations, created_at";

const TrackSessionCtx = createContext<TrackSessionContextValue | null>(null);

const LOCAL_KEY = "studio-sensei-active-report-id";

function widthLabel(w: number | null | undefined): string | undefined {
  if (w == null) return undefined;
  if (w < 0.25) return "Narrow / mostly mono";
  if (w < 0.55) return "Moderate stereo";
  if (w < 0.85) return "Wide stereo";
  return "Very wide stereo";
}

export const TrackSessionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [active, setActive] = useState<TrackReport | null>(null);
  const [recent, setRecent] = useState<TrackReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActive = useCallback(async () => {
    if (!user) {
      setActive(null);
      setRecent([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // 1. Try saved active session row
    const { data: sessionRow } = await supabase
      .from("user_active_track_session")
      .select("audio_analysis_report_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let activeReport: TrackReport | null = null;
    if (sessionRow?.audio_analysis_report_id) {
      const { data: rep } = await supabase
        .from("audio_analysis_reports")
        .select(REPORT_FIELDS)
        .eq("id", sessionRow.audio_analysis_report_id)
        .maybeSingle();
      if (rep) activeReport = rep as TrackReport;
    }

    // 2. Fallback to localStorage hint (for instant restore after fresh sign-in)
    if (!activeReport) {
      const hint = localStorage.getItem(LOCAL_KEY);
      if (hint) {
        const { data: rep } = await supabase
          .from("audio_analysis_reports")
          .select(REPORT_FIELDS)
          .eq("id", hint)
          .maybeSingle();
        if (rep) activeReport = rep as TrackReport;
      }
    }

    // 3. Fallback to latest analysis
    if (!activeReport) {
      const { data: rep } = await supabase
        .from("audio_analysis_reports")
        .select(REPORT_FIELDS)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rep) activeReport = rep as TrackReport;
    }

    setActive(activeReport);
    if (activeReport) {
      localStorage.setItem(LOCAL_KEY, activeReport.id);
      // Let the project layer persist this as the project's last-opened track.
      announceTrackActivated(activeReport.id);
    }

    // Recent list
    const { data: recentRows } = await supabase
      .from("audio_analysis_reports")
      .select(REPORT_FIELDS)
      .order("created_at", { ascending: false })
      .limit(15);
    setRecent((recentRows as TrackReport[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  const setActiveReport = useCallback(
    async (reportId: string) => {
      if (!user) return;
      const { data: rep, error } = await supabase
        .from("audio_analysis_reports")
        .select(REPORT_FIELDS)
        .eq("id", reportId)
        .maybeSingle();
      if (error || !rep) return;
      const report = rep as TrackReport;
      await supabase.from("user_active_track_session").upsert(
        {
          user_id: user.id,
          audio_analysis_report_id: report.id,
          track_name: report.file_name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      setActive(report);
      localStorage.setItem(LOCAL_KEY, report.id);
      announceTrackActivated(report.id);
    },
    [user],
  );

  // Project layer asks us to activate a specific (per-project) track.
  useEffect(() => {
    const handler = (e: Event) => {
      const reportId = (e as CustomEvent<{ reportId?: string }>).detail?.reportId;
      if (reportId && reportId !== active?.id) {
        setActiveReport(reportId).catch(() => {});
      }
    };
    window.addEventListener(EVT_ACTIVATE_TRACK, handler);
    return () => window.removeEventListener(EVT_ACTIVATE_TRACK, handler);
  }, [active?.id, setActiveReport]);

  useEffect(() => {
    const handler = () => { clearActive().catch(() => {}); };
    window.addEventListener(EVT_CLEAR_TRACK, handler);
    return () => window.removeEventListener(EVT_CLEAR_TRACK, handler);
  }, [clearActive]);

  const clearActive = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_active_track_session").delete().eq("user_id", user.id);
    setActive(null);
    localStorage.removeItem(LOCAL_KEY);
  }, [user]);

  const refreshRecent = useCallback(async () => {
    const { data } = await supabase
      .from("audio_analysis_reports")
      .select(REPORT_FIELDS)
      .order("created_at", { ascending: false })
      .limit(15);
    setRecent((data as TrackReport[]) ?? []);
  }, []);

  const toChatAudio = useCallback((): ChatContext["audio"] | undefined => {
    if (!active) return undefined;
    const issues = Array.isArray(active.detected_issues) ? active.detected_issues : [];
    return {
      fileName: active.file_name,
      fileFormat: active.file_format ?? undefined,
      durationSec: active.duration_sec ?? undefined,
      sampleRate: active.sample_rate ?? undefined,
      bitRate: active.bit_rate ?? undefined,
      channels: active.channels ?? undefined,
      peakDb: active.peak_db ?? undefined,
      rmsDb: active.rms_db ?? undefined,
      lufsEstimate: active.lufs_estimate ?? undefined,
      dynamicRangeDb: active.dynamic_range_db ?? undefined,
      stereoWidth: active.stereo_width ?? undefined,
      stereoWidthLabel: widthLabel(active.stereo_width),
      bpm: active.bpm,
      detectedKey: active.detected_key,
      bands: {
        low: active.band_low_db ?? 0,
        lowMid: active.band_lowmid_db ?? 0,
        mid: active.band_mid_db ?? 0,
        highMid: active.band_highmid_db ?? 0,
        high: active.band_high_db ?? 0,
      },
      issues: issues.map((i: any) => ({
        severity: String(i?.severity ?? "info"),
        title: String(i?.title ?? ""),
        detail: String(i?.detail ?? ""),
        recommendation: String(i?.recommendation ?? ""),
      })),
      recommendations: Array.isArray(active.recommendations)
        ? active.recommendations.map((r: any) => String(r)).filter(Boolean)
        : [],
    };
  }, [active]);

  return (
    <TrackSessionCtx.Provider
      value={{ active, loading, recent, refreshRecent, setActiveReport, clearActive, toChatAudio }}
    >
      {children}
    </TrackSessionCtx.Provider>
  );
};

export const useTrackSession = () => {
  const ctx = useContext(TrackSessionCtx);
  if (!ctx) throw new Error("useTrackSession must be used within TrackSessionProvider");
  return ctx;
};
