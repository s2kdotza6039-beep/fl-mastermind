// R15 — proof lock helpers. Pure logic so we can unit + integration test it.

export interface ProofLockState {
  lockedReportId: string;
  projectId: string | null;
  messageId: string | null;
  /** R15.1 — how many bounces the producer has offered as proof while locked. */
  attempts?: number;
  /** R15.1 — id of the last bounce that was rejected as proof. */
  lastRejectedReportId?: string | null;
  /** R15.1 — why the last attempt was rejected. */
  lastRejectReason?: "foreign" | "same-file" | "other-project" | null;
}

export type ProofMatch = "waiting" | "checking" | "rejected" | "matched";

export interface ProofStatus {
  match: ProofMatch;
  attempts: number;
  title: string;
  detail: string;
}

/** UI status panel model — does the current bounce count as proof, and how many tries so far. */
export function describeProofStatus(
  lock: ProofLockState | null,
  currentReportId: string | null,
  projectId: string | null,
  loopLockKind: string | null,
): ProofStatus {
  const attempts = lock?.attempts ?? 0;
  if (!lock) {
    return { match: "matched", attempts, title: "Proof accepted", detail: "Coaching is open — no proof pending." };
  }
  if (loopLockKind === "foreign") {
    return {
      match: "rejected",
      attempts,
      title: "Bounce rejected — different song",
      detail: "The beat DNA of this upload doesn't match the project. Export the SAME song again (same tempo/key/arrangement) and upload that.",
    };
  }
  if (lock.projectId !== projectId) {
    return {
      match: "rejected",
      attempts,
      title: "Bounce rejected — wrong project",
      detail: "That bounce belongs to another project. Switch back to the locked project or upload this song's bounce.",
    };
  }
  if (currentReportId && currentReportId === lock.lockedReportId) {
    return {
      match: "waiting",
      attempts,
      title: "Waiting for a NEW bounce",
      detail: "Still hearing the same file you were coached on. Apply the fixes in FL Studio, re-export, then upload the new WAV/MP3.",
    };
  }
  if (loopLockKind === "rebounce") {
    return { match: "checking", attempts, title: "Checking your bounce…", detail: "Sensei is comparing beat DNA against the locked version." };
  }
  return {
    match: "waiting",
    attempts,
    title: "Waiting for proof",
    detail: "Upload the re-exported bounce of this same song with the 📎 paperclip or on /upload.",
  };
}

/** Record a rejected proof attempt (increments the counter shown in the status panel). */
export function recordProofAttempt(
  lock: ProofLockState | null,
  rejectedReportId: string | null,
  reason: ProofLockState["lastRejectReason"],
): ProofLockState | null {
  if (!lock) return lock;
  if (rejectedReportId && rejectedReportId === lock.lastRejectedReportId) return lock;
  return {
    ...lock,
    attempts: (lock.attempts ?? 0) + 1,
    lastRejectedReportId: rejectedReportId,
    lastRejectReason: reason ?? null,
  };
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
/**
 * R15.1 — dev-only toggle, no code change needed:
 *   localStorage.setItem("sensei.proofDebug", "on")  // or window.senseiProofDebug(true)
 * Defaults: on in dev, off in production builds.
 */
const DEBUG_KEY = "sensei.proofDebug";

export function setProofDebug(on: boolean) {
  try { localStorage.setItem(DEBUG_KEY, on ? "on" : "off"); } catch { /* ignore */ }
}

export function isProofDebugEnabled(): boolean {
  let flag: string | null = null;
  try { flag = localStorage.getItem(DEBUG_KEY); } catch { /* ignore */ }
  if (flag === "on") return true;
  if (flag === "off") return false;
  try {
    return !(typeof import.meta !== "undefined" && (import.meta as any).env?.PROD);
  } catch {
    return false;
  }
}

export function proofLog(event: string, data?: Record<string, unknown>) {
  try {
    if (!isProofDebugEnabled()) return;
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
