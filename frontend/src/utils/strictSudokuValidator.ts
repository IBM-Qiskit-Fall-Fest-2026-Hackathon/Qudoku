import { getBoxIndex, getGridSpec, isSupportedGridSize } from "./sudokuConfig";

export interface CellPosition {
  row: number;
  col: number;
}

export type StrictValidationStatus =
  | "duplicates"
  | "no_solution"
  | "unique"
  | "multiple_solutions";

export interface StrictValidationResult {
  status: StrictValidationStatus;
  valid: boolean;
  message: string;
  solutionCount: number;
  conflictCells: CellPosition[];
  ambiguousCells: CellPosition[];
  firstSolution: number[][] | null;
  secondSolution: number[][] | null;
  durationMs: number;
}

function popcount(mask: number): number {
  let m = mask;
  let c = 0;
  while (m !== 0) {
    m &= m - 1;
    c++;
  }
  return c;
}

/**
 * Check immediate Sudoku rule violations (duplicates in row, column, or box)
 * across any supported NxN Sudoku size (4, 6, 9, 12, 16).
 */
export function prevalidateDuplicates(board: number[][]): {
  conflictCells: CellPosition[];
  hasRowDup: boolean;
  hasColDup: boolean;
  hasBoxDup: boolean;
} {
  const size = board.length;
  const { boxRows, boxCols } = getGridSpec(size);
  const boxesPerRow = size / boxCols;
  const conflictSet = new Set<string>();
  let hasRowDup = false;
  let hasColDup = false;
  let hasBoxDup = false;

  // Rows
  for (let r = 0; r < size; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < size; c++) {
      const v = board[r][c];
      if (v >= 1 && v <= size) {
        const list = seen.get(v) ?? [];
        list.push(c);
        seen.set(v, list);
      }
    }
    for (const cols of seen.values()) {
      if (cols.length > 1) {
        hasRowDup = true;
        for (const c of cols) conflictSet.add(`${r},${c}`);
      }
    }
  }

  // Columns
  for (let c = 0; c < size; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < size; r++) {
      const v = board[r][c];
      if (v >= 1 && v <= size) {
        const list = seen.get(v) ?? [];
        list.push(r);
        seen.set(v, list);
      }
    }
    for (const rows of seen.values()) {
      if (rows.length > 1) {
        hasColDup = true;
        for (const r of rows) conflictSet.add(`${r},${c}`);
      }
    }
  }

  // Boxes (boxRows x boxCols)
  for (let b = 0; b < size; b++) {
    const br = Math.floor(b / boxesPerRow) * boxRows;
    const bc = (b % boxesPerRow) * boxCols;
    const seen = new Map<number, CellPosition[]>();
    for (let dr = 0; dr < boxRows; dr++) {
      for (let dc = 0; dc < boxCols; dc++) {
        const r = br + dr;
        const c = bc + dc;
        const v = board[r][c];
        if (v >= 1 && v <= size) {
          const list = seen.get(v) ?? [];
          list.push({ row: r, col: c });
          seen.set(v, list);
        }
      }
    }
    for (const cells of seen.values()) {
      if (cells.length > 1) {
        hasBoxDup = true;
        for (const pt of cells) conflictSet.add(`${pt.row},${pt.col}`);
      }
    }
  }

  const conflictCells = Array.from(conflictSet).map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { row: r, col: c };
  });

  return { conflictCells, hasRowDup, hasColDup, hasBoxDup };
}

function formatDuplicateMessage(
  hasRowDup: boolean,
  hasColDup: boolean,
  hasBoxDup: boolean,
  boxRows: number,
  boxCols: number
): string {
  const parts: string[] = [];
  if (hasRowDup) parts.push("a row");
  if (hasColDup) parts.push("a column");
  if (hasBoxDup) parts.push(`a ${boxRows}×${boxCols} box`);

  let joined = `a row, column, or ${boxRows}×${boxCols} box`;
  if (parts.length === 1) {
    joined = parts[0];
  } else if (parts.length === 2) {
    joined = `${parts[0]} and ${parts[1]}`;
  } else if (parts.length === 3) {
    joined = `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
  }
  return `Invalid Sudoku: Duplicate symbols found in ${joined}.`;
}

/**
 * Client-side Strict Mode Sudoku Validator & MRV Stop-at-2 Uniqueness Solver
 * supporting 4x4, 6x6, 9x9, 12x12, and 16x16 grids.
 */
export function validateSudokuStrict(board: number[][]): StrictValidationResult {
  const t0 = performance.now();
  const size = board.length;
  if (!isSupportedGridSize(size)) {
    return {
      status: "no_solution",
      valid: false,
      message: `Unsupported grid size ${size}×${size}.`,
      solutionCount: 0,
      conflictCells: [],
      ambiguousCells: [],
      firstSolution: null,
      secondSolution: null,
      durationMs: 0,
    };
  }

  const { boxRows, boxCols } = getGridSpec(size);

  // 1. Input Pre-Validation
  const { conflictCells, hasRowDup, hasColDup, hasBoxDup } =
    prevalidateDuplicates(board);
  if (conflictCells.length > 0) {
    return {
      status: "duplicates",
      valid: false,
      message: formatDuplicateMessage(hasRowDup, hasColDup, hasBoxDup, boxRows, boxCols),
      solutionCount: 0,
      conflictCells,
      ambiguousCells: [],
      firstSolution: null,
      secondSolution: null,
      durationMs: Number((performance.now() - t0).toFixed(2)),
    };
  }

  // 2. Bitmask MRV Stop-at-2 Backtracking Solver
  const allMask = ((1 << size) - 1) << 1; // bits 1..size
  const working = board.map((row) => [...row]);
  const rowMask = new Int32Array(size);
  const colMask = new Int32Array(size);
  const boxMask = new Int32Array(size);
  const empties: number[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = working[r][c];
      if (v >= 1 && v <= size) {
        const bit = 1 << v;
        rowMask[r] |= bit;
        colMask[c] |= bit;
        boxMask[getBoxIndex(r, c, size)] |= bit;
      } else {
        empties.push(r * size + c);
      }
    }
  }

  let solutionCount = 0;
  let firstSolution: number[][] | null = null;
  let secondSolution: number[][] | null = null;
  let nodes = 0;
  const maxNodes = size >= 12 ? 350_000 : 1_000_000;

  function backtrack(filledCount: number): void {
    if (solutionCount >= 2 || nodes >= maxNodes) return;
    nodes++;
    if (filledCount === empties.length) {
      solutionCount++;
      const copy = working.map((row) => [...row]);
      if (solutionCount === 1) {
        firstSolution = copy;
      } else if (solutionCount === 2) {
        secondSolution = copy;
      }
      return;
    }

    let bestIdx = -1;
    let bestCount = size + 2;
    let bestCands = 0;

    for (let i = filledCount; i < empties.length; i++) {
      const cellId = empties[i];
      const r = Math.floor(cellId / size);
      const c = cellId % size;
      const b = getBoxIndex(r, c, size);
      const avail = allMask & ~(rowMask[r] | colMask[c] | boxMask[b]);
      const cnt = popcount(avail);
      if (cnt === 0) return;
      if (cnt < bestCount) {
        bestCount = cnt;
        bestIdx = i;
        bestCands = avail;
        if (cnt === 1) break;
      }
    }

    const chosenCell = empties[bestIdx];
    empties[bestIdx] = empties[filledCount];
    empties[filledCount] = chosenCell;

    const r = Math.floor(chosenCell / size);
    const c = chosenCell % size;
    const b = getBoxIndex(r, c, size);

    let mask = bestCands;
    while (mask !== 0 && solutionCount < 2 && nodes < maxNodes) {
      const bit = mask & -mask;
      mask ^= bit;
      const digit = Math.clz32(bit) ^ 31;

      working[r][c] = digit;
      rowMask[r] |= bit;
      colMask[c] |= bit;
      boxMask[b] |= bit;

      backtrack(filledCount + 1);

      working[r][c] = 0;
      rowMask[r] ^= bit;
      colMask[c] ^= bit;
      boxMask[b] ^= bit;
    }

    empties[filledCount] = empties[bestIdx];
    empties[bestIdx] = chosenCell;
  }

  backtrack(0);
  const durationMs = Number((performance.now() - t0).toFixed(2));

  if (solutionCount === 0) {
    return {
      status: "no_solution",
      valid: false,
      message: "Invalid Sudoku: This puzzle has no valid solution.",
      solutionCount: 0,
      conflictCells: [],
      ambiguousCells: [],
      firstSolution: null,
      secondSolution: null,
      durationMs,
    };
  }

  if (solutionCount === 1) {
    return {
      status: "unique",
      valid: true,
      message: "Valid Sudoku: Unique solution verified.",
      solutionCount: 1,
      conflictCells: [],
      ambiguousCells: [],
      firstSolution,
      secondSolution: null,
      durationMs,
    };
  }

  const ambiguousCells: CellPosition[] = [];
  if (firstSolution && secondSolution) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (firstSolution[r][c] !== secondSolution[r][c]) {
          ambiguousCells.push({ row: r, col: c });
        }
      }
    }
  }

  return {
    status: "multiple_solutions",
    valid: false,
    message:
      "Invalid Sudoku: Multiple solutions exist. A valid Sudoku must have exactly one unique solution. Add more clues to resolve the ambiguity.",
    solutionCount: 2,
    conflictCells: [],
    ambiguousCells,
    firstSolution,
    secondSolution,
    durationMs,
  };
}
