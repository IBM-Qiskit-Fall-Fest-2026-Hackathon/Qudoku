import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  Atom,
  BookOpen,
  CheckCircle2,
  Clock,
  Globe,
  HelpCircle,
  History,
  Lightbulb,
  Moon,
  Redo2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Sun,
  Undo2,
  Upload,
} from "lucide-react";
import { api } from "./api/client";
import { ImportPuzzleModal } from "./components/ImportPuzzleModal";
import { Tooltip } from "./components/InfoTooltip";
import { LessonsPage } from "./components/LessonsPage";
import { QuantumPanel } from "./components/QuantumPanel";
import { QuizPage } from "./components/QuizPage";
import { SessionGamesModal } from "./components/SessionGamesModal";
import { SudokuBoard } from "./components/SudokuBoard";
import { TRANSLATIONS } from "./i18n/translations";
import {
  boardReducer,
  createEmptyBoard,
  initialQudokuState,
} from "./store/boardReducer";
import {
  getGridSpec,
  SUPPORTED_SIZES,
  symbolToValue,
  valueToSymbol,
  type GridSize,
} from "./utils/sudokuConfig";

function computeLocalCellCandidates(
  board: number[][],
  eliminated: Record<string, number[]>,
  row: number,
  col: number
): number[] {
  const size = board.length;
  if (board[row]?.[col] !== 0) return [];
  const elimSet = new Set(eliminated[`${row},${col}`] ?? []);
  const used = new Set<number>();
  for (let i = 0; i < size; i++) {
    if (board[row]?.[i]) used.add(board[row][i]);
    if (board[i]?.[col]) used.add(board[i][col]);
  }
  const { boxRows, boxCols } = getGridSpec(size);
  const startR = Math.floor(row / boxRows) * boxRows;
  const startC = Math.floor(col / boxCols) * boxCols;
  for (let dr = 0; dr < boxRows; dr++) {
    for (let dc = 0; dc < boxCols; dc++) {
      const v = board[startR + dr]?.[startC + dc] ?? 0;
      if (v !== 0) used.add(v);
    }
  }
  const out: number[] = [];
  for (let d = 1; d <= size; d++) {
    if (!used.has(d) && !elimSet.has(d)) out.push(d);
  }
  return out;
}
import type {
  EntanglementCluster,
  GateOverride,
  HardwareBenchmark,
  Language,
  NoiseProfile,
  PuzzleSpec,
  SessionGameRecord,
  SimulationOutcome,
  ThemeMode,
} from "./types/quantum";
import {
  clearAllSessionGames,
  deleteSessionGame,
  getActiveSessionPuzzleId,
  loadSessionGames,
  saveSessionGame,
} from "./utils/sessionStorage";

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function App() {
  const [state, dispatch] = useReducer(boardReducer, initialQudokuState);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return window.localStorage.getItem("qudoku_theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [lang, setLang] = useState<Language>("en");

  useEffect(() => {
    document.documentElement.classList.toggle("light-theme", theme === "light");
    try {
      window.localStorage.setItem("qudoku_theme", theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);
  const [puzzles, setPuzzles] = useState<PuzzleSpec[]>([]);
  const [sessionGames, setSessionGames] = useState<Record<string, SessionGameRecord>>({});
  const [hardwareBenchmarks, setHardwareBenchmarks] = useState<HardwareBenchmark[]>([]);
  const [noiseProfile, setNoiseProfile] = useState<NoiseProfile>("ideal");
  const [customNoiseLevel, setCustomNoiseLevel] = useState<number>(0.03);
  const [shots, setShots] = useState<number>(512);
  const [mitigateReadout, setMitigateReadout] = useState<boolean>(false);
  const [gateOverride, setGateOverride] = useState<GateOverride>("normal");
  const [simulation, setSimulation] = useState<SimulationOutcome | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<"sandbox" | "lessons" | "quiz">("sandbox");
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [sessionOpen, setSessionOpen] = useState<boolean>(false);
  const [inspectedSupCluster, setInspectedSupCluster] = useState<EntanglementCluster | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  // Initial load: puzzles, cached IBM hardware benchmarks, and sessionStorage games
  useEffect(() => {
    let cancelled = false;
    const savedMap = loadSessionGames();
    const activeSavedId = getActiveSessionPuzzleId();

    Promise.all([api.getPuzzles(), api.getHardwareBenchmarks()])
      .then(([puzList, bmList]) => {
        if (cancelled) return;
        const customPuzzles = Object.values(savedMap)
          .map((rec) => rec.puzzle)
          .filter((p) => p.isCustom && !puzList.some((bp) => bp.id === p.id));
        const merged = [...puzList, ...customPuzzles];

        setPuzzles(merged);
        setSessionGames(savedMap);
        setHardwareBenchmarks(bmList);

        if (activeSavedId && savedMap[activeSavedId]) {
          dispatch({ type: "RESTORE_SESSION_GAME", record: savedMap[activeSavedId] });
          return;
        }
        const defaultPuzzle =
          merged.find((p) => p.id === "tutorial-bell") ?? merged[0];
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

  const isSolved = useMemo(() => {
    return (
      state.valid &&
      state.board.every((row) => row.every((v) => v !== 0))
    );
  }, [state.board, state.valid]);

  // Puzzle timer (pauses when solved or modals open)
  useEffect(() => {
    if (!state.puzzle || isSolved) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "TICK_TIMER" });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.puzzle, isSolved]);

  // Auto-persist every played game in sessionStorage
  useEffect(() => {
    if (!state.puzzle) return;
    const record: SessionGameRecord = {
      puzzle: state.puzzle,
      board: state.board,
      notes: state.notes,
      eliminated: state.eliminated,
      elapsedSeconds: state.elapsedSeconds,
      solved: isSolved,
      updatedAt: new Date().toISOString(),
    };
    const nextMap = saveSessionGame(record);
    setSessionGames(nextMap);
  }, [state.puzzle, state.board, state.notes, state.eliminated, state.elapsedSeconds, isSolved]);

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
    if (inspectedSupCluster) {
      return inspectedSupCluster;
    }
    if (state.entanglementMode === "manual") {
      return (
        state.manualClusters.find((c) => c.id === state.activeManualClusterId) ??
        state.manualClusters[0] ??
        null
      );
    }
    return (
      state.autoClusters.find((c) => c.id === state.activeClusterId) ??
      state.autoClusters[0] ??
      null
    );
  }, [
    state.entanglementMode,
    state.manualClusters,
    state.activeManualClusterId,
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
        const res = await api.runCircuit(
          cluster,
          shots,
          noiseProfile,
          customNoiseLevel,
          mitigateReadout,
          gateOverride
        );
        setSimulation(res);
      } catch (err) {
        console.error(err);
      } finally {
        setIsRunning(false);
      }
    },
    [shots, noiseProfile, customNoiseLevel, mitigateReadout, gateOverride]
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeCluster) {
      setSimulation(null);
      return;
    }
    setIsRunning(true);
    api
      .runCircuit(
        activeCluster,
        shots,
        noiseProfile,
        customNoiseLevel,
        mitigateReadout,
        gateOverride
      )
      .then((res) => {
        if (!cancelled) setSimulation(res);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setIsRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCluster, shots, noiseProfile, customNoiseLevel, mitigateReadout, gateOverride]);

  const handleLoadPuzzle = useCallback(
    (puzzleId: string) => {
      setInspectedSupCluster(null);
      setBannerMsg(null);
      const saved = sessionGames[puzzleId];
      if (saved) {
        dispatch({ type: "RESTORE_SESSION_GAME", record: saved });
        return;
      }
      const found = puzzles.find((p) => p.id === puzzleId);
      if (found) {
        dispatch({ type: "LOAD_PUZZLE", puzzle: found });
      }
    },
    [puzzles, sessionGames]
  );

  const handleImportPuzzle = useCallback((customPuzzle: PuzzleSpec) => {
    setInspectedSupCluster(null);
    setBannerMsg(null);
    setPuzzles((prev) => [...prev, customPuzzle]);
    dispatch({ type: "LOAD_PUZZLE", puzzle: customPuzzle });
  }, []);

  // Ctrl/Cmd+Click or Pick Cells mode toggles draft cells; normal click plays Sudoku or focuses clusters
  const handleCellClick = useCallback(
    (row: number, col: number, ctrlOrMeta: boolean) => {
      setBannerMsg(null);
      if (state.entanglementMode === "manual") {
        if (ctrlOrMeta || state.manualPicking) {
          dispatch({ type: "TOGGLE_MANUAL_CELL", cell: { row, col } });
          return;
        }
        dispatch({ type: "SELECT_CELL", cell: { row, col } });
        const matchingManual = state.manualClusters.filter((cl) =>
          cl.cells.some((c) => c.row === row && c.col === col)
        );
        if (matchingManual.length > 0) {
          setInspectedSupCluster(null);
          const idx = matchingManual.findIndex(
            (cl) => cl.id === state.activeManualClusterId
          );
          const next =
            idx >= 0 &&
            state.selectedCell?.row === row &&
            state.selectedCell?.col === col
              ? matchingManual[(idx + 1) % matchingManual.length]
              : idx >= 0
                ? matchingManual[idx]
                : matchingManual[0];
          dispatch({ type: "SELECT_MANUAL_CLUSTER", clusterId: next.id });
        }
        return;
      }

      dispatch({ type: "SELECT_CELL", cell: { row, col } });

      // Find all detected clusters containing this cell
      const matchingClusters = state.autoClusters.filter((cl) =>
        cl.cells.some((c) => c.row === row && c.col === col)
      );

      setInspectedSupCluster(null);
      if (matchingClusters.length > 0) {
        const currentIdx = matchingClusters.findIndex(
          (cl) => cl.id === state.activeClusterId
        );
        const nextCluster =
          currentIdx >= 0 &&
          state.selectedCell?.row === row &&
          state.selectedCell?.col === col
            ? matchingClusters[(currentIdx + 1) % matchingClusters.length]
            : currentIdx >= 0
              ? matchingClusters[currentIdx]
              : matchingClusters[0];
        dispatch({ type: "SELECT_CLUSTER", clusterId: nextCluster.id });
      }
    },
    [
      state.entanglementMode,
      state.manualPicking,
      state.manualClusters,
      state.activeManualClusterId,
      state.autoClusters,
      state.activeClusterId,
      state.selectedCell,
    ]
  );

  const handleDigitInput = useCallback(
    (digit: number) => {
      if (!state.selectedCell) return;
      const { row, col } = state.selectedCell;
      if (state.puzzle && state.puzzle.givens[row][col] !== 0) return;

      if (state.noteMode) {
        dispatch({ type: "TOGGLE_NOTE", row, col, digit });
      } else {
        setInspectedSupCluster(null);
        dispatch({ type: "SET_DIGIT", row, col, digit });
      }
    },
    [state.selectedCell, state.puzzle, state.noteMode]
  );

  // Keyboard shortcuts: 1-9, Backspace/Delete/0, N (notes mode), Arrows, Ctrl+Z/Y
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
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
      if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "SET_NOTE_MODE", enabled: !state.noteMode });
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const n = state.gridSize;
        const r = state.selectedCell?.row ?? 0;
        const c = state.selectedCell?.col ?? 0;
        const next =
          e.key === "ArrowUp"
            ? { row: (r + n - 1) % n, col: c }
            : e.key === "ArrowDown"
              ? { row: (r + 1) % n, col: c }
              : e.key === "ArrowLeft"
                ? { row: r, col: (c + n - 1) % n }
                : { row: r, col: (c + 1) % n };
        dispatch({ type: "SELECT_CELL", cell: next });
        return;
      }
      if (!state.selectedCell) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        handleDigitInput(0);
        return;
      }
      const symVal = symbolToValue(e.key, state.gridSize);
      if (symVal !== null) {
        handleDigitInput(symVal);
      } else if (e.key === "0" && state.gridSize !== 16) {
        handleDigitInput(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.selectedCell, state.noteMode, state.gridSize, handleDigitInput]);

  const handleSynthesizeManual = async () => {
    if (state.manualCells.length === 0) return;
    setIsRunning(true);
    try {
      const cl = await api.buildManualCluster(
        state.board,
        state.eliminated,
        state.manualCells,
        state.manualStateType,
        state.manualDigitA,
        state.manualDigitB,
        state.manualCustomState
      );
      setInspectedSupCluster(null);
      dispatch({ type: "ADD_MANUAL_CLUSTER", cluster: cl });
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
    if (state.board[row]?.[col] !== 0) return;
    const targetId = `sup-r${row + 1}c${col + 1}`;
    if (inspectedSupCluster?.id === targetId) {
      setInspectedSupCluster(null);
      return;
    }
    const cachedCands = state.candidates[row]?.[col];
    const cands =
      cachedCands && cachedCands.length > 0
        ? cachedCands
        : computeLocalCellCandidates(state.board, state.eliminated, row, col);
    if (cands.length === 0) {
      setBannerMsg(
        `No valid candidates available at R${row + 1}C${col + 1} due to row, column, or box conflicts.`
      );
      return;
    }
    const symList = cands.map((c) => valueToSymbol(c, state.gridSize)).join(", ");
    setInspectedSupCluster({
      id: targetId,
      state_type: "SUPERPOSITION",
      cells: [{ row, col }],
      candidate_pair: cands,
      parity: [],
      house_label: `R${row + 1}C${col + 1}`,
      mechanism: `Single-cell superposition over ${cands.length} candidates: {${symList}}`,
      consistent: true,
      diagnostic: `Amplitude = 1/√${cands.length} per symbol`,
      is_manual: false,
      grid_size: state.gridSize,
    });
  };

  const puzzlesForActiveSize = useMemo(() => {
    return puzzles.filter(
      (p) => (p.grid_size ?? p.givens.length) === state.gridSize
    );
  }, [puzzles, state.gridSize]);

  const handleBoardSizeChange = (nextSize: GridSize) => {
    const matching = puzzles.filter(
      (p) => (p.grid_size ?? p.givens.length) === nextSize
    );
    const preferred =
      matching.find((p) => p.concept_focus === "SUPERPOSITION") ?? matching[0];
    if (preferred) {
      handleLoadPuzzle(preferred.id);
    }
  };

  const handleDeleteSessionGame = (puzzleId: string) => {
    const nextMap = deleteSessionGame(puzzleId);
    setSessionGames(nextMap);
    if (state.puzzle?.id === puzzleId) {
      const fallback = puzzles.find((p) => p.id !== puzzleId);
      if (fallback) {
        dispatch({ type: "LOAD_PUZZLE", puzzle: fallback });
      }
    }
  };

  const handleClearSessionGames = () => {
    clearAllSessionGames();
    setSessionGames({});
    if (state.puzzle) {
      dispatch({ type: "RESET_PUZZLE" });
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/90 bg-[#0B1120]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveView("sandbox")}
            className="flex items-center gap-3 text-left focus:outline-none group"
            title={t.btn_back_to_board}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition">
              <Atom className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                {t.app_title}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400">{t.app_subtitle}</p>
            </div>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <Tooltip text={t.tip_btn_import} position="bottom">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-3 py-1.5 text-xs font-semibold text-amber-200 transition"
                title={t.tip_btn_import}
              >
                <Upload className="w-4 h-4" />
                {t.btn_import}
              </button>
            </Tooltip>
            <Tooltip text={t.tip_btn_session_games} position="bottom">
              <button
                type="button"
                onClick={() => setSessionOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition"
                title={t.tip_btn_session_games}
              >
                <History className="w-4 h-4" />
                {t.btn_session_games} ({Object.keys(sessionGames).length})
              </button>
            </Tooltip>
            <Tooltip text={t.tip_btn_lessons} position="bottom">
              <button
                type="button"
                onClick={() =>
                  setActiveView((v) => (v === "lessons" ? "sandbox" : "lessons"))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  activeView === "lessons"
                    ? "border-cyan-400 bg-cyan-400/25 text-white ring-1 ring-cyan-400/60"
                    : "border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200"
                }`}
                title={t.tip_btn_lessons}
              >
                <BookOpen className="w-4 h-4" />
                {t.btn_lessons}
              </button>
            </Tooltip>
            <Tooltip text={t.tip_btn_quiz} position="bottom">
              <button
                type="button"
                onClick={() =>
                  setActiveView((v) => (v === "quiz" ? "sandbox" : "quiz"))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  activeView === "quiz"
                    ? "border-violet-400 bg-violet-400/25 text-white ring-1 ring-violet-400/60"
                    : "border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 text-violet-200"
                }`}
                title={t.tip_btn_quiz}
              >
                <HelpCircle className="w-4 h-4" />
                {t.btn_quiz}
              </button>
            </Tooltip>
            <Tooltip text={t.tip_theme} position="bottom">
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-amber-400 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition"
                title={t.tip_theme}
                aria-label={t.tip_theme}
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span className="hidden sm:inline">{t.theme_light}</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-violet-400" />
                    <span className="hidden sm:inline">{t.theme_dark}</span>
                  </>
                )}
              </button>
            </Tooltip>
            <Tooltip text={t.tip_language} position="bottom">
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
                  <option value="mr" className="bg-slate-900">
                    मराठी (Marathi)
                  </option>
                  <option value="kn" className="bg-slate-900">
                    ಕನ್ನಡ (Kannada)
                  </option>
                  <option value="ta" className="bg-slate-900">
                    தமிழ் (Tamil)
                  </option>
                  <option value="te" className="bg-slate-900">
                    తెలుగు (Telugu)
                  </option>
                  <option value="bn" className="bg-slate-900">
                    বাংলা (Bengali)
                  </option>
                </select>
              </div>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {activeView === "lessons" ? (
        <LessonsPage
          t={t}
          currentPuzzleId={state.puzzle?.id}
          onLoadPuzzle={handleLoadPuzzle}
          onBackToBoard={() => setActiveView("sandbox")}
          onOpenQuiz={() => setActiveView("quiz")}
        />
      ) : activeView === "quiz" ? (
        <QuizPage
          t={t}
          onBackToBoard={() => setActiveView("sandbox")}
          onOpenLessons={() => setActiveView("lessons")}
        />
      ) : (
      <main className="max-w-7xl w-full mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        {/* Left Column: Puzzle Controls & Generic Quantum Sudoku Board */}
        <section className="lg:col-span-6 flex flex-col gap-4 items-center min-w-0">
          <div className="w-full max-w-[560px] rounded-2xl border border-slate-800 bg-[#0F1629]/90 p-3.5 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 flex-1 min-w-[240px]">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {t.board_size_label}
                  </label>
                  <select
                    value={state.gridSize}
                    onChange={(e) =>
                      handleBoardSizeChange(Number(e.target.value) as GridSize)
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-100"
                  >
                    {SUPPORTED_SIZES.map((sz) => {
                      const sp = getGridSpec(sz);
                      return (
                        <option key={sz} value={sz}>
                          {sp.label} ({sp.boxRows}×{sp.boxCols})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {t.tutorial_select_label}
                  </label>
                  <select
                    value={state.puzzle?.id ?? ""}
                    onChange={(e) => handleLoadPuzzle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-100"
                  >
                    {puzzlesForActiveSize.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.customTitle ?? t[p.title_key] ?? p.id} ({p.difficulty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pb-0.5">
                <Tooltip text={t.tip_btn_undo} position="top">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "UNDO" })}
                    disabled={state.past.length === 0}
                    title={t.tip_btn_undo}
                    className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400 disabled:opacity-35 transition"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip text={t.tip_btn_redo} position="top">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "REDO" })}
                    disabled={state.future.length === 0}
                    title={t.tip_btn_redo}
                    className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-cyan-400 disabled:opacity-35 transition"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip text={t.tip_btn_reset} position="top">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectedSupCluster(null);
                      setBannerMsg(null);
                      dispatch({ type: "RESET_PUZZLE" });
                    }}
                    title={t.tip_btn_reset}
                    className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-rose-400 transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </Tooltip>
                <Tooltip text={t.tip_btn_hint} position="top">
                  <button
                    type="button"
                    onClick={handleHint}
                    title={t.tip_btn_hint}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-2 text-xs font-semibold text-amber-200 transition"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    {t.btn_hint}
                  </button>
                </Tooltip>
              </div>
            </div>

            {state.puzzle && (
              <p className="text-xs text-slate-400">
                {t[state.puzzle.description_key]}
              </p>
            )}

            {/* Status & Timer Badges */}
            <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="rounded-full bg-violet-500/15 border border-violet-500/35 px-2 py-0.5 font-mono font-semibold text-violet-200 whitespace-nowrap">
                  {getGridSpec(state.gridSize).label}
                </span>
                {isSolved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 px-2 py-0.5 font-bold text-emerald-300 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {t.status_solved}
                  </span>
                ) : state.valid ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-medium text-emerald-300 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {t.status_valid}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 font-semibold text-rose-300 whitespace-nowrap">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    {t.status_conflict}
                  </span>
                )}

                {state.uniqueSolution && !isSolved && (
                  <span
                    className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-cyan-300 whitespace-nowrap"
                    title={t.status_unique}
                  >
                    Unique
                  </span>
                )}

                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-700 px-2 py-0.5 font-mono text-slate-300 whitespace-nowrap">
                  <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                  {formatTimer(state.elapsedSeconds)}
                </span>
              </div>

              <Tooltip text={t.tip_inspect_sup} position="top" className="shrink-0">
                <button
                  type="button"
                  onClick={handleInspectSelectedSuperposition}
                  disabled={
                    !state.selectedCell ||
                    state.board[state.selectedCell.row]?.[state.selectedCell.col] !== 0
                  }
                  title={t.tip_inspect_sup}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 whitespace-nowrap shrink-0 disabled:opacity-35 disabled:cursor-not-allowed transition ${
                    inspectedSupCluster
                      ? "bg-amber-400/25 border-amber-300 text-amber-100 ring-1 ring-amber-400/50"
                      : "bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25"
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>
                    {state.selectedCell &&
                    state.board[state.selectedCell.row]?.[state.selectedCell.col] === 0
                      ? `Inspect |ψ⟩ (R${state.selectedCell.row + 1}C${state.selectedCell.col + 1})`
                      : "Inspect |ψ⟩"}
                  </span>
                </button>
              </Tooltip>
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
              state.puzzle?.givens ?? createEmptyBoard(state.gridSize)
            }
            notes={state.notes}
            selectedCell={state.selectedCell}
            conflicts={state.conflicts}
            clusters={
              state.entanglementMode === "manual"
                ? state.manualClusters
                : state.autoClusters
            }
            activeCluster={activeCluster}
            entanglementMode={state.entanglementMode}
            manualCells={state.manualCells}
            lastCollapseTrace={state.lastCollapseTrace}
            noteMode={state.noteMode}
            showTethers={state.showTethers}
            theme={theme}
            onCellClick={handleCellClick}
            onDigitInput={handleDigitInput}
            onToggleNoteMode={() =>
              dispatch({ type: "SET_NOTE_MODE", enabled: !state.noteMode })
            }
            onAutoFillNotes={() => dispatch({ type: "AUTO_FILL_NOTES" })}
            onClearAllNotes={() => dispatch({ type: "CLEAR_ALL_NOTES" })}
            onToggleTethers={() =>
              dispatch({ type: "SET_SHOW_TETHERS", enabled: !state.showTethers })
            }
            t={t}
          />

          <p className="text-[11px] text-slate-500 text-center max-w-[504px]">
            {state.entanglementMode === "auto"
              ? t.board_help_auto
              : t.board_help_manual}
          </p>
        </section>

        {/* Right Column: Live Qiskit Workbench */}
        <section className="lg:col-span-6 w-full min-w-0">
          <QuantumPanel
            t={t}
            gridSize={state.gridSize}
            entanglementMode={state.entanglementMode}
            onModeChange={(mode) => {
              setInspectedSupCluster(null);
              dispatch({ type: "SET_ENTANGLEMENT_MODE", mode });
            }}
            clusters={state.autoClusters}
            manualClusters={state.manualClusters}
            activeCluster={activeCluster}
            onSelectCluster={(id) => {
              setInspectedSupCluster(null);
              dispatch({ type: "SELECT_CLUSTER", clusterId: id });
            }}
            onSelectManualCluster={(id) => {
              setInspectedSupCluster(null);
              dispatch({ type: "SELECT_MANUAL_CLUSTER", clusterId: id });
            }}
            onDeleteManualCluster={(id) =>
              dispatch({ type: "DELETE_MANUAL_CLUSTER", clusterId: id })
            }
            manualPicking={state.manualPicking}
            onToggleManualPicking={() =>
              dispatch({
                type: "SET_MANUAL_PICKING",
                enabled: !state.manualPicking,
              })
            }
            manualCells={state.manualCells}
            manualStateType={state.manualStateType}
            manualDigitA={state.manualDigitA}
            manualDigitB={state.manualDigitB}
            manualCustomState={state.manualCustomState}
            onManualStateTypeChange={(st) =>
              dispatch({ type: "SET_MANUAL_STATE_TYPE", stateType: st })
            }
            onManualDigitAChange={(d) =>
              dispatch({ type: "SET_MANUAL_DIGIT_A", digit: d })
            }
            onManualDigitBChange={(d) =>
              dispatch({ type: "SET_MANUAL_DIGIT_B", digit: d })
            }
            onManualCustomStateChange={(expr) =>
              dispatch({ type: "SET_MANUAL_CUSTOM_STATE", expr })
            }
            onSynthesizeManual={handleSynthesizeManual}
            onClearManual={() => dispatch({ type: "CLEAR_MANUAL_CELLS" })}
            noiseProfile={noiseProfile}
            onNoiseProfileChange={setNoiseProfile}
            customNoiseLevel={customNoiseLevel}
            onCustomNoiseChange={setCustomNoiseLevel}
            shots={shots}
            onShotsChange={setShots}
            mitigateReadout={mitigateReadout}
            onMitigateReadoutChange={setMitigateReadout}
            gateOverride={gateOverride}
            onGateOverrideChange={setGateOverride}
            cascadeEnabled={state.cascadeEnabled}
            onCascadeChange={(enabled) =>
              dispatch({ type: "SET_CASCADE", enabled })
            }
            autoFillSingleNote={state.autoFillSingleNote}
            onToggleAutoFillSingleNote={() =>
              dispatch({
                type: "SET_AUTO_FILL_SINGLE_NOTE",
                enabled: !state.autoFillSingleNote,
              })
            }
            simulation={simulation}
            isRunning={isRunning}
            onRunCircuit={() => void runActiveCircuit(activeCluster)}
            lastCollapseTrace={state.lastCollapseTrace}
            hardwareBenchmarks={hardwareBenchmarks}
            theme={theme}
            isInspectingSingleCell={inspectedSupCluster !== null}
            onExitSingleCell={() => setInspectedSupCluster(null)}
          />
        </section>
      </main>
      )}

      <ImportPuzzleModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        t={t}
        onImportPuzzle={handleImportPuzzle}
      />

      <SessionGamesModal
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        t={t}
        games={Object.values(sessionGames)}
        activePuzzleId={state.puzzle?.id}
        onResumeGame={(rec) => {
          setInspectedSupCluster(null);
          if (
            rec.puzzle.isCustom &&
            !puzzles.some((p) => p.id === rec.puzzle.id)
          ) {
            setPuzzles((prev) => [...prev, rec.puzzle]);
          }
          dispatch({ type: "RESTORE_SESSION_GAME", record: rec });
        }}
        onDeleteGame={handleDeleteSessionGame}
        onClearAll={handleClearSessionGames}
      />
    </div>
  );
}

export default App;
