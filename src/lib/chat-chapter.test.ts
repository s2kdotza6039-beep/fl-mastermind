import { describe, it, expect } from "vitest";
import { CHAPTERS, chapterFromPath, chapterDirective, chapterLabel } from "./chat-chapter";

describe("chat-chapter", () => {
  it("maps production routes", () => {
    expect(chapterFromPath("/production")).toBe("PRODUCTION");
    expect(chapterFromPath("/upload")).toBe("PRODUCTION");
    expect(chapterFromPath("/genre")).toBe("PRODUCTION");
  });

  it("maps mixing routes", () => {
    for (const p of ["/mixing", "/chat", "/quick", "/problems", "/key"]) {
      expect(chapterFromPath(p)).toBe("MIXING");
    }
  });

  it("maps mastering and publish routes", () => {
    expect(chapterFromPath("/mastering")).toBe("MASTERING");
    expect(chapterFromPath("/publish")).toBe("PUBLISH");
  });

  it("falls back to GENERAL", () => {
    expect(chapterFromPath("/settings")).toBe("GENERAL");
    expect(chapterFromPath("")).toBe("GENERAL");
  });

  it("gives a non-empty directive for every steerable chapter", () => {
    for (const c of CHAPTERS) expect(chapterDirective(c).length).toBeGreaterThan(20);
    expect(chapterDirective("GENERAL")).toBe("");
  });

  it("labels chapters", () => {
    expect(chapterLabel("PRODUCTION")).toBe("Production");
    expect(chapterLabel("PUBLISH")).toBe("Publish");
  });
});
