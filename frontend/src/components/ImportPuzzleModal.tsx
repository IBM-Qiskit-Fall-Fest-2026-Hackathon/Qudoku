import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileUp,
  Play,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { TranslationDict } from "../i18n/translations";
import type { PuzzleSpec } from "../types/quantum";
import { parseSudokuInput } from "../utils/sessionStorage";
import {
  validateSudokuStrict,
  type StrictValidationResult,
} from "../utils/strictSudokuValidator";
import {
  getGridSpec,
  SUPPORTED_SIZES,
  valueToSymbol,
  type GridSize,
} from "../utils/sudokuConfig";

interface ImportPuzzleModalProps {
  open: boolean;
  onClose: () => void;
  t: TranslationDict;
  onImportPuzzle: (puzzle: PuzzleSpec) => void;
}

const SAMPLES_BY_SIZE: Record<GridSize, string> = {
  4: "1 4 . 2\n2 . 4 1\n. 1 . .\n4 2 . .",
  6: ". 5 6 4 . 1\n. 2 4 . 5 3\n. . . 1 . .\n. 6 1 . 4 5\n. 1 . . 3 .\n. 3 . 5 . 4",
  9: "003020600900305001001806400008102900700000008006708200002609500800203009005010300",
  12: [
    "2 . C . 8 1 7 . . . 4 B",
    ". . 4 . C 3 A 2 1 9 8 .",
    ". 7 8 1 . . . . . . C .",
    ". . . C 3 . 9 A . 7 1 .",
    "A . . 8 . 4 6 7 C . 5 2",
    "7 . . 4 5 . 2 B 8 . . 9",
    "1 . . . 6 B . . . . . .",
    "5 . 6 B . . . 3 . . . 4",
    "3 8 2 A . . . 1 B . . C",
    "C . B 2 A 9 . . 6 . . 5",
    "8 1 A . 7 6 5 4 . . . 3",
    ". 5 7 6 B 2 . . 9 8 A 1",
  ].join("\n"),
  16: [
    "5 A C 8 E 0 . . 9 D . F . 6 . 1",
    ". 6 1 . . F D 9 . . E 0 . . . .",
    "4 . B . 2 . . 7 5 C . A . F 3 .",
    "9 F . . 8 A . 5 . . 2 6 . . E .",
    ". 8 . C B E . . . 9 D . . . 1 7",
    "A 3 . . . 8 5 0 . . 1 . . E . 4",
    "F 2 . 1 D 3 . A 6 . . E . . C 5",
    ". E 4 . 1 . 7 . 0 . C 8 A . D .",
    "C . 8 A . 5 E . D 3 . 7 . 4 . 2",
    "1 . 2 . F . 3 . B . . 5 . . . .",
    ". . E 0 . 4 2 . C . A 9 . . . 3",
    ". . . F . 9 8 . . 2 . 4 B 5 . E",
    ". . . 9 5 . 0 E . . 7 . . B 4 6",
    ". . F . . . A . 2 . 4 . E . . 0",
    "2 B 6 4 7 1 F . . 0 . C 8 . 9 .",
    "E C 0 5 . B 6 . 8 . . . 3 1 7 F",
  ].join("\n"),
};

function emptyGrid(size: GridSize): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function gridToInputString(grid: number[][], size: number): string {
  const sep = size > 9 ? " " : "";
  return grid
    .map((row) =>
      row.map((v) => (v === 0 ? "." : valueToSymbol(v, size))).join(sep)
    )
    .join("\n");
}

export const ImportPuzzleModal: React.FC<ImportPuzzleModalProps> = ({
  open,
  onClose,
  t,
  onImportPuzzle,
}) => {
  const [preferredSize, setPreferredSize] = useState<GridSize>(9);
  const [title, setTitle] = useState("My Custom Sudoku");
  const [rawText, setRawText] = useState("");
  const [grid, setGrid] = useState<number[][]>(() => emptyGrid(9));
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedPreviewCell, setSelectedPreviewCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [showSolvedGrid, setShowSolvedGrid] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<StrictValidationResult | null>(null);

  const runStrictValidationAsync = (targetGrid: number[][]) => {
    setIsValidating(true);
    setShowSolvedGrid(false);
    // Yield to browser paint so UI never freezes during validation
    window.setTimeout(() => {
      const result = validateSudokuStrict(targetGrid);
      setValidation(result);
      setIsValidating(false);
    }, 0);
  };

  // Auto-run Strict Mode whenever text changes and parses cleanly
  useEffect(() => {
    if (!open) return;
    if (!rawText.trim()) {
      setGrid(emptyGrid(preferredSize));
      setParseError(null);
      setValidation(null);
      setShowSolvedGrid(false);
      return;
    }
    const parsed = parseSudokuInput(
      rawText,
      title || "My Custom Sudoku",
      preferredSize
    );
    if ("error" in parsed) {
      setParseError(parsed.error);
      setValidation(null);
      setShowSolvedGrid(false);
      return;
    }
    setParseError(null);
    setPreferredSize(parsed.size);
    setGrid(parsed.givens);
    runStrictValidationAsync(parsed.givens);
  }, [rawText, open]);

  if (!open) return null;

  const handleSizeSwitch = (nextSize: GridSize) => {
    setPreferredSize(nextSize);
    setRawText("");
    setGrid(emptyGrid(nextSize));
    setParseError(null);
    setValidation(null);
    setShowSolvedGrid(false);
    setSelectedPreviewCell(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    if (baseName) setTitle(baseName);
    setRawText(text);
  };

  const handleValidateButton = () => {
    if (parseError) return;
    runStrictValidationAsync(grid);
  };

  const handleEditPreviewCell = (digit: number) => {
    if (!selectedPreviewCell) return;
    const activeSize = grid.length;
    const next = grid.map((r) => [...r]);
    next[selectedPreviewCell.row][selectedPreviewCell.col] = digit;
    setGrid(next);
    setRawText(gridToInputString(next, activeSize));
  };

  const handleLoadPuzzle = (loadSolved = false) => {
    if (!validation || validation.status !== "unique" || !validation.firstSolution) {
      return;
    }
    const spec = getGridSpec(grid.length);
    const givensToLoad = loadSolved
      ? validation.firstSolution
      : grid.map((row) => [...row]);

    const customPuzzle: PuzzleSpec = {
      id: `custom-${Date.now()}`,
      title_key: "custom_puzzle_title",
      description_key: "custom_puzzle_desc",
      customTitle: title.trim() || `Custom ${spec.size}×${spec.size}`,
      isCustom: true,
      difficulty: `${spec.label} · Strict Unique`,
      concept_focus: "MIXED",
      grid_size: spec.size,
      box_rows: spec.boxRows,
      box_cols: spec.boxCols,
      symbols: spec.symbols,
      givens: givensToLoad,
      solution: validation.firstSolution,
    };
    onImportPuzzle(customPuzzle);
    setRawText("");
    setValidation(null);
    setShowSolvedGrid(false);
    onClose();
  };

  const activeSpec = getGridSpec(grid.length);
  const { size: gridSize, boxRows, boxCols, symbols } = activeSpec;
  const totalCells = gridSize * gridSize;
  const conflictSet = new Set(
    (validation?.conflictCells ?? []).map((c) => `${c.row},${c.col}`)
  );
  const ambiguousSet = new Set(
    (validation?.ambiguousCells ?? []).map((c) => `${c.row},${c.col}`)
  );
  const displayedGrid =
    showSolvedGrid && validation?.firstSolution ? validation.firstSolution : grid;
  const givensCount = grid.flat().filter((v) => v !== 0).length;
  const hasBlankEdits = rawText.trim() !== "" || givensCount > 0 || gridSize !== 9;
  const previewSizeClass =
    gridSize >= 12 ? "w-64 h-64 sm:w-72 sm:h-72" : "w-52 h-52";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0F1629] p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">{t.import_title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400">{t.import_subtitle}</p>

        {/* Grid Size Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-400 mr-1">
            Grid Size:
          </span>
          {SUPPORTED_SIZES.map((sz) => {
            const spec = getGridSpec(sz);
            const active = preferredSize === sz;
            return (
              <button
                key={sz}
                type="button"
                onClick={() => handleSizeSwitch(sz)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-mono font-semibold transition ${
                  active
                    ? "border-cyan-400 bg-cyan-500/20 text-cyan-200"
                    : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {spec.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              {t.import_name_label}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              {t.import_file_label}
            </label>
            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-950/35 px-3 py-2 text-xs font-semibold text-cyan-200 cursor-pointer transition">
              <FileUp className="w-4 h-4" />
              <span>{t.import_choose_file}</span>
              <input
                type="file"
                accept=".txt,.json,.sdk,.sdm,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-slate-400">
              {t.import_paste_label}
            </label>
            <button
              type="button"
              onClick={() => {
                const sample = SAMPLES_BY_SIZE[preferredSize] || SAMPLES_BY_SIZE[9];
                if (!SAMPLES_BY_SIZE[preferredSize]) setPreferredSize(9);
                setRawText(sample);
                setTitle("Sample Uploaded Puzzle");
              }}
              className="text-[11px] text-cyan-300 hover:underline"
            >
              {t.import_use_sample}
            </button>
          </div>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={
              preferredSize === 16
                ? "Paste 16×16 hex grid (0-9, A-F, '.' for empty), 16 space-separated lines, or JSON [[...]]"
                : preferredSize === 12
                  ? "Paste 12×12 grid (1-9, A-C, '.' or '0' for empty), 12 space-separated lines, or JSON [[...]]"
                  : "003020600900305001... or rows separated by newlines, or JSON [[...]]"
            }
            className="w-full rounded-xl border border-slate-700 bg-[#070B14] p-3 font-mono text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        {parseError && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Strict Mode Preview Grid & Validation Status */}
        {!parseError && hasBlankEdits && (
          <div className="flex flex-col sm:flex-row items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="space-y-2 shrink-0">
              <div
                className={`grid border border-slate-500 bg-slate-950 ${previewSizeClass}`}
                style={{
                  gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
                }}
              >
                {displayedGrid.map((row, r) =>
                  row.map((val, c) => {
                    const key = `${r},${c}`;
                    const isConflict = conflictSet.has(key);
                    const isAmbiguous = ambiguousSet.has(key);
                    const isSel =
                      selectedPreviewCell?.row === r &&
                      selectedPreviewCell?.col === c;
                    const isSolvedFill =
                      showSolvedGrid && grid[r][c] === 0 && val !== 0;

                    let cellCls = "text-slate-100";
                    if (isConflict) {
                      cellCls =
                        "bg-rose-600/40 text-rose-100 ring-1 ring-inset ring-rose-400 font-bold";
                    } else if (isAmbiguous) {
                      cellCls =
                        "bg-amber-500/25 text-amber-200 ring-1 ring-inset ring-amber-400/70";
                    } else if (isSel) {
                      cellCls =
                        "bg-cyan-900/60 ring-2 ring-inset ring-cyan-400 text-cyan-200";
                    } else if (isSolvedFill) {
                      cellCls = "text-emerald-300 font-semibold";
                    } else if (val === 0) {
                      cellCls = "text-slate-600";
                    }

                    const isBoxRight = c < gridSize - 1 && (c + 1) % boxCols === 0;
                    const isBoxBottom = r < gridSize - 1 && (r + 1) % boxRows === 0;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedPreviewCell({ row: r, col: c })}
                        className={`flex items-center justify-center ${
                          gridSize >= 12 ? "text-[9px]" : "text-[11px]"
                        } font-mono border-slate-800 ${
                          isBoxRight
                            ? "border-r-2 border-r-slate-500"
                            : "border-r"
                        } ${
                          isBoxBottom
                            ? "border-b-2 border-b-slate-500"
                            : "border-b"
                        } ${cellCls}`}
                      >
                        {val !== 0 ? valueToSymbol(val, gridSize) : "·"}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Quick edit pad for fixing conflicts / adding clues to ambiguous cells */}
              {selectedPreviewCell && !showSolvedGrid && (
                <div className="flex flex-wrap gap-1 w-64 justify-center">
                  {symbols.map((sym, idx) => {
                    const d = idx + 1;
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => handleEditPreviewCell(d)}
                        className="w-6 h-6 rounded border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-200 hover:border-cyan-400"
                      >
                        {sym}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => handleEditPreviewCell(0)}
                    className="w-6 h-6 rounded border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-200 hover:border-rose-400"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2.5 text-xs flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-300 font-semibold">
                  {activeSpec.label} · Givens: {givensCount} / {totalCells}
                </span>
                {validation && (
                  <span className="font-mono text-[11px] text-slate-400">
                    MRV Stop-at-2: {validation.durationMs} ms
                  </span>
                )}
              </div>

              {isValidating && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-cyan-200">
                  Running Strict Mode solver...
                </div>
              )}

              {!isValidating && validation && (
                <div
                  className={`rounded-xl border p-3 space-y-1.5 ${
                    validation.valid
                      ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-200"
                      : validation.status === "multiple_solutions"
                        ? "border-amber-500/40 bg-amber-950/25 text-amber-200"
                        : "border-rose-500/40 bg-rose-950/30 text-rose-200"
                  }`}
                >
                  <div className="flex items-start gap-2 font-semibold">
                    {validation.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{validation.message}</span>
                  </div>

                  {validation.status === "duplicates" && (
                    <p className="text-[11px] text-rose-300/90">
                      Conflicting cells are highlighted in red. Click a cell to fix it, then click Validate Sudoku Puzzle.
                    </p>
                  )}

                  {validation.status === "multiple_solutions" && (
                    <p className="text-[11px] text-amber-300/90">
                      {validation.ambiguousCells.length} ambiguous cell(s) differ between solution #1 and #2 (highlighted in amber). Click any highlighted cell to add a clue.
                    </p>
                  )}

                  {validation.status === "unique" && (
                    <div className="pt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSolvedGrid((s) => !s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {showSolvedGrid ? t.import_hide_solved : t.import_show_solved}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            disabled={!!parseError || !rawText.trim() || isValidating}
            onClick={handleValidateButton}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 px-4 py-2 text-xs font-semibold text-cyan-200 transition"
          >
            <ShieldCheck className="w-4 h-4" />
            {t.import_validate_btn}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              {t.quiz_close}
            </button>
            <button
              type="button"
              disabled={!validation || validation.status !== "unique" || isValidating}
              onClick={() => handleLoadPuzzle(false)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 disabled:opacity-40 px-4 py-2 text-xs font-bold text-slate-950 transition"
            >
              <Play className="w-3.5 h-3.5" />
              {t.import_load_btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
