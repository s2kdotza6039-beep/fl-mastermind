import { describe, expect, it } from "vitest";
import { resolveGenreTarget } from "./genre-target";
import type { GenreProfileRow } from "./genre-target";

const profiles: GenreProfileRow[] = [
  { genre: "Amapiano", target_score: 85 },
  { genre: "Hip-hop", target_score: 85 },
  { genre: "Pop", target_score: 85 },
];

describe("genre target resolver", () => {
  it("exact match is non-generic; unknown falls back to pop flagged generic", () => {
    const a = resolveGenreTarget(profiles, "amapiano");
    expect(a.profile?.genre).toBe("Amapiano");
    expect(a.generic).toBe(false);
    const b = resolveGenreTarget(profiles, "Soulection Beats");
    expect(b.profile?.genre).toBe("Pop");
    expect(b.generic).toBe(true);
  });

  it("aliases resolve to their canonical profile (still flagged generic)", () => {
    expect(resolveGenreTarget(profiles, "HipHop").profile?.genre).toBe("Hip-hop");
  });

  it("null genre → no profile, generic", () => {
    expect(resolveGenreTarget(profiles, null)).toEqual({ profile: null, generic: true });
  });
});
