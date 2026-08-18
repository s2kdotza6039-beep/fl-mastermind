// R14.2 — per-stage chat scopes. Each chapter (and each Production phase)
// keeps its own conversation so coaching never bleeds across stages.
import { chapterLabel, type ChatChapter } from "@/lib/chat-chapter";

const PHASE_LABEL: Record<string, string> = {
  BEAT: "Beat",
  BODY: "Body",
  ARRANGE: "Arrange",
  VOCALS: "Vocals",
  DONE: "Done",
};

/** "PRODUCTION:BEAT" | "MIXING" — stable key stored on each chat message. */
export function makeScope(chapter: ChatChapter, phase?: string | null): string {
  const c = (chapter || "GENERAL").toUpperCase();
  const p = phase ? String(phase).toUpperCase() : "";
  return p ? `${c}:${p}` : c;
}

/** Human label for the chat header, e.g. "Production · Beat". */
export function scopeLabel(scope: string): string {
  const [c, p] = (scope || "GENERAL").split(":");
  const chapter = chapterLabel(c as ChatChapter);
  if (!p) return chapter;
  return `${chapter} · ${PHASE_LABEL[p] ?? p.charAt(0) + p.slice(1).toLowerCase()}`;
}
