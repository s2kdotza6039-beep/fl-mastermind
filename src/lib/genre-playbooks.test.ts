import { describe, expect, it } from "vitest";
import { matchPlaybook, GENRE_PLAYBOOKS } from "./genre-playbooks";

describe("genre playbooks", () => {
  it("matches by id, alias and mixed case; unknown → null", () => {
    expect(matchPlaybook("Amapiano")?.id).toBe("amapiano");
    expect(matchPlaybook("gqom")?.id).toBe("gqom");
    expect(matchPlaybook("Afro House")?.id).toBe("afro-house");
    expect(matchPlaybook("Drill")?.id).toBe("trap");
    expect(matchPlaybook("Liquid DnB")).toBeNull();
    expect(matchPlaybook(null)).toBeNull();
  });

  it("every playbook is a complete, sane song map", () => {
    for (const p of GENRE_PLAYBOOKS) {
      expect(p.arrangement.reduce((s, x) => s + x.bars, 0)).toBeGreaterThanOrEqual(64);
      expect(p.drumPalette.length).toBeGreaterThanOrEqual(3);
      expect(p.mixFocus.length).toBeGreaterThanOrEqual(2);
      expect(p.bpmRange[0]).toBeLessThan(p.bpmRange[1]);
    }
  });

  it("ids stay unique (planner keys depend on it)", () => {
    const ids = GENRE_PLAYBOOKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
