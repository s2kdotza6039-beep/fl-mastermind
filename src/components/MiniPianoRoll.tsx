import { buildNoteGrid } from "@/lib/piano-roll";

const H = 96;

export const MiniPianoRoll = ({ chords }: { chords: string[][] }) => {
  const grid = buildNoteGrid(chords);
  if (!grid.rows.length) return null;
  const rowH = H / grid.rows.length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-2 overflow-x-auto">
      <div className="flex items-stretch gap-1" style={{ height: H }}>
        {/* Pitch gutter — labels only on C rows. */}
        <div className="relative w-9 shrink-0">
          {grid.rows.map((r, i) =>
            r.label ? (
              <span
                key={r.midi}
                className="absolute left-0 text-[9px] text-muted-foreground/80 font-mono leading-none"
                style={{ top: i * rowH }}
              >
                {r.label}
              </span>
            ) : null,
          )}
        </div>
        {Array.from({ length: grid.cols }).map((_, col) => (
          <div key={col} className="relative flex-1 min-w-[48px] rounded border border-border/60 bg-background/40">
            {grid.cells
              .filter((c) => c.col === col)
              .map((c) => (
                <div
                  key={c.midi}
                  className="absolute left-0.5 right-0.5 rounded-sm bg-primary/80"
                  style={{ top: c.row * rowH, height: Math.max(2, rowH - 1) }}
                  title={`MIDI ${c.midi}`}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};
