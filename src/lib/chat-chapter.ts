// R13.5 — chapter-aware chat. Sensei coaches the chapter the producer is in.
// The chapter follows the route by default; the producer can steer it in chat.

export type ChatChapter = "PRODUCTION" | "MIXING" | "MASTERING" | "PUBLISH" | "GENERAL";

/** Steerable chapters (GENERAL is the fallback, never shown as a chip). */
export const CHAPTERS: ChatChapter[] = ["PRODUCTION", "MIXING", "MASTERING", "PUBLISH"];

const ROUTES: Array<[string, ChatChapter]> = [
  ["/production", "PRODUCTION"],
  ["/upload", "PRODUCTION"],
  ["/genre", "PRODUCTION"],
  ["/mixing", "MIXING"],
  ["/chat", "MIXING"],
  ["/quick", "MIXING"],
  ["/problems", "MIXING"],
  ["/key", "MIXING"],
  ["/mastering", "MASTERING"],
  ["/publish", "PUBLISH"],
];

export function chapterFromPath(pathname: string): ChatChapter {
  const p = (pathname || "").toLowerCase();
  for (const [prefix, chapter] of ROUTES) {
    if (p === prefix || p.startsWith(prefix + "/")) return chapter;
  }
  return "GENERAL";
}

export function chapterLabel(chapter: ChatChapter): string {
  switch (chapter) {
    case "PRODUCTION": return "Production";
    case "MIXING": return "Mixing";
    case "MASTERING": return "Mastering";
    case "PUBLISH": return "Publish";
    default: return "General";
  }
}

export function chapterDirective(chapter: ChatChapter): string {
  switch (chapter) {
    case "PRODUCTION":
      return "You are coaching the PRODUCTION chapter: writing the beat, building the body (bass, chords, melody, vocals), and arranging. Treat a beat-only upload as a sketch, not a finished song. Coach composition, sound selection, groove, and arrangement. Do NOT give mixing, mastering, or release advice unless the producer explicitly asks — instead point them to the next chapter when the song is arranged.";
    case "MIXING":
      return "You are coaching the MIXING chapter: balance, EQ, compression, stereo image, and fixing the single worst problem first. Do NOT give mastering (final loudness/limiting) or release/distribution advice unless explicitly asked — hand off to the Mastering chapter when the mix is clean.";
    case "MASTERING":
      return "You are coaching the MASTERING chapter: final loudness targets (LUFS), true peak, dynamics, tonal polish, and format. Do NOT re-open composition or deep mixing work unless a mix fault blocks mastering — in that case say so plainly and send them back to Mixing.";
    case "PUBLISH":
      return "You are coaching the PUBLISH chapter: export formats, platform loudness specs, metadata, artwork, splits, distribution and release planning. Do NOT give production, mixing, or mastering advice unless explicitly asked.";
    default:
      return "";
  }
}
