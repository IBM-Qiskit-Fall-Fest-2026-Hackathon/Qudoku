import type { PuzzleSpec, SessionGameRecord } from "../types/quantum";
import { createEmptyNotes } from "../store/boardReducer";
import { isSupportedGridSize, symbolToValue, type GridSize } from "./sudokuConfig";

const SESSION_GAMES_KEY = "qudoku_session_games_v1";
const ACTIVE_PUZZLE_KEY = "qudoku_active_puzzle_id_v1";

export function loadSessionGames(): Record<string, SessionGameRecord> {
  try {
    const raw = window.sessionStorage.getItem(SESSION_GAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SessionGameRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSessionGame(record: SessionGameRecord): Record<string, SessionGameRecord> {
  const all = loadSessionGames();
  all[record.puzzle.id] = record;
  try {
    window.sessionStorage.setItem(SESSION_GAMES_KEY, JSON.stringify(all));
    window.sessionStorage.setItem(ACTIVE_PUZZLE_KEY, record.puzzle.id);
  } catch {
    // Ignore sessionStorage quota errors gracefully
  }
  return all;
}

export function deleteSessionGame(puzzleId: string): Record<string, SessionGameRecord> {
  const all = loadSessionGames();
  delete all[puzzleId];
  try {
    window.sessionStorage.setItem(SESSION_GAMES_KEY, JSON.stringify(all));
    if (window.sessionStorage.getItem(ACTIVE_PUZZLE_KEY) === puzzleId) {
      window.sessionStorage.removeItem(ACTIVE_PUZZLE_KEY);
    }
  } catch {
    // Ignore
  }
  return all;
}

export function clearAllSessionGames(): void {
  try {
    window.sessionStorage.removeItem(SESSION_GAMES_KEY);
    window.sessionStorage.removeItem(ACTIVE_PUZZLE_KEY);
  } catch {
    // Ignore
  }
}

export function getActiveSessionPuzzleId(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_PUZZLE_KEY);
  } catch {
    return null;
  }
}

export function createInitialRecord(puzzle: PuzzleSpec): SessionGameRecord {
  const size = puzzle.givens.length || 9;
  return {
    puzzle,
    board: puzzle.givens.map((row) => [...row]),
    notes: createEmptyNotes(size),
    eliminated: {},
    elapsedSeconds: 0,
    solved: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Parse arbitrary 4x4, 6x6, 9x9, 12x12, or 16x16 (hex) Sudoku text/JSON formats:
 * - JSON: { title?, givens: number[][] | string[][] } or raw NxN array
 * - Delimited rows or flat N*N token stream:
 *   - For 16x16 hex: '.'/'_'/'-' = empty (0); '0'-'9','A'-'F' = symbols 1..16
 *   - For 4/6/9/12: '0'/'.'/'_' = empty (0); '1'-'9','A'-'C' = symbols 1..N
 */
export function parseSudokuInput(
  rawText: string,
  fallbackTitle = "Custom Uploaded Sudoku",
  preferredSize?: GridSize
): { givens: number[][]; size: GridSize; title: string } | { error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { error: "Input is empty." };
  }

  // 1. Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const gridCandidate = Array.isArray(parsed) ? parsed : parsed?.givens;
      if (Array.isArray(gridCandidate) && isSupportedGridSize(gridCandidate.length)) {
        const size = gridCandidate.length as GridSize;
        const validRows = gridCandidate.every(
          (row) => Array.isArray(row) && row.length === size
        );
        if (validRows) {
          const givens: number[][] = [];
          let ok = true;
          for (const row of gridCandidate) {
            const outRow: number[] = [];
            for (const cell of row) {
              if (typeof cell === "number" && Number.isInteger(cell) && cell >= 0 && cell <= size) {
                outRow.push(cell);
              } else if (typeof cell === "string") {
                const s = cell.trim();
                if (!s || s === "." || s === "_" || (size !== 16 && s === "0")) {
                  outRow.push(0);
                } else {
                  const mapped = symbolToValue(s, size);
                  if (mapped === null) {
                    ok = false;
                    break;
                  }
                  outRow.push(mapped);
                }
              } else {
                ok = false;
                break;
              }
            }
            if (!ok) break;
            givens.push(outRow);
          }
          if (ok) {
            const title =
              typeof parsed?.title === "string" && parsed.title.trim()
                ? parsed.title.trim()
                : fallbackTitle;
            return { givens, size, title };
          }
        }
      }
    } catch {
      // Fall through to text parser
    }
  }

  // 2. Text / Grid parser
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//") && !/^[-+|=]+$/.test(l));

  // If whitespace/comma separated tokens (e.g. 10, 11, 12 for 12x12 or hex tokens)
  const spaceTokens = lines
    .join(" ")
    .replace(/[,|]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const inferSizeFromCount = (cnt: number): GridSize | null => {
    if (cnt === 16) return 4;
    if (cnt === 36) return 6;
    if (cnt === 81) return 9;
    if (cnt === 144) return 12;
    if (cnt === 256) return 16;
    return null;
  };

  if (spaceTokens.length >= 16 && inferSizeFromCount(spaceTokens.length) !== null) {
    const size = inferSizeFromCount(spaceTokens.length)!;
    const givens: number[][] = [];
    let ok = true;
    const flat: number[] = [];
    for (const tok of spaceTokens) {
      if (tok === "." || tok === "_" || tok === "-" || (size !== 16 && tok === "0")) {
        flat.push(0);
      } else if (/^\d+$/.test(tok) && Number(tok) >= 1 && Number(tok) <= size && (size !== 16 || tok.length > 1)) {
        flat.push(Number(tok));
      } else {
        const mapped = symbolToValue(tok, size);
        if (mapped === null) {
          ok = false;
          break;
        }
        flat.push(mapped);
      }
    }
    if (ok && flat.length === size * size) {
      for (let r = 0; r < size; r++) {
        givens.push(flat.slice(r * size, (r + 1) * size));
      }
      return { givens, size, title: fallbackTitle };
    }
  }

  // Character-by-character compact extraction
  const compactChars = lines
    .join("")
    .replace(/[\s,|]/g, "")
    .split("")
    .filter((ch) => /[0-9a-fA-F._-]/.test(ch));

  const detectedSize = inferSizeFromCount(compactChars.length) ?? preferredSize ?? null;
  if (detectedSize && compactChars.length === detectedSize * detectedSize) {
    const flat: number[] = [];
    for (const ch of compactChars) {
      if (ch === "." || ch === "_" || ch === "-" || (detectedSize !== 16 && ch === "0")) {
        flat.push(0);
      } else {
        const mapped = symbolToValue(ch, detectedSize);
        if (mapped === null) {
          return {
            error: `Invalid symbol '${ch}' for ${detectedSize}×${detectedSize} Sudoku.`,
          };
        }
        flat.push(mapped);
      }
    }
    const givens: number[][] = [];
    for (let r = 0; r < detectedSize; r++) {
      givens.push(flat.slice(r * detectedSize, (r + 1) * detectedSize));
    }
    return { givens, size: detectedSize, title: fallbackTitle };
  }

  return {
    error: `Expected 16 (4×4), 36 (6×6), 81 (9×9), 144 (12×12), or 256 (16×16) Sudoku cells, found ${compactChars.length}. (For 16×16 hex, use '.' for empty cells.)`,
  };
}
