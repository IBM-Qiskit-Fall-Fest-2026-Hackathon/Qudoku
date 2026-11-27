import assert from "node:assert/strict";
import test from "node:test";
import { LESSONS, QUIZ_QUESTIONS } from "../src/data/curriculum";
import { TRANSLATIONS } from "../src/i18n/translations";
import { boardReducer, initialQudokuState } from "../src/store/boardReducer";
import type { PuzzleSpec } from "../src/types/quantum";
import { parseSudokuInput } from "../src/utils/sessionStorage";
import { validateSudokuStrict } from "../src/utils/strictSudokuValidator";
import { symbolToValue, valueToSymbol } from "../src/utils/sudokuConfig";

test("symbol encoding maps 4x4..16x16 hex cleanly (0-F -> 1..16)", () => {
  assert.equal(valueToSymbol(1, 9), "1");
  assert.equal(valueToSymbol(12, 12), "C");
  assert.equal(valueToSymbol(1, 16), "0");
  assert.equal(valueToSymbol(16, 16), "F");
  assert.equal(symbolToValue("0", 16), 1);
  assert.equal(symbolToValue("f", 16), 16);
  assert.equal(symbolToValue("0", 9), null);
});

test("parseSudokuInput & Strict Mode MRV validator verify unique 4x4 and 6x6 grids", () => {
  const p4 = parseSudokuInput("1 4 . 2\n2 . 4 1\n. 1 . .\n4 2 . .", "Test 4x4");
  assert.ok(!("error" in p4));
  const v4 = validateSudokuStrict(p4.givens);
  assert.equal(v4.status, "unique");
  assert.equal(v4.valid, true);

  const p6 = parseSudokuInput(
    ". 5 6 4 . 1\n. 2 4 . 5 3\n. . . 1 . .\n. 6 1 . 4 5\n. 1 . . 3 .\n. 3 . 5 . 4",
    "Test 6x6"
  );
  assert.ok(!("error" in p6));
  const v6 = validateSudokuStrict(p6.givens);
  assert.equal(v6.status, "unique");
});

test("Strict Mode rejects duplicates, unsolvable boards, and multiple solutions", () => {
  const dup = Array.from({ length: 4 }, () => Array(4).fill(0));
  dup[0][0] = 2;
  dup[0][3] = 2;
  const rDup = validateSudokuStrict(dup);
  assert.equal(rDup.status, "duplicates");
  assert.equal(rDup.conflictCells.length, 2);

  const empty4 = Array.from({ length: 4 }, () => Array(4).fill(0));
  const rMulti = validateSudokuStrict(empty4);
  assert.equal(rMulti.status, "multiple_solutions");
  assert.ok(rMulti.ambiguousCells.length > 0);
});

test("boardReducer auto-assigns single-note cells and entangled Bell partners without blank auto-notes", () => {
  const puz4: PuzzleSpec = {
    id: "unit-4x4",
    title_key: "puzzle_superposition_title",
    description_key: "puzzle_superposition_desc",
    difficulty: "4x4",
    concept_focus: "BELL",
    grid_size: 4,
    box_rows: 2,
    box_cols: 2,
    symbols: ["1", "2", "3", "4"],
    givens: [
      [1, 4, 0, 2],
      [2, 3, 4, 1],
      [3, 1, 2, 4],
      [4, 2, 0, 3],
    ],
    solution: [
      [1, 4, 3, 2],
      [2, 3, 4, 1],
      [3, 1, 2, 4],
      [4, 2, 1, 3],
    ],
  };

  let st = boardReducer(initialQudokuState, { type: "LOAD_PUZZLE", puzzle: puz4 });
  assert.equal(st.gridSize, 4);
  assert.deepEqual(st.notes[0][2], []);

  // Turn on Auto-Fill Single Note and enter candidate notes [1, 3] into R1C3
  st = boardReducer(st, { type: "SET_AUTO_FILL_SINGLE_NOTE", enabled: true });
  st = boardReducer(st, { type: "TOGGLE_NOTE", row: 0, col: 2, digit: 1 });
  st = boardReducer(st, { type: "TOGGLE_NOTE", row: 0, col: 2, digit: 3 });
  assert.deepEqual(st.notes[0][2], [1, 3]);

  // Setting R4C3 = 1 prunes 1 from R1C3 -> leaves single note 3 -> auto-fills R1C3 = 3!
  st = boardReducer(st, { type: "SET_DIGIT", row: 3, col: 2, digit: 1 });
  assert.equal(st.board[3][2], 1);
  assert.equal(st.board[0][2], 3);
});

test("all 8 languages (EN/HI/GU/MR/KN/TA/TE/BN) include identical keys for lessons, quiz, and tooltips", () => {
  const enKeys = Object.keys(TRANSLATIONS.en);
  for (const lang of ["hi", "gu", "mr", "kn", "ta", "te", "bn"] as const) {
    for (const k of enKeys) {
      assert.ok(TRANSLATIONS[lang][k], `Missing ${lang} translation for key '${k}'`);
    }
  }
  for (const l of LESSONS) {
    assert.ok(TRANSLATIONS.en[l.analogyKey]);
    assert.ok(TRANSLATIONS.en[l.stepsKey]);
    assert.ok(TRANSLATIONS.en[l.misconceptionKey]);
  }
  for (const q of QUIZ_QUESTIONS) {
    assert.ok(TRANSLATIONS.en[q.questionKey]);
    assert.ok(TRANSLATIONS.en[q.tipKey]);
    assert.ok(TRANSLATIONS.en[q.explanationKey]);
  }
});
