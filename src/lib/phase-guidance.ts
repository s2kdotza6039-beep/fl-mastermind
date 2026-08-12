import type { ProductionPhase } from "@/lib/production-phase";

/**
 * R14 — one concrete micro-instruction per phase, tuned by genre where it matters.
 * Small nudges, not essays: the producer reads it in three seconds and acts.
 */
const BEAT_TIPS: Record<string, string> = {
  amapiano: "Lock the log-drum first at 112–115 BPM, then place the shaker on the off-beat 16ths so the groove breathes.",
  gqom: "Build the broken 3+3+2 kick pattern at ~124 BPM before anything melodic — the swing lives in the kick.",
  trap: "Program hats last: get the kick/808 conversation right at 130–150 BPM, then add rolls where the beat feels empty.",
  drill: "Slide your 808 between two notes on the bar's tail — that glide is the drill signature. Keep 138–145 BPM.",
  kwaito: "Sit at 100–110 BPM and let the bassline carry the melody; keep percussion sparse and human.",
  "boom-bap": "Swing your hats 55–62% and let the snare land slightly late — the drums should feel hand-played.",
  house: "Four-on-the-floor kick, off-beat open hat, and clap on 2 and 4 — nail that skeleton before layering.",
  afro: "Start with the percussion loop (shaker, conga, rim) and only then place the kick, so the groove stays circular.",
};

const GENERIC_BEAT =
  "Get kick, snare/clap and one percussion layer talking to each other before you add anything melodic.";

export function phaseTip(phase: ProductionPhase, genre?: string | null): string {
  const g = (genre ?? "").trim().toLowerCase();
  switch (phase) {
    case "BEAT":
      return BEAT_TIPS[g] ?? GENERIC_BEAT;
    case "BODY":
      return "Write the chords first, then the melody on top — 4 or 8 bars is enough. Keep the bass out of the chord range.";
    case "ARRANGE":
      return "Copy your 8-bar loop into intro / verse / chorus / bridge and remove one element per section so the drop feels bigger.";
    case "DONE":
      return "Bounce a 24-bit WAV with the master fader at 0 dB and no limiter — the Mixing chapter needs headroom to work with.";
    default:
      return GENERIC_BEAT;
  }
}

export function mixingTip(genre?: string | null): string {
  const g = (genre ?? "").trim().toLowerCase();
  if (g.includes("amapiano") || g.includes("gqom") || g.includes("afro")) {
    return "High-pass everything except kick and bass at 80–120 Hz — the log-drum/808 needs the basement to itself.";
  }
  if (g.includes("trap") || g.includes("drill")) {
    return "Sidechain the 808 to the kick by 2–3 dB — the low end stops flapping and the kick reads on phone speakers.";
  }
  return "Fix the loudest problem first: one EQ cut on the worst resonance beats ten small moves.";
}
