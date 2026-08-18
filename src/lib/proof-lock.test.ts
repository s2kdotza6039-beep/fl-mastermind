import { describe, it, expect } from "vitest";
import { shouldUnlockProof } from "./proof-lock";

describe("proof-lock guard", () => {
  const lock = { lockedReportId: "r1", projectId: "p1", messageId: "m1" };

  it("does not unlock without a lock", () => {
    expect(shouldUnlockProof(null, "r2", "p1", null)).toBe(false);
  });

  it("does not unlock when report id is same", () => {
    expect(shouldUnlockProof(lock, "r1", "p1", null)).toBe(false);
  });

  it("does not unlock when report is null", () => {
    expect(shouldUnlockProof(lock, null, "p1", null)).toBe(false);
  });

  it("does not unlock when project mismatches", () => {
    expect(shouldUnlockProof(lock, "r2", "p2", null)).toBe(false);
  });

  it("does not unlock when foreign lock is active", () => {
    expect(shouldUnlockProof(lock, "r2", "p1", "foreign")).toBe(false);
  });

  it("unlocks when new report, same project, not foreign", () => {
    expect(shouldUnlockProof(lock, "r2", "p1", null)).toBe(true);
    expect(shouldUnlockProof(lock, "r2", "p1", "rebounce")).toBe(true);
  });

  it("composer stays locked on foreign upload even if report id changes", () => {
    // Simulates the bug Lovable warned about: foreign upload somehow set active but must NOT clear.
    const foreignAttempt = shouldUnlockProof(lock, "r-foreign", "p1", "foreign");
    expect(foreignAttempt).toBe(false);
  });
});
