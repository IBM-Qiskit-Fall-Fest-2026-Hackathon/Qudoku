import type {
  AnalyzeBoardResponse,
  CellCoord,
  CollapseStep,
  EntanglementCluster,
  EntanglementMode,
  PuzzleSpec,
  SessionGameRecord,
  StateType,
  SuperpositionCell,
} from "../types/quantum";
import { getGridSpec, symbolToValue, valueToSymbol } from "../utils/sudokuConfig";

export interface BoardSnapshot {
  board: number[][];
  notes: number[][][];
  eliminated: Record<string, number[]>;
}

export interface QudokuState {
  puzzle: PuzzleSpec | null;
  gridSize: number;
  board: number[][];
  notes: number[][][];
  eliminated: Record<string, number[]>;
  selectedCell: CellCoord | null;
  noteMode: boolean;
  autoFillSingleNote: boolean;
  showAutoCandidates: boolean;
  showTethers: boolean;
  entanglementMode: EntanglementMode;
  manualPicking: boolean;
  manualCells: CellCoord[];
  manualStateType: StateType;
  manualDigitA: number | null;
  manualDigitB: string | null;
  manualCustomState: string;
  manualClusters: EntanglementCluster[];
  activeManualClusterId: string | null;
  autoClusters: EntanglementCluster[];
  activeClusterId: string | null;
  candidates: number[][][];
  superpositionCells: SuperpositionCell[];
  conflicts: CellCoord[];
  valid: boolean;
  solvable: boolean;
  uniqueSolution: boolean;
  cascadeEnabled: boolean;
  lastCollapseTrace: CollapseStep[];
  elapsedSeconds: number;
  past: BoardSnapshot[];
  future: BoardSnapshot[];
}

export type QudokuAction =
  | { type: "LOAD_PUZZLE"; puzzle: PuzzleSpec }
  | { type: "RESTORE_SESSION_GAME"; record: SessionGameRecord }
  | { type: "RESET_PUZZLE" }
  | { type: "SELECT_CELL"; cell: CellCoord | null }
  | { type: "SET_NOTE_MODE"; enabled: boolean }
  | { type: "SET_AUTO_FILL_SINGLE_NOTE"; enabled: boolean }
  | { type: "SET_SHOW_AUTO_CANDIDATES"; enabled: boolean }
  | { type: "SET_SHOW_TETHERS"; enabled: boolean }
  | { type: "SET_DIGIT"; row: number; col: number; digit: number }
  | { type: "TOGGLE_NOTE"; row: number; col: number; digit: number }
  | { type: "AUTO_FILL_NOTES" }
  | { type: "CLEAR_ALL_NOTES" }
  | { type: "APPLY_ANALYSIS"; analysis: AnalyzeBoardResponse }
  | { type: "SET_ENTANGLEMENT_MODE"; mode: EntanglementMode }
  | { type: "SET_MANUAL_PICKING"; enabled: boolean }
  | { type: "TOGGLE_MANUAL_CELL"; cell: CellCoord }
  | { type: "CLEAR_MANUAL_CELLS" }
  | { type: "SET_MANUAL_STATE_TYPE"; stateType: StateType }
  | { type: "SET_MANUAL_DIGIT_A"; digit: number | null }
  | { type: "SET_MANUAL_DIGIT_B"; digit: string | null }
  | { type: "SET_MANUAL_CUSTOM_STATE"; expr: string }
  | { type: "ADD_MANUAL_CLUSTER"; cluster: EntanglementCluster }
  | { type: "SELECT_MANUAL_CLUSTER"; clusterId: string | null }
  | { type: "DELETE_MANUAL_CLUSTER"; clusterId: string }
  | { type: "SELECT_CLUSTER"; clusterId: string | null }
  | { type: "SET_CASCADE"; enabled: boolean }
  | {
      type: "APPLY_COLLAPSE";
      board: number[][];
      eliminated: Record<string, number[]>;
      trace: CollapseStep[];
    }
  | { type: "TICK_TIMER" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR_TRACE" };

export function createEmptyBoard(size = 9): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

export function createEmptyNotes(size = 9): number[][][] {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => []));
}

function cloneBoard(board: number[][]): number[][] {
  return board.map((row) => [...row]);
}

function cloneNotes(notes: number[][][]): number[][][] {
  return notes.map((row) => row.map((cellNotes) => [...cellNotes]));
}

function cloneEliminated(elim: Record<string, number[]>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(elim)) {
    out[k] = [...v];
  }
  return out;
}

function prunePeerNotes(
  notes: number[][][],
  row: number,
  col: number,
  digit: number,
  size: number
): number[][][] {
  const next = cloneNotes(notes);
  next[row][col] = [];
  if (digit === 0) return next;

  const { boxRows, boxCols } = getGridSpec(size);
  const boxRow = Math.floor(row / boxRows) * boxRows;
  const boxCol = Math.floor(col / boxCols) * boxCols;

  for (let i = 0; i < size; i++) {
    next[row][i] = next[row][i].filter((d) => d !== digit);
    next[i][col] = next[i][col].filter((d) => d !== digit);
  }
  for (let dr = 0; dr < boxRows; dr++) {
    for (let dc = 0; dc < boxCols; dc++) {
      const r = boxRow + dr;
      const c = boxCol + dc;
      next[r][c] = next[r][c].filter((d) => d !== digit);
    }
  }
  return next;
}

function propagateEntangledClusters(
  startBoard: number[][],
  startNotes: number[][][],
  startElim: Record<string, number[]>,
  clusters: EntanglementCluster[],
  size: number
): {
  board: number[][];
  notes: number[][][];
  eliminated: Record<string, number[]>;
  trace: CollapseStep[];
} {
  const board = cloneBoard(startBoard);
  let notes = cloneNotes(startNotes);
  const eliminated = cloneEliminated(startElim);
  const trace: CollapseStep[] = [];

  for (let pass = 0; pass < 12; pass++) {
    let changed = false;

    for (const cl of clusters) {
      if (cl.cells.length < 2) continue;

      if (
        (cl.state_type === "BELL" || cl.state_type === "GHZ") &&
        cl.candidate_pair?.length === 2 &&
        cl.candidate_pair[0] !== 0
      ) {
        const [a, b] = cl.candidate_pair;
        const parity =
          cl.parity.length === cl.cells.length ? cl.parity : cl.cells.map((_, i) => i % 2);
        let anchorFlip: number | null = null;
        for (let i = 0; i < cl.cells.length; i++) {
          const v = board[cl.cells[i].row][cl.cells[i].col];
          if (v === a || v === b) {
            const bitVal = v === a ? 0 : 1;
            anchorFlip = bitVal === parity[i] ? 0 : 1;
            break;
          }
        }
        if (anchorFlip !== null) {
          for (let j = 0; j < cl.cells.length; j++) {
            const { row, col } = cl.cells[j];
            if (board[row][col] === 0) {
              const targetBit = anchorFlip === 0 ? parity[j] : 1 - parity[j];
              const assigned = targetBit === 0 ? a : b;
              board[row][col] = assigned;
              notes = prunePeerNotes(notes, row, col, assigned, size);
              delete eliminated[`${row},${col}`];
              trace.push({
                row,
                col,
                digit: assigned,
                reason: `Entangled ${cl.state_type} (${cl.house_label})`,
              });
              changed = true;
            }
          }
        }
      } else if (cl.state_type === "BELL" && cl.target_digit != null) {
        const d = cl.target_digit;
        const sd = valueToSymbol(d, size);
        const [c0, c1] = cl.cells;
        const v0 = board[c0.row][c0.col];
        const v1 = board[c1.row][c1.col];
        if (v0 !== 0 && v0 !== d && v1 === 0) {
          board[c1.row][c1.col] = d;
          notes = prunePeerNotes(notes, c1.row, c1.col, d, size);
          delete eliminated[`${c1.row},${c1.col}`];
          trace.push({ row: c1.row, col: c1.col, digit: d, reason: `Bell {${sd},*} propagation` });
          changed = true;
        } else if (v1 !== 0 && v1 !== d && v0 === 0) {
          board[c0.row][c0.col] = d;
          notes = prunePeerNotes(notes, c0.row, c0.col, d, size);
          delete eliminated[`${c0.row},${c0.col}`];
          trace.push({ row: c0.row, col: c0.col, digit: d, reason: `Bell {${sd},*} propagation` });
          changed = true;
        }
      } else if (cl.state_type === "W" && cl.target_digit != null) {
        const d = cl.target_digit;
        const sd = valueToSymbol(d, size);
        const hasD = cl.cells.some((c) => board[c.row][c.col] === d);
        if (!hasD) {
          const open = cl.cells.filter(
            (c) =>
              board[c.row][c.col] === 0 &&
              !(eliminated[`${c.row},${c.col}`] ?? []).includes(d)
          );
          if (open.length === 1) {
            const target = open[0];
            board[target.row][target.col] = d;
            notes = prunePeerNotes(notes, target.row, target.col, d, size);
            delete eliminated[`${target.row},${target.col}`];
            trace.push({
              row: target.row,
              col: target.col,
              digit: d,
              reason: `W-state |W_${cl.cells.length}⟩ last cell for ${sd}`,
            });
            changed = true;
          }
        }
      } else if (cl.state_type === "CUSTOM" && cl.custom_terms && cl.custom_terms.length > 0) {
        const matchingTerms = cl.custom_terms.filter((term) => {
          if (term.length !== cl.cells.length) return false;
          for (let i = 0; i < cl.cells.length; i++) {
            const v = board[cl.cells[i].row][cl.cells[i].col];
            if (v !== 0 && term[i] !== "*") {
              const tv = symbolToValue(term[i], size);
              if (tv !== v) return false;
            }
          }
          return true;
        });
        if (matchingTerms.length > 0) {
          for (let j = 0; j < cl.cells.length; j++) {
            const { row, col } = cl.cells[j];
            if (board[row][col] !== 0) continue;
            const chars = new Set(matchingTerms.map((t) => t[j]));
            if (chars.size === 1) {
              const onlyCh = [...chars][0];
              if (onlyCh !== "*") {
                const assigned = symbolToValue(onlyCh, size);
                if (assigned !== null) {
                  board[row][col] = assigned;
                  notes = prunePeerNotes(notes, row, col, assigned, size);
                  delete eliminated[`${row},${col}`];
                  trace.push({
                    row,
                    col,
                    digit: assigned,
                    reason: `Custom state |${matchingTerms[0]}⟩ propagation`,
                  });
                  changed = true;
                }
              }
            }
          }
        }
      }
    }

    if (!changed) break;
  }

  return { board, notes, eliminated, trace };
}

function runAutoPropagationAndSingleNotes(
  startBoard: number[][],
  startNotes: number[][][],
  startElim: Record<string, number[]>,
  prevNotesBeforeMove: number[][][],
  clusters: EntanglementCluster[],
  cascadeEnabled: boolean,
  autoFillSingleNote: boolean,
  size: number,
  assignAllExistingSingles = false
): {
  board: number[][];
  notes: number[][][];
  eliminated: Record<string, number[]>;
  trace: CollapseStep[];
} {
  let board = cloneBoard(startBoard);
  let notes = cloneNotes(startNotes);
  let eliminated = cloneEliminated(startElim);
  const trace: CollapseStep[] = [];
  let baselineNotes = cloneNotes(prevNotesBeforeMove);

  for (let iter = 0; iter < size * size; iter++) {
    let changed = false;

    if (cascadeEnabled) {
      const prop = propagateEntangledClusters(board, notes, eliminated, clusters, size);
      if (prop.trace.length > 0) {
        board = prop.board;
        notes = prop.notes;
        eliminated = prop.eliminated;
        trace.push(...prop.trace);
        changed = true;
      }
    }

    if (autoFillSingleNote) {
      let picked: { row: number; col: number; digit: number } | null = null;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (board[r][c] === 0 && notes[r][c].length === 1) {
            const wasPrunedToOne = baselineNotes[r][c].length >= 2;
            if (assignAllExistingSingles || wasPrunedToOne) {
              picked = { row: r, col: c, digit: notes[r][c][0] };
              break;
            }
          }
        }
        if (picked) break;
      }
      if (picked) {
        baselineNotes = cloneNotes(notes);
        board[picked.row][picked.col] = picked.digit;
        notes = prunePeerNotes(notes, picked.row, picked.col, picked.digit, size);
        delete eliminated[`${picked.row},${picked.col}`];
        trace.push({
          row: picked.row,
          col: picked.col,
          digit: picked.digit,
          reason: "Single-note cell auto-fill",
        });
        changed = true;
      }
    }

    if (!changed) break;
  }

  return { board, notes, eliminated, trace };
}

export const initialQudokuState: QudokuState = {
  puzzle: null,
  gridSize: 9,
  board: createEmptyBoard(9),
  notes: createEmptyNotes(9),
  eliminated: {},
  selectedCell: null,
  noteMode: false,
  autoFillSingleNote: false,
  showAutoCandidates: false,
  showTethers: true,
  entanglementMode: "auto",
  manualPicking: false,
  manualCells: [],
  manualStateType: "BELL",
  manualDigitA: null,
  manualDigitB: null,
  manualCustomState: "",
  manualClusters: [],
  activeManualClusterId: null,
  autoClusters: [],
  activeClusterId: null,
  candidates: createEmptyNotes(9),
  superpositionCells: [],
  conflicts: [],
  valid: true,
  solvable: true,
  uniqueSolution: true,
  cascadeEnabled: true,
  lastCollapseTrace: [],
  elapsedSeconds: 0,
  past: [],
  future: [],
};

export function boardReducer(state: QudokuState, action: QudokuAction): QudokuState {
  switch (action.type) {
    case "LOAD_PUZZLE": {
      const size = action.puzzle.givens.length || 9;
      return {
        ...state,
        puzzle: action.puzzle,
        gridSize: size,
        board: cloneBoard(action.puzzle.givens),
        notes: createEmptyNotes(size),
        candidates: createEmptyNotes(size),
        eliminated: {},
        selectedCell: null,
        manualPicking: false,
        manualCells: [],
        manualDigitA: null,
        manualDigitB: null,
        manualClusters: [],
        activeManualClusterId: null,
        autoClusters: [],
        activeClusterId: null,
        conflicts: [],
        lastCollapseTrace: [],
        elapsedSeconds: 0,
        past: [],
        future: [],
      };
    }

    case "RESTORE_SESSION_GAME": {
      const size = action.record.board.length || 9;
      return {
        ...state,
        puzzle: action.record.puzzle,
        gridSize: size,
        board: cloneBoard(action.record.board),
        notes: cloneNotes(action.record.notes),
        candidates: createEmptyNotes(size),
        eliminated: cloneEliminated(action.record.eliminated),
        selectedCell: null,
        manualPicking: false,
        manualCells: [],
        manualDigitA: null,
        manualDigitB: null,
        manualClusters: [],
        activeManualClusterId: null,
        autoClusters: [],
        activeClusterId: null,
        conflicts: [],
        lastCollapseTrace: [],
        elapsedSeconds: action.record.elapsedSeconds ?? 0,
        past: [],
        future: [],
      };
    }

    case "RESET_PUZZLE": {
      if (!state.puzzle) return state;
      const size = state.puzzle.givens.length || 9;
      return {
        ...state,
        gridSize: size,
        board: cloneBoard(state.puzzle.givens),
        notes: createEmptyNotes(size),
        eliminated: {},
        selectedCell: null,
        manualPicking: false,
        manualCells: [],
        manualClusters: [],
        activeManualClusterId: null,
        activeClusterId: null,
        lastCollapseTrace: [],
        elapsedSeconds: 0,
        past: [],
        future: [],
      };
    }

    case "SELECT_CELL":
      return { ...state, selectedCell: action.cell };

    case "SET_NOTE_MODE":
      return { ...state, noteMode: action.enabled };

    case "SET_AUTO_FILL_SINGLE_NOTE": {
      if (!action.enabled) {
        return { ...state, autoFillSingleNote: false };
      }
      const hasSingles = state.board.some((rowArr, r) =>
        rowArr.some((v, c) => v === 0 && (state.notes[r]?.[c]?.length ?? 0) === 1)
      );
      if (!hasSingles) {
        return { ...state, autoFillSingleNote: true };
      }
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      const allClusters = [...state.manualClusters, ...state.autoClusters];
      const res = runAutoPropagationAndSingleNotes(
        state.board,
        state.notes,
        state.eliminated,
        state.notes,
        allClusters,
        state.cascadeEnabled,
        true,
        state.gridSize,
        true
      );
      return {
        ...state,
        autoFillSingleNote: true,
        board: res.board,
        notes: res.notes,
        eliminated: res.eliminated,
        lastCollapseTrace: res.trace,
        past: res.trace.length > 0 ? [...state.past.slice(-29), snapshot] : state.past,
        future: res.trace.length > 0 ? [] : state.future,
      };
    }

    case "SET_SHOW_AUTO_CANDIDATES":
      return { ...state, showAutoCandidates: action.enabled };

    case "SET_SHOW_TETHERS":
      return { ...state, showTethers: action.enabled };

    case "SET_DIGIT": {
      if (state.puzzle && state.puzzle.givens[action.row]?.[action.col] !== 0) {
        return state;
      }
      if (state.board[action.row]?.[action.col] === action.digit) {
        return state;
      }
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      let nextBoard = cloneBoard(state.board);
      nextBoard[action.row][action.col] = action.digit;
      let nextNotes =
        action.digit !== 0
          ? prunePeerNotes(state.notes, action.row, action.col, action.digit, state.gridSize)
          : cloneNotes(state.notes);
      let nextElim = cloneEliminated(state.eliminated);
      delete nextElim[`${action.row},${action.col}`];

      let trace: CollapseStep[] = [];
      if (action.digit !== 0 && (state.cascadeEnabled || state.autoFillSingleNote)) {
        const allClusters = [...state.manualClusters, ...state.autoClusters];
        const propagated = runAutoPropagationAndSingleNotes(
          nextBoard,
          nextNotes,
          nextElim,
          state.notes,
          allClusters,
          state.cascadeEnabled,
          state.autoFillSingleNote,
          state.gridSize,
          false
        );
        nextBoard = propagated.board;
        nextNotes = propagated.notes;
        nextElim = propagated.eliminated;
        trace = propagated.trace;
      }

      return {
        ...state,
        board: nextBoard,
        notes: nextNotes,
        eliminated: nextElim,
        lastCollapseTrace: trace,
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "TOGGLE_NOTE": {
      if (state.board[action.row]?.[action.col] !== 0) {
        return state;
      }
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      let nextNotes = cloneNotes(state.notes);
      let prunedFromMultiple = false;
      if (action.digit === 0) {
        nextNotes[action.row][action.col] = [];
      } else {
        const curr = nextNotes[action.row][action.col];
        if (curr.includes(action.digit)) {
          prunedFromMultiple = curr.length >= 2;
          nextNotes[action.row][action.col] = curr.filter((d) => d !== action.digit);
        } else {
          nextNotes[action.row][action.col] = [...curr, action.digit].sort((a, b) => a - b);
        }
      }

      let nextBoard = cloneBoard(state.board);
      let nextElim = cloneEliminated(state.eliminated);
      let trace: CollapseStep[] = [];

      if (prunedFromMultiple && state.autoFillSingleNote) {
        const allClusters = [...state.manualClusters, ...state.autoClusters];
        const propagated = runAutoPropagationAndSingleNotes(
          nextBoard,
          nextNotes,
          nextElim,
          state.notes,
          allClusters,
          state.cascadeEnabled,
          true,
          state.gridSize,
          false
        );
        nextBoard = propagated.board;
        nextNotes = propagated.notes;
        nextElim = propagated.eliminated;
        trace = propagated.trace;
      }

      return {
        ...state,
        board: nextBoard,
        notes: nextNotes,
        eliminated: nextElim,
        lastCollapseTrace: trace,
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "AUTO_FILL_NOTES": {
      const size = state.gridSize;
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      const filled = createEmptyNotes(size);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (state.board[r][c] === 0) {
            filled[r][c] = [...(state.candidates[r]?.[c] ?? [])];
          }
        }
      }
      if (!state.autoFillSingleNote) {
        return {
          ...state,
          notes: filled,
          past: [...state.past.slice(-29), snapshot],
          future: [],
        };
      }
      const allClusters = [...state.manualClusters, ...state.autoClusters];
      const res = runAutoPropagationAndSingleNotes(
        state.board,
        filled,
        state.eliminated,
        filled,
        allClusters,
        state.cascadeEnabled,
        true,
        size,
        true
      );
      return {
        ...state,
        board: res.board,
        notes: res.notes,
        eliminated: res.eliminated,
        lastCollapseTrace: res.trace,
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "CLEAR_ALL_NOTES": {
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        notes: createEmptyNotes(state.gridSize),
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "APPLY_ANALYSIS": {
      const clusters = action.analysis.clusters;
      const stillExists = clusters.some((c) => c.id === state.activeClusterId);
      const nextActiveId = stillExists
        ? state.activeClusterId
        : clusters.length > 0
          ? clusters[0].id
          : null;
      return {
        ...state,
        candidates: action.analysis.candidates,
        superpositionCells: action.analysis.superposition_cells,
        autoClusters: clusters,
        activeClusterId: nextActiveId,
        conflicts: action.analysis.conflicts,
        valid: action.analysis.valid,
        solvable: action.analysis.solvable,
        uniqueSolution: action.analysis.unique_solution,
      };
    }

    case "SET_ENTANGLEMENT_MODE":
      return {
        ...state,
        entanglementMode: action.mode,
        manualPicking: false,
        manualCells: [],
      };

    case "SET_MANUAL_PICKING":
      return { ...state, manualPicking: action.enabled };

    case "TOGGLE_MANUAL_CELL": {
      const exists = state.manualCells.some(
        (c) => c.row === action.cell.row && c.col === action.cell.col
      );
      if (state.board[action.cell.row]?.[action.cell.col] !== 0) {
        return state;
      }
      const nextCells = exists
        ? state.manualCells.filter(
            (c) => !(c.row === action.cell.row && c.col === action.cell.col)
          )
        : [...state.manualCells.slice(-5), action.cell];

      let nextType = state.manualStateType;
      if (nextCells.length === 2 && nextType === "GHZ") {
        nextType = "BELL";
      } else if (nextCells.length >= 3 && nextType === "BELL") {
        nextType = "GHZ";
      }
      return {
        ...state,
        manualCells: nextCells,
        manualStateType: nextType,
        selectedCell: action.cell,
      };
    }

    case "CLEAR_MANUAL_CELLS":
      return { ...state, manualCells: [] };

    case "SET_MANUAL_STATE_TYPE":
      return { ...state, manualStateType: action.stateType };

    case "SET_MANUAL_DIGIT_A":
      return { ...state, manualDigitA: action.digit };

    case "SET_MANUAL_DIGIT_B":
      return { ...state, manualDigitB: action.digit };

    case "SET_MANUAL_CUSTOM_STATE":
      return { ...state, manualCustomState: action.expr };

    case "ADD_MANUAL_CLUSTER": {
      const filtered = state.manualClusters.filter((c) => c.id !== action.cluster.id);
      const nextClusters = [...filtered, action.cluster];
      return {
        ...state,
        manualClusters: nextClusters,
        activeManualClusterId: action.cluster.id,
        manualCells: [],
        manualPicking: false,
      };
    }

    case "SELECT_MANUAL_CLUSTER":
      return { ...state, activeManualClusterId: action.clusterId };

    case "DELETE_MANUAL_CLUSTER": {
      const nextClusters = state.manualClusters.filter((c) => c.id !== action.clusterId);
      const nextActive =
        state.activeManualClusterId === action.clusterId
          ? nextClusters[0]?.id ?? null
          : state.activeManualClusterId;
      return {
        ...state,
        manualClusters: nextClusters,
        activeManualClusterId: nextActive,
      };
    }

    case "SELECT_CLUSTER":
      return { ...state, activeClusterId: action.clusterId };

    case "SET_CASCADE":
      return { ...state, cascadeEnabled: action.enabled };

    case "APPLY_COLLAPSE": {
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      let nextNotes = cloneNotes(state.notes);
      for (const step of action.trace) {
        nextNotes = prunePeerNotes(nextNotes, step.row, step.col, step.digit, state.gridSize);
      }
      const remainingManual = state.manualClusters.filter((cl) =>
        cl.cells.some((c) => action.board[c.row][c.col] === 0)
      );
      const nextManualActive = remainingManual.some(
        (c) => c.id === state.activeManualClusterId
      )
        ? state.activeManualClusterId
        : remainingManual[0]?.id ?? null;

      return {
        ...state,
        board: cloneBoard(action.board),
        notes: nextNotes,
        eliminated: cloneEliminated(action.eliminated),
        lastCollapseTrace: action.trace,
        manualCells: [],
        manualPicking: false,
        manualClusters: remainingManual,
        activeManualClusterId: nextManualActive,
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "TICK_TIMER":
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const currSnapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        board: cloneBoard(prev.board),
        notes: cloneNotes(prev.notes),
        eliminated: cloneEliminated(prev.eliminated),
        lastCollapseTrace: [],
        past: state.past.slice(0, -1),
        future: [currSnapshot, ...state.future.slice(0, 29)],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const currSnapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        notes: cloneNotes(state.notes),
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        board: cloneBoard(next.board),
        notes: cloneNotes(next.notes),
        eliminated: cloneEliminated(next.eliminated),
        lastCollapseTrace: [],
        past: [...state.past, currSnapshot],
        future: state.future.slice(1),
      };
    }

    case "CLEAR_TRACE":
      return { ...state, lastCollapseTrace: [] };

    default:
      return state;
  }
}
