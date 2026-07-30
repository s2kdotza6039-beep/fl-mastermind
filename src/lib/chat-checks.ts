// Per-message chat checklist persistence. Check marks inside Sensei chat
// messages are a local working aid (they do not sync to the project checklist
// page — that is a separate roadmap feature), but they should survive reloads.
const PREFIX = "sensei.chat.checks.";

export type ChatChecks = Record<string, boolean>;

export function loadChatChecks(messageId: string): ChatChecks {
  try {
    const raw = localStorage.getItem(PREFIX + messageId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ChatChecks;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function saveChatChecks(messageId: string, checks: ChatChecks) {
  try {
    if (Object.keys(checks).length === 0) localStorage.removeItem(PREFIX + messageId);
    else localStorage.setItem(PREFIX + messageId, JSON.stringify(checks));
  } catch {
    /* ignore */
  }
}
