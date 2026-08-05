import { useMemo } from "react";
import { buildGrooveGrid, type Groove } from "@/lib/grooves";

const CELL_W = 12;

export const GrooveGrid = ({ groove, bars }: { groove: Groove; bars: number }) => {
  const grid = useMemo(() => buildGrooveGrid(groove, bars), [groove, bars]);
  const byCol = useMemo(
    () => grid.rows.map((r) => new Map(r.cells.map((c) => [c.col, c]))),
    [grid],
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card/40 p-2">
      <div className="min-w-max space-y-1">
        {/* bar ruler */}
        <div className="flex items-center gap-1">
          <div className="w-24 shrink-0" />
          {Array.from({ length: bars }).map((_, b) => (
            <div
              key={b}
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
              style={{ width: CELL_W * groove.stepsPerBar }}
            >
              Bar {b + 1}
            </div>
          ))}
        </div>

        {grid.rows.map((row, ri) => (
          <div key={row.laneId} className="flex items-center gap-1">
            <div className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
              {row.label}
            </div>
            <div className="flex">
              {Array.from({ length: grid.cols }).map((_, col) => {
                const c = byCol[ri].get(col);
                const barLine = col % groove.stepsPerBar === 0;
                return (
                  <div
                    key={col}
                    className={`mr-[2px] h-3 rounded-[2px] ${
                      barLine ? "ml-[2px] " : ""
                    }${
                      c
                        ? c.vel >= 108
                          ? "bg-primary"
                          : c.vel >= 90
                            ? "bg-primary/70"
                            : "bg-primary/40"
                        : "bg-muted/40"
                    }`}
                    style={{ width: CELL_W - 2 }}
                    title={
                      c
                        ? `${row.label} · step ${(col % groove.stepsPerBar) + 1}${c.note ? ` · ${c.note}` : ""}`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
