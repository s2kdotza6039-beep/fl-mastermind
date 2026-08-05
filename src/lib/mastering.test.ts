import { describe, it, expect } from "vitest";
import { assessMaster, buildMasterAdvisePrompt, getPlatform, PLATFORM_TARGETS } from "@/lib/mastering";

const clean = { lufs_estimate: -14.2, peak_db: -1.2, dynamic_range_db: 8, stereo_width: 0.5, detected_issues: [] };

describe("mastering assessment — the platform verdict", () => {
  it("a disciplined master is PLATFORM-READY, all checks pass", () => {
    const v = assessMaster(clean, getPlatform("spotify"));
    expect(v.status).toBe("platform-ready");
    expect(v.checks.every((c) => c.verdict === "pass")).toBe(true);
    expect(v.headline).toContain("PLATFORM-READY");
  });

  it("louder than target = NOT YET (streaming turns you down for free)", () => {
    const v = assessMaster({ ...clean, lufs_estimate: -9.0 }, getPlatform("spotify"));
    expect(v.status).toBe("not-yet");
    const loud = v.checks.find((c) => c.id === "loudness");
    expect(loud?.verdict).toBe("fail");
    expect(loud?.fix).toContain("Fruity Limiter");
  });

  it("more than 2 LU under target = note, not a fail", () => {
    const v = assessMaster({ ...clean, lufs_estimate: -18.0 }, getPlatform("spotify"));
    expect(v.status).toBe("ready-with-notes");
    expect(v.checks.find((c) => c.id === "quiet")?.verdict).toBe("warn");
  });

  it("ceiling: above it fails, inside the thin margin it warns, with room it passes", () => {
    expect(assessMaster({ ...clean, peak_db: -1.3 }, getPlatform("spotify")).status).toBe("platform-ready");
    expect(assessMaster({ ...clean, peak_db: -1.0 }, getPlatform("spotify")).checks.find((c) => c.id === "ceiling")?.verdict).toBe("warn");
    const hot = assessMaster({ ...clean, peak_db: -0.5 }, getPlatform("spotify"));
    expect(hot.status).toBe("not-yet");
    expect(hot.checks.find((c) => c.id === "ceiling")?.verdict).toBe("fail");
  });

  it("inter-sample breach is read from issues by EITHER field shape", () => {
    const byId = assessMaster({ ...clean, detected_issues: [{ id: "intersample_hot", severity: "warn" }] }, getPlatform("spotify"));
    const byDetector = assessMaster({ ...clean, detected_issues: [{ detector_id: "intersample_hot", severity: "warn" }] }, getPlatform("spotify"));
    expect(byId.checks.find((c) => c.id === "intersample")?.verdict).toBe("fail");
    expect(byDetector.status).toBe("not-yet");
  });

  it("open criticals fail the master even when loudness is perfect", () => {
    const v = assessMaster({ ...clean, detected_issues: [{ id: "clipping", severity: "critical" }] }, getPlatform("spotify"));
    expect(v.status).toBe("not-yet");
    expect(v.checks.find((c) => c.id === "criticals")?.verdict).toBe("fail");
  });

  it("the same master can fail Spotify and pass the Club table", () => {
    const r = { ...clean, lufs_estimate: -7.5, peak_db: -0.9, dynamic_range_db: 6.5 };
    expect(assessMaster(r, getPlatform("spotify")).status).toBe("not-yet");
    expect(assessMaster(r, getPlatform("club")).status).toBe("platform-ready");
  });

  it("unmeasured metrics skip their checks instead of crashing", () => {
    const v = assessMaster({ lufs_estimate: null, peak_db: null, dynamic_range_db: null, stereo_width: null, detected_issues: null }, getPlatform("boomplay"));
    expect(v.status).toBe("platform-ready");
    expect(v.checks.length).toBe(0);
  });
});

describe("platform table + advise prompt", () => {
  it("every platform enforces a real ceiling and Boomplay is on the map", () => {
    expect(PLATFORM_TARGETS.length).toBe(5);
    expect(PLATFORM_TARGETS.every((p) => p.ceilingDb <= -0.3)).toBe(true);
    expect(getPlatform("boomplay").lufs).toBe(-14);
    expect(getPlatform("nonsense").id).toBe("spotify"); // fallback
  });

  it("buildMasterAdvisePrompt lists open checks and the newest-stock doctrine", () => {
    const v = assessMaster({ ...clean, lufs_estimate: -9.0, peak_db: -0.4 }, getPlatform("spotify"));
    const prompt = buildMasterAdvisePrompt(clean, getPlatform("spotify"), v);
    expect(prompt).toContain("Spotify");
    expect(prompt).toContain("TOO HOT");
    expect(prompt).toContain("Fruity Limiter");
    expect(prompt).toContain("platform-ready");
  });
});
