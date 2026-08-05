import { describe, it, expect } from "vitest";
import { buildReleaseAdvisePrompt, buildReleasePlan } from "@/lib/release";

const cleanReport = { lufs_estimate: -14.2, peak_db: -1.2, dynamic_range_db: 8, stereo_width: 0.5, detected_issues: [] };
const base = { masterReady: true, mixScore: 87, platformId: "spotify", projectName: "Sgija Sunday", genre: "Amapiano" };

describe("publish chapter — the final gates", () => {
  it("nothing ships unheard — no report closes the first gate", () => {
    const p = buildReleasePlan({ ...base, report: null });
    expect(p.gates.find((g) => g.id === "analyzed")?.verdict).toBe("fail");
    expect(p.ready).toBe(false);
    expect(p.headline).toContain("NOT RELEASE-READY");
  });

  it("a disciplined master on target reads RELEASE-READY, every gate green", () => {
    const p = buildReleasePlan({ ...base, report: cleanReport });
    expect(p.ready).toBe(true);
    expect(p.clean).toBe(true);
    expect(p.gates.every((g) => g.verdict === "pass")).toBe(true);
    expect(p.headline).toContain("RELEASE-READY");
  });

  it("a master hotter than the platform target fails the loudness gate", () => {
    const p = buildReleasePlan({ ...base, report: { ...cleanReport, lufs_estimate: -10 } });
    expect(p.gates.find((g) => g.id === "loudness")?.verdict).toBe("fail");
    expect(p.ready).toBe(false);
  });

  it("a quiet master is shippable with notes, never RELEASE-READY", () => {
    const p = buildReleasePlan({ ...base, report: { ...cleanReport, lufs_estimate: -18 } });
    expect(p.gates.find((g) => g.id === "quiet")?.verdict).toBe("warn");
    expect(p.ready).toBe(true);
    expect(p.clean).toBe(false);
    expect(p.headline).toContain("READY WITH NOTES");
  });

  it("inter-sample peaks slip past a safe sample-peak — the gate catches them", () => {
    const p = buildReleasePlan({
      ...base,
      report: { ...cleanReport, detected_issues: [{ id: "intersample_hot", severity: "warn", detail: "0.3 dBTP over" }] },
    });
    expect(p.gates.find((g) => g.id === "intersample")?.verdict).toBe("fail");
    expect(p.ready).toBe(false);
  });

  it("open criticals bar the door even when every measurement is clean", () => {
    const p = buildReleasePlan({ ...base, report: { ...cleanReport, detected_issues: [{ id: "dc_offset", severity: "critical" }] } });
    expect(p.gates.find((g) => g.id === "criticals")?.verdict).toBe("fail");
    expect(p.ready).toBe(false);
  });

  it("club dynamics floor is 5 dB, the streaming floor is 6 dB", () => {
    const club = buildReleasePlan({ ...base, platformId: "club", report: { ...cleanReport, lufs_estimate: -7, peak_db: -0.5, dynamic_range_db: 5.4 } });
    const spot = buildReleasePlan({ ...base, report: { ...cleanReport, dynamic_range_db: 5.4 } });
    expect(club.gates.find((g) => g.id === "dynamics")?.verdict).toBe("pass");
    expect(spot.gates.find((g) => g.id === "dynamics")?.verdict).toBe("warn");
  });

  it("missing release identity warns but never bars the door alone", () => {
    const p = buildReleasePlan({ ...base, report: cleanReport, genre: "" });
    expect(p.gates.find((g) => g.id === "metadata")?.verdict).toBe("warn");
    expect(p.ready).toBe(true);
  });

  it("a stamped mix under the 80 bar carries a note, not a lock", () => {
    const low = buildReleasePlan({ ...base, report: cleanReport, mixScore: 72 });
    const unscored = buildReleasePlan({ ...base, report: cleanReport, mixScore: null });
    expect(low.gates.find((g) => g.id === "scored")?.verdict).toBe("warn");
    expect(unscored.gates.find((g) => g.id === "scored")?.verdict).toBe("pass");
    expect(low.ready).toBe(true);
  });

  it("without the Mixing chapter stamp there is no release — the door stays shut", () => {
    const p = buildReleasePlan({ ...base, masterReady: false, report: cleanReport });
    expect(p.gates.find((g) => g.id === "scored")?.verdict).toBe("fail");
    expect(p.ready).toBe(false);
  });
});

describe("publish chapter — the Sensei handoff", () => {
  it("the advise prompt carries the verdict, the open gates, and the export doctrine", () => {
    const report = { ...cleanReport, lufs_estimate: -10 };
    const plan = buildReleasePlan({ ...base, report });
    const prompt = buildReleaseAdvisePrompt(plan, report);
    expect(prompt).toContain("RELEASE READINESS — Spotify / Deezer");
    expect(prompt).toContain("(FAIL)");
    expect(prompt).toContain("24-bit");
    expect(prompt).toContain("44.1 kHz");
    expect(prompt).toContain("show me export wav");
  });

  it("a clean plan walks the release, not the fixes", () => {
    const plan = buildReleasePlan({ ...base, report: cleanReport });
    expect(buildReleaseAdvisePrompt(plan, cleanReport)).toContain("Every gate passes");
  });
});
