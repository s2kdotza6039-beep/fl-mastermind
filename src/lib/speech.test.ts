import { describe, it, expect, beforeEach } from "vitest";
import {
  stripForSpeech,
  countSentences,
  loadStoredRate,
  storeRate,
  loadStoredPrefs,
  storePrefs,
  SPEECH_RATE_KEY,
} from "./speech";

describe("stripForSpeech", () => {
  beforeEach(() => localStorage.clear());

  it("turns bullet items into separate sentences", () => {
    const out = stripForSpeech("- Cut 200Hz\n- Add compression\n- Check stereo width");
    expect(out).toBe("Cut 200Hz. Add compression. Check stereo width.");
    expect(countSentences(out)).toBe(3);
  });

  it("handles numbered lists and task lists", () => {
    const out = stripForSpeech("1. First step\n2) Second step\n- [x] Done item");
    expect(out).toBe("First step. Second step. Done item.");
    expect(countSentences(out)).toBe(3);
  });

  it("reads blockquotes with a spoken prefix", () => {
    const out = stripForSpeech("> Mix quieter than you think.");
    expect(out).toBe("Quote: Mix quieter than you think.");
    expect(countSentences(out)).toBe(1);
  });

  it("strips headings, emphasis, links, code and rules", () => {
    const out = stripForSpeech(
      "## Mix Notes\n---\nUse **EQ** and `gain` on [this track](https://x.com).\n```js\nconst a=1;\n```",
    );
    expect(out).toContain("Mix Notes.");
    expect(out).toContain("Use EQ and code block on this track.");
    expect(out).toContain("code block");
    expect(out).not.toMatch(/[#*`>|]/);
  });

  it("returns empty string for empty input", () => {
    expect(stripForSpeech("")).toBe("");
    expect(countSentences("")).toBe(0);
  });
});

describe("speech preference persistence", () => {
  beforeEach(() => localStorage.clear());

  it("falls back when nothing stored", () => {
    expect(loadStoredRate()).toBe(1);
    expect(loadStoredRate(1.5)).toBe(1.5);
  });

  it("round-trips a stored rate", () => {
    storeRate(1.25);
    expect(localStorage.getItem(SPEECH_RATE_KEY)).toBe("1.25");
    expect(loadStoredRate()).toBe(1.25);
  });

  it("ignores invalid or out-of-range rates", () => {
    localStorage.setItem(SPEECH_RATE_KEY, "abc");
    expect(loadStoredRate()).toBe(1);
    localStorage.setItem(SPEECH_RATE_KEY, "99");
    expect(loadStoredRate()).toBe(1);
  });

  it("round-trips playback prefs", () => {
    expect(loadStoredPrefs()).toEqual({ autoResume: false, lastSpokenId: null });
    storePrefs({ autoResume: true, lastSpokenId: "msg-7" });
    expect(loadStoredPrefs()).toEqual({ autoResume: true, lastSpokenId: "msg-7" });
  });
});
