import { describe, expect, it } from "vitest";
import { buildNoteGrid } from "./piano-roll";

describe("piano-roll grid math", () => {
  it("lays one chord out with correct rows, columns and C labels", () => {
    const g = buildNoteGrid([["A3", "C4", "E4"]]);
    expect(g.cols).toBe(1);
    expect(g.rows).toHaveLength(8); // E4 (top) down to A3
    expect(g.cells).toHaveLength(3);
    expect(g.cells).toContainEqual({ row: 0, col: 0, midi: 64 });
    expect(g.cells).toContainEqual({ row: 4, col: 0, midi: 60 });
    expect(g.cells).toContainEqual({ row: 7, col: 0, midi: 57 });
    expect(g.rows[4].label).toBe("C4");
    expect(g.rows[0].label).toBe("");
  });

  it("one column per chord; unparseable names are ignored safely", () => {
    const g = buildNoteGrid([["A3", "C4"], ["F#2", "A2"]]);
    expect(g.cols).toBe(2);
    expect(g.cells.filter((c) => c.col === 1)).toHaveLength(2);
    const junk = buildNoteGrid([["A3", "nope"]]);
    expect(junk.cells).toHaveLength(1);
  });

  it("empty input returns an empty grid that still tracks columns", () => {
    const g = buildNoteGrid([[], []]);
    expect(g.rows).toHaveLength(0);
    expect(g.cells).toHaveLength(0);
    expect(g.cols).toBe(2);
  });
});
