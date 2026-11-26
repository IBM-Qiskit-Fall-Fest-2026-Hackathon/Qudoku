import React from "react";
import type {
  CellCoord,
  CollapseStep,
  EntanglementCluster,
  EntanglementMode,
  StateType,
} from "../types/quantum";

interface SudokuBoardProps {
  board: number[][];
  givens: number[][];
  candidates: number[][][];
  selectedCell: CellCoord | null;
  conflicts: CellCoord[];
  clusters: EntanglementCluster[];
  activeCluster: EntanglementCluster | null;
  entanglementMode: EntanglementMode;
  manualCells: CellCoord[];
  lastCollapseTrace: CollapseStep[];
  onCellClick: (row: number, col: number) => void;
  onDigitInput: (digit: number) => void;
  clearLabel: string;
}

const STATE_COLORS: Record<StateType, string> = {
  BELL: "#22D3EE",
  GHZ: "#A78BFA",
  W: "#34D399",
  SUPERPOSITION: "#FBBF24",
};

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

export const SudokuBoard: React.FC<SudokuBoardProps> = ({
  board,
  givens,
  candidates,
  selectedCell,
  conflicts,
  clusters,
  activeCluster,
  entanglementMode,
  manualCells,
  lastCollapseTrace,
  onCellClick,
  onDigitInput,
  clearLabel,
}) => {
  const activeColor = activeCluster ? STATE_COLORS[activeCluster.state_type] : "#22D3EE";

  const qubitIndexMap = new Map<string, number>();
  if (activeCluster) {
    activeCluster.cells.forEach((cell, idx) => {
      qubitIndexMap.set(`${cell.row},${cell.col}`, idx);
    });
  }

  const manualIndexMap = new Map<string, number>();
  manualCells.forEach((cell, idx) => {
    manualIndexMap.set(`${cell.row},${cell.col}`, idx);
  });

  const traceMap = new Map<string, CollapseStep>();
  lastCollapseTrace.forEach((step) => {
    traceMap.set(`${step.row},${step.col}`, step);
  });

  const conflictSet = new Set(conflicts.map((c) => `${c.row},${c.col}`));

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="relative w-full max-w-[504px] aspect-square rounded-xl border-2 border-slate-700/90 bg-[#0B1120] shadow-2xl overflow-hidden select-none">
        {/* 9x9 Grid */}
        <div className="grid grid-cols-9 grid-rows-9 w-full h-full">
          {board.map((rowArr, r) =>
            rowArr.map((val, c) => {
              const key = `${r},${c}`;
              const isGiven = givens[r]?.[c] !== 0;
              const isSelected = selectedCell ? sameCell(selectedCell, { row: r, col: c }) : false;
              const isConflict = conflictSet.has(key);
              const qIdx = qubitIndexMap.get(key);
              const mIdx = manualIndexMap.get(key);
              const traceStep = traceMap.get(key);
              const cellCands = candidates[r]?.[c] ?? [];

              const borderRight =
                c === 2 || c === 5
                  ? "border-r-2 border-r-slate-500/80"
                  : c < 8
                    ? "border-r border-r-slate-800"
                    : "";
              const borderBottom =
                r === 2 || r === 5
                  ? "border-b-2 border-b-slate-500/80"
                  : r < 8
                    ? "border-b border-b-slate-800"
                    : "";

              let bgClass = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0
                ? "bg-[#0D1426]"
                : "bg-[#111A30]";
              if (isConflict) {
                bgClass = "bg-rose-950/70";
              } else if (isSelected) {
                bgClass = "bg-cyan-950/70 ring-2 ring-inset ring-cyan-400";
              } else if (mIdx !== undefined && entanglementMode === "manual") {
                bgClass = "bg-violet-950/60 ring-2 ring-inset ring-violet-400";
              } else if (qIdx !== undefined) {
                bgClass = "bg-slate-800/75 ring-1 ring-inset ring-cyan-400/50";
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onCellClick(r, c)}
                  className={`relative flex items-center justify-center transition-colors duration-150 focus:outline-none ${bgClass} ${borderRight} ${borderBottom} ${
                    traceStep ? "collapse-flash" : ""
                  } hover:bg-slate-800/80`}
                  aria-label={`Row ${r + 1} Column ${c + 1}`}
                >
                  {/* Qubit / Manual index pill */}
                  {entanglementMode === "manual" && mIdx !== undefined ? (
                    <span className="absolute top-0.5 left-0.5 z-20 rounded bg-violet-500/90 px-1 text-[9px] font-bold leading-tight text-slate-950 font-mono">
                      q{mIdx}
                    </span>
                  ) : (
                    qIdx !== undefined && (
                      <span
                        className="absolute top-0.5 left-0.5 z-20 rounded px-1 text-[9px] font-bold leading-tight text-slate-950 font-mono"
                        style={{ backgroundColor: activeColor }}
                      >
                        q{qIdx}
                      </span>
                    )
                  )}

                  {val !== 0 ? (
                    <span
                      className={`text-lg sm:text-xl font-bold font-mono ${
                        isConflict
                          ? "text-rose-400"
                          : isGiven
                            ? "text-slate-100"
                            : traceStep
                              ? "text-emerald-300"
                              : "text-cyan-300"
                      }`}
                    >
                      {val}
                    </span>
                  ) : (
                    <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-0.5 sm:p-1 place-items-center pointer-events-none">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                        const active = cellCands.includes(d);
                        return (
                          <span
                            key={d}
                            className={`text-[8px] sm:text-[9px] leading-none font-mono ${
                              active ? "text-cyan-300/75 font-medium" : "text-transparent"
                            }`}
                          >
                            {d}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* SVG Entanglement Tether Overlay */}
        <svg
          viewBox="0 0 900 900"
          className="pointer-events-none absolute inset-0 w-full h-full z-10"
        >
          <defs>
            <filter id="tetherGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Subtle background tethers for non-active clusters in auto mode */}
          {entanglementMode === "auto" &&
            clusters
              .filter((cl) => !activeCluster || cl.id !== activeCluster.id)
              .slice(0, 6)
              .map((cl) => {
                if (cl.cells.length < 2) return null;
                const color = STATE_COLORS[cl.state_type];
                return (
                  <g key={`bg-${cl.id}`} opacity={0.22}>
                    {cl.cells.slice(0, -1).map((cell, idx) => {
                      const next = cl.cells[idx + 1];
                      const x1 = cell.col * 100 + 50;
                      const y1 = cell.row * 100 + 50;
                      const x2 = next.col * 100 + 50;
                      const y2 = next.row * 100 + 50;
                      return (
                        <line
                          key={idx}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={color}
                          strokeWidth={3}
                          strokeDasharray="6 6"
                        />
                      );
                    })}
                  </g>
                );
              })}

          {/* Highlighted active cluster tethers */}
          {activeCluster && activeCluster.cells.length >= 2 && (
            <g filter="url(#tetherGlow)" className="tether-animate">
              {activeCluster.cells.map((cell, idx) => {
                const x1 = cell.col * 100 + 50;
                const y1 = cell.row * 100 + 50;
                const next = activeCluster.cells[(idx + 1) % activeCluster.cells.length];
                // For W-state of >=3 cells, connect star/ring cleanly; for chain/bell connect sequential
                if (idx === activeCluster.cells.length - 1 && activeCluster.cells.length <= 2) {
                  return null;
                }
                if (
                  idx === activeCluster.cells.length - 1 &&
                  activeCluster.state_type !== "W"
                ) {
                  return null;
                }
                const x2 = next.col * 100 + 50;
                const y2 = next.row * 100 + 50;
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const cx = mx - dy * 0.12;
                const cy = my + dx * 0.12;
                return (
                  <path
                    key={`act-edge-${idx}`}
                    d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                    fill="none"
                    stroke={activeColor}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={activeCluster.state_type === "W" ? "10 6" : undefined}
                  />
                );
              })}

              {activeCluster.cells.map((cell, idx) => (
                <circle
                  key={`node-${idx}`}
                  cx={cell.col * 100 + 50}
                  cy={cell.row * 100 + 50}
                  r={36}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth={3.5}
                  strokeOpacity={0.85}
                />
              ))}
            </g>
          )}

          {/* Single-cell superposition halo */}
          {activeCluster && activeCluster.cells.length === 1 && (
            <circle
              cx={activeCluster.cells[0].col * 100 + 50}
              cy={activeCluster.cells[0].row * 100 + 50}
              r={40}
              fill="none"
              stroke={STATE_COLORS.SUPERPOSITION}
              strokeWidth={4}
              strokeDasharray="8 5"
              filter="url(#tetherGlow)"
            />
          )}

          {/* Manual selection tether preview */}
          {entanglementMode === "manual" && manualCells.length >= 2 && (
            <g filter="url(#tetherGlow)">
              {manualCells.slice(0, -1).map((cell, idx) => {
                const next = manualCells[idx + 1];
                return (
                  <line
                    key={`man-${idx}`}
                    x1={cell.col * 100 + 50}
                    y1={cell.row * 100 + 50}
                    x2={next.col * 100 + 50}
                    y2={next.row * 100 + 50}
                    stroke="#A78BFA"
                    strokeWidth={4.5}
                    strokeDasharray="8 5"
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Digit Input Pad */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-[504px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDigitInput(d)}
            disabled={!selectedCell}
            className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900/90 text-slate-100 font-mono font-semibold text-base hover:border-cyan-400 hover:bg-cyan-950/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onDigitInput(0)}
          disabled={!selectedCell}
          className="px-3 h-10 rounded-lg border border-slate-700 bg-slate-900/90 text-slate-300 text-xs font-medium hover:border-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {clearLabel}
        </button>
      </div>
    </div>
  );
};
