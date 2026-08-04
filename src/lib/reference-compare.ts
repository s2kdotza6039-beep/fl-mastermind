// Session-only reference-track comparison. Pure derivation, no persistence.
import type { AudioMetrics } from "./audio-analysis";

export type CompareVerdict = "match" | "mine_higher" | "mine_lower";
export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  mine: number | string;
  reference: number | string;
  delta: number | null;
  verdict: CompareVerdict;
}

function row(
  key: string,
  label: string,
  unit: string,
  mine: number | null,
  reference: number | null,
  threshold: number,
): CompareRow {
  if (mine === null || reference === null || !Number.isFinite(mine) || !Number.isFinite(reference)) {
    return { key, label, unit, mine: mine ?? "—", reference: reference ?? "—", delta: null, verdict: "match" };
  }
  const delta = Math.round((mine - reference) * 100) / 100;
  const verdict: CompareVerdict =
    Math.abs(delta) <= threshold ? "match" : delta > 0 ? "mine_higher" : "mine_lower";
  return { key, label, unit, mine, reference, delta, verdict };
}

function nn(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

export function compareMetrics(mine: AudioMetrics, reference: AudioMetrics): CompareRow[] {
  const m: AudioMetrics = mine;
  const r: AudioMetrics = reference;
  return [
    row("lufs", "Integrated loudness", "LUFS", nn(m.lufsEstimate), nn(r.lufsEstimate), 0.5),
    row("truePeak", "True peak (est.)", "dBTP", nn(m.truePeakDbtp ?? m.peakDb), nn(r.truePeakDbtp ?? r.peakDb), 0.5),
    row("dr", "Dynamic range", "dB", nn(m.dynamicRangeDb), nn(r.dynamicRangeDb), 1),
    row("width", "Stereo width", "", nn(m.stereoWidth), nn(r.stereoWidth), 0.05),
    row("bpm", "Tempo", "BPM", m.bpm ?? null, r.bpm ?? null, 2),
    row("band_low", "Low (20–120 Hz)", "dB", nn(m.bands.low), nn(r.bands.low), 1.5),
    row("band_lowmid", "Low-mid (120–500 Hz)", "dB", nn(m.bands.lowMid), nn(r.bands.lowMid), 1.5),
    row("band_mid", "Mid (500 Hz–2 kHz)", "dB", nn(m.bands.mid), nn(r.bands.mid), 1.5),
    row("band_highmid", "High-mid (2–6 kHz)", "dB", nn(m.bands.highMid), nn(r.bands.highMid), 1.5),
    row("band_high", "High (6 kHz+)", "dB", nn(m.bands.high), nn(r.bands.high), 1.5),
  ];
}

/** One-line Sensei-style summary of the comparison. */
export function compareSummary(rows: CompareRow[]): string {
  const off = rows.filter((r) => r.verdict !== "match");
  if (off.length === 0) return "Your bounce sits right on the reference profile. Tight.";
  const loud = rows.find((r) => r.key === "lufs");
  const base =
    loud && loud.verdict !== "match"
      ? loud.verdict === "mine_higher"
        ? `You're ${Math.abs(loud.delta ?? 0).toFixed(1)} dB hotter than the reference`
        : `You're ${Math.abs(loud.delta ?? 0).toFixed(1)} dB quieter than the reference`
      : "Loudness tracks the reference";
  const tonal = off.filter((r) => r.key.startsWith("band_")).map((r) => r.label.split(" (")[0]);
  return tonal.length
    ? `${base}; biggest tonal gaps: ${tonal.join(", ")}.`
    : `${base}.`;
}
