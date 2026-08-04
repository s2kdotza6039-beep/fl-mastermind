import { describe, expect, it } from "vitest";
import {
  ADVISOR_LANG_KEY,
  advisorBcp47,
  loadAdvisorLanguage,
  storeAdvisorLanguage,
} from "./advisor-language";

describe("advisor language", () => {
  it("defaults to English with nothing stored and rejects unknown codes", () => {
    localStorage.removeItem(ADVISOR_LANG_KEY);
    expect(loadAdvisorLanguage()).toBe("en");
    storeAdvisorLanguage("xx");
    expect(loadAdvisorLanguage()).toBe("en");
    expect(advisorBcp47("xx")).toBe("en");
  });

  it("round-trips a supported language (isiZulu first-class)", () => {
    storeAdvisorLanguage("zu");
    expect(loadAdvisorLanguage()).toBe("zu");
    expect(advisorBcp47("zu")).toBe("zu");
    localStorage.removeItem(ADVISOR_LANG_KEY);
  });

  it("survives a full allowlist store cycle", () => {
    for (const code of ["en", "pt", "sw", "ar"]) {
      storeAdvisorLanguage(code);
      expect(loadAdvisorLanguage()).toBe(code);
    }
    localStorage.removeItem(ADVISOR_LANG_KEY);
  });
});
