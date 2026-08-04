import { describe, it, expect } from "vitest";
import { chordsToMidi, noteNameToMidi, progressionToFlInstructions, progressionToText, safeFileName } from "@/lib/midi";

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
