export const NATIVE_PLUGINS = [
  "Fruity Parametric EQ 2",
  "Fruity Limiter",
  "Fruity Compressor",
  "Maximus",
  "Fruity Reeverb 2",
  "Fruity Delay 3",
  "Fruity Soft Clipper",
  "Soundgoodizer",
  "Stereo Shaper",
  "Edison",
  "Wave Candy",
  "Patcher",
  "Pitcher",
  "Gross Beat",
  "FLEX",
  "Sytrus",
  "Harmor",
  "Harmless",
  "Sakura",
  "NewTone",
  "Slicex",
] as const;

export const THIRD_PARTY_BRANDS = [
  "FabFilter",
  "Waves",
  "iZotope",
  "Antares",
  "Melodyne",
  "Soundtoys",
  "Valhalla",
  "SSL",
  "Plugin Alliance",
  "Slate Digital",
  "UAD",
  "Eventide",
  "Auto-Tune",
  "Ozone",
  "Neutron",
  "Other",
] as const;

// Catalog used to autocomplete the custom-plugin field. Keeps custom entries
// consistent (e.g. "Serum" instead of "serum"/"Xfer Serum") and prevents messy dupes.
export const CUSTOM_PLUGIN_SUGGESTIONS = [
  "Serum", "Vital", "Sylenth1", "Massive", "Massive X", "Spire", "Nexus",
  "Omnisphere", "Keyscape", "Trilian", "Diva", "Repro-5", "Pigments",
  "Kontakt 7", "Kontakt 8", "Battery 4", "Reaktor 6", "Halion",
  "Decapitator", "EchoBoy", "Little Plate", "Little AlterBoy",
  "RX 11", "Nectar 4", "Insight 2",
  "Pro-Q 3", "Pro-Q 4", "Pro-C 2", "Pro-L 2", "Pro-R 2", "Pro-MB", "Saturn 2",
  "CLA-2A", "CLA-76", "SSL G-Master Buss", "H-Comp", "H-Delay",
  "MetricAB", "ADPTR Streamliner",
  "Vintage Verb", "Plate", "Shimmer", "Delay",
] as const;

