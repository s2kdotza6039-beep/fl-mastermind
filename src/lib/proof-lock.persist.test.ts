import { describe, it, expect, beforeEach } from "vitest";
import { loadProofLock, saveProofLock, proofLockKey, shouldUnlockProof, type ProofLockState } from "./proof-lock";

const lock: ProofLockState = { lockedReportId: "r1", projectId: "p1", messageId: "m1" };

describe("proof lock persistence (scope switch / navigation)", () => {
  beforeEach(() => sessionStorage.clear());

  it("survives a remount for the same project", () => {
    saveProofLock("p1", lock);
    expect(loadProofLock("p1")).toEqual(lock);
  });

  it("is scoped per project", () => {
    saveProofLock("p1", lock);
    expect(loadProofLock("p2")).toBeNull();
  });

  it("clears on unlock", () => {
    saveProofLock("p1", lock);
    saveProofLock("p1", null);
    expect(loadProofLock("p1")).toBeNull();
  });

  it("ignores corrupt payloads", () => {
    sessionStorage.setItem(proofLockKey("p1"), "{not json");
    expect(loadProofLock("p1")).toBeNull();
  });

  it("a foreign upload after remount still cannot unlock", () => {
    saveProofLock("p1", lock);
    const restored = loadProofLock("p1");
    expect(shouldUnlockProof(restored, "r-foreign", "p1", "foreign")).toBe(false);
    expect(shouldUnlockProof(restored, "r2", "p1", null)).toBe(true);
  });
});
