// Resolve a scoring target profile for ANY genre string (D25). Exact and
// alias matches first; everything else falls back to a generic profile with
// an honesty flag so the UI can disclose it.
export interface GenreProfileRow {
  genre: string;
  target_score: number;
  [key: string]: unknown;
}

export interface ResolvedTarget {
  profile: GenreProfileRow | null;
  generic: boolean;
}

const ALIASES: Record<string, string> = {
  "afro house": "afrobeat",
  "afro-house": "afrobeat",
  "hiphop": "hip-hop",
  "hip hop": "hip-hop",
  "rmb": "r&b",
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function resolveGenreTarget(
  profiles: GenreProfileRow[],
  genre: string | null | undefined,
  fallbackGenre = "pop",
): ResolvedTarget {
  if (!genre) return { profile: null, generic: true };
  const g = norm(genre);
  const exact = profiles.find((p) => norm(p.genre) === g);
  if (exact) return { profile: exact, generic: false };
  const alias = ALIASES[g];
  if (alias) {
    const hit = profiles.find((p) => norm(p.genre) === alias);
    if (hit) return { profile: hit, generic: true };
  }
  const fb = profiles.find((p) => norm(p.genre) === fallbackGenre);
  return { profile: fb ?? profiles[0] ?? null, generic: true };
}
