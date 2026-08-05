// ============================================================================
// STUDIO SENSEI — CHORD PROGRESSION ENGINE (D23 / D16 Tier-1 / D26)
// ----------------------------------------------------------------------------
// Deterministic chord-progression generator. ZERO AI, ZERO network — pure
// music-theory tables + a seeded voicing engine ("endless" = infinite seeds).
// ============================================================================

import { noteNameToMidi } from "./midi";

export type Mode = "major" | "minor";
export type Direction = "uplifting" | "dark" | "soulful" | "hard" | "chill";

export const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const DIRECTIONS: Direction[] = ["uplifting", "dark", "soulful", "hard", "chill"];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** Semitone intervals from the chord root, per quality. */
const QUALITY_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
};

const QUALITY_SUFFIX: Record<string, string> = {
  maj: "", min: "m", "7": "7", maj7: "maj7", min7: "m7",
  min9: "m9", maj9: "maj9", add9: "add9", sus2: "sus2", sus4: "sus4", dim: "dim",
};

export interface ProgressionResult {
  /** Human label, e.g. "Yano soul loop". */
  label: string;
  /** Roman numerals for display, e.g. ["i9", "VImaj7", "IIImaj7", "VII7"]. */
  romans: string[];
  /** Chord names in the chosen key, e.g. ["Am9", "Fmaj7", "Cmaj7", "G7"]. */
  chords: string[];
  /** FL Piano-roll note names per chord. */
  notes: string[][];
  matchedGenre: boolean;
  matchedDirection: boolean;
}

interface Recipe {
  label: string;
  mode: Mode;
  /** 0-based scale degrees for each chord root. */
  degrees: number[];
  /** Optional semitone shift per degree (borrowed chords like bVII). Default 0. */
  shift?: number[];
  /** Chord quality per degree, index-aligned. */
  qualities: string[];
  /** Roman numerals, index-aligned (display only). */
  romans: string[];
  genres: string[];
  directions: Direction[];
}

const RECIPES: Recipe[] = [
  // ---- MINOR ----
  { label: "Yano soul loop", mode: "minor",
    degrees: [0, 5, 2, 6], qualities: ["min9", "maj7", "maj7", "7"],
    romans: ["i9", "VImaj7", "IIImaj7", "VII7"],
    genres: ["amapiano", "afro-house", "deep-house", "r&b"], directions: ["soulful", "chill"] },
  { label: "Emotive minor loop", mode: "minor",
    degrees: [0, 5, 2, 6], qualities: ["min", "maj", "maj", "maj"],
    romans: ["i", "VI", "III", "VII"],
    genres: ["amapiano", "pop", "r&b", "kwaito"], directions: ["soulful", "uplifting"] },
  { label: "Trap minor drive", mode: "minor",
    degrees: [0, 3, 5, 4], qualities: ["min", "min", "maj", "7"],
    romans: ["i", "iv", "VI", "V7"],
    genres: ["trap", "drill", "hip-hop"], directions: ["dark", "hard"] },
  { label: "Dark pull-down", mode: "minor",
    degrees: [0, 6, 5, 6], qualities: ["min", "maj", "maj", "maj"],
    romans: ["i", "VII", "VI", "VII"],
    genres: ["gqom", "trap", "drill", "techno"], directions: ["dark", "hard"] },
  { label: "Wavey minor drift", mode: "minor",
    degrees: [0, 2, 6, 3], qualities: ["min7", "maj7", "maj7", "min7"],
    romans: ["i7", "IIImaj7", "VIImaj7", "iv7"],
    genres: ["r&b", "lo-fi", "trap"], directions: ["chill", "dark"] },
  { label: "Drill bounce", mode: "minor",
    degrees: [0, 3, 0, 4], qualities: ["min", "min", "min", "7"],
    romans: ["i", "iv", "i", "V7"],
    genres: ["drill", "trap"], directions: ["hard", "dark"] },
  { label: "Private-school run", mode: "minor",
    degrees: [0, 3, 5, 4], qualities: ["min9", "min7", "maj9", "7"],
    romans: ["i9", "iv7", "VImaj9", "V7"],
    genres: ["amapiano", "soulful-house"], directions: ["soulful"] },
  // ---- MAJOR ----
  { label: "Anthem lift", mode: "major",
    degrees: [0, 4, 5, 3], qualities: ["maj", "maj", "min", "maj"],
    romans: ["I", "V", "vi", "IV"],
    genres: ["pop", "afrobeat", "hip-hop"], directions: ["uplifting"] },
  { label: "Classic lift", mode: "major",
    degrees: [0, 5, 3, 4], qualities: ["maj", "min", "maj", "maj"],
    romans: ["I", "vi", "IV", "V"],
    genres: ["pop", "r&b", "gospel"], directions: ["uplifting", "soulful"] },
  { label: "Gospel worship walk", mode: "major",
    degrees: [0, 3, 1, 4], qualities: ["maj", "maj", "min7", "sus4"],
    romans: ["I", "IV", "ii7", "Vsus4"],
    genres: ["gospel", "r&b"], directions: ["soulful", "uplifting"] },
  { label: "Neo-soul turnaround", mode: "major",
    degrees: [1, 4, 0, 5], qualities: ["min9", "7", "maj9", "7"],
    romans: ["ii9", "V7", "Imaj9", "VI7"],
    genres: ["r&b", "neo-soul", "boom-bap"], directions: ["soulful", "chill"] },
  { label: "House lift", mode: "major",
    degrees: [5, 3, 0, 4], qualities: ["min7", "maj9", "maj7", "7"],
    romans: ["vi7", "IVmaj9", "Imaj7", "V7"],
    genres: ["house", "afro-house", "deep-house"], directions: ["uplifting", "chill"] },
  { label: "Lo-fi cruise", mode: "major",
    degrees: [0, 3], qualities: ["maj7", "maj9"],
    romans: ["Imaj7", "IVmaj9"],
    genres: ["lo-fi", "chillhop", "r&b"], directions: ["chill"] },
  { label: "Mixolydian bounce", mode: "major",
    degrees: [0, 6, 3], shift: [0, -1, 0], qualities: ["maj", "maj", "maj"],
    romans: ["I", "bVII", "IV"],
    genres: ["afro-house", "funk", "pop"], directions: ["uplifting", "hard"] },
  { label: "Sad-bright wash", mode: "major",
    degrees: [3, 4, 2, 5], qualities: ["maj", "maj", "min", "min"],
    romans: ["IV", "V", "iii", "vi"],
    genres: ["pop", "edm"], directions: ["chill", "uplifting"] },
];

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
};

/**
 * Parse analysis-style key strings like "A Minor", "F# Major", "Bb minor".
 * Returns null on anything unparseable.
 */
export function parseKeyMode(text: string | null | undefined): { key: string; mode: Mode } | null {
  if (!text) return null;
  const m = text.trim().match(/^([A-Ga-g])(#|b)?\s+(major|minor|maj|min)\b/i);
  if (!m) return null;
  const raw = m[1].toUpperCase() + (m[2] ?? "");
  const key = FLAT_TO_SHARP[raw] ?? raw;
  if (!(KEYS as readonly string[]).includes(key)) return null;
  const mode: Mode = /^(minor|min)$/i.test(m[3]) ? "minor" : "major";
  return { key, mode };
}

function midiName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${KEYS[pc]}${oct}`;
}

/** Voice one chord: root + quality intervals, then seed-driven inversion/lift. */
function voiceChord(rootMidi: number, quality: string, variant: number, chordIndex: number): string[] {
  const ivals = QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS.maj;
  const mids = ivals.map((s) => rootMidi + s);
  const inv = (variant + chordIndex) % Math.min(3, mids.length);
  for (let i = 0; i < inv; i++) mids.push(mids.shift()! + 12);
  if (variant % 3 === 2 && mids.length >= 3) mids[mids.length - 1] += 12;
  return mids.map(midiName);
}

export interface GenerateOptions {
  genre?: string | null;
  direction?: Direction | null;
  /** Endless engine: same seed → same result; +1 → fresh voicings. */
  seed?: number;
  count?: number;
}

export function generateProgressions(key: string, mode: Mode, opts: GenerateOptions = {}): ProgressionResult[] {
  const { genre, direction = null, seed = 0, count = 4 } = opts;
  const keyIdx = (KEYS as readonly string[]).indexOf(key);
  const keyPc = keyIdx < 0 ? 0 : keyIdx;
  const scale = mode === "major" ? MAJOR : MINOR;
  const g = (genre ?? "").trim().toLowerCase();

  const scored = RECIPES.filter((r) => r.mode === mode).map((r) => ({
    r,
    matchedGenre: !!g && r.genres.some((x) => g.includes(x) || x.includes(g)),
    matchedDirection: !!direction && r.directions.includes(direction),
  }));
  scored.sort(
    (a, b) =>
      Number(b.matchedGenre) - Number(a.matchedGenre) ||
      Number(b.matchedDirection) - Number(a.matchedDirection),
  );

  // Rotate the window by seed so "More" keeps surfacing different recipes first.
  const rot = ((seed % scored.length) + scored.length) % scored.length;
  const ordered = [...scored.slice(rot), ...scored.slice(0, rot)];
  const picked = ordered.slice(0, Math.max(1, count));

  // Tonic sits around C3–B3 (midi 48–59) for Piano-roll-friendly voicings.
  const rootBase = 48 + keyPc;
  return picked.map(({ r, matchedGenre, matchedDirection }, i) => {
    const chords: string[] = [];
    const notes: string[][] = [];
    r.degrees.forEach((deg, ci) => {
      const root = rootBase + scale[deg] + (r.shift?.[ci] ?? 0);
      const q = r.qualities[ci];
      chords.push(`${KEYS[((root % 12) + 12) % 12]}${QUALITY_SUFFIX[q] ?? q}`);
      notes.push(voiceChord(root, q, seed + i, ci));
    });
    return { label: r.label, romans: [...r.romans], chords, notes, matchedGenre, matchedDirection };
  });
}

// ============================================================================
// R9.5 FORGE HELPERS (D29 / s6): inversions & slash bass
// Pipeline rule: applyInversion FIRST, slashBass LAST (bass stays on the floor).
// ============================================================================

/** Rotate the lowest note up one octave `times` (chord inversions, by name). */
export function applyInversion(notes: string[], times: number): string[] {
  if (notes.length === 0) return [];
  const t = ((times % notes.length) + notes.length) % notes.length;
  if (t === 0) return [...notes];
  const lifted = notes.slice(0, t).map((n) => {
    const m = noteNameToMidi(n);
    return m === null ? n : midiName(m + 12);
  });
  return [...notes.slice(t), ...lifted];
}

export type SlashOption = "none" | "root-12" | "fifth-12";

/**
 * Prepend a low bass note: "root-12" doubles the root one octave down;
 * "fifth-12" puts the chord's fifth in the bass (the classic slash sound).
 */
export function slashBass(notes: string[], opt: SlashOption): string[] {
  if (opt === "none" || notes.length === 0) return [...notes];
  const root = noteNameToMidi(notes[0]);
  if (root === null) return [...notes];
  return [midiName(opt === "root-12" ? root - 12 : root + 7 - 12), ...notes];
}
