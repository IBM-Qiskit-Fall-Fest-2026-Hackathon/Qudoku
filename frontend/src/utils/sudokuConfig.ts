export type GridSize = 4 | 6 | 9 | 12 | 16;

export interface GridSpec {
  size: GridSize;
  boxRows: number;
  boxCols: number;
  symbols: string[];
  label: string;
}

export const GRID_SPECS: Record<GridSize, GridSpec> = {
  4: {
    size: 4,
    boxRows: 2,
    boxCols: 2,
    symbols: ["1", "2", "3", "4"],
    label: "4×4",
  },
  6: {
    size: 6,
    boxRows: 2,
    boxCols: 3,
    symbols: ["1", "2", "3", "4", "5", "6"],
    label: "6×6",
  },
  9: {
    size: 9,
    boxRows: 3,
    boxCols: 3,
    symbols: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    label: "9×9",
  },
  12: {
    size: 12,
    boxRows: 3,
    boxCols: 4,
    symbols: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C"],
    label: "12×12",
  },
  16: {
    size: 16,
    boxRows: 4,
    boxCols: 4,
    symbols: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F"],
    label: "16×16 (Hex)",
  },
};

export const SUPPORTED_SIZES: GridSize[] = [4, 6, 9, 12, 16];

export function isSupportedGridSize(n: number): n is GridSize {
  return n === 4 || n === 6 || n === 9 || n === 12 || n === 16;
}

export function getGridSpec(size: number): GridSpec {
  return isSupportedGridSize(size) ? GRID_SPECS[size] : GRID_SPECS[9];
}

export function valueToSymbol(val: number, size: number): string {
  if (val <= 0) return "";
  const spec = getGridSpec(size);
  return spec.symbols[val - 1] ?? String(val);
}

export function symbolToValue(ch: string, size: number): number | null {
  const spec = getGridSpec(size);
  const idx = spec.symbols.indexOf(ch.toUpperCase());
  return idx >= 0 ? idx + 1 : null;
}

export function getBoxIndex(row: number, col: number, size: number): number {
  const { boxRows, boxCols } = getGridSpec(size);
  const boxesPerRow = size / boxCols;
  return Math.floor(row / boxRows) * boxesPerRow + Math.floor(col / boxCols);
}
