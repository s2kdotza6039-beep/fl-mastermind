import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack } from "lucide-react";

interface WaveformPlayerProps {
  src: string;
  peaks: Float32Array | null;
  durationSec: number;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Lightweight waveform display + transport controls, driven by a hidden <audio>. */
export function WaveformPlayer({ src, peaks, durationSec }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationSec);

  // Draw waveform whenever peaks/position changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
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
    const playedPct = actualDuration > 0 ? pos / actualDuration : 0;
    const playedX = playedPct * cssW;

    // Choose colors from CSS variables so we honour the theme.
    const root = getComputedStyle(document.documentElement);
    const primary = `hsl(${root.getPropertyValue("--primary").trim() || "45 95% 55%"})`;
    const muted = `hsl(${root.getPropertyValue("--muted-foreground").trim() || "220 10% 50%"} / 0.45)`;

    const buckets = peaks.length;
    const barW = Math.max(1, cssW / buckets);
    for (let i = 0; i < buckets; i++) {
      const x = i * barW;
      const h = Math.max(1, peaks[i] * (cssH * 0.92));
      ctx.fillStyle = x < playedX ? primary : muted;
      ctx.fillRect(x, mid - h / 2, Math.max(1, barW - 0.5), h);
    }

    // Playhead
    ctx.fillStyle = primary;
    ctx.fillRect(Math.max(0, playedX - 1), 0, 2, cssH);
  }, [peaks, pos, actualDuration]);

  // Wire up audio events
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

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a = audioRef.current;
    const canvas = canvasRef.current;
    if (!a || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = Math.max(0, Math.min(actualDuration, pct * actualDuration));
    a.currentTime = t;
    setPos(t);
  };

  return (
    <div className="mt-4 space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="relative w-full h-20 rounded-md bg-secondary/40 border border-border overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="w-full h-full cursor-pointer"
          aria-label="Audio waveform — click to seek"
        />
        {!peaks && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
            Generating waveform…
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
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
          {fmt(pos)} / {fmt(actualDuration)}
        </div>
      </div>
    </div>
  );
}
