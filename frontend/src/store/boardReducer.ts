import type {
  AnalyzeBoardResponse,
  CellCoord,
  CollapseStep,
  EntanglementCluster,
  EntanglementMode,
  PuzzleSpec,
  StateType,
  SuperpositionCell,
} from "../types/quantum";

export interface BoardSnapshot {
  board: number[][];
  eliminated: Record<string, number[]>;
}

export interface QudokuState {
  puzzle: PuzzleSpec | null;
  board: number[][];
  eliminated: Record<string, number[]>;
  selectedCell: CellCoord | null;
  entanglementMode: EntanglementMode;
  manualCells: CellCoord[];
  manualStateType: StateType;
  manualTargetDigit: number | null;
  manualCluster: EntanglementCluster | null;
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
  past: BoardSnapshot[];
  future: BoardSnapshot[];
}

export type QudokuAction =
  | { type: "LOAD_PUZZLE"; puzzle: PuzzleSpec }
  | { type: "RESET_PUZZLE" }
  | { type: "SELECT_CELL"; cell: CellCoord | null }
  | { type: "SET_DIGIT"; row: number; col: number; digit: number }
  | { type: "APPLY_ANALYSIS"; analysis: AnalyzeBoardResponse }
  | { type: "SET_ENTANGLEMENT_MODE"; mode: EntanglementMode }
  | { type: "TOGGLE_MANUAL_CELL"; cell: CellCoord }
  | { type: "CLEAR_MANUAL_CELLS" }
  | { type: "SET_MANUAL_STATE_TYPE"; stateType: StateType }
  | { type: "SET_MANUAL_TARGET_DIGIT"; digit: number | null }
  | { type: "SET_MANUAL_CLUSTER"; cluster: EntanglementCluster | null }
  | { type: "SELECT_CLUSTER"; clusterId: string | null }
  | { type: "SET_CASCADE"; enabled: boolean }
  | {
      type: "APPLY_COLLAPSE";
      board: number[][];
      eliminated: Record<string, number[]>;
      trace: CollapseStep[];
    }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR_TRACE" };

function cloneBoard(board: number[][]): number[][] {
  return board.map((row) => [...row]);
}

function cloneEliminated(elim: Record<string, number[]>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(elim)) {
    out[k] = [...v];
  }
  return out;
}

function emptyBoard(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

export const initialQudokuState: QudokuState = {
  puzzle: null,
  board: emptyBoard(),
  eliminated: {},
  selectedCell: null,
  entanglementMode: "auto",
  manualCells: [],
  manualStateType: "BELL",
  manualTargetDigit: null,
  manualCluster: null,
  autoClusters: [],
  activeClusterId: null,
  candidates: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])),
  superpositionCells: [],
  conflicts: [],
  valid: true,
  solvable: true,
  uniqueSolution: true,
  cascadeEnabled: true,
  lastCollapseTrace: [],
  past: [],
  future: [],
};

export function boardReducer(state: QudokuState, action: QudokuAction): QudokuState {
  switch (action.type) {
    case "LOAD_PUZZLE": {
      return {
        ...state,
        puzzle: action.puzzle,
        board: cloneBoard(action.puzzle.givens),
        eliminated: {},
        selectedCell: null,
        manualCells: [],
        manualCluster: null,
        activeClusterId: null,
        lastCollapseTrace: [],
        past: [],
        future: [],
      };
    }

    case "RESET_PUZZLE": {
      if (!state.puzzle) return state;
      return {
        ...state,
        board: cloneBoard(state.puzzle.givens),
        eliminated: {},
        selectedCell: null,
        manualCells: [],
        manualCluster: null,
        activeClusterId: null,
        lastCollapseTrace: [],
        past: [],
        future: [],
      };
    }

    case "SELECT_CELL":
      return { ...state, selectedCell: action.cell };

    case "SET_DIGIT": {
      if (state.puzzle && state.puzzle.givens[action.row][action.col] !== 0) {
        return state;
      }
      if (state.board[action.row][action.col] === action.digit) {
        return state;
      }
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        eliminated: cloneEliminated(state.eliminated),
      };
      const nextBoard = cloneBoard(state.board);
      nextBoard[action.row][action.col] = action.digit;
      const nextElim = cloneEliminated(state.eliminated);
      delete nextElim[`${action.row},${action.col}`];
      return {
        ...state,
        board: nextBoard,
        eliminated: nextElim,
        lastCollapseTrace: [],
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
        manualCells: [],
        manualCluster: null,
      };

    case "TOGGLE_MANUAL_CELL": {
      const exists = state.manualCells.some(
        (c) => c.row === action.cell.row && c.col === action.cell.col
      );
      if (state.board[action.cell.row][action.cell.col] !== 0) {
        return state;
      }
      const nextCells = exists
        ? state.manualCells.filter(
            (c) => !(c.row === action.cell.row && c.col === action.cell.col)
          )
        : [...state.manualCells.slice(-5), action.cell];
      return { ...state, manualCells: nextCells, selectedCell: action.cell };
    }

    case "CLEAR_MANUAL_CELLS":
      return { ...state, manualCells: [], manualCluster: null };

    case "SET_MANUAL_STATE_TYPE":
      return { ...state, manualStateType: action.stateType };

    case "SET_MANUAL_TARGET_DIGIT":
      return { ...state, manualTargetDigit: action.digit };

    case "SET_MANUAL_CLUSTER":
      return { ...state, manualCluster: action.cluster };

    case "SELECT_CLUSTER":
      return { ...state, activeClusterId: action.clusterId };

    case "SET_CASCADE":
      return { ...state, cascadeEnabled: action.enabled };

    case "APPLY_COLLAPSE": {
      const snapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        board: cloneBoard(action.board),
        eliminated: cloneEliminated(action.eliminated),
        lastCollapseTrace: action.trace,
        manualCells: [],
        manualCluster: null,
        past: [...state.past.slice(-29), snapshot],
        future: [],
      };
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const currSnapshot: BoardSnapshot = {
        board: cloneBoard(state.board),
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        board: cloneBoard(prev.board),
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
        eliminated: cloneEliminated(state.eliminated),
      };
      return {
        ...state,
        board: cloneBoard(next.board),
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
