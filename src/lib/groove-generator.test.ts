import { describe, expect, it } from "vitest";
import { GROOVES } from "./grooves";
import { fillify, generateGrooveVariant, ghostify, hitCount, humanize } from "./groove-generator";

const base = GROOVES[0];

describe("groove generator", () => {
  it("is deterministic and never mutates the input", () => {
    const before = JSON.stringify(base);
    const a = generateGrooveVariant(base, 42);
    const b = generateGrooveVariant(base, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(base)).toBe(before);
    expect(a.lanes).toHaveLength(base.lanes.length);
  });

  it("humanize keeps the pattern length and stays in MIDI velocity range", () => {
    const h = humanize(base, 5);
    for (const l of h.lanes) {
      if (l.steps) expect(l.steps.length).toBe(base.lanes.find((x) => x.id === l.id)!.steps!.length);
      for (const hit of l.hits ?? []) expect(hit.vel).toBeGreaterThanOrEqual(1);
      for (const hit of l.hits ?? []) expect(hit.vel).toBeLessThanOrEqual(127);
    }
  });

  it("ghostify only adds hits, never removes them", () => {
    const g = ghostify(base, 9);
    expect(hitCount(g)).toBeGreaterThanOrEqual(hitCount(base));
  });

  it("fillify busies the end of the bar on a drum lane", () => {
    const f = fillify(base, 3);
    const changed = f.lanes.some((l, i) => l.steps && l.steps !== base.lanes[i].steps);
    expect(changed).toBe(true);
    expect(hitCount(f)).toBeGreaterThan(0);
  });
});
