import { describe, expect, it } from "vitest";
import {
  GROOVES, STEP_TICKS, buildGrooveGrid, grooveEvents, grooveToMidi,
  lanesToText, matchGrooves, sortGroovesForGenre,
} from "./grooves";

const yano = GROOVES.find((g) => g.id === "amapiano-logdrum")!;

describe("groove data integrity", () => {
  it("every pattern is well-formed (16 steps, legal chars, sane lanes)", () => {
    for (const g of GROOVES) {
      expect(g.lanes.length).toBeGreaterThanOrEqual(3);
      for (const lane of g.lanes) {
        if (lane.pitched) {
          expect((lane.hits ?? []).length).toBeGreaterThan(0);
          for (const h of lane.hits ?? []) {
            expect(h.step).toBeGreaterThanOrEqual(0);
            expect(h.step).toBeLessThan(g.stepsPerBar);
          }
        } else {
          expect(lane.note).toBeTruthy();
          expect(lane.steps).toHaveLength(g.stepsPerBar);
          expect([...(lane.steps ?? "")].every((c) => "Xxo.".includes(c))).toBe(true);
        }
      }
    }
  });

  it("genre matching routes and sorts; unknown genre matches nothing", () => {
    expect(matchGrooves("Amapiano")[0].id).toBe("amapiano-logdrum");
    expect(matchGrooves("Drill")[0].id).toBe("drill-slide");
    expect(matchGrooves("Liquid DnB")).toHaveLength(0);
    expect(matchGrooves(null)).toHaveLength(0);
    expect(sortGroovesForGenre("Gqom")[0].id).toBe("gqom-broken");
  });
});

describe("grid + events math", () => {
  it("grid clones the bar loop across bars with velocity tiers", () => {
    const grid = buildGrooveGrid(yano, 2);
    expect(grid.cols).toBe(32);
    const kick = grid.rows.find((r) => r.laneId === "kick")!;
    expect(kick.cells).toHaveLength(4); // 2 per bar × 2 bars
    expect(kick.cells.every((c) => c.vel === 96)).toBe(true);
    const log = grid.rows.find((r) => r.laneId === "logdrum")!;
    expect(log.cells).toHaveLength(12);
    expect(log.cells[0]).toEqual({ col: 0, vel: 108, note: "A2" });
    expect(log.cells[6]).toEqual({ col: 16 + 0, vel: 108, note: "A2" });
  });

  it("events: channels, durations, first-hit positions (no swing)", () => {
    const ev = grooveEvents(yano, { bars: 1, swing: 0.5 });
    const kickHits = ev.filter((e) => e.channel === 9 && e.velocity === 96);
    expect(kickHits.length).toBeGreaterThan(0);
    expect(kickHits[0].startTicks).toBe(0);
    const log = ev.filter((e) => e.channel === 0);
    expect(log[0]).toMatchObject({ midi: 45, startTicks: 0, durTicks: STEP_TICKS * 2, velocity: 108 });
    expect(Math.min(...log.map((e) => e.startTicks))).toBe(0);
  });

  it("swing delays odd 16ths deterministically", () => {
    const straight = grooveEvents(yano, { bars: 1, swing: 0.5 });
    const swung = grooveEvents(yano, { bars: 1, swing: 0.58 });
    const offset = Math.round(0.08 * 2 * STEP_TICKS); // 19
    const s1Straight = straight.filter((e) => e.startTicks % STEP_TICKS !== 0);
    expect(s1Straight).toHaveLength(0); // straight lands on grid
    const off = swung.filter((e) => e.startTicks % STEP_TICKS === offset);
    expect(off.length).toBeGreaterThan(0); // odd steps pushed by 19 ticks
    // second bar starts exactly at 1920 regardless of swing
    const two = grooveEvents(yano, { bars: 2, swing: 0.58 });
    expect(two.some((e) => e.startTicks === 1920)).toBe(true);
  });

  it("midi + text exports carry drums on ch10 and pitched bass on ch1", () => {
    const b = new Uint8Array(grooveToMidi(yano, { bars: 1, bpm: 112 }));
    expect(String.fromCharCode(...b.slice(0, 4))).toBe("MThd");
    const drum = b.findIndex((v, i) => b[i] === 0x99);
    const bass = b.findIndex((v, i) => b[i] === 0x90 && b[i + 1] === 45);
    expect(drum).toBeGreaterThan(-1);
    expect(bass).toBeGreaterThan(-1);
    const text = lanesToText(yano, 1);
    expect(text).toContain("Kick");
    expect(text).toContain("Log drum");
    expect(text).toContain("Bar 1");
  });
});
