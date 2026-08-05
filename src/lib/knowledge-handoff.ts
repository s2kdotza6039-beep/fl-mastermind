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

// ============================================================================
// R9.5 REWRITE CONSTRAINT CHIPS (D29 / s10)
// Deterministic prompt clauses — no AI-side logic changes, no extra calls.
// ============================================================================

export const REWRITE_CONSTRAINTS = [
  { id: "harmonic-rhythm", label: "Keep harmonic rhythm",
    line: "CONSTRAINT: Keep the harmonic rhythm exactly (same chord changes, same bars) — change only chord tones or voicings." },
  { id: "voicings-only", label: "Voicings only",
    line: "CONSTRAINT: Suggest voicing/inversion changes only — do not change any chord roots." },
  { id: "vocal-first", label: "Fit my vocal first",
    line: "CONSTRAINT: The vocal melody is fixed — make every suggestion sit underneath it." },
] as const;

export function buildRewritePrompt(base: string[], constraintIds: string[]): string {
  const lines = [...base];
  for (const c of REWRITE_CONSTRAINTS) {
    if (constraintIds.includes(c.id)) lines.push(c.line);
  }
  return lines.filter(Boolean).join("\n");
}
