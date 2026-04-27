// Diatonic chord builder for major/minor keys.
// Returns Roman numerals + triads + 7th-extensions + suggested progressions.

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type Note = typeof NOTES[number];
export type Scale = "Major" | "Minor";

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

const MAJOR_QUALITIES = ["maj", "min", "min", "maj", "maj", "min", "dim"] as const;
const MINOR_QUALITIES = ["min", "dim", "maj", "min", "min", "maj", "maj"] as const;

const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export interface DiatonicChord {
  numeral: string;
  symbol: string;       // e.g. "Am", "F", "Bdim"
  notes: string[];      // triad notes
  seventh: string;      // 7th-chord symbol e.g. "Am7"
  function: string;     // "Tonic", "Subdominant", etc.
}

const FUNCTIONS_MAJOR = ["Tonic", "Supertonic", "Mediant", "Subdominant", "Dominant", "Submediant", "Leading"];
const FUNCTIONS_MINOR = ["Tonic", "Supertonic", "Mediant", "Subdominant", "Dominant", "Submediant", "Subtonic"];

function noteAt(rootIdx: number, semitones: number): string {
  return NOTES[(rootIdx + semitones + 144) % 12];
}

export function diatonicChords(root: Note, scale: Scale): DiatonicChord[] {
  const idx = NOTES.indexOf(root);
  const intervals = scale === "Major" ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const qualities = scale === "Major" ? MAJOR_QUALITIES : MINOR_QUALITIES;
  const numerals = scale === "Major" ? MAJOR_NUMERALS : MINOR_NUMERALS;
  const fns = scale === "Major" ? FUNCTIONS_MAJOR : FUNCTIONS_MINOR;

  return intervals.map((step, degree) => {
    const r = noteAt(idx, step);
    const q = qualities[degree];
    // Triad intervals from chord root
    const thirdSemis = q === "min" || q === "dim" ? 3 : 4;
    const fifthSemis = q === "dim" ? 6 : 7;
    const third = noteAt(idx, step + thirdSemis);
    const fifth = noteAt(idx, step + fifthSemis);

    const symbol =
      q === "maj" ? r :
      q === "min" ? `${r}m` :
      `${r}dim`;

    // 7th chord
    let seventhSymbol: string;
    if (q === "maj") {
      const isDominant = scale === "Major" && degree === 4; // V7
      seventhSymbol = isDominant ? `${r}7` : `${r}maj7`;
    } else if (q === "min") {
      seventhSymbol = `${r}m7`;
    } else {
      seventhSymbol = `${r}m7♭5`;
    }

    return {
      numeral: numerals[degree],
      symbol,
      notes: [r, third, fifth],
      seventh: seventhSymbol,
      function: fns[degree],
    };
  });
}

/** Common, well-known progressions for the chosen key. */
export function suggestedProgressions(root: Note, scale: Scale): { name: string; numerals: string[]; chords: string[] }[] {
  const ch = diatonicChords(root, scale);
  const sym = (n: string) => ch.find((c) => c.numeral === n)?.symbol ?? n;

  if (scale === "Major") {
    return [
      {
        name: "Pop / Hook (I–V–vi–IV)",
        numerals: ["I", "V", "vi", "IV"],
        chords: ["I", "V", "vi", "IV"].map(sym),
      },
      {
        name: "R&B / Soul (ii–V–I)",
        numerals: ["ii", "V", "I"],
        chords: ["ii", "V", "I"].map(sym),
      },
      {
        name: "Anthem / Worship (I–IV–vi–V)",
        numerals: ["I", "IV", "vi", "V"],
        chords: ["I", "IV", "vi", "V"].map(sym),
      },
    ];
  }
  return [
    {
      name: "Trap / Drill (i–VI–III–VII)",
      numerals: ["i", "VI", "III", "VII"],
      chords: ["i", "VI", "III", "VII"].map(sym),
    },
    {
      name: "Dark / Cinematic (i–iv–VII–VI)",
      numerals: ["i", "iv", "VII", "VI"],
      chords: ["i", "iv", "VII", "VI"].map(sym),
    },
    {
      name: "Amapiano / House (i–VII–VI–v)",
      numerals: ["i", "VII", "VI", "v"],
      chords: ["i", "VII", "VI", "v"].map(sym),
    },
  ];
}
