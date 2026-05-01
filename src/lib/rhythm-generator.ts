// Style-aware 16-step rhythm generator for chord progressions.
// Returns a printable grid + FL Studio sample suggestions.

export type RhythmStyle =
  | "Trap" | "Drill" | "Hip-hop" | "R&B"
  | "Amapiano" | "Afrobeat" | "Kwaito"
  | "House" | "Gospel" | "Pop" | "Lo-fi";

export interface RhythmTrack {
  name: string;
  /** 16 chars: 'X' = hit, 'x' = ghost, '.' = rest */
  pattern: string;
  sample: string; // FL Studio sample / instrument suggestion
}

export interface GeneratedRhythm {
  style: RhythmStyle;
  bpm: number;
  swing: string;     // e.g. "55% triplet swing"
  feel: string;      // short description
  bars: number;
  tracks: RhythmTrack[];
  chordsPerBar: string[];   // one chord per bar across `bars`
  notes: string[];   // teaching notes
}

const PRESETS: Record<RhythmStyle, Omit<GeneratedRhythm, "chordsPerBar" | "bars">> = {
  Trap: {
    style: "Trap",
    bpm: 140,
    swing: "Straight 16ths, hats use triplet rolls",
    feel: "Sparse kick, half-time snare, rolled hats, 808 glides between chord roots",
    notes: [
      "Place 808 hits on the chord roots — slide between them with portamento (Pitcher MIDI mode or 3xOsc + automation).",
      "Hat rolls land on the 'a' of beats 2 and 4 — drag note velocity from low → high.",
      "Mute the kick where the 808 hits — they share the same sub. Use Fruity Limiter sidechain (Threshold -20, Release 80 ms).",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . X . . . . . . .", sample: "FPC: 808 Mafia Kick / Vengeance VEC trap kick" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Layered clap + snare (KSHMR snare)" },
      { name: "ClosedHat",pattern: "X . X . X . X X X . X . X . XXX", sample: "FPC: Trap hat (with 1/32 rolls on 4)" },
      { name: "OpenHat",  pattern: ". . . . . . X . . . . . . . X .", sample: "FPC: Open hat — short tail" },
      { name: "808",      pattern: "X . . . . . . X X . . . . . X .", sample: "Sampler: 808 sub (tuned to chord root)" },
    ],
  },
  Drill: {
    style: "Drill",
    bpm: 142,
    swing: "Straight; sliding 808s define the groove",
    feel: "Half-time snare, sliding 808 with portamento, syncopated hats",
    notes: [
      "808 should slide between chord roots — use Pitcher in MIDI mode or 3xOsc + portamento ~120 ms.",
      "Snare lands on beat 3 only (UK drill). Layer a clap underneath for weight.",
      "Hats use double-time with occasional 1/16 rolls — keep them off-grid for swag.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . X . . . X . . . . .", sample: "FPC: Drill kick (sub-heavy)" },
      { name: "Snare",    pattern: ". . . . . . . . X . . . . . . .", sample: "FPC: UK drill snare + clap layer" },
      { name: "ClosedHat",pattern: "X X . X X . X X X X . X X . X X", sample: "FPC: Drill hat — pitched up 2 semitones" },
      { name: "OpenHat",  pattern: ". . . . . . X . . . . . . X . .", sample: "FPC: Open hat" },
      { name: "808 Slide",pattern: "X-------->X-------->X-->X------>", sample: "Sampler: 808 with Pitcher portamento" },
    ],
  },
  "Hip-hop": {
    style: "Hip-hop",
    bpm: 90,
    swing: "55% swing — boom-bap pocket",
    feel: "Boom-bap kick on 1 & 3, snare on 2 & 4, swung hats",
    notes: [
      "Quantize hats to swing 55% — gives that head-nod feel.",
      "Add ghost snares (lowercase x) at 30% velocity for groove.",
      "Filter the drum bus -3 dB at 8 kHz to get the tape feel (Fruity Parametric EQ 2).",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . X . . X . . . .", sample: "FPC: Boom-bap kick (vinyl-y)" },
      { name: "Snare",    pattern: ". . . . X . . x . . . . X . . .", sample: "FPC: Vinyl snare + rim layer" },
      { name: "ClosedHat",pattern: "X . X . X . X . X . X . X . X .", sample: "FPC: Closed hat (swing on)" },
      { name: "OpenHat",  pattern: ". . . . . . . . . . X . . . . .", sample: "FPC: Open hat" },
      { name: "Bass",     pattern: "X . . . X . . . X . . . X . . .", sample: "FL Keys / Sytrus upright bass on chord roots" },
    ],
  },
  "R&B": {
    style: "R&B",
    bpm: 75,
    swing: "65% swing, lots of ghost snares",
    feel: "Laid-back, ghost-snare-heavy, finger-snap on 2 & 4, soft 808",
    notes: [
      "R&B lives in the ghost notes — play snare velocities between 20–60.",
      "Use a finger-snap on beats 2 and 4 to replace the snare for the verse.",
      "808 should be smooth — long release, no slide. Land on chord roots.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . X . . . X . . . . .", sample: "FPC: R&B kick (soft, rounded)" },
      { name: "Snare",    pattern: ". . x . X . . x . x . . X . x .", sample: "FPC: Snare + ghost layer" },
      { name: "Snap",     pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Finger snap" },
      { name: "ClosedHat",pattern: "X . X X X . X . X X . X X . X .", sample: "FPC: Closed hat (swung)" },
      { name: "808",      pattern: "X . . . . . . . . . . . . . . .", sample: "Sampler: Soft 808 (long release)" },
    ],
  },
  Amapiano: {
    style: "Amapiano",
    bpm: 112,
    swing: "Straight 16ths with shaker shuffle",
    feel: "Log-drum on off-beats, shaker rolls, kick on 1, ghost percs everywhere",
    notes: [
      "The LOG DRUM is the bass — pitch it to the chord root every bar (Sampler root note).",
      "Shaker pattern = continuous 16ths, accents on the 'e' of every beat.",
      "Kick is sparse — usually only beat 1 of every other bar.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . . . . . . . . .", sample: "FPC: Amapiano kick (deep, short)" },
      { name: "LogDrum",  pattern: ". . X . . X . . X . X . . X . X", sample: "Sampler: Log drum (tune to chord root)" },
      { name: "Shaker",   pattern: "X x X x X x X x X x X x X x X x", sample: "FPC: Shaker (16th roll, accent on 'e')" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Soft snare / rim" },
      { name: "Perc",     pattern: ". . . X . . . . . X . . . . X .", sample: "FPC: Conga / perc loop" },
    ],
  },
  Afrobeat: {
    style: "Afrobeat",
    bpm: 105,
    swing: "Straight, with syncopated bell pattern",
    feel: "Syncopated kick, bell pattern up top, shaker drives the groove",
    notes: [
      "Bell pattern is the SIGNATURE — never quantize fully, leave human feel.",
      "Kick is syncopated (off-beat hits) — different from boom-bap.",
      "Bass plays the chord root on beat 1 of each bar with a small slide-up.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . X . . X . . X . . X . X .", sample: "FPC: Afrobeat kick" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Afro snare + clap" },
      { name: "Bell",     pattern: "X . X . X X . X . X . X X . X .", sample: "FPC: Cowbell / agogo" },
      { name: "Shaker",   pattern: "X x X x X x X x X x X x X x X x", sample: "FPC: Shaker" },
      { name: "Bass",     pattern: "X . . . . . . . . . . . . . . .", sample: "Sampler: Afro bass (pitch to chord root)" },
    ],
  },
  Kwaito: {
    style: "Kwaito",
    bpm: 100,
    swing: "Straight, deep groove",
    feel: "Slow house-y kick, lazy snare, deep bass, sparse percs",
    notes: [
      "Kwaito is the slowed-down cousin of house — keep the kick on every beat but pitched DOWN.",
      "Bass plays a 2-bar pattern on the chord roots, with a syncopated note on the 'a' of 4.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . X . . . X . . . X . . .", sample: "FPC: Kwaito kick (low-tuned house kick)" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Snare" },
      { name: "Hat",      pattern: ". . X . . . X . . . X . . . X .", sample: "FPC: Closed hat (off-beat)" },
      { name: "Perc",     pattern: ". . . X . . . . . . . X . . . .", sample: "FPC: Perc loop" },
      { name: "Bass",     pattern: "X . . . . . . X X . . . . . X .", sample: "Sampler: Sub bass on chord roots" },
    ],
  },
  House: {
    style: "House",
    bpm: 124,
    swing: "Straight, 4-on-the-floor",
    feel: "Kick every beat, open hat on off-beat, clap on 2 & 4",
    notes: [
      "Sidechain EVERYTHING to the kick — Fruity Limiter on each bus, Threshold -25, Release 120 ms.",
      "Bass plays on the 'and' of every beat (off-beat) — classic house feel.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . X . . . X . . . X . . .", sample: "FPC: House kick (punchy)" },
      { name: "Clap",     pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Clap" },
      { name: "ClosedHat",pattern: "X . X . X . X . X . X . X . X .", sample: "FPC: Closed hat" },
      { name: "OpenHat",  pattern: ". . X . . . X . . . X . . . X .", sample: "FPC: Open hat (off-beat)" },
      { name: "Bass",     pattern: ". . X . . . X . . . X . . . X .", sample: "Sytrus: Off-beat bass (chord root)" },
    ],
  },
  Gospel: {
    style: "Gospel",
    bpm: 70,
    swing: "Triplet swing 66%",
    feel: "Live drum feel, kick on 1 & 3, snare on 2 & 4, ride cymbal triplets",
    notes: [
      "Use REAL drum samples (not 808s). Layer multiple snares for depth.",
      "Ride cymbal plays triplet feel — that's the gospel heartbeat.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . X . . . . . . .", sample: "FPC: Live kick (acoustic)" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Live snare + rim" },
      { name: "Ride",     pattern: "X X . X X . X X . X X . X X . X", sample: "FPC: Ride cymbal (triplet feel)" },
      { name: "HiHat",    pattern: ". . X . . . X . . . X . . . X .", sample: "FPC: Closed hat" },
      { name: "Bass",     pattern: "X . . . X . . . X . . . X . . .", sample: "FL Keys: Upright bass on chord roots" },
    ],
  },
  Pop: {
    style: "Pop",
    bpm: 118,
    swing: "Straight",
    feel: "Punchy kick, big clap-snare on 2 & 4, driving hats",
    notes: [
      "Layer a clap UNDER the snare for radio width (pan clap ±15 L/R).",
      "Use sidechain pumping on the chord pad to give that radio-friendly breathing feel.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . X . . . . . X .", sample: "FPC: Pop kick (punchy, mid-forward)" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Snare + clap layer" },
      { name: "ClosedHat",pattern: "X . X . X . X . X . X . X . X .", sample: "FPC: Closed hat" },
      { name: "OpenHat",  pattern: ". . . . . . X . . . . . . . X .", sample: "FPC: Open hat" },
      { name: "Bass",     pattern: "X . . . X . . . X . . . X . . X", sample: "Sytrus: Synth bass on chord roots" },
    ],
  },
  "Lo-fi": {
    style: "Lo-fi",
    bpm: 80,
    swing: "60% swing, loose timing",
    feel: "Dusty kick, brushed snare, jazzy hats, vinyl crackle",
    notes: [
      "Add Fruity Filter LP at 7 kHz to dull the highs — that's the lo-fi sheen.",
      "Drop a vinyl crackle sample (-25 dB) on a parallel bus.",
      "DO NOT quantize 100% — leave human timing.",
    ],
    tracks: [
      { name: "Kick",     pattern: "X . . . . . . . X . . . . . . .", sample: "FPC: Lo-fi kick (dusty)" },
      { name: "Snare",    pattern: ". . . . X . . . . . . . X . . .", sample: "FPC: Brushed snare" },
      { name: "ClosedHat",pattern: "X . X . X X . X X . X . X X . X", sample: "FPC: Jazzy hat (swung)" },
      { name: "Vinyl",    pattern: "X X X X X X X X X X X X X X X X", sample: "Sampler: Vinyl crackle (parallel, -25 dB)" },
      { name: "Bass",     pattern: "X . . . X . . . X . . . X . . .", sample: "FL Keys: Upright bass" },
    ],
  },
};

export function generateRhythm(style: RhythmStyle, chords: string[], bars = 4): GeneratedRhythm {
  const preset = PRESETS[style];
  // Cycle / pad chords to fill bars
  const chordsPerBar = Array.from({ length: bars }, (_, i) => chords[i % chords.length] ?? chords[0]);
  return { ...preset, bars, chordsPerBar };
}

export const RHYTHM_STYLES: RhythmStyle[] = [
  "Trap", "Drill", "Hip-hop", "R&B", "Amapiano", "Afrobeat", "Kwaito", "House", "Gospel", "Pop", "Lo-fi",
];

/** Picks a sensible default style for a music genre. */
export function suggestStyleForGenre(genre: string): RhythmStyle {
  const g = genre.toLowerCase();
  if (g.includes("trap")) return "Trap";
  if (g.includes("drill")) return "Drill";
  if (g.includes("amapiano")) return "Amapiano";
  if (g.includes("afro")) return "Afrobeat";
  if (g.includes("kwaito")) return "Kwaito";
  if (g.includes("house")) return "House";
  if (g.includes("r&b") || g.includes("rnb") || g.includes("soul")) return "R&B";
  if (g.includes("gospel")) return "Gospel";
  if (g.includes("pop")) return "Pop";
  if (g.includes("lo-fi") || g.includes("lofi")) return "Lo-fi";
  return "Hip-hop";
}

/** Pretty plain-text export for FL Studio Notes / clipboard. */
export function rhythmToText(r: GeneratedRhythm): string {
  const lines: string[] = [];
  lines.push(`STUDIO SENSEI — Rhythm Pattern`);
  lines.push(`Style: ${r.style}   BPM: ${r.bpm}   Feel: ${r.swing}`);
  lines.push(`Bars: ${r.bars}   Chords: ${r.chordsPerBar.join(" | ")}`);
  lines.push(``);
  lines.push(`Grid: 16 steps per bar (1e&a 2e&a 3e&a 4e&a)`);
  lines.push(`X = hit · x = ghost · . = rest`);
  lines.push(``);
  for (const t of r.tracks) {
    lines.push(`${t.name.padEnd(10)}: ${t.pattern}    [${t.sample}]`);
  }
  lines.push(``);
  lines.push(`Notes:`);
  for (const n of r.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}
