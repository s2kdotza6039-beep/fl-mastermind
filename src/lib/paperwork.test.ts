import { describe, expect, it } from "vitest";
import { buildMixChecklistMarkdown, buildReleaseNotesMarkdown } from "@/lib/paperwork";
import type { ReleasePlan } from "@/lib/release";

const plan: ReleasePlan = {
  platform: { id: "spotify", label: "Spotify", lufs: -14, ceilingDb: -1, note: "normalizes to -14" } as any,
  gates: [
    { id: "loudness", label: "Loudness", verdict: "pass", detail: "-14.1 LUFS" },
    { id: "peak", label: "True peak", verdict: "fail", detail: "-0.1 dBTP", fix: "Lower the ceiling to -1 dBTP" },
  ],
  fails: 1,
  warns: 0,
  ready: false,
  clean: false,
  headline: "One gate still fails.",
  master: null,
};

describe("paperwork", () => {
  it("renders the checklist with gate marks and fixes", () => {
    const md = buildMixChecklistMarkdown(plan, { name: "Night Drive", genre: "amapiano" });
    expect(md).toContain("# Final mix & master checklist");
    expect(md).toContain("Night Drive");
    expect(md).toContain("- [x] **Loudness**");
    expect(md).toContain("- [ ] **True peak**");
    expect(md).toContain("Fix: Lower the ceiling to -1 dBTP");
  });

  it("renders release notes with measurements and metadata fields", () => {
    const md = buildReleaseNotesMarkdown(plan, { name: "Night Drive" }, {
      lufs_estimate: -9.2,
      peak_db: -0.3,
      dynamic_range_db: 7,
      stereo_width: 0.6,
      detected_issues: [],
    } as any);
    expect(md).toContain("# Release notes");
    expect(md).toContain("-9.2 LUFS");
    expect(md).toContain("ISRC:");
    expect(md).toContain("Ready to ship: not yet");
  });
});
