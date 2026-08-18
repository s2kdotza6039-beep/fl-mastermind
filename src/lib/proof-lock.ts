// R15 — proof lock helpers. Pure logic so we can unit + integration test it.

export interface ProofLockState {
  lockedReportId: string;
  projectId: string | null;
  messageId: string | null;
}

/**
 * Returns true only if the new active report should clear the proof lock.
 * Guards:
 *  - must have a lock
 *  - must have a new report id different from locked id
 *  - must be same project
 *  - must NOT be flagged as foreign by the same-beat guard
 */
export function shouldUnlockProof(
  lock: ProofLockState | null,
  newReportId: string | null,
  projectId: string | null,
  loopLockKind: string | null
): boolean {
  if (!lock) return false;
  if (!newReportId) return false;
  if (newReportId === lock.lockedReportId) return false;
  if (lock.projectId !== projectId) return false;
  if (loopLockKind === "foreign") return false;
  return true;
}

/** Lightweight analytics payload for proof events — no PII, just ids. */
export function proofEventPayload(lock: ProofLockState | null) {
  if (!lock) return null;
  return { lockedReportId: lock.lockedReportId, projectId: lock.projectId, messageId: lock.messageId };
}
