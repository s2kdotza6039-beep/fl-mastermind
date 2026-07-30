import { describe, it, expect } from "vitest";
import { buildExportPayload, exportFileName, parseExportChecklist } from "./project-export";

const project = {
  id: "p1",
  name: "  Midnight  Drive!  ",
  description: "demo",
  genre: "afro",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  checklist: [
    { id: "1", label: "Beat ready", done: true },
    { id: "2", label: "Vocals recorded", done: false },
    { id: "bad", label: 5 },
  ],
};

describe("exportFileName", () => {
  it("slugifies the project name", () => {
    expect(exportFileName("  Midnight  Drive!  ")).toBe("midnight-drive-studio-sensei-export.json");
  });
  it("falls back to 'project' when the name has no usable characters", () => {
    expect(exportFileName("***")).toBe("project-studio-sensei-export.json");
    expect(exportFileName("")).toBe("project-studio-sensei-export.json");
  });
});

describe("parseExportChecklist", () => {
  it("keeps only valid items and coerces done", () => {
    expect(parseExportChecklist(project.checklist)).toEqual([
      { id: "1", label: "Beat ready", done: true },
      { id: "2", label: "Vocals recorded", done: false },
    ]);
  });
  it("returns an empty array for non-array input", () => {
    expect(parseExportChecklist(null)).toEqual([]);
    expect(parseExportChecklist({})).toEqual([]);
  });
});

describe("buildExportPayload", () => {
  const payload = buildExportPayload({
    project,
    versions: [{ id: "v1" }],
    scores: [],
    issues: [],
    plans: [{ id: "pl1", steps: [] }],
    advice: [],
    exportedAt: "2026-07-30T05:00:00.000Z",
  });

  it("has the expected top-level shape", () => {
    expect(Object.keys(payload).sort()).toEqual(
      ["advice", "app", "exported_at", "issues", "plans", "project", "scores", "versions"].sort(),
    );
    expect(payload.app).toBe("studio-sensei");
    expect(payload.exported_at).toBe("2026-07-30T05:00:00.000Z");
  });

  it("includes checklist items and done state", () => {
    expect(payload.project.checklist).toEqual([
      { id: "1", label: "Beat ready", done: true },
      { id: "2", label: "Vocals recorded", done: false },
    ]);
    expect(payload.project.checklist_progress).toEqual({ done: 1, total: 2 });
  });

  it("nulls out optional project fields", () => {
    const p = buildExportPayload({
      project: { id: "x", name: "X", status: "active", created_at: "now" },
      versions: [],
      scores: [],
      issues: [],
      plans: [],
      advice: [],
    });
    expect(p.project.description).toBeNull();
    expect(p.project.genre).toBeNull();
    expect(p.project.goal).toBeNull();
    expect(p.project.session_notes).toBeNull();
    expect(p.project.checklist).toEqual([]);
  });

  it("serializes to a JSON blob with the export filename", () => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    expect(blob.type).toBe("application/json");
    expect(exportFileName(project.name)).toBe("midnight-drive-studio-sensei-export.json");
  });
});
