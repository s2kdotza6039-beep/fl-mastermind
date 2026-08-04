// ============================================================================
// STUDIO SENSEI — GENRE PLAYBOOKS (D23 / D25)
// ----------------------------------------------------------------------------
// Deterministic per-genre knowledge: tempo, keys, drum palette, a typical
// arrangement map and mix focus. Unknown genres return null and the UI shows
// the honest universal-engineering note instead (no fake authority, D25).
// ============================================================================

export interface PlaybookSection { section: string; bars: number; notes: string; }

export interface GenrePlaybook {
  id: string;
  display: string;
  aliases: string[];
  bpmRange: [number, number];
  commonKeys: string;
  drumPalette: string[];
  arrangement: PlaybookSection[];
  mixFocus: string[];
}

export const GENRE_PLAYBOOKS: GenrePlaybook[] = [
  { id: "amapiano", display: "Amapiano", aliases: ["amapiano", "yano", "private school"],
    bpmRange: [110, 116], commonKeys: "Minor — A, C#, F# favourites",
    drumPalette: ["Log drum (the heartbeat)", "Soft round kick", "Shaker + rim/perc loop", "Open hat accents"],
    arrangement: [
      { section: "Intro", bars: 16, notes: "percussion + ambient pad, filtered log-drum tease" },
      { section: "Build", bars: 16, notes: "shaker bounce enters, log drum muted underneath" },
      { section: "Drop", bars: 32, notes: "full log-drum line, vocal chops answer" },
      { section: "Break", bars: 16, notes: "strip to percussion + vocal" },
      { section: "Drop 2", bars: 32, notes: "variation, ad-libs, extra perc layer" },
      { section: "Outro", bars: 16, notes: "percussion fades out" },
    ],
    mixFocus: [
      "Log drum owns 60-200 Hz — carve that lane clean of everything else",
      "High-pass non-bass elements below ~120 Hz",
      "Shaker/top sparkle lives 8-12 kHz — keep it out of the vocal's face",
      "Energy comes from groove, not loudness — keep the master gentle",
    ] },
  { id: "kwaito", display: "Kwaito", aliases: ["kwaito"],
    bpmRange: [95, 110], commonKeys: "Minor",
    drumPalette: ["Deep rounded kick", "Sparse snare/clap on 3", "Swinging hats", "Occasional whistles/FX"],
    arrangement: [
      { section: "Intro", bars: 16, notes: "drums + bassline establish the bounce" },
      { section: "Verse", bars: 32, notes: "vocal lead, sparse melodic stabs" },
      { section: "Hook", bars: 16, notes: "chant/call-response, fuller drums" },
      { section: "Verse", bars: 32, notes: "variation, filtered hook echo" },
      { section: "Hook", bars: 24, notes: "stacked vocals" },
      { section: "Outro", bars: 16, notes: "drums only, natural fade" },
    ],
    mixFocus: [
      "Sub weight sits 40-80 Hz — round, not distorted",
      "Leave air between elements — space IS the groove",
      "Keep vocals dry and upfront",
    ] },
  { id: "trap", display: "Trap / Drill", aliases: ["trap", "drill", "hip-hop trap"],
    bpmRange: [130, 150], commonKeys: "Minor — half-time feel 65-75 BPM",
    drumPalette: ["808 sub with slides/glides", "Tight punchy kick", "Crisp snare on 3 (half-time)", "Fast hat rolls (1/32), open hat on offbeats"],
    arrangement: [
      { section: "Intro", bars: 8, notes: "melody only, maybe filtered" },
      { section: "Hook", bars: 16, notes: "full drums + 808" },
      { section: "Verse", bars: 16, notes: "drop some elements for headroom" },
      { section: "Hook", bars: 16, notes: "full again" },
      { section: "Verse", bars: 16, notes: "808 switch-up variation" },
      { section: "Hook", bars: 16, notes: "final, ad-lib stack" },
      { section: "Outro", bars: 8, notes: "melody fades" },
    ],
    mixFocus: [
      "808 is mono sub below ~60 Hz — no stereo information down there",
      "Kick and 808 need separation: sidechain or different octave lanes",
      "Hat rolls move but never mask the snare transient at 2-5 kHz",
    ] },
  { id: "gqom", display: "Gqom", aliases: ["gqom", "sgubhu"],
    bpmRange: [120, 126], commonKeys: "Minor / atonal is welcome",
    drumPalette: ["Broken-beat kick pattern", "Dark tom hits", "Whistle / siren FX", "Sparse snare stabs"],
    arrangement: [
      { section: "Intro", bars: 16, notes: "single groove element, ominous" },
      { section: "Groove A", bars: 32, notes: "full broken kick, call pattern" },
      { section: "Switch", bars: 16, notes: "response pattern, FX hits" },
      { section: "Groove B", bars: 32, notes: "heavier variation" },
      { section: "Outro", bars: 16, notes: "elements drop one by one" },
    ],
    mixFocus: [
      "Mid-bass knock lives 150-300 Hz — raw, not round",
      "Keep it dark: don't over-polish the top end",
      "Contrast comes from muting, not adding",
    ] },
  { id: "afro-house", display: "Afro House / Afro Tech", aliases: ["afro house", "afrohouse", "afro tech", "afro-tech"],
    bpmRange: [120, 124], commonKeys: "Minor or Major — soulful both ways",
    drumPalette: ["Congas + live percussion", "Four-floor kick, warm", "Shakers in layers", "Rim/wood hits"],
    arrangement: [
      { section: "Intro", bars: 16, notes: "percussion builds layer by layer" },
      { section: "Verse", bars: 16, notes: "pad/motif enters" },
      { section: "Lift", bars: 32, notes: "full percussion + bass groove" },
      { section: "Break", bars: 16, notes: "drums mute, vocal/keys feature" },
      { section: "Lift 2", bars: 32, notes: "all elements, energy peak" },
      { section: "Outro", bars: 16, notes: "percussion strips back" },
    ],
    mixFocus: [
      "Sub sits warm 45-70 Hz under a rounded kick",
      "Percussion needs room — short verbs, wide panning, no mud at 250-400 Hz",
    ] },
  { id: "boom-bap", display: "Boom-Bap / Hip-Hop", aliases: ["boom bap", "boom-bap", "hip-hop", "hiphop", "boombap"],
    bpmRange: [86, 96], commonKeys: "Any — sample rules the key",
    drumPalette: ["Chopped break or hard kick", "Snare crack on 2 & 4", "Swing in the hats (54-58%)"],
    arrangement: [
      { section: "Intro", bars: 8, notes: "filtered sample or scratch" },
      { section: "Verse", bars: 16, notes: "full loop, MC rides" },
      { section: "Hook", bars: 8, notes: "chop variation or scratch hook" },
      { section: "Verse", bars: 16, notes: "loop with switch-ups" },
      { section: "Hook", bars: 8, notes: "repeat" },
      { section: "Outro", bars: 8, notes: "sample ride-out" },
    ],
    mixFocus: [
      "Drum bus punch first — transient before everything",
      "Vinyl/crackle top layer is allowed — keep it out of vocal range 1-4 kHz",
      "Vocals sit on TOP, dry-ish, in your face",
    ] },
];

/** Case-insensitive match by id, display name or alias. Null → honesty note. */
export function matchPlaybook(genre: string | null | undefined): GenrePlaybook | null {
  const g = (genre ?? "").trim().toLowerCase();
  if (!g) return null;
  for (const p of GENRE_PLAYBOOKS) {
    if (p.id === g || p.display.toLowerCase() === g) return p;
    if (p.aliases.some((a) => g.includes(a) || a.includes(g))) return p;
  }
  return null;
}
