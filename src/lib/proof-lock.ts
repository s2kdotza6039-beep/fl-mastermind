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

/** Storage key — the lock lives per project so scope switches/navigation keep it. */
const STORAGE_PREFIX = "sensei.proofLock:";
export function proofLockKey(projectId: string | null): string {
  return `${STORAGE_PREFIX}${projectId ?? "no-project"}`;
}

/** Dev-only structured logging for lock/unlock diagnosis. */
export function proofLog(event: string, data?: Record<string, unknown>) {
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.PROD) return;
    console.info(`[SenseiProof] ${event}`, data ?? {});
  } catch { /* ignore */ }
}

export function loadProofLock(projectId: string | null): ProofLockState | null {
  try {
    const raw = sessionStorage.getItem(proofLockKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProofLockState;
    if (!parsed || typeof parsed.lockedReportId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProofLock(projectId: string | null, lock: ProofLockState | null) {
  try {
    const key = proofLockKey(projectId);
    if (!lock) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(lock));
  } catch { /* ignore */ }
}
