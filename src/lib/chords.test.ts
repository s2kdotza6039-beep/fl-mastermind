import { describe, expect, it } from "vitest";
import { applyInversion, generateProgressions, parseKeyMode, slashBass } from "./chords";

describe("chord engine — correctness", () => {
  it("A minor yields the classic i-VI-III-VII with correct spelling", () => {
    const all = generateProgressions("A", "minor", { seed: 0, count: 7 });
    const emotive = all.find((r) => r.label === "Emotive minor loop")!;
    expect(emotive.chords).toEqual(["Am", "F", "C", "G"]);
    const yano = all.find((r) => r.label === "Yano soul loop")!;
    expect(yano.chords[0]).toBe("Am9");
    expect(yano.notes[0][0]).toMatch(/^A\d$/);
  });

  it("sharp keys spell correctly (F# major, E major)", () => {
    const fs = generateProgressions("F#", "major", { seed: 0, count: 8 });
    expect(fs.some((r) => r.chords[0].startsWith("F#"))).toBe(true);
    const e = generateProgressions("E", "major", { seed: 0, count: 8 });
    expect(e.some((r) => r.chords[0] === "E")).toBe(true);
  });

  it("mode discipline: minor recipes open on minor chords; Anthem lift spells I-V-vi-IV", () => {
    for (const r of generateProgressions("C", "minor", { seed: 0, count: 7 })) {
      const head = r.chords[0].replace(/^[A-G]#?/, "");
      expect(head === "" || head.startsWith("maj")).toBe(false);
    }
    const maj = generateProgressions("C", "major", { seed: 0, count: 8 });
    expect(maj.find((r) => r.label === "Anthem lift")!.chords).toEqual(["C", "G", "Am", "F"]);
  });

  it("deterministic: same seed same result; rerolls bring variety", () => {
    const a = JSON.stringify(generateProgressions("A", "minor", { seed: 2, count: 4 }));
    const b = JSON.stringify(generateProgressions("A", "minor", { seed: 2, count: 4 }));
    expect(a).toBe(b);
    const variants = new Set(
      [0, 1, 2, 3, 4].map((s) => JSON.stringify(generateProgressions("A", "minor", { seed: s, count: 4 }))),
    );
    expect(variants.size).toBeGreaterThanOrEqual(3);
  });

  it("genre match is flagged and floated to the front", () => {
    const res = generateProgressions("A", "minor", { genre: "Amapiano", direction: "soulful", seed: 0, count: 4 });
    expect(res[0].matchedGenre).toBe(true);
    expect(res[0].matchedDirection).toBe(true);
  });
});

describe("parseKeyMode", () => {
  it("parses analysis output, flats normalize to sharps, junk is null", () => {
    expect(parseKeyMode("A Minor")).toEqual({ key: "A", mode: "minor" });
    expect(parseKeyMode("F# Major")).toEqual({ key: "F#", mode: "major" });
    expect(parseKeyMode("Bb minor")).toEqual({ key: "A#", mode: "minor" });
    expect(parseKeyMode("n/a")).toBeNull();
    expect(parseKeyMode(null)).toBeNull();
  });
});

describe("forge helpers (R9.5)", () => {
  it("applyInversion rotates the bottom note up an octave, wrapping safely", () => {
    expect(applyInversion(["A3", "C4", "E4"], 1)).toEqual(["C4", "E4", "A4"]);
    expect(applyInversion(["A3", "C4", "E4"], 3)).toEqual(["A3", "C4", "E4"]);
    expect(applyInversion(["A3", "C4", "E4"], 0)).toEqual(["A3", "C4", "E4"]);
  });

  it("slashBass prepends a low root or a fifth in the bass", () => {
    expect(slashBass(["A3", "C4", "E4"], "root-12")).toEqual(["A2", "A3", "C4", "E4"]);
    expect(slashBass(["A3", "C4", "E4"], "fifth-12")).toEqual(["E3", "A3", "C4", "E4"]);
    expect(slashBass(["A3", "C4", "E4"], "none")).toEqual(["A3", "C4", "E4"]);
  });

  it("slash-after-inversion keeps the bass on the floor (pipeline rule)", () => {
    const inv = applyInversion(["A3", "C4", "E4"], 1);
    expect(slashBass(inv, "root-12")[0]).toBe("C3");
  });
});
