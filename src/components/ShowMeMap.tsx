import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FlProcedure, FlZone } from "@/lib/fl-procedures";

export const ShowMeMap = ({ procedure, onClose }: { procedure: FlProcedure; onClose?: () => void }) => {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const n = procedure.steps.length;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 1600);
    return () => clearInterval(t);
  }, [playing, n]);

  const zone = procedure.zones[idx];

  const panel = (id: FlZone, label: string, cls: string) => (
    <div
      className={`relative rounded-md border px-2 py-1 text-[10px] flex items-center transition-colors ${cls} ${
        zone === id ? "border-primary bg-primary/15 text-foreground" : "border-border bg-muted/30 text-muted-foreground"
      }`}
    >
      {label}
      {zone === id && (
        <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-pulse">
          {idx + 1}
        </span>
      )}
    </div>
  );

  return (
    <div className="mt-2 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold">
          👁 Show Me — {procedure.title} ({procedure.flVersions})
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Restart"
            onClick={() => { setIdx(0); setPlaying(true); }}>
            <RotateCcw className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" title={playing ? "Pause" : "Play"}
            onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </Button>
          {onClose && (
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Close" onClick={onClose}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Simplified FL Studio zone map — the highlight shows WHERE to click. */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="col-span-2">{panel("menu", "☰ Menu bar (F5 Playlist · F7 Piano roll · F9 Mixer)", "h-6")}</div>
        {panel("channel-rack", "Channel Rack", "h-14")}
        {panel("mixer", "Mixer", "h-14")}
        <div className="col-span-2">{panel("playlist", "Playlist", "h-10")}</div>
        {panel("piano-roll", "Piano roll", "h-12")}
        {panel("edison", "Edison", "h-12")}
      </div>

      <div className="mt-3 space-y-0.5">
        {procedure.steps.map((s, i) => (
          <button key={i} type="button" onClick={() => { setIdx(i); setPlaying(false); }}
            className={`w-full text-left text-[11px] rounded px-2 py-1 transition-colors ${i === idx ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>
    </div>
  );
};
