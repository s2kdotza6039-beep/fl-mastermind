// ============================================================================
// STUDIO SENSEI — GROOVE ENGINE (D31 / R9.6)
// ----------------------------------------------------------------------------
// Genre-true drum patterns as data: GM-note lanes, velocity tiers, and
// PITCHED lanes (log drum, 808) that carry real note names. Every pattern is
// a one-bar loop; the engine clones it across bars and applies swing by
// delaying odd 16ths. Zero AI, zero network — the same determinism as the
// chord engine.
// ============================================================================

import { noteNameToMidi, notesToMidi, type MidiEvent } from "./midi";

export interface GrooveHit { step: number; note: string; vel: number }

export interface GrooveLane {
  id: string;
  label: string;
  /** GM drum note for unpitched lanes (e.g. "C1" = kick 36). */
  note?: string;
  /** Melodic lane (log drum / 808) — `hits` carry real note names. */
  pitched?: boolean;
  /** One-bar loop for unpitched lanes: X=accent x=hard o=ghost .=rest */
  steps?: string;
  /** Pitched hits per bar. */
  hits?: GrooveHit[];
}

export interface Groove {
  id: string;
  label: string;
  genres: string[];
  bpm: number;
  stepsPerBar: number;
  lanes: GrooveLane[];
  /** Producer tip shown under the pattern. */
  note: string;
}

export const GROOVES: Groove[] = [
  { id: "amapiano-logdrum", label: "Amapiano — Log Drum Bounce", genres: ["amapiano", "yano", "private school"], bpm: 112, stepsPerBar: 16,
    lanes: [
      { id: "shaker", label: "Shaker", note: "A#3", steps: "xoxoxxoxoxxoxoxx" },
      { id: "kick", label: "Kick", note: "C1", steps: "x.......x......." },
      { id: "rim", label: "Rimshot", note: "C#1", steps: "....x.......x..." },
      { id: "logdrum", label: "Log drum", pitched: true, hits: [
        { step: 0, note: "A2", vel: 108 }, { step: 3, note: "A2", vel: 88 },
        { step: 6, note: "C3", vel: 96 }, { step: 10, note: "G2", vel: 96 },
        { step: 12, note: "A2", vel: 104 }, { step: 14, note: "E2", vel: 82 },
      ] },
    ],
    note: "Log drum is the bass AND the melody — keep 60–200 Hz empty for it. Shaker breathes better at 54% swing." },
  { id: "gqom-broken", label: "Gqom — Broken Kick", genres: ["gqom", "sgubhu"], bpm: 123, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x.....x...x....." },
      { id: "rim", label: "Rimshot", note: "C#1", steps: "....o...o......." },
      { id: "tom", label: "Dark tom", note: "F1", steps: "........x...x..x" },
      { id: "fx", label: "Whistle FX", note: "C4", steps: "....x..........." },
    ],
    note: "Contrast comes from muting, not adding. Keep it dark — resist the urge to fill space." },
  { id: "trap-808", label: "Trap — Half-time Knock", genres: ["trap", "hip-hop trap"], bpm: 140, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x......x..x....." },
      { id: "snare", label: "Snare", note: "D1", steps: "........x......." },
      { id: "hat", label: "Closed hat", note: "F#1", steps: "xoxoxoxoxoxoxoxo" },
      { id: "openhat", label: "Open hat", note: "A#1", steps: "......o.......o." },
      { id: "b808", label: "808 sub", pitched: true, hits: [
        { step: 0, note: "C2", vel: 112 }, { step: 8, note: "C2", vel: 100 },
        { step: 10, note: "G1", vel: 98 }, { step: 12, note: "D#2", vel: 102 },
      ] },
    ],
    note: "Draw 1/32 hat rolls by hand for seasoning; 808 slides = portamento/glide on the channel." },
  { id: "drill-slide", label: "Drill — Slide & Skip", genres: ["drill"], bpm: 142, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x.........x....." },
      { id: "snare", label: "Snare", note: "D1", steps: "........x...xx.." },
      { id: "hat", label: "Closed hat", note: "F#1", steps: "xxoxxoxxoxxoxxox" },
      { id: "b808", label: "808 sub", pitched: true, hits: [
        { step: 0, note: "D2", vel: 112 }, { step: 10, note: "C2", vel: 98 },
        { step: 12, note: "D2", vel: 104 }, { step: 15, note: "F2", vel: 92 },
      ] },
    ],
    note: "The snare skips ARE the signature — do not quantize them flat onto the grid." },
  { id: "kwaito-bounce", label: "Kwaito — Deep Bounce", genres: ["kwaito"], bpm: 102, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x...x...x...x..." },
      { id: "clap", label: "Clap", note: "D#1", steps: "....x.......x..." },
      { id: "hat", label: "Closed hat", note: "F#1", steps: "x..x.x..x..x.x.." },
      { id: "fx", label: "Whistle FX", note: "C4", steps: "............x..." },
    ],
    note: "Round sub weight sits 40–80 Hz. Leave air between elements — space IS the groove." },
  { id: "afrohouse-perc", label: "Afro House — Perc Layers", genres: ["afro house", "afrohouse", "afro tech", "afro-tech"], bpm: 122, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x...x...x...x..." },
      { id: "clap", label: "Clap", note: "D#1", steps: "....x.......x..." },
      { id: "congah", label: "Hi conga", note: "F#3", steps: "..x..x..x..x..x." },
      { id: "congal", label: "Lo conga", note: "F3", steps: "x..x..x.x..x...." },
      { id: "shaker", label: "Shaker", note: "A#3", steps: "xoxoxoxoxoxoxoxo" },
    ],
    note: "Percussion needs room: short verbs, wide pans, nothing muddy at 250–400 Hz." },
  { id: "boombap-swing", label: "Boom-Bap — Swing 2 & 4", genres: ["boom bap", "boom-bap", "hip-hop", "hiphop", "boombap"], bpm: 92, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x..x....x......." },
      { id: "snare", label: "Snare", note: "D1", steps: "....x.......x..." },
      { id: "hat", label: "Closed hat", note: "F#1", steps: "x.x.x.x.x.x.x.x." },
    ],
    note: "Push swing to 54–58% — the hats should lean like a head nod." },
  { id: "soulful-house", label: "Soulful House — Four-Floor", genres: ["house", "deep-house", "soulful-house", "deep house"], bpm: 123, stepsPerBar: 16,
    lanes: [
      { id: "kick", label: "Kick", note: "C1", steps: "x...x...x...x..." },
      { id: "clap", label: "Clap", note: "D#1", steps: "....x.......x..." },
      { id: "openhat", label: "Open hat", note: "A#1", steps: "..o...o...o...o." },
      { id: "shaker", label: "Shaker", note: "A#3", steps: "xoxoxoxoxoxoxoxo" },
    ],
    note: "Groove over loudness — the four-floor breathes against an offbeat bass." },
];

/** Groove-match by genre tag (substring both ways, like the playbooks). */
export function matchGrooves(genre: string | null | undefined): Groove[] {
  const g = (genre ?? "").trim().toLowerCase();
  if (!g) return [];
  return GROOVES.filter((gr) => gr.genres.some((t) => g.includes(t) || t.includes(g)));
}

/** All grooves, matched-to-genre first (stable). */
export function sortGroovesForGenre(genre: string | null | undefined): Groove[] {
  const matched = new Set(matchGrooves(genre).map((g) => g.id));
  return [...GROOVES].sort((a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)));
}

// ---- grid -------------------------------------------------------------

export interface GrooveCell { col: number; vel: number; note?: string }
export interface GrooveRow { laneId: string; label: string; cells: GrooveCell[] }

const CHAR_VEL: Record<string, number> = { X: 112, x: 96, o: 72 };

export function buildGrooveGrid(g: Groove, bars: number): { rows: GrooveRow[]; cols: number } {
  const cols = g.stepsPerBar * Math.max(1, bars);
  const rows: GrooveRow[] = g.lanes.map((lane) => {
    const cells: GrooveCell[] = [];
    for (let bar = 0; bar < Math.max(1, bars); bar++) {
      const base = bar * g.stepsPerBar;
      if (lane.pitched) {
        for (const h of lane.hits ?? []) {
          cells.push({ col: base + h.step, vel: h.vel, note: h.note });
        }
      } else {
        [...(lane.steps ?? "")].forEach((ch, step) => {
          const vel = CHAR_VEL[ch];
          if (vel) cells.push({ col: base + step, vel });
        });
      }
    }
    return { laneId: lane.id, label: lane.label, cells };
  });
  return { rows, cols };
}

// ---- midi events -------------------------------------------------------

export const STEP_TICKS = 120; // PPQ 480 / 4 = one 16th

export function grooveEvents(
  g: Groove,
  opts: { bars?: number; swing?: number } = {},
): MidiEvent[] {
  const { bars = 4, swing = 0.5 } = opts;
  const swingOffset = Math.round((swing - 0.5) * 2 * STEP_TICKS);
  const events: MidiEvent[] = [];
  for (let bar = 0; bar < Math.max(1, bars); bar++) {
    const base = bar * g.stepsPerBar * STEP_TICKS;
    for (const lane of g.lanes) {
      if (lane.pitched) {
        for (const h of lane.hits ?? []) {
          const midi = noteNameToMidi(h.note);
          if (midi === null) continue;
          events.push({
            midi, velocity: h.vel, channel: 0, durTicks: STEP_TICKS * 2,
            startTicks: base + h.step * STEP_TICKS + (h.step % 2 === 1 ? swingOffset : 0),
          });
        }
      } else {
        const laneMidi = lane.note ? noteNameToMidi(lane.note) : null;
        if (laneMidi === null) continue;
        [...(lane.steps ?? "")].forEach((ch, step) => {
          const vel = CHAR_VEL[ch];
          if (!vel) return;
          events.push({
            midi: laneMidi, velocity: vel, channel: 9, durTicks: 60,
            startTicks: base + step * STEP_TICKS + (step % 2 === 1 ? swingOffset : 0),
          });
        });
      }
    }
  }
  return events;
}

export function grooveToMidi(
  g: Groove,
  opts: { bars?: number; bpm?: number; swing?: number } = {},
): ArrayBuffer {
  const { bpm = g.bpm } = opts;
  return notesToMidi(grooveEvents(g, opts), { bpm, name: g.label });
}

// ---- FL step text --------------------------------------------------------

export function lanesToText(g: Groove, bars: number): string {
  const grid = buildGrooveGrid(g, bars);
  const lines: string[] = [`${g.label} — ${bars} bar(s), 16 steps per bar`];
  for (let bar = 0; bar < Math.max(1, bars); bar++) {
    const base = bar * g.stepsPerBar;
    lines.push(`Bar ${bar + 1}:`);
    for (const row of grid.rows) {
      const here = row.cells.filter((c) => c.col >= base && c.col < base + g.stepsPerBar);
      if (!here.length) continue;
      const shown = here
        .map((c) => (c.note ? `${c.note}@${c.col - base + 1}` : `${c.col - base + 1}`))
        .join(" ");
      lines.push(`  ${row.label}: ${shown}`);
    }
  }
  lines.push(`Producer note: ${g.note}`);
  return lines.join("\n");
}
