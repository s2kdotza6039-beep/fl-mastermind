// ============================================================================
// STUDIO SENSEI — FL MASTERY PACK: PROCEDURE DATA (D23 / D26)
// ----------------------------------------------------------------------------
// Structured, version-aware FL Studio procedure records — ONE source of truth:
//   • R9:   injected into sensei-chat context when the question matches
//   • R9.5: rendered as "Show Me" animated step maps (visual learning)
// Keep `steps` SHORT, imperative and UI-accurate — they are shown verbatim.
// ============================================================================

export interface FlProcedure {
  id: string;
  title: string;
  /** FL Studio versions this applies to. */
  flVersions: string;
  /** Exact click-path steps (short, imperative, exact menu paths). */
  steps: string[];
  /** One zone per step (index-aligned) for the Show-Me animated map (R9.5). */
  zones: FlZone[];
  /** Trigger keywords for deterministic question matching. */
  keywords: string[];
}

/** Zones of the simplified FL Studio map rendered by ShowMeMap (R9.5). */
export type FlZone = "channel-rack" | "mixer" | "piano-roll" | "playlist" | "edison" | "menu";

export const FL_PROCEDURES: FlProcedure[] = [
  { id: "add-mixer-plugin", title: "Add a plugin to a mixer track", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Open the Mixer (F9)",
      "Click the insert track you want (e.g. Insert 5)",
      "In the effect rack on the right, click an empty SLOT",
      "Pick the plugin from the list (type to search)",
    ],
    zones: ["menu", "mixer", "mixer", "mixer"],
    keywords: ["add plugin", "insert", "slot", "load plugin", "open plugin", "effect rack", "add effect"] },
  { id: "eq2-basics", title: "EQ a sound with Fruity Parametric EQ 2", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Mixer (F9) → click the sound's insert track",
      "Click an empty SLOT → Fruity Parametric EQ 2",
      "Drag a band up to boost, down to cut",
      "For low-cut: set Band 1 type to High Pass, raise FREQ toward 20-40 Hz",
    ],
    zones: ["mixer", "mixer", "mixer", "mixer"],
    keywords: ["eq", "equalizer", "parametric", "high pass", "low cut", "eq2", "frequency"] },
  { id: "route-channel-to-mixer", title: "Route a channel to a mixer track", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Channel Rack → click the channel to select it",
      "Open Channel settings (gear icon)",
      "Set the TRACK number box (top-right) to the mixer insert number",
      "Or press Ctrl+L to link selected channels to the selected mixer track",
    ],
    zones: ["channel-rack", "channel-rack", "channel-rack", "mixer"],
    keywords: ["route", "routing", "link channel", "send to mixer", "mixer track", "ctrl+l"] },
  { id: "open-piano-roll", title: "Open the Piano roll for a channel", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Right-click the channel in the Channel Rack",
      "Choose Piano roll (or press F7 and pick the channel)",
    ],
    zones: ["channel-rack", "channel-rack"],
    keywords: ["piano roll", "melody", "write notes", "chords", "midi"] },
  { id: "stamp-chord", title: "Stamp a chord in the Piano roll", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Open the Piano roll",
      "Press Alt+S (Stamp tool)",
      "Pick a chord preset (Major, Minor, min9...)",
      "Click a key to place the whole chord",
    ],
    zones: ["piano-roll", "piano-roll", "piano-roll", "piano-roll"],
    keywords: ["stamp", "chord tool", "alt+s", "chord preset", "place chord"] },
  { id: "sidechain-fk1", title: "Sidechain bass to the kick (Fruity Limiter)", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Route the kick to Insert 1 and the bass to Insert 2",
      "On Insert 2 add Fruity Limiter, open the COMP section",
      "At the bottom of the kick's track, right-click the routing ARROW to the bass track → Sidechain to this track",
      "Lower THRESH and raise RATIO on the bass track until it ducks",
    ],
    zones: ["mixer", "mixer", "mixer", "mixer"],
    keywords: ["sidechain", "ducking", "pumping", "kick and bass", "limiter"] },
  { id: "export-wav", title: "Export / bounce your track (WAV)", flVersions: "FL 21 / FL 2024+",
    steps: [
      "File → Export → Wave file (Ctrl+R)",
      "Choose folder and filename",
      "Set WAV to 24-bit (32 float for max headroom), 44100 Hz",
      "Enable Leave remainder for reverb tails, then Start",
    ],
    zones: ["menu", "menu", "menu", "menu"],
    keywords: ["export", "bounce", "render", "wav", "save song", "mp3"] },
  { id: "set-bpm", title: "Set the project tempo (BPM)", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Find the BPM display in the top panel",
      "Type the number in, or drag up/down",
      "Or right-click it and use Tap for tap-tempo",
    ],
    zones: ["menu", "menu", "menu"],
    keywords: ["bpm", "tempo", "song speed", "too slow", "too fast"] },
  { id: "edison-chop", title: "Record and chop audio in Edison", flVersions: "FL 21 / FL 2024+",
    steps: [
      "On a mixer track, add Edison to an empty SLOT",
      "Select input, hit Record, then Stop",
      "Drag the send-to-playlist handle onto the Playlist",
      "Use the slice/chop tools for chops",
    ],
    zones: ["mixer", "edison", "playlist", "edison"],
    keywords: ["edison", "record audio", "chop", "sample", "slice", "record vocals"] },
  { id: "pattern-to-playlist", title: "Build the arrangement in the Playlist", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Press F5 to open the Playlist",
      "With a pattern selected in the toolbar, paint it into the timeline as blocks",
      "Stack patterns vertically to layer instruments",
      "Switch to Song mode (top-left) so playback follows the Playlist",
    ],
    zones: ["playlist", "playlist", "playlist", "menu"],
    keywords: ["playlist", "arrange", "arrangement", "pattern", "song mode", "structure"] },
  { id: "automation-clip", title: "Automate any knob", flVersions: "FL 21 / FL 2024+",
    steps: [
      "Right-click any knob or fader (FL native or plugin)",
      "Choose Create automation clip",
      "The clip appears in the Playlist — drag points to draw movement",
      "Drag the line between points to bend curve tension",
    ],
    zones: ["mixer", "mixer", "playlist", "playlist"],
    keywords: ["automation", "automate", "envelope", "filter sweep", "fade"] },
  { id: "backup-restore", title: "Find autosaved backups after a crash", flVersions: "FL 21 / FL 2024+",
    steps: [
      "File → Revert to last backup",
      "Backups live in the FL data folder under Projects\\Backup",
      "Set autosave at Options → File settings → auto save every 5 minutes",
    ],
    zones: ["menu", "menu", "menu"],
    keywords: ["backup", "crash", "lost project", "autosave", "revert"] },
];

/**
 * Deterministic keyword matcher. Multi-word keywords weigh more (they're more
 * specific). Ties break by id so output order is stable and testable.
 */
export function matchProcedures(text: string, max = 2): FlProcedure[] {
  const t = ` ${text.toLowerCase()} `;
  const scored = FL_PROCEDURES.map((p) => {
    let score = 0;
    for (const k of p.keywords) if (t.includes(k)) score += k.includes(" ") ? 2 : 1;
    if (t.includes(p.title.toLowerCase())) score += 2;
    return { p, score };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  return scored.slice(0, Math.max(1, max)).map((s) => s.p);
}

/** Compact text form for the chat context (≈300 chars for 2 procedures). */
export function proceduresToContext(procs: FlProcedure[]): string {
  return procs.map((p) => `${p.title} (${p.flVersions}): ${p.steps.join(" → ")}`).join("\n");
}
