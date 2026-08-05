// ============================================================================
// STUDIO SENSEI — PIANO-ROLL GRID MATH (D29 / s8)
// ----------------------------------------------------------------------------
// Deterministic layout for the chord preview grid. Pure math, unit-tested —
// the component only paints what this returns.
// ============================================================================

import { noteNameToMidi } from "./midi";

export interface GridCell { row: number; col: number; midi: number }

export interface NoteGrid {
  /** Index 0 = TOP of the grid (highest pitch). Labels shown on C rows only. */
  rows: { midi: number; label: string }[];
  cells: GridCell[];
  /** One column per chord/bar. */
  cols: number;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function buildNoteGrid(chords: string[][]): NoteGrid {
  const midis = chords.flat().map(noteNameToMidi).filter((n): n is number => n !== null);
  if (midis.length === 0) return { rows: [], cells: [], cols: chords.length };
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  const rows: NoteGrid["rows"] = [];
  for (let m = max; m >= min; m--) {
    const pc = ((m % 12) + 12) % 12;
    rows.push({ midi: m, label: pc === 0 ? `${NAMES[pc]}${Math.floor(m / 12) - 1}` : "" });
  }
  const cells: GridCell[] = [];
  chords.forEach((chord, col) => {
    chord.forEach((name) => {
      const midi = noteNameToMidi(name);
      if (midi !== null) cells.push({ row: max - midi, col, midi });
    });
  });
  return { rows, cells, cols: chords.length };
}
