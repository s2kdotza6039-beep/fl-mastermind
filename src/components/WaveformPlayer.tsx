import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, X } from "lucide-react";

export interface WaveformSelection {
  startSec: number;
  endSec: number;
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

/** Lightweight waveform display + transport controls + beat grid + click-drag selection. */
export function WaveformPlayer({
  src,
  peaks,
  durationSec,
  bpm,
  bpmConfidence = 1,
  bpmOffsetSec = 0,
  selection,
  onSelectionChange,
  onCanvasRef,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationSec);
  const dragRef = useRef<{ startX: number; startT: number; moved: boolean } | null>(null);

  useEffect(() => {
    onCanvasRef?.(canvasRef.current);
    return () => onCanvasRef?.(null);
  }, [onCanvasRef]);

  // Redraw on any visual input change.
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
    const dur = actualDuration > 0 ? actualDuration : durationSec;
    const playedPct = dur > 0 ? pos / dur : 0;
    const playedX = playedPct * cssW;

    const root = getComputedStyle(document.documentElement);
    const primary = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"})`;
    const muted = `hsl(${root.getPropertyValue("--muted-foreground").trim() || "220 10% 50%"} / 0.45)`;

    // Selection backdrop first (under waveform)
    if (selection && dur > 0) {
      const x1 = (selection.startSec / dur) * cssW;
      const x2 = (selection.endSec / dur) * cssW;
      ctx.fillStyle = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / 0.18)`;
      ctx.fillRect(Math.min(x1, x2), 0, Math.abs(x2 - x1), cssH);
    }

    // Waveform bars
    if (peaks) {
      const buckets = peaks.length;
      const barW = Math.max(1, cssW / buckets);
      for (let i = 0; i < buckets; i++) {
        const x = i * barW;
        const h = Math.max(1, peaks[i] * (cssH * 0.92));
        ctx.fillStyle = x < playedX ? primary : muted;
        ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
      }
    }

    // Beat grid (drawn over waveform, under playhead)
    if (bpm && bpm > 0 && dur > 0) {
      const beatSec = 60 / bpm;
      const alpha = Math.max(0.15, Math.min(0.7, bpmConfidence));
      const beatColor = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / ${alpha})`;
      const downbeatColor = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"} / ${Math.min(1, alpha + 0.25)})`;
      const offset = ((bpmOffsetSec % beatSec) + beatSec) % beatSec;
      const totalBeats = Math.floor((dur - offset) / beatSec);
      const maxBeats = Math.min(totalBeats, 512);
      for (let i = 0; i <= maxBeats; i++) {
        const t = offset + i * beatSec;
        if (t > dur) break;
        const x = (t / dur) * cssW;
        const isDownbeat = i % 4 === 0;
        ctx.fillStyle = isDownbeat ? downbeatColor : beatColor;
        const w = isDownbeat ? 1.4 : 0.6;
        const top = isDownbeat ? 0 : cssH * 0.18;
        const bot = isDownbeat ? cssH : cssH * 0.82;
        ctx.fillRect(x, top, w, bot - top);
      }
    }

    // Selection borders
    if (selection && dur > 0) {
      const x1 = (selection.startSec / dur) * cssW;
      const x2 = (selection.endSec / dur) * cssW;
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.min(x1, x2) + 0.5, 0); ctx.lineTo(Math.min(x1, x2) + 0.5, cssH);
      ctx.moveTo(Math.max(x1, x2) - 0.5, 0); ctx.lineTo(Math.max(x1, x2) - 0.5, cssH);
      ctx.stroke();
    }

    // Playhead
    ctx.fillStyle = primary;
    ctx.fillRect(Math.max(0, playedX - 1), 0, 2, cssH);
  }, [peaks, pos, actualDuration, durationSec, bpm, bpmConfidence, selection]);

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

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

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
    const dur = actualDuration || durationSec;
    return Math.max(0, Math.min(dur, pct * dur));
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
      const start = Math.min(d.startT, t);
      const end = Math.max(d.startT, t);
      onSelectionChange({ startSec: start, endSec: end });
    }
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      // Click — seek
      const a = audioRef.current;
      const t = xToTime(e.clientX);
      if (a) { a.currentTime = t; setPos(t); }
      // Clicking outside an existing selection clears it; clicking inside leaves it.
      if (selection && (t < selection.startSec || t > selection.endSec) && onSelectionChange) {
        onSelectionChange(null);
      }
    } else if (onSelectionChange) {
      const t = xToTime(e.clientX);
      const start = Math.min(d.startT, t);
      const end = Math.max(d.startT, t);
      // Discard tiny selections (< 0.25s) — treat as a click.
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
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums ml-1">
          {fmt(pos)} / {fmt(actualDuration || durationSec)}
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
            Beat grid: {bpm} BPM · drag waveform to select a region
          </span>
        )}
      </div>
    </div>
  );
}
