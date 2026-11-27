import React from "react";
import { Eraser, Network, Pencil, Sparkles } from "lucide-react";
import type { TranslationDict } from "../i18n/translations";
import type {
  CellCoord,
  CollapseStep,
  EntanglementCluster,
  EntanglementMode,
  StateType,
  ThemeMode,
} from "../types/quantum";
import { getBoxIndex, getGridSpec, valueToSymbol } from "../utils/sudokuConfig";
import { Tooltip } from "./InfoTooltip";

interface SudokuBoardProps {
  board: number[][];
  givens: number[][];
  notes: number[][][];
  selectedCell: CellCoord | null;
  conflicts: CellCoord[];
  clusters: EntanglementCluster[];
  activeCluster: EntanglementCluster | null;
  entanglementMode: EntanglementMode;
  manualCells: CellCoord[];
  lastCollapseTrace: CollapseStep[];
  noteMode: boolean;
  showTethers: boolean;
  theme?: ThemeMode;
  onCellClick: (row: number, col: number, ctrlOrMeta: boolean) => void;
  onDigitInput: (digit: number) => void;
  onToggleNoteMode: () => void;
  onAutoFillNotes: () => void;
  onClearAllNotes: () => void;
  onToggleTethers: () => void;
  t: TranslationDict;
}

const STATE_COLORS: Record<StateType, string> = {
  BELL: "#22D3EE",
  GHZ: "#A78BFA",
  W: "#34D399",
  SUPERPOSITION: "#FBBF24",
  CUSTOM: "#F472B6",
};

function sameCell(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

function isPeerCell(a: CellCoord, b: CellCoord, size: number): boolean {
  if (sameCell(a, b)) return false;
  return (
    a.row === b.row ||
    a.col === b.col ||
    getBoxIndex(a.row, a.col, size) === getBoxIndex(b.row, b.col, size)
  );
}

export const SudokuBoard: React.FC<SudokuBoardProps> = ({
  board,
  givens,
  notes,
  selectedCell,
  conflicts,
  clusters,
  activeCluster,
  entanglementMode,
  manualCells,
  lastCollapseTrace,
  noteMode,
  showTethers,
  theme = "dark",
  onCellClick,
  onDigitInput,
  onToggleNoteMode,
  onAutoFillNotes,
  onClearAllNotes,
  onToggleTethers,
  t,
}) => {
  const isLight = theme === "light";
  const spec = getGridSpec(board.length);
  const { size, boxRows, boxCols, symbols } = spec;
  const activeColor = activeCluster ? STATE_COLORS[activeCluster.state_type] : "#22D3EE";

  const qubitIndexMap = new Map<string, number>();
  if (activeCluster && showTethers) {
    activeCluster.cells.forEach((cell, idx) => {
      qubitIndexMap.set(`${cell.row},${cell.col}`, idx);
    });
  }

  const draftIndexMap = new Map<string, number>();
  manualCells.forEach((cell, idx) => {
    draftIndexMap.set(`${cell.row},${cell.col}`, idx);
  });

  const traceMap = new Map<string, CollapseStep>();
  lastCollapseTrace.forEach((step) => {
    traceMap.set(`${step.row},${step.col}`, step);
  });

  const conflictSet = new Set(conflicts.map((c) => `${c.row},${c.col}`));

  const selectedIsEmpty =
    selectedCell !== null && board[selectedCell.row]?.[selectedCell.col] === 0;
  const selectedCellNotes =
    selectedIsEmpty && selectedCell ? (notes[selectedCell.row]?.[selectedCell.col] ?? []) : [];

  const selectedDigit =
    selectedCell && board[selectedCell.row]?.[selectedCell.col]
      ? board[selectedCell.row][selectedCell.col]
      : 0;

  const digitCounts = Array(size + 1).fill(0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = board[r]?.[c] ?? 0;
      if (v >= 1 && v <= size) digitCounts[v]++;
    }
  }

  const boardMaxWidthClass =
    size >= 16
      ? "max-w-[600px]"
      : size >= 12
        ? "max-w-[560px]"
        : "max-w-[504px]";

  const valueTextSizeClass =
    size <= 6
      ? "text-2xl sm:text-3xl"
      : size === 9
        ? "text-lg sm:text-xl"
        : size === 12
          ? "text-sm sm:text-base"
          : "text-xs sm:text-sm";

  const noteTextSizeClass =
    size <= 6
      ? "text-[10px] sm:text-xs leading-none"
      : size === 9
        ? "text-[8px] sm:text-[9px] leading-none"
        : size === 12
          ? "text-[6px] sm:text-[7px] leading-none"
          : "text-[5px] sm:text-[6px] leading-none";

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div
        className={`relative w-full ${boardMaxWidthClass} aspect-square rounded-xl border-2 shadow-2xl overflow-hidden select-none ${
          isLight
            ? "border-slate-500 bg-white"
            : "border-slate-700/90 bg-[#0B1120]"
        }`}
      >
        {/* Dynamic N×N Grid */}
        <div
          className="grid w-full h-full"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          }}
        >
          {board.map((rowArr, r) =>
            rowArr.map((val, c) => {
              const key = `${r},${c}`;
              const cellPos = { row: r, col: c };
              const isGiven = (givens[r]?.[c] ?? 0) !== 0;
              const isSelected = selectedCell ? sameCell(selectedCell, cellPos) : false;
              const isPeer = selectedCell ? isPeerCell(selectedCell, cellPos, size) : false;
              const isSameDigit = selectedDigit !== 0 && val === selectedDigit && !isSelected;
              const isConflict = conflictSet.has(key);
              const qIdx = qubitIndexMap.get(key);
              const dIdx = draftIndexMap.get(key);
              const traceStep = traceMap.get(key);
              const userNotes = notes[r]?.[c] ?? [];

              const isBoxRight = c < size - 1 && (c + 1) % boxCols === 0;
              const isBoxBottom = r < size - 1 && (r + 1) % boxRows === 0;

              const borderRight = isBoxRight
                ? isLight
                  ? "border-r-2 border-r-slate-600"
                  : "border-r-2 border-r-slate-500/80"
                : c < size - 1
                  ? isLight
                    ? "border-r border-r-slate-300"
                    : "border-r border-r-slate-800"
                  : "";
              const borderBottom = isBoxBottom
                ? isLight
                  ? "border-b-2 border-b-slate-600"
                  : "border-b-2 border-b-slate-500/80"
                : r < size - 1
                  ? isLight
                    ? "border-b border-b-slate-300"
                    : "border-b border-b-slate-800"
                  : "";

              const isEvenBox = (Math.floor(r / boxRows) + Math.floor(c / boxCols)) % 2 === 0;
              let bgClass = isLight
                ? isEvenBox
                  ? "bg-white"
                  : "bg-slate-50/90"
                : isEvenBox
                  ? "bg-[#0D1426]"
                  : "bg-[#111A30]";

              if (isConflict) {
                bgClass = isLight
                  ? "bg-rose-200/85 ring-1 ring-inset ring-rose-500"
                  : "bg-rose-950/75";
              } else if (dIdx !== undefined && entanglementMode === "manual") {
                bgClass = isLight
                  ? "bg-violet-100 ring-2 ring-inset ring-violet-500"
                  : "bg-violet-950/65 ring-2 ring-inset ring-violet-400";
              } else if (isSelected) {
                bgClass =
                  val === 0 && noteMode
                    ? isLight
                      ? "bg-amber-100 ring-2 ring-inset ring-amber-500"
                      : "bg-indigo-950/85 ring-2 ring-inset ring-amber-400"
                    : isLight
                      ? "bg-sky-200 ring-2 ring-inset ring-sky-600"
                      : "bg-cyan-950/80 ring-2 ring-inset ring-cyan-400";
              } else if (isSameDigit) {
                bgClass = isLight
                  ? "bg-sky-300/75 ring-1 ring-inset ring-sky-500/70"
                  : "bg-cyan-500/35 ring-1 ring-inset ring-cyan-300/75";
              } else if (isPeer) {
                bgClass = isLight
                  ? "bg-sky-100/90"
                  : "bg-slate-700/65";
              } else if (qIdx !== undefined) {
                bgClass = isLight
                  ? "bg-cyan-50/80 ring-1 ring-inset ring-cyan-500/50"
                  : "bg-slate-800/80 ring-1 ring-inset ring-cyan-400/45";
              }

              const clusterRingClass =
                qIdx !== undefined && !isSelected && !isConflict && !isSameDigit
                  ? isLight
                    ? "ring-1 ring-inset ring-cyan-500/60"
                    : "ring-1 ring-inset ring-cyan-400/50"
                  : "";

              return (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => onCellClick(r, c, e.ctrlKey || e.metaKey)}
                  className={`relative flex items-center justify-center transition-colors duration-150 focus:outline-none ${bgClass} ${clusterRingClass} ${borderRight} ${borderBottom} ${
                    traceStep ? "collapse-flash" : ""
                  } ${isLight ? "hover:bg-sky-200/70" : "hover:bg-slate-700/80"}`}
                  aria-label={`Row ${r + 1} Column ${c + 1}`}
                >
                  {/* Active cluster qubit pill */}
                  {qIdx !== undefined && (
                    <span
                      className="absolute top-0.5 left-0.5 z-20 rounded px-1 text-[8px] sm:text-[9px] font-bold leading-tight text-slate-950 font-mono"
                      style={{ backgroundColor: activeColor }}
                    >
                      q{qIdx}
                    </span>
                  )}

                  {/* Draft pick index badge in Manual mode */}
                  {entanglementMode === "manual" && dIdx !== undefined && (
                    <span className="absolute bottom-0.5 right-0.5 z-20 rounded bg-violet-400 px-1 text-[8px] sm:text-[9px] font-bold leading-tight text-slate-950 font-mono">
                      +{dIdx}
                    </span>
                  )}

                  {val !== 0 ? (
                    <span
                      className={`${valueTextSizeClass} font-bold font-mono ${
                        isConflict
                          ? isLight
                            ? "text-rose-700"
                            : "text-rose-400"
                          : isGiven
                            ? isLight
                              ? "text-slate-900"
                              : "text-slate-100"
                            : traceStep
                              ? isLight
                                ? "text-emerald-700"
                                : "text-emerald-300"
                              : isLight
                                ? "text-sky-700"
                                : "text-cyan-300"
                      }`}
                    >
                      {valueToSymbol(val, size)}
                    </span>
                  ) : (
                    <div
                      className="grid w-full h-full p-0.5 place-items-center pointer-events-none"
                      style={{
                        gridTemplateColumns: `repeat(${boxCols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${boxRows}, minmax(0, 1fr))`,
                      }}
                    >
                      {symbols.map((sym, idx) => {
                        const d = idx + 1;
                        const active = userNotes.includes(d);
                        return (
                          <span
                            key={sym}
                            className={`${noteTextSizeClass} font-mono ${
                              active
                                ? isSelected
                                  ? isLight
                                    ? "text-amber-800 font-bold"
                                    : "text-amber-200 font-bold"
                                  : isLight
                                    ? "text-amber-700 font-bold"
                                    : "text-amber-300 font-bold"
                                : "text-transparent"
                            }`}
                          >
                            {sym}
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
        {showTethers && (
          <svg
            viewBox={`0 0 ${size * 100} ${size * 100}`}
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

            {/* All saved clusters (both Auto and Manual lists) stay visibly tethered */}
            {clusters
              .filter(
                (cl) =>
                  (!activeCluster || cl.id !== activeCluster.id) &&
                  cl.cells.every((c) => c.row < size && c.col < size)
              )
              .map((cl) => {
                if (cl.cells.length < 2) return null;
                const color = STATE_COLORS[cl.state_type];
                return (
                  <g key={`bg-${cl.id}`} opacity={0.5}>
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
                          strokeWidth={3.5}
                          strokeDasharray="7 5"
                        />
                      );
                    })}
                    {cl.cells.map((cell, idx) => (
                      <circle
                        key={`bg-node-${idx}`}
                        cx={cell.col * 100 + 50}
                        cy={cell.row * 100 + 50}
                        r={30}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeOpacity={0.55}
                      />
                    ))}
                  </g>
                );
              })}

            {activeCluster &&
              activeCluster.cells.length >= 2 &&
              activeCluster.cells.every((c) => c.row < size && c.col < size) && (
              <g filter="url(#tetherGlow)" className="tether-animate">
                {activeCluster.cells.map((cell, idx) => {
                  const x1 = cell.col * 100 + 50;
                  const y1 = cell.row * 100 + 50;
                  const next = activeCluster.cells[(idx + 1) % activeCluster.cells.length];
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
                      strokeWidth={5.5}
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
                    strokeOpacity={0.9}
                  />
                ))}
              </g>
            )}

            {activeCluster &&
              activeCluster.cells.length === 1 &&
              activeCluster.cells[0].row < size &&
              activeCluster.cells[0].col < size && (
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

            {/* Draft manual selection preview */}
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
                      strokeDasharray="6 6"
                    />
                  );
                })}
              </g>
            )}
          </svg>
        )}
      </div>

      {/* Sudoku Tools Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-[504px]">
        <Tooltip text={t.tip_btn_notes} position="top">
          <button
            type="button"
            onClick={onToggleNoteMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              noteMode
                ? "border-amber-400 bg-amber-500/20 text-amber-200 shadow-sm"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400/60"
            }`}
            title={t.tip_btn_notes}
          >
            <Pencil className="w-3.5 h-3.5" />
            {t.btn_notes_mode} {noteMode ? "ON" : "OFF"}
          </button>
        </Tooltip>

        <Tooltip text={t.tip_btn_auto_notes} position="top">
          <button
            type="button"
            onClick={onAutoFillNotes}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:border-cyan-400 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition"
            title={t.tip_btn_auto_notes}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            {t.btn_auto_notes}
          </button>
        </Tooltip>

        <Tooltip text={t.tip_btn_clear_notes} position="top">
          <button
            type="button"
            onClick={onClearAllNotes}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:border-rose-400 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition"
            title={t.tip_btn_clear_notes}
          >
            <Eraser className="w-3.5 h-3.5 text-rose-400" />
            {t.btn_clear_notes}
          </button>
        </Tooltip>

        <Tooltip text={t.tip_btn_tethers} position="top">
          <button
            type="button"
            onClick={onToggleTethers}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              showTethers
                ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                : "border-slate-700 bg-slate-900 text-slate-400"
            }`}
            title={t.tip_btn_tethers}
          >
            <Network className="w-3.5 h-3.5" />
            {t.btn_tethers}
          </button>
        </Tooltip>
      </div>

      {/* Primary Symbol Pad */}
      <div className={`flex flex-wrap items-center justify-center gap-1.5 w-full ${boardMaxWidthClass}`}>
        {symbols.map((sym, idx) => {
          const d = idx + 1;
          const remaining = Math.max(0, size - digitCounts[d]);
          const isNotedInSelected = selectedCellNotes.includes(d);
          const done = remaining === 0 && !noteMode && !isNotedInSelected;
          return (
            <button
              key={sym}
              type="button"
              onClick={() => onDigitInput(d)}
              disabled={!selectedCell || done}
              className={`relative ${size > 9 ? "w-8 h-9 text-xs" : "w-10 h-11 text-base"} rounded-lg border font-mono transition flex flex-col items-center justify-center ${
                isNotedInSelected
                  ? isLight
                    ? "border-amber-500 bg-amber-300 text-slate-950 font-bold ring-2 ring-amber-400/70"
                    : "border-amber-300 bg-amber-400 text-slate-950 font-bold ring-2 ring-amber-300/70"
                  : isLight
                    ? "border-slate-300 bg-white text-slate-900 font-semibold hover:border-sky-500 hover:bg-sky-50"
                    : "border-slate-700 bg-slate-900/90 text-slate-100 font-semibold hover:border-cyan-400 hover:bg-cyan-950/50"
              } disabled:opacity-35 disabled:cursor-not-allowed`}
            >
              <span className="leading-none">{sym}</span>
              <span
                className={`text-[9px] leading-none mt-0.5 ${
                  isNotedInSelected ? "text-slate-900 font-bold" : "text-slate-400"
                }`}
              >
                {remaining}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onDigitInput(0)}
          disabled={!selectedCell}
          className={`px-3 ${size > 9 ? "h-9" : "h-11"} rounded-lg border border-slate-700 bg-slate-900/90 text-slate-300 text-xs font-medium hover:border-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition`}
        >
          {t.btn_clear_cell}
        </button>
      </div>
    </div>
  );
};
