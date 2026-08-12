import { describe, expect, it } from "vitest";
import { makeScope, scopeLabel } from "./chat-scope";

describe("chat scope", () => {
  it("builds a chapter-only scope when there is no phase", () => {
    expect(makeScope("MIXING")).toBe("MIXING");
    expect(makeScope("PRODUCTION", null)).toBe("PRODUCTION");
  });

  it("builds a chapter:phase scope and upper-cases it", () => {
    expect(makeScope("PRODUCTION", "beat")).toBe("PRODUCTION:BEAT");
  });

  it("labels chapter-only scopes", () => {
    expect(scopeLabel("MIXING")).toBe("Mixing");
  });

  it("labels chapter:phase scopes", () => {
    expect(scopeLabel("PRODUCTION:BEAT")).toBe("Production · Beat");
  });
});
