import { describe, it, expect } from "vitest";
import { chordsToMidi, chordsToMidiMulti, noteNameToMidi, progressionToFlInstructions, progressionToText, safeFileName } from "@/lib/midi";

const p = {
  label: "Yano soul loop", key: "A", mode: "minor",
  romans: ["i9", "VImaj7"], chords: ["Am9", "Fmaj7"],
  notes: [["A3", "C4", "E4"], ["F3", "A3", "C4"]], bpm: 112,
};

describe("midi export", () => {
  it("parses note names", () => {
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("A#3")).toBe(58);
    expect(noteNameToMidi("nope")).toBeNull();
  });

  it("writes a valid MThd/MTrk file", () => {
    const buf = chordsToMidi(p.notes, { bpm: 112 });
    const bytes = new Uint8Array(buf);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    expect(String.fromCharCode(...bytes.slice(14, 18))).toBe("MTrk");
    expect(bytes.length).toBeGreaterThan(30);
  });

  it("renders text and FL instructions", () => {
    expect(progressionToText(p)).toContain("Bar 1 — Am9: A3 C4 E4");
    const fl = progressionToFlInstructions(p, { pattern: "Chords", channel: "FLEX" });
    expect(fl).toContain('Pattern: Chords');
    expect(fl).toContain("Piano roll");
  });

  it("makes safe filenames", () => {
    expect(safeFileName("A minor — Yano soul loop")).toBe("a-minor-yano-soul-loop");
  });
});

describe("multitrack midi (R9.5)", () => {
  it("writes format-1 with tempo track + one MTrk per part", () => {
    const buf = chordsToMidiMulti(p.notes, { bpm: 112 });
    const b = new Uint8Array(buf);
    expect([b[8], b[9]]).toEqual([0, 1]); // format 1
    expect([b[10], b[11]]).toEqual([0, 4]); // 4 tracks
    const text = Array.from(b).map((x) => String.fromCharCode(x)).join("");
    expect(text.split("MTrk").length - 1).toBe(4);
    expect(b.includes(0x91)).toBe(true); // bass channel
    expect(b.includes(0x92)).toBe(true); // pads channel
  });

  it("chords-only export yields 2 tracks and no part channels", () => {
    const b = new Uint8Array(chordsToMidiMulti(p.notes, { bass: false, pads: false }));
    expect([b[10], b[11]]).toEqual([0, 2]);
    expect(b.includes(0x91)).toBe(false);
    expect(b.includes(0x92)).toBe(false);
  });

  it("bass track plays the lowest chord tone one octave down on channel 2", () => {
    const b = new Uint8Array(chordsToMidiMulti([["A3", "C4", "E4"]], {}));
    // lowest of A3/C4/E4 is 57 (A3); bass = 45 (A2) with a 0x91 note-on before it.
    const pair = b.findIndex((_, i) => b[i] === 0x91 && b[i + 1] === 45);
    expect(pair).toBeGreaterThan(-1);
  });
});
