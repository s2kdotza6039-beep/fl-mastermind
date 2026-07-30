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

import {
  splitSentences,
  messageKey,
  scoreVoice,
  pickBestVoice,
  saveResume,
  loadResume,
  clearResume,
} from "./speech";

describe("sentence splitting (V1.5 engine)", () => {
  it("splits into trimmed sentences and drops empties", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(splitSentences("")).toEqual([]);
  });
});

describe("messageKey stability", () => {
  it("is deterministic and content-sensitive", () => {
    expect(messageKey("hello mix")).toBe(messageKey("hello mix"));
    expect(messageKey("hello mix")).not.toBe(messageKey("hello mix!"));
  });
});

describe("voice scoring", () => {
  const mk = (name: string, lang: string) =>
    ({ name, lang, voiceURI: name, default: false, localService: true }) as SpeechSynthesisVoice;

  it("prefers natural/neural voices over plain ones", () => {
    expect(scoreVoice("Microsoft Aria Online (Natural) - English (United States)", "en-US"))
      .toBeGreaterThan(scoreVoice("English", "en-US"));
  });

  it("prefers en-ZA among equal-quality voices and rejects non-English", () => {
    expect(scoreVoice("Google South African English", "en-ZA")).toBeGreaterThan(
      scoreVoice("Google US English", "en-US"),
    );
    expect(scoreVoice("Lucie", "fr-FR")).toBeLessThan(0);
  });

  it("pickBestVoice honors an explicit override first", () => {
    const a = mk("Microsoft Aria Online (Natural) - English (United States)", "en-US");
    const b = mk("Plain Voice", "en-US");
    expect(pickBestVoice([a, b], "Plain Voice")?.name).toBe("Plain Voice");
    expect(pickBestVoice([a, b], null)?.name).toBe(a.name);
  });
});

describe("resume positions", () => {
  it("round-trips and clears", () => {
    saveResume("m1", 4, 9);
    expect(loadResume("m1")).toMatchObject({ sentence: 4, total: 9 });
    clearResume("m1");
    expect(loadResume("m1")).toBeNull();
  });

  it("rejects finished/corrupt/unknown positions", () => {
    expect(loadResume("never-saved")).toBeNull();
    saveResume("m2", 9, 9); // finished — nothing to resume
    expect(loadResume("m2")).toBeNull();
    localStorage.setItem("sensei.speech.resume.m3", "{oops");
    expect(loadResume("m3")).toBeNull();
    localStorage.removeItem("sensei.speech.resume.m3");
    localStorage.removeItem("sensei.speech.resume.m2");
  });
});
