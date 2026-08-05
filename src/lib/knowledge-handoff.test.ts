import { describe, expect, it } from "vitest";
import { stashChatPrompt, takeChatPrompt, buildRewritePrompt } from "./knowledge-handoff";

describe("knowledge handoff", () => {
  it("stash → take is a one-shot round trip", () => {
    stashChatPrompt("hello sensei");
    expect(takeChatPrompt()).toBe("hello sensei");
    expect(takeChatPrompt()).toBeNull(); // one-shot: second take is empty
    expect(takeChatPrompt()).toBeNull(); // never was stashed
  });

  it("prompt builder keeps base lines and appends constraints in canonical order", () => {
    const p = buildRewritePrompt(["Line one.", "Line two."], ["vocal-first", "harmonic-rhythm"]);
    const chunks = p.split("\n");
    expect(chunks[0]).toBe("Line one.");
    expect(chunks[1]).toBe("Line two.");
    expect(chunks[2]).toContain("harmonic rhythm");
    expect(chunks[3]).toContain("vocal melody is fixed");
  });

  it("empty constraint ids leave the base unchanged; blanks are dropped", () => {
    expect(buildRewritePrompt(["Solo", ""], [])).toBe("Solo");
  });
});
