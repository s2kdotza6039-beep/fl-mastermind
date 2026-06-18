// Mirror of src/lib/fl-plugin-eligibility.ts for the edge function runtime.
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

const STOCK_BASE = [
  "Fruity Parametric EQ 2", "Fruity Limiter", "Fruity Compressor", "Fruity Reeverb 2",
  "Fruity Delay 3", "Fruity Stereo Shaper", "Fruity Balance", "Fruity Multiband Compressor",
  "Soundgoodizer", "Fruity Bass Boost", "Fruity Filter", "Fruity Phaser", "Fruity Flanger",
  "Fruity Chorus", "Wave Candy",
];
const PRODUCER_EXTRA = ["Edison", "Patcher (basic)", "Slicex", "Vocodex"];
const SIGNATURE_EXTRA = ["Maximus", "Pitcher", "Newtone", "Gross Beat", "Harmor", "Sytrus", "Toxic Biohazard", "Hardcore"];
const ALL_EXTRA = ["DirectWave (full)", "Sakura", "Morphine", "Drumaxx", "Ogun", "PoiZone", "Transistor Bass", "Vintage Chorus", "Vintage Phaser"];

export function eligiblePlugins(tier: FlEditionTier): string[] {
  switch (tier) {
    case "fruity": return [...STOCK_BASE];
    case "producer":
    case "trial": return [...STOCK_BASE, ...PRODUCER_EXTRA];
    case "signature": return [...STOCK_BASE, ...PRODUCER_EXTRA, ...SIGNATURE_EXTRA];
    case "all": return [...STOCK_BASE, ...PRODUCER_EXTRA, ...SIGNATURE_EXTRA, ...ALL_EXTRA];
    default: return [...STOCK_BASE];
  }
}

export function forbiddenPlugins(tier: FlEditionTier): string[] {
  const have = new Set(eligiblePlugins(tier));
  return [...PRODUCER_EXTRA, ...SIGNATURE_EXTRA, ...ALL_EXTRA].filter((p) => !have.has(p));
}
