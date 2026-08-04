import { describe, expect, it } from "vitest";
import { loadMessageRating, storeMessageRating } from "./message-rating";

describe("message rating", () => {
  it("round-trips up/down and clears", () => {
    storeMessageRating("mA", "up");
    expect(loadMessageRating("mA")).toBe("up");
    storeMessageRating("mA", "down");
    expect(loadMessageRating("mA")).toBe("down");
    storeMessageRating("mA", null);
    expect(loadMessageRating("mA")).toBeNull();
  });

  it("is isolated per message and ignores junk", () => {
    expect(loadMessageRating("never")).toBeNull();
    localStorage.setItem("sensei.msg.rating.junk", "meh");
    expect(loadMessageRating("junk")).toBeNull();
    localStorage.removeItem("sensei.msg.rating.junk");
  });
});
