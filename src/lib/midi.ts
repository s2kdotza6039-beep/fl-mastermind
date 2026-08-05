// ============================================================================
// STUDIO SENSEI — MIDI + FL EXPORT HELPERS
// ----------------------------------------------------------------------------
// Deterministic, dependency-free MIDI type-0 writer for chord progressions,
// plus plain-text exports that can be typed straight into FL's Piano roll.
// ============================================================================

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** "A#3" | "F#-1" → MIDI number. Returns null when unparseable. */
export function noteNameToMidi(name: string): number | null {
  const m = name.trim().match(/^([A-G])(#|b)?(-?\d+)$/);
  if (!m) return null;
  let pc = PITCH_CLASSES.indexOf(m[1]);
  if (pc < 0) return null;
  if (m[2] === "#") pc += 1;
  if (m[2] === "b") pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function str(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

function u32(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export interface MidiOptions {
  /** Beats per chord. Default 4 (one bar of 4/4). */
  beatsPerChord?: number;
  bpm?: number;
  velocity?: number;
}

const PPQ = 480;

/**
 * Build a single-track (type-0) MIDI file from chord note names.
 * `chords` is an array of chords, each an array of note names ("A3", "C4"...).
 */
export function chordsToMidi(chords: string[][], opts: MidiOptions = {}): ArrayBuffer {
  const { beatsPerChord = 4, bpm = 120, velocity = 96 } = opts;
  const ticks = Math.max(1, Math.round(beatsPerChord * PPQ));
  const track: number[] = [];

  // Tempo meta event.
  const usPerQuarter = Math.round(60_000_000 / Math.max(1, bpm));
  track.push(
    0x00, 0xff, 0x51, 0x03,
    (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff,
  );

  for (const chord of chords) {
    const midis = chord.map(noteNameToMidi).filter((n): n is number => n !== null && n >= 0 && n <= 127);
    if (midis.length === 0) continue;
    midis.forEach((n, i) => {
      track.push(...variableLength(i === 0 ? 0 : 0), 0x90, n, velocity);
    });
    midis.forEach((n, i) => {
      track.push(...variableLength(i === 0 ? ticks : 0), 0x80, n, 0x40);
    });
  }

  track.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const header = [...str("MThd"), ...u32(6), 0x00, 0x00, 0x00, 0x01, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const chunk = [...str("MTrk"), ...u32(track.length), ...track];
  const bytes = [...header, ...chunk];
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export interface ProgressionExport {
  label: string;
  key: string;
  mode: string;
  romans: string[];
  chords: string[];
  notes: string[][];
  bpm?: number;
}

/** Human/FL-friendly text block: chord names, romans and Piano-roll note names. */
export function progressionToText(p: ProgressionExport): string {
  const lines: string[] = [
    `Studio Sensei — ${p.label}`,
    `Key: ${p.key} ${p.mode}${p.bpm ? ` · ${p.bpm} BPM` : ""}`,
    `Roman numerals: ${p.romans.join(" – ")}`,
    `Chords: ${p.chords.join(" | ")}`,
    "",
    "FL Piano roll (one chord per bar, 4/4):",
  ];
  p.notes.forEach((n, i) => {
    lines.push(`Bar ${i + 1} — ${p.chords[i]}: ${n.join(" ")}`);
  });
  return lines.join("\n");
}

/** Step-by-step insert instructions for a chosen pattern + channel. */
export function progressionToFlInstructions(
  p: ProgressionExport,
  target: { pattern: string; channel: string },
): string {
  const lines: string[] = [
    `INSERT "${p.label}" INTO FL STUDIO`,
    `Pattern: ${target.pattern}   Channel: ${target.channel}`,
    `Key: ${p.key} ${p.mode}${p.bpm ? ` · ${p.bpm} BPM` : ""}`,
    "",
    `1. In the Channel rack, select pattern "${target.pattern}" from the pattern selector.`,
    `2. Right-click the "${target.channel}" channel → Piano roll.`,
    `3. Set the snap to Bar, and length to ${p.notes.length} bars.`,
    "4. Draw each chord as whole-bar notes at these pitches:",
  ];
  p.notes.forEach((n, i) => {
    lines.push(`   Bar ${i + 1} — ${p.chords[i]}: ${n.join(", ")}`);
  });
  lines.push(
    "5. Select all (Ctrl+A) → right-click → Quantize (Alt+Q) to lock timing.",
    "6. Optional: Piano roll → Tools → Riff machine for variations, or Alt+S to stamp extra voicings.",
    "7. Save the pattern (Ctrl+S) before moving to arrangement.",
  );
  return lines.join("\n");
}

export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "progression";
}

// ============================================================================
// R9.5 FORGE PACK (D29 / s9): MULTITRACK SMF TYPE-1
// Track 0 = tempo map; one MTrk per part. Bass = lowest chord tone (octave
// shifted), Pads = full chord (softer velocity). Channels 1/2/3 in FL terms.
// ============================================================================

export interface ForgeParts {
  chords?: boolean;
  bass?: boolean;
  pads?: boolean;
  bassVelocity?: number;
  padVelocity?: number;
  /** Octave shifts: bass default -1 (down), pads default 0. */
  bassOctave?: number;
  padOctave?: number;
}

const clampMidi = (n: number) => Math.max(0, Math.min(127, n));

function buildTrack(name: string, channel: number, chordsMidi: number[][], ticks: number, velocity: number): number[] {
  const body: number[] = [0x00, 0xff, 0x03, name.length, ...str(name)];
  for (const midis of chordsMidi) {
    if (!midis.length) continue;
    midis.forEach((n) => body.push(...variableLength(0), 0x90 | channel, n, velocity));
    midis.forEach((n, i) => body.push(...variableLength(i === 0 ? ticks : 0), 0x80 | channel, n, 0x40));
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  return [...str("MTrk"), ...u32(body.length), ...body];
}

export function chordsToMidiMulti(
  chords: string[][],
  opts: { bpm?: number; beatsPerChord?: number; velocity?: number } & ForgeParts = {},
): ArrayBuffer {
  const { beatsPerChord = 4, bpm = 120, velocity = 96 } = opts;
  const {
    chords: useChords = true, bass = true, pads = true,
    bassVelocity = 104, padVelocity = 72, bassOctave = -1, padOctave = 0,
  } = opts;
  const ticks = Math.max(1, Math.round(beatsPerChord * PPQ));
  const per = chords.map((ch) =>
    ch.map(noteNameToMidi).filter((n): n is number => n !== null && n >= 0 && n <= 127));

  const tracks: number[][] = [];
  if (useChords) tracks.push(buildTrack("Chords", 0, per.map((m) => m.map(clampMidi)), ticks, velocity));
  if (bass) tracks.push(buildTrack("Bass", 1, per.map((m) => (m.length ? [clampMidi(Math.min(...m) + bassOctave * 12)] : [])), ticks, bassVelocity));
  if (pads) tracks.push(buildTrack("Pads", 2, per.map((m) => m.map((n) => clampMidi(n + padOctave * 12))), ticks, padVelocity));

  // Track 0: tempo map (format 1 convention).
  const usPerQuarter = Math.round(60_000_000 / Math.max(1, bpm));
  const t0Body = [
    0x00, 0xff, 0x51, 0x03,
    (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff,
    0x00, 0xff, 0x2f, 0x00,
  ];
  const t0 = [...str("MTrk"), ...u32(t0Body.length), ...t0Body];

  const ntracks = tracks.length + 1;
  const header = [
    ...str("MThd"), ...u32(6),
    0x00, 0x01, // format 1
    (ntracks >> 8) & 0xff, ntracks & 0xff,
    (PPQ >> 8) & 0xff, PPQ & 0xff,
  ];
  const bytes = [...header, ...t0, ...tracks.flat()];
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

// ============================================================================
// R9.6 — GENERIC EVENT WRITER (channel-aware, delta-encoded timeline)
// Foundation for the Groove Engine: drums on channel 10 (index 9), melodic
// lanes (log drum / 808) on channel 1 (index 0) — FL Studio reads both.
// ============================================================================

export interface MidiEvent {
  midi: number;
  startTicks: number;
  durTicks: number;
  velocity: number;
  channel: number; // 0-based; 9 = GM drums
}

/** Build a type-0 single-track SMF from arbitrary events (tempo meta included). */
export function notesToMidi(events: MidiEvent[], opts: { bpm?: number; name?: string } = {}): ArrayBuffer {
  const { bpm = 120, name } = opts;
  interface Act { t: number; on: boolean; midi: number; vel: number; chan: number; ord: number }
  const acts: Act[] = [];
  events.forEach((e, i) => {
    const chan = e.channel & 0x0f;
    const vel = Math.max(1, Math.min(127, Math.round(e.velocity)));
    acts.push({ t: e.startTicks, on: true, midi: e.midi, vel, chan, ord: i * 2 });
    acts.push({ t: e.startTicks + Math.max(1, Math.round(e.durTicks)), on: false, midi: e.midi, vel: 64, chan, ord: i * 2 + 1 });
  });
  // Time asc; at equal times note-OFFs first; then original order (stable, deterministic).
  acts.sort((a, b) => a.t - b.t || Number(a.on) - Number(b.on) || a.ord - b.ord);

  const body: number[] = [];
  if (name) body.push(0x00, 0xff, 0x03, name.length, ...str(name));
  const usPerQuarter = Math.round(60_000_000 / Math.max(1, bpm));
  body.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);

  let last = 0;
  for (const a of acts) {
    body.push(...variableLength(Math.max(0, a.t - last)), a.on ? 0x90 | a.chan : 0x80 | a.chan, a.midi, a.vel);
    last = a.t;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);

  const header = [...str("MThd"), ...u32(6), 0x00, 0x00, 0x00, 0x01, (PPQ >> 8) & 0xff, PPQ & 0xff];
  const chunk = [...str("MTrk"), ...u32(body.length), ...body];
  const bytes = [...header, ...chunk];
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
