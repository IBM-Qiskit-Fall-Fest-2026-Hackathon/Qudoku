import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  Atom,
  BookOpen,
  CheckCircle2,
  Globe,
  HelpCircle,
  Lightbulb,
  Redo2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Undo2,
} from "lucide-react";
import { api } from "./api/client";
import { LessonDrawer } from "./components/LessonDrawer";
import { QuantumPanel } from "./components/QuantumPanel";
import { QuizModal } from "./components/QuizModal";
import { SudokuBoard } from "./components/SudokuBoard";
import { TRANSLATIONS } from "./i18n/translations";
import { boardReducer, initialQudokuState } from "./store/boardReducer";
import type {
  EntanglementCluster,
  HardwareBenchmark,
  Language,
  NoiseProfile,
  PuzzleSpec,
  SimulationOutcome,
} from "./types/quantum";

export function App() {
  const [state, dispatch] = useReducer(boardReducer, initialQudokuState);
  const [lang, setLang] = useState<Language>("en");
  const [puzzles, setPuzzles] = useState<PuzzleSpec[]>([]);
  const [hardwareBenchmarks, setHardwareBenchmarks] = useState<HardwareBenchmark[]>([]);
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile>("ideal");
  const [customNoiseLevel, setCustomNoiseLevel] = useState<number>(0.03);
  const [shots, setShots] = useState<number>(1024);
  const [simulation, setSimulation] = useState<SimulationOutcome | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [lessonsOpen, setLessonsOpen] = useState<boolean>(false);
  const [quizOpen, setQuizOpen] = useState<boolean>(false);
  const [inspectedSupCluster, setInspectedSupCluster] = useState<EntanglementCluster | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  // Initial load: puzzles & cached IBM hardware benchmarks
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getPuzzles(), api.getHardwareBenchmarks()])
      .then(([puzList, bmList]) => {
        if (cancelled) return;
        setPuzzles(puzList);
        setHardwareBenchmarks(bmList);
        const defaultPuzzle =
          puzList.find((p) => p.id === "tutorial-bell") ?? puzList[0];
        if (defaultPuzzle) {
          dispatch({ type: "LOAD_PUZZLE", puzzle: defaultPuzzle });
        }
      })
      .catch((err) => {
        console.error(err);
        setBannerMsg(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-analyze board whenever board or eliminations change
  useEffect(() => {
    if (!state.puzzle) return;
    let cancelled = false;
    api
      .analyzeBoard(state.board, state.eliminated)
      .then((analysis) => {
        if (!cancelled) {
          dispatch({ type: "APPLY_ANALYSIS", analysis });
        }
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [state.board, state.eliminated, state.puzzle]);

  const activeCluster: EntanglementCluster | null = useMemo(() => {
    if (state.entanglementMode === "manual") {
      return state.manualCluster;
    }
    if (inspectedSupCluster) {
      return inspectedSupCluster;
    }
    return (
      state.autoClusters.find((c) => c.id === state.activeClusterId) ??
      state.autoClusters[0] ??
      null
    );
  }, [
    state.entanglementMode,
    state.manualCluster,
    state.autoClusters,
    state.activeClusterId,
    inspectedSupCluster,
  ]);

  // Run Qiskit circuit automatically whenever active cluster, noise profile, or shots changes
  const runActiveCircuit = useCallback(
    async (cluster: EntanglementCluster | null) => {
      if (!cluster) {
        setSimulation(null);
        return;
      }
      setIsRunning(true);
      try {
        const res = await api.runCircuit(cluster, shots, noiseProfile, customNoiseLevel);
        setSimulation(res);
      } catch (err) {
        console.error(err);
      } finally {
        setIsRunning(false);
      }
    },
    [shots, noiseProfile, customNoiseLevel]
  );

  useEffect(() => {
    void runActiveCircuit(activeCluster);
  }, [activeCluster, runActiveCircuit]);

  const isSolved = useMemo(() => {
    return (
      state.valid &&
      state.board.every((row) => row.every((v) => v !== 0))
    );
  }, [state.board, state.valid]);

  const handleLoadPuzzle = useCallback(
    (puzzleId: string) => {
      const found = puzzles.find((p) => p.id === puzzleId);
      if (found) {
        setInspectedSupCluster(null);
        setBannerMsg(null);
        dispatch({ type: "LOAD_PUZZLE", puzzle: found });
      }
    },
    [puzzles]
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setBannerMsg(null);
      if (state.entanglementMode === "manual") {
        dispatch({ type: "TOGGLE_MANUAL_CELL", cell: { row, col } });
        return;
      }
      dispatch({ type: "SELECT_CELL", cell: { row, col } });

      // If user clicks an empty cell in superposition tutorial or when no cluster matches, allow quick inspection
      if (state.board[row][col] === 0 && state.puzzle?.concept_focus === "SUPERPOSITION") {
        const cands = state.candidates[row]?.[col] ?? [];
        if (cands.length > 0) {
          setInspectedSupCluster({
            id: `sup-r${row + 1}c${col + 1}`,
            state_type: "SUPERPOSITION",
            cells: [{ row, col }],
            candidate_pair: cands,
            parity: [],
            house_label: `R${row + 1}C${col + 1}`,
            mechanism: `Single-cell superposition over ${cands.length} legal candidates: {${cands.join(", ")}}`,
            consistent: true,
            diagnostic: `Amplitude per candidate = 1/√${cands.length}`,
            is_manual: false,
          });
        }
      } else {
        setInspectedSupCluster(null);
        // Auto-highlight cluster containing this cell if one exists
        const matching = state.autoClusters.find((cl) =>
          cl.cells.some((c) => c.row === row && c.col === col)
        );
        if (matching) {
          dispatch({ type: "SELECT_CLUSTER", clusterId: matching.id });
        }
      }
    },
    [
      state.entanglementMode,
      state.board,
      state.puzzle,
      state.candidates,
      state.autoClusters,
    ]
  );

  const handleDigitInput = useCallback(
    (digit: number) => {
      if (!state.selectedCell) return;
      setInspectedSupCluster(null);
      dispatch({
        type: "SET_DIGIT",
        row: state.selectedCell.row,
        col: state.selectedCell.col,
        digit,
      });
    },
    [state.selectedCell]
  );

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: "UNDO" });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }
      if (!state.selectedCell) return;
      if (e.key >= "1" && e.key <= "9") {
        handleDigitInput(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        handleDigitInput(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.selectedCell, handleDigitInput]);

  const handleSynthesizeManual = async () => {
    if (state.manualCells.length === 0) return;
    setIsRunning(true);
    try {
      const cl = await api.buildManualCluster(
        state.board,
        state.eliminated,
        state.manualCells,
        state.manualStateType,
        state.manualTargetDigit ?? undefined
      );
      dispatch({ type: "SET_MANUAL_CLUSTER", cluster: cl });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleMeasureCollapse = async () => {
    if (!activeCluster) return;
    setIsRunning(true);
    try {
      const res = await api.collapseCluster(
        state.board,
        state.eliminated,
        activeCluster,
        shots,
        noiseProfile,
        customNoiseLevel,
        state.cascadeEnabled
      );
      setSimulation(res.simulation);
      setInspectedSupCluster(null);
      dispatch({
        type: "APPLY_COLLAPSE",
        board: res.board,
        eliminated: res.eliminated,
        trace: res.trace,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleHint = async () => {
    try {
      const hint = await api.getHint(state.board);
      if (hint.found && hint.row != null && hint.col != null && hint.digit != null) {
        dispatch({ type: "SELECT_CELL", cell: { row: hint.row, col: hint.col } });
        dispatch({ type: "SET_DIGIT", row: hint.row, col: hint.col, digit: hint.digit });
        setBannerMsg(hint.reason);
      } else {
        setBannerMsg(hint.reason);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInspectSelectedSuperposition = () => {
    if (!state.selectedCell) return;
    const { row, col } = state.selectedCell;
    if (state.board[row][col] !== 0) return;
    const cands = state.candidates[row]?.[col] ?? [];
    if (cands.length === 0) return;
    setInspectedSupCluster({
      id: `sup-r${row + 1}c${col + 1}`,
      state_type: "SUPERPOSITION",
      cells: [{ row, col }],
      candidate_pair: cands,
      parity: [],
      house_label: `R${row + 1}C${col + 1}`,
      mechanism: `Single-cell superposition over ${cands.length} candidates: {${cands.join(", ")}}`,
      consistent: true,
      diagnostic: `Amplitude = 1/√${cands.length} per digit`,
      is_manual: false,
    });
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/90 bg-[#0B1120]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg">
              <Atom className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                {t.app_title}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">{t.app_subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLessonsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition"
            >
              <BookOpen className="w-4 h-4" />
              {t.btn_lessons}
            </button>
            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 px-3 py-1.5 text-xs font-semibold text-violet-200 transition"
            >
              <HelpCircle className="w-4 h-4" />
              {t.btn_quiz}
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                aria-label={t.language_label}
                className="bg-transparent text-xs font-medium text-slate-100 focus:outline-none"
              >
                <option value="en" className="bg-slate-900">
                  English
                </option>
                <option value="hi" className="bg-slate-900">
                  हिन्दी (Hindi)
                </option>
                <option value="gu" className="bg-slate-900">
                  ગુજરાતી (Gujarati)
                </option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        {/* Left Column: Puzzle Controls & 9x9 Quantum Sudoku Board */}
        <section className="lg:col-span-6 flex flex-col gap-4 items-center">
          {/* Puzzle Selector + Status */}
          <div className="w-full max-w-[504px] rounded-2xl border border-slate-800 bg-[#0F1629]/90 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  {t.puzzle_select}
                </label>
                <select
                  value={state.puzzle?.id ?? ""}
                  onChange={(e) => handleLoadPuzzle(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-100"
                >
                  {puzzles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t[p.title_key] ?? p.id} ({p.difficulty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 pt-4">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "UNDO" })}
                  disabled={state.past.length === 0}
                  title={t.btn_undo}
                  className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400 disabled:opacity-35 transition"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "REDO" })}
                  disabled={state.future.length === 0}
                  title={t.btn_redo}
                  className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400 disabled:opacity-35 transition"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectedSupCluster(null);
                    setBannerMsg(null);
                    dispatch({ type: "RESET_PUZZLE" });
                  }}
                  title={t.btn_reset}
                  className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-rose-400 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleHint}
                  title={t.btn_hint}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-2 text-xs font-semibold text-amber-200 transition"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {t.btn_hint}
                </button>
              </div>
            </div>

            {state.puzzle && (
              <p className="text-xs text-slate-400">
                {t[state.puzzle.description_key]}
              </p>
            )}

            {/* Status Badges */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {isSolved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-0.5 font-bold text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t.status_solved}
                </span>
              ) : state.valid ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 font-medium text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t.status_valid}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2.5 py-0.5 font-semibold text-rose-300">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {t.status_conflict}
                </span>
              )}

              {state.uniqueSolution && !isSolved && (
                <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 text-cyan-300">
                  {t.status_unique}
                </span>
              )}

              {state.selectedCell &&
                state.board[state.selectedCell.row][state.selectedCell.col] === 0 && (
                  <button
                    type="button"
                    onClick={handleInspectSelectedSuperposition}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 text-amber-200 hover:bg-amber-500/25 transition"
                  >
                    <Sparkles className="w-3 h-3" />
                    Inspect |ψ⟩ (R{state.selectedCell.row + 1}C{state.selectedCell.col + 1})
                  </button>
                )}
            </div>

            {bannerMsg && (
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-1.5 text-xs text-cyan-200">
                {bannerMsg}
              </div>
            )}
          </div>

          <SudokuBoard
            board={state.board}
            givens={
              state.puzzle?.givens ??
              Array.from({ length: 9 }, () => Array(9).fill(0))
            }
            candidates={state.candidates}
            selectedCell={state.selectedCell}
            conflicts={state.conflicts}
            clusters={state.autoClusters}
            activeCluster={activeCluster}
            entanglementMode={state.entanglementMode}
            manualCells={state.manualCells}
            lastCollapseTrace={state.lastCollapseTrace}
            onCellClick={handleCellClick}
            onDigitInput={handleDigitInput}
            clearLabel={t.btn_clear_cell}
          />

          <p className="text-[11px] text-slate-500 text-center max-w-[504px]">
            {state.entanglementMode === "auto"
              ? t.board_help_auto
              : t.board_help_manual}
          </p>
        </section>

        {/* Right Column: Live Qiskit Workbench */}
        <section className="lg:col-span-6 w-full">
          <QuantumPanel
            t={t}
            entanglementMode={state.entanglementMode}
            onModeChange={(mode) => {
              setInspectedSupCluster(null);
              dispatch({ type: "SET_ENTANGLEMENT_MODE", mode });
            }}
            clusters={state.autoClusters}
            activeCluster={activeCluster}
            onSelectCluster={(id) => {
              setInspectedSupCluster(null);
              dispatch({ type: "SELECT_CLUSTER", clusterId: id });
            }}
            manualCells={state.manualCells}
            manualStateType={state.manualStateType}
            manualTargetDigit={state.manualTargetDigit}
            onManualStateTypeChange={(st) =>
              dispatch({ type: "SET_MANUAL_STATE_TYPE", stateType: st })
            }
            onManualTargetDigitChange={(d) =>
              dispatch({ type: "SET_MANUAL_TARGET_DIGIT", digit: d })
            }
            onSynthesizeManual={handleSynthesizeManual}
            onClearManual={() => dispatch({ type: "CLEAR_MANUAL_CELLS" })}
            noiseProfile={noiseProfile}
            onNoiseProfileChange={setNoiseProfile}
            customNoiseLevel={customNoiseLevel}
            onCustomNoiseChange={setCustomNoiseLevel}
            shots={shots}
            onShotsChange={setShots}
            cascadeEnabled={state.cascadeEnabled}
            onCascadeChange={(enabled) =>
              dispatch({ type: "SET_CASCADE", enabled })
            }
            simulation={simulation}
            isRunning={isRunning}
            onRunCircuit={() => void runActiveCircuit(activeCluster)}
            onMeasureCollapse={() => void handleMeasureCollapse()}
            lastCollapseTrace={state.lastCollapseTrace}
            hardwareBenchmarks={hardwareBenchmarks}
          />
        </section>
      </main>

      <LessonDrawer
        open={lessonsOpen}
        onClose={() => setLessonsOpen(false)}
        t={t}
        currentPuzzleId={state.puzzle?.id}
        onLoadPuzzle={handleLoadPuzzle}
      />

      <QuizModal open={quizOpen} onClose={() => setQuizOpen(false)} t={t} />
    </div>
  );
}

export default App;
