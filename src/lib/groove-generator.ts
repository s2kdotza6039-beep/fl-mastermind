// ============================================================================
// STUDIO SENSEI — GROOVE GENERATOR (R15.2)
// ----------------------------------------------------------------------------
// Deterministic, seeded transformations of a base Groove so the producer gets
// endless options without any AI call. Every function is pure: it returns a NEW
// groove and never mutates the input.
// ============================================================================

import type { Groove, GrooveLane, GrooveHit } from "./grooves";

/** Tiny deterministic PRNG (mulberry32) — same seed ⇒ same groove. */
function rng(seed: number) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

function cloneLane(l: GrooveLane): GrooveLane {
  return { ...l, hits: l.hits ? l.hits.map((h) => ({ ...h })) : undefined };
}

function cloneGroove(g: Groove, label?: string): Groove {
  return { ...g, label: label ?? g.label, lanes: g.lanes.map(cloneLane) };
}

/** Keep lanes with a `steps` string untouched when the lane has no steps. */
function mapSteps(l: GrooveLane, fn: (ch: string, i: number) => string): GrooveLane {
  if (!l.steps) return l;
  return { ...l, steps: l.steps.split("").map(fn).join("") };
}

/**
 * Seeded variation: nudges a few unpitched hits by one 16th, flips a couple of
 * rests into ghosts, and transposes pitched lanes inside the pattern. The kick
 * downbeat (step 0) is always protected so the groove keeps its anchor.
 */
export function generateGrooveVariant(g: Groove, seed: number): Groove {
  const rand = rng(seed);
  const lanes = g.lanes.map((lane) => {
    const l = cloneLane(lane);
    if (l.steps) {
      const arr = l.steps.split("");
      const moves = 1 + Math.floor(rand() * 2);
      for (let m = 0; m < moves; m++) {
        const i = Math.floor(rand() * arr.length);
        if (i === 0 && l.id === "kick") continue;
        if (arr[i] !== ".") {
          const dir = rand() < 0.5 ? -1 : 1;
          const j = (i + dir + arr.length) % arr.length;
          if (arr[j] === "." && !(j === 0 && l.id === "kick")) {
            arr[j] = arr[i];
            arr[i] = ".";
          }
        } else if (rand() < 0.35) {
          arr[i] = "o";
        }
      }
      l.steps = arr.join("");
      return l;
    }
    if (l.hits) {
      l.hits = l.hits.map((h) => ({
        ...h,
        step: rand() < 0.3 ? (h.step + (rand() < 0.5 ? 1 : -1) + g.stepsPerBar) % g.stepsPerBar : h.step,
        vel: clampVel(h.vel + (rand() * 16 - 8)),
      }));
      return l;
    }
    return l;
  });
  return { ...g, lanes, label: `${g.label} · var ${Math.abs(seed) % 97}` };
}

/** Human feel: seeded velocity jitter on pitched lanes, ghosting on accents. */
export function humanize(g: Groove, seed = 7): Groove {
  const rand = rng(seed);
  const out = cloneGroove(g, `${g.label} · humanized`);
  out.lanes = out.lanes.map((l) => {
    if (l.hits) return { ...l, hits: l.hits.map((h) => ({ ...h, vel: clampVel(h.vel + (rand() * 18 - 9)) })) };
    return mapSteps(l, (ch) => {
      if (ch === "X") return rand() < 0.25 ? "x" : "X";
      if (ch === "x") return rand() < 0.2 ? "o" : "x";
      return ch;
    });
  });
  return out;
}

/** Adds soft ghost notes into empty 16ths of unpitched lanes. */
export function ghostify(g: Groove, seed = 11): Groove {
  const rand = rng(seed);
  const out = cloneGroove(g, `${g.label} · ghosts`);
  out.lanes = out.lanes.map((l) =>
    mapSteps(l, (ch, i) => (ch === "." && i % 2 === 1 && rand() < 0.4 ? "o" : ch)),
  );
  return out;
}

/** Turns the last quarter of the bar into a fill on the busiest drum lane. */
export function fillify(g: Groove, seed = 13): Groove {
  const rand = rng(seed);
  const out = cloneGroove(g, `${g.label} · fill`);
  const target = out.lanes
    .filter((l) => !!l.steps)
    .sort((a, b) => (b.steps!.replace(/\./g, "").length) - (a.steps!.replace(/\./g, "").length))[0];
  if (!target?.steps) return out;
  const arr = target.steps.split("");
  const start = Math.max(0, arr.length - Math.round(arr.length / 4));
  for (let i = start; i < arr.length; i++) {
    arr[i] = rand() < 0.7 ? (rand() < 0.5 ? "x" : "X") : "o";
  }
  target.steps = arr.join("");
  return out;
}

/** Random-but-reproducible pick used by the "Surprise Me" button. */
export function surpriseGroove(g: Groove, seed: number): Groove {
  const pick = Math.abs(seed) % 3;
  const varied = generateGrooveVariant(g, seed);
  if (pick === 0) return humanize(varied, seed + 1);
  if (pick === 1) return ghostify(varied, seed + 2);
  return fillify(varied, seed + 3);
}

/** Convenience: hit count of a groove — used for tests and UI badges. */
export function hitCount(g: Groove): number {
  return g.lanes.reduce((n, l) => {
    if (l.steps) return n + l.steps.replace(/\./g, "").length;
    return n + (l.hits?.length ?? 0);
  }, 0);
}

export type { Groove, GrooveHit };
