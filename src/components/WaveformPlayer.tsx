import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, X, ZoomIn, ZoomOut } from "lucide-react";

export interface WaveformSelection {
  startSec: number;
  endSec: number;
}

export interface WaveformPlayerHandle {
  togglePlay: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  isPlaying: () => boolean;
}

interface WaveformPlayerProps {
  src: string;
  peaks: Float32Array | null;
  durationSec: number;
  /** Detected BPM — when set, a beat grid is drawn across the waveform. */
  bpm?: number | null;
  /** Confidence 0–1 controls beat-grid opacity (low conf = faint). */
  bpmConfidence?: number;
  /** Phase offset (seconds) — where the first downbeat sits. */
  bpmOffsetSec?: number;
  selection?: WaveformSelection | null;
  onSelectionChange?: (sel: WaveformSelection | null) => void;
  /** Receives the underlying canvas so the parent can snapshot it (e.g. for PDF export). */
  onCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ZOOM_LEVELS = [1, 2, 4, 8, 16];

/** Lightweight waveform display + transport + beat grid + zoom + selection. */
export const WaveformPlayer = forwardRef<WaveformPlayerHandle, WaveformPlayerProps>(function WaveformPlayer(
  {
    src,
    peaks,
    durationSec,
    bpm,
    bpmConfidence = 1,
    bpmOffsetSec = 0,
    selection,
    onSelectionChange,
    onCanvasRef,
  },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationSec);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [viewStartSec, setViewStartSec] = useState(0);
  const dragRef = useRef<{ startX: number; startT: number; moved: boolean } | null>(null);

  const zoom = ZOOM_LEVELS[zoomIdx];
  const totalDur = actualDuration > 0 ? actualDuration : durationSec;
  const viewDur = totalDur / zoom;

  // Clamp / auto-follow viewStart so playhead stays visible.
  useEffect(() => {
    if (zoom === 1) { if (viewStartSec !== 0) setViewStartSec(0); return; }
    const maxStart = Math.max(0, totalDur - viewDur);
    let next = viewStartSec;
    if (pos < viewStartSec || pos > viewStartSec + viewDur) {
      next = Math.max(0, Math.min(maxStart, pos - viewDur / 2));
    }
    next = Math.max(0, Math.min(maxStart, next));
    if (next !== viewStartSec) setViewStartSec(next);
  }, [zoom, pos, totalDur, viewDur, viewStartSec]);

  useEffect(() => {
    onCanvasRef?.(canvasRef.current);
    return () => onCanvasRef?.(null);
  }, [onCanvasRef]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  useImperativeHandle(ref, () => ({
    togglePlay: toggle,
    zoomIn: () => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1)),
    zoomOut: () => setZoomIdx((i) => Math.max(0, i - 1)),
    resetZoom: () => { setZoomIdx(0); setViewStartSec(0); },
    isPlaying: () => !!audioRef.current && !audioRef.current.paused,
  }), []);

  // Redraw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const mid = cssH / 2;
    const vStart = viewStartSec;
    const vDur = viewDur;
    const secToX = (s: number) => ((s - vStart) / vDur) * cssW;
    const playedX = secToX(pos);

    const root = getComputedStyle(document.documentElement);
    const primary = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"})`;
    const muted = `hsl(${root.getPropertyValue("--muted-foreground").trim() || "220 10% 50%"} / 0.45)`;

    // Selection backdrop
    if (selection && vDur > 0) {
      const x1 = secToX(selection.startSec);
      const x2 = secToX(selection.endSec);
      ctx.fillStyle = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / 0.18)`;
      ctx.fillRect(Math.min(x1, x2), 0, Math.abs(x2 - x1), cssH);
    }

    // Waveform — slice peaks for current view.
    if (peaks && totalDur > 0) {
      const startBucket = Math.floor((vStart / totalDur) * peaks.length);
      const endBucket = Math.ceil(((vStart + vDur) / totalDur) * peaks.length);
      const visible = Math.max(1, endBucket - startBucket);
      const barW = Math.max(1, cssW / visible);
      for (let i = 0; i < visible; i++) {
        const peak = peaks[startBucket + i] ?? 0;
        const x = i * barW;
        const h = Math.max(1, peak * (cssH * 0.92));
        ctx.fillStyle = x < playedX ? primary : muted;
        ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
      }
    }

    // Beat grid
    if (bpm && bpm > 0 && vDur > 0) {
      const beatSec = 60 / bpm;
      const alpha = Math.max(0.15, Math.min(0.7, bpmConfidence));
      const beatColor = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / ${alpha})`;
      const downbeatColor = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / ${Math.min(1, alpha + 0.25)})`;
      const offset = ((bpmOffsetSec % beatSec) + beatSec) % beatSec;
      // First beat index visible
      const firstBeatIdx = Math.max(0, Math.floor((vStart - offset) / beatSec));
      const lastBeatIdx = Math.min(firstBeatIdx + 1024, Math.floor((vStart + vDur - offset) / beatSec) + 1);
      for (let i = firstBeatIdx; i <= lastBeatIdx; i++) {
        const t = offset + i * beatSec;
        if (t > totalDur) break;
        const x = secToX(t);
        if (x < -2 || x > cssW + 2) continue;
        const isDownbeat = i % 4 === 0;
        ctx.fillStyle = isDownbeat ? downbeatColor : beatColor;
        const w = isDownbeat ? 1.4 : 0.6;
        const top = isDownbeat ? 0 : cssH * 0.18;
        const bot = isDownbeat ? cssH : cssH * 0.82;
        ctx.fillRect(x, top, w, bot - top);
      }
    }

    // Selection borders
    if (selection && vDur > 0) {
      const x1 = secToX(selection.startSec);
      const x2 = secToX(selection.endSec);
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.min(x1, x2) + 0.5, 0); ctx.lineTo(Math.min(x1, x2) + 0.5, cssH);
      ctx.moveTo(Math.max(x1, x2) - 0.5, 0); ctx.lineTo(Math.max(x1, x2) - 0.5, cssH);
      ctx.stroke();
    }

    // Playhead
    if (playedX >= 0 && playedX <= cssW) {
      ctx.fillStyle = primary;
      ctx.fillRect(Math.max(0, playedX - 1), 0, 2, cssH);
    }
  }, [peaks, pos, actualDuration, durationSec, bpm, bpmConfidence, bpmOffsetSec, selection, viewStartSec, viewDur, totalDur]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPos(a.currentTime);
    const onMeta = () => { if (isFinite(a.duration) && a.duration > 0) setActualDuration(a.duration); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => { setPlaying(false); setPos(a.duration || 0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const restart = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setPos(0);
  };

  const xToTime = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(totalDur, viewStartSec + pct * viewDur));
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const t = xToTime(e.clientX);
    dragRef.current = { startX: e.clientX, startT: t, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) > 3) d.moved = true;
    if (d.moved && onSelectionChange) {
      const t = xToTime(e.clientX);
      onSelectionChange({ startSec: Math.min(d.startT, t), endSec: Math.max(d.startT, t) });
    }
  };
  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      const a = audioRef.current;
      const t = xToTime(e.clientX);
      if (a) { a.currentTime = t; setPos(t); }
      if (selection && (t < selection.startSec || t > selection.endSec) && onSelectionChange) {
        onSelectionChange(null);
      }
    } else if (onSelectionChange) {
      const t = xToTime(e.clientX);
      const start = Math.min(d.startT, t);
      const end = Math.max(d.startT, t);
      if (end - start < 0.25) onSelectionChange(null);
      else onSelectionChange({ startSec: start, endSec: end });
    }
  };

  const clearSelection = () => onSelectionChange?.(null);

  return (
    <div className="mt-4 space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="relative w-full h-20 rounded-md bg-secondary/40 border border-border overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragRef.current = null; }}
          className="w-full h-full cursor-crosshair select-none"
          aria-label="Audio waveform — click to seek, drag to select a region"
        />
        {!peaks && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
            Generating waveform…
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" size="icon" variant="outline" onClick={restart} aria-label="Restart">
          <SkipBack className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={toggle}
          className="bg-gradient-gold text-primary-foreground hover:opacity-90"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums ml-1">
          {fmt(pos)} / {fmt(actualDuration || durationSec)}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0} aria-label="Zoom out" title="Zoom out (−)">
            <ZoomOut className="w-3 h-3" />
          </Button>
          <span className="text-[10px] tabular-nums text-muted-foreground min-w-[28px] text-center">{zoom}x</span>
          <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1} aria-label="Zoom in" title="Zoom in (+)">
            <ZoomIn className="w-3 h-3" />
          </Button>
        </div>
        {selection && (
          <div className="flex items-center gap-1 ml-auto text-xs">
            <span className="text-primary tabular-nums">
              Selection: {fmt(selection.startSec)}–{fmt(selection.endSec)} ({(selection.endSec - selection.startSec).toFixed(1)}s)
            </span>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={clearSelection} aria-label="Clear selection">
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
        {bpm && !selection && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            Beat grid: {bpm} BPM · drag to select · Space / +/− / ←→
          </span>
        )}
      </div>
    </div>
  );
});
