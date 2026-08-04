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
export function chordsToMidi(chords: string[][], opts: MidiOptions = {}): Uint8Array {
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
  return new Uint8Array([...header, ...chunk]);
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
