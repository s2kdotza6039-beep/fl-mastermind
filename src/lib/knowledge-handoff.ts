// ============================================================================
// STUDIO SENSEI — KNOWLEDGE → CHAT HANDOFF
// ----------------------------------------------------------------------------
// Lets deterministic knowledge cards (chords, genre playbook) hand a fully
// written prompt to Sensei Chat. Stored in sessionStorage so a route change
// carries it exactly once.
// ============================================================================

const KEY = "sensei.knowledge.handoff";

export function stashChatPrompt(prompt: string) {
  try { sessionStorage.setItem(KEY, prompt); } catch { /* storage unavailable */ }
}

/** Reads and clears the pending prompt (one-shot). */
export function takeChatPrompt(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}
