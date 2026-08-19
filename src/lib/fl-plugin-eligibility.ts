// FL Studio plugin eligibility map — drives Sensei plugin gating.
// Source of truth for which stock plugins ship with each FL Studio edition.

export type FlEditionTier = "fruity" | "producer" | "signature" | "all" | "trial" | "unknown";

export function editionToTier(edition: string | null | undefined): FlEditionTier {
  if (!edition) return "unknown";
  const e = edition.toLowerCase();
  if (e.includes("all plugins")) return "all";
  if (e.includes("signature")) return "signature";
  if (e.includes("producer")) return "producer";
  if (e.includes("fruity")) return "fruity";
  if (e.includes("trial")) return "trial";
  return "unknown";
}

// Plugins always available in every edition (stock-only safe set).
const STOCK_BASE = [
  "Fruity Parametric EQ 2",
  "Fruity Limiter",
  "Fruity Compressor",
  "Fruity Reeverb 2",
  "Fruity Delay 3",
  "Fruity Stereo Shaper",
  "Fruity Balance",
  "Fruity Multiband Compressor",
  "Soundgoodizer",
  "Fruity Bass Boost",
  "Fruity Filter",
  "Fruity Phaser",
  "Fruity Flanger",
  "Fruity Chorus",
  "Wave Candy",
];

// Producer Edition adds recording / audio editing / Patcher.
const PRODUCER_EXTRA = [
  "Edison",
  "Patcher",
  "Patcher: EQ→Comp — beats Fruity Limiter alone",
  "Patcher: EQ→Soft Clipper→Bass Boost→Love Philter — 808 punch",
  "Patcher: EQ→Stereo Shaper→Delay 3→Reeverb 2 — mono-safe widener",
  "Slicex",
  "Vocodex",
];

// Signature Bundle adds advanced plugins.
const SIGNATURE_EXTRA = [
  "Maximus",
  "Pitcher",
  "Newtone",
  "Gross Beat",
  "Harmor",
  "Sytrus",
  "Toxic Biohazard",
  "Hardcore",
  "Patcher: Pitcher→EQ→parallel Limiter — vocal stack",
  "Patcher: Gross Beat→Delay 3 — stutter FX",
];

// All Plugins Edition unlocks the entire factory bundle.
const ALL_EXTRA = [
  "DirectWave (full)",
  "Sakura",
  "Morphine",
  "Drumaxx",
  "Ogun",
  "PoiZone",
  "Transistor Bass",
  "Vintage Chorus",
  "Vintage Phaser",
  "Patcher: Drumaxx→Maximus multiband — drum bus",
];

/** Best Patcher routing per coaching topic — Sensei quotes this verbatim. */
export function patcherAdvantage(topic: "vocal" | "808" | "wide" | "effect"): string {
  switch (topic) {
    case "vocal":
      return "Patcher: EQ 2 → Fruity Limiter (COMP) → Convolver → Delay 3, with a parallel squashed Limiter at ~30% — recalls as one preset, which beats stacking stock plugins by hand.";
    case "808":
      return "Patcher: EQ 2 (HP 25 Hz) → Soft Clipper → Bass Boost → Love Philter — clip before boost keeps the sub tight; beats Maximus alone for punch.";
    case "wide":
      return "Patcher: EQ 2 (mono below 200 Hz) → Stereo Shaper → Delay 3 at 15 ms one side → Reeverb 2 at 18% — wider and mono-safe versus Stereo Shaper alone.";
    default:
      return "Patcher: chain stock plugins in series and split a parallel branch — the same stock DSP, but recallable as one preset with wet/dry control.";
  }
}


export function eligiblePlugins(tier: FlEditionTier): string[] {
  switch (tier) {
    case "fruity":
      return [...STOCK_BASE];
    case "producer":
    case "trial":
      return [...STOCK_BASE, ...PRODUCER_EXTRA];
    case "signature":
      return [...STOCK_BASE, ...PRODUCER_EXTRA, ...SIGNATURE_EXTRA];
    case "all":
      return [...STOCK_BASE, ...PRODUCER_EXTRA, ...SIGNATURE_EXTRA, ...ALL_EXTRA];
    default:
      return [...STOCK_BASE];
  }
}

export function forbiddenPlugins(tier: FlEditionTier): string[] {
  const have = new Set(eligiblePlugins(tier));
  return [...PRODUCER_EXTRA, ...SIGNATURE_EXTRA, ...ALL_EXTRA].filter((p) => !have.has(p));
}

export function tierLabel(tier: FlEditionTier): string {
  return (
    {
      fruity: "Fruity Edition (stock-only)",
      producer: "Producer Edition",
      signature: "Signature Bundle",
      all: "All Plugins Edition",
      trial: "Trial (Producer-equivalent)",
      unknown: "Unknown edition",
    } as const
  )[tier];
}
