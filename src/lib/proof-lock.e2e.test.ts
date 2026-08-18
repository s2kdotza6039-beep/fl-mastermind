// R15.1 — end-to-end style coverage of the proof lock across scope switches and navigation.
// Simulates the SenseiChat lifecycle: mount -> hydrate from sessionStorage -> attempt unlock.
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadProofLock,
  saveProofLock,
  shouldUnlockProof,
  describeProofStatus,
  recordProofAttempt,
  setProofDebug,
  isProofDebugEnabled,
  type ProofLockState,
} from "./proof-lock";

const PROJECT = "proj-1";

/** Mimics the chat component: hydrate lock for the project, try to unlock with the active report. */
function mountChat(projectId: string, activeReportId: string | null, lockKind: string | null) {
  const lock = loadProofLock(projectId);
  const unlocked = shouldUnlockProof(lock, activeReportId, projectId, lockKind);
  let next: ProofLockState | null = lock;
  if (unlocked) next = null;
  else if (lock && activeReportId && activeReportId !== lock.lockedReportId) {
    next = recordProofAttempt(lock, activeReportId, lockKind === "foreign" ? "foreign" : "other-project");
  }
  saveProofLock(projectId, next);
  return {
    awaitingProof: next,
    textareaDisabled: next != null || lockKind != null,
    status: describeProofStatus(next, activeReportId, projectId, lockKind),
  };
}

describe("proof lock e2e — scope switches and navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    saveProofLock(PROJECT, { lockedReportId: "rep-1", projectId: PROJECT, messageId: "msg-1" });
  });

  it("stays locked when the producer switches chat scope (component remount)", () => {
    const beat = mountChat(PROJECT, "rep-1", null);
    expect(beat.textareaDisabled).toBe(true);
    // switch scope PRODUCTION:BEAT -> PRODUCTION:VOCALS (remount)
    const vocals = mountChat(PROJECT, "rep-1", null);
    expect(vocals.awaitingProof?.lockedReportId).toBe("rep-1");
    expect(vocals.textareaDisabled).toBe(true);
    expect(vocals.status.match).toBe("waiting");
  });

  it("stays locked after navigating away and back", () => {
    mountChat(PROJECT, "rep-1", null); // /production
    // navigate to /mixing then back to /production — fresh mounts each time
    const away = mountChat(PROJECT, "rep-1", null);
    const back = mountChat(PROJECT, "rep-1", null);
    expect(away.textareaDisabled).toBe(true);
    expect(back.textareaDisabled).toBe(true);
    expect(loadProofLock(PROJECT)).not.toBeNull();
  });

  it("a foreign upload never unlocks and increments the attempt counter", () => {
    const foreign = mountChat(PROJECT, "rep-foreign", "foreign");
    expect(foreign.awaitingProof).not.toBeNull();
    expect(foreign.textareaDisabled).toBe(true);
    expect(foreign.status.match).toBe("rejected");
    expect(foreign.status.attempts).toBe(1);

    // still foreign after navigating away and back
    const back = mountChat(PROJECT, "rep-foreign", "foreign");
    expect(back.textareaDisabled).toBe(true);
    // same rejected report is not double counted
    expect(back.status.attempts).toBe(1);

    const second = mountChat(PROJECT, "rep-foreign-2", "foreign");
    expect(second.status.attempts).toBe(2);
    expect(second.textareaDisabled).toBe(true);
  });

  it("unlocks only for a new bounce of the same project with a clean DNA check", () => {
    mountChat(PROJECT, "rep-foreign", "foreign");
    const good = mountChat(PROJECT, "rep-2", null);
    expect(good.awaitingProof).toBeNull();
    expect(good.textareaDisabled).toBe(false);
    expect(loadProofLock(PROJECT)).toBeNull();
  });

  it("a bounce from another project does not unlock this project's chat", () => {
    const other = mountChat("proj-2", "rep-9", null);
    expect(other.awaitingProof).toBeNull(); // no lock stored for proj-2
    // returning to the locked project keeps the lock
    const back = mountChat(PROJECT, "rep-1", null);
    expect(back.textareaDisabled).toBe(true);
  });
});

describe("proof debug toggle", () => {
  beforeEach(() => localStorage.clear());

  it("can be turned on and off without code changes", () => {
    setProofDebug(true);
    expect(isProofDebugEnabled()).toBe(true);
    setProofDebug(false);
    expect(isProofDebugEnabled()).toBe(false);
  });
});
