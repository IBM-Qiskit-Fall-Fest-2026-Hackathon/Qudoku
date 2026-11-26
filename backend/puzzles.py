"""Curated 9x9 Sudoku puzzles tailored for quantum computing pedagogy and sandbox play."""

from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel


class PuzzleSpec(BaseModel):
    id: str
    title_key: str
    description_key: str
    difficulty: str
    concept_focus: str
    givens: List[List[int]]
    solution: List[List[int]]


PUZZLES: List[PuzzleSpec] = [
    PuzzleSpec(
        id="tutorial-superposition",
        title_key="puzzle_superposition_title",
        description_key="puzzle_superposition_desc",
        difficulty="Tutorial 1",
        concept_focus="SUPERPOSITION",
        givens=[
            [5, 0, 4, 6, 7, 8, 0, 1, 0],
            [6, 0, 2, 1, 9, 5, 3, 4, 8],
            [1, 0, 8, 0, 4, 2, 0, 6, 7],
            [0, 5, 9, 0, 6, 1, 4, 2, 3],
            [0, 0, 0, 8, 0, 3, 7, 0, 1],
            [0, 0, 0, 9, 0, 4, 0, 5, 0],
            [9, 6, 1, 5, 3, 0, 2, 0, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 0],
            [3, 0, 5, 2, 8, 0, 1, 7, 9],
        ],
        solution=[
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
    ),
    PuzzleSpec(
        id="tutorial-bell",
        title_key="puzzle_bell_title",
        description_key="puzzle_bell_desc",
        difficulty="Tutorial 2",
        concept_focus="BELL",
        givens=[
            [5, 0, 0, 0, 0, 8, 0, 1, 2],
            [0, 0, 2, 1, 9, 5, 0, 0, 0],
            [1, 9, 8, 0, 0, 0, 5, 6, 7],
            [0, 0, 0, 7, 0, 1, 0, 0, 3],
            [4, 0, 6, 8, 5, 0, 7, 0, 1],
            [0, 1, 3, 0, 2, 4, 0, 5, 6],
            [9, 6, 1, 0, 0, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 0],
            [3, 4, 5, 0, 0, 6, 0, 7, 0],
        ],
        solution=[
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
    ),
    PuzzleSpec(
        id="tutorial-ghz",
        title_key="puzzle_ghz_title",
        description_key="puzzle_ghz_desc",
        difficulty="Tutorial 3",
        concept_focus="GHZ",
        givens=[
            [5, 0, 4, 6, 7, 8, 9, 0, 0],
            [6, 7, 2, 0, 9, 5, 0, 4, 8],
            [0, 0, 0, 3, 4, 0, 5, 6, 7],
            [8, 5, 9, 0, 6, 0, 0, 2, 3],
            [0, 2, 6, 0, 0, 3, 7, 0, 1],
            [7, 0, 3, 9, 0, 0, 8, 0, 0],
            [9, 0, 0, 0, 0, 0, 2, 0, 0],
            [0, 8, 0, 0, 1, 0, 6, 0, 5],
            [3, 4, 5, 2, 8, 0, 0, 7, 9],
        ],
        solution=[
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
    ),
    PuzzleSpec(
        id="tutorial-wstate",
        title_key="puzzle_wstate_title",
        description_key="puzzle_wstate_desc",
        difficulty="Tutorial 4",
        concept_focus="W",
        givens=[
            [0, 3, 4, 6, 0, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 0, 3, 0, 0, 5, 6, 0],
            [0, 0, 9, 7, 0, 0, 4, 2, 3],
            [0, 2, 0, 0, 5, 3, 7, 9, 1],
            [7, 1, 0, 9, 0, 4, 0, 0, 0],
            [0, 6, 0, 5, 0, 0, 2, 8, 0],
            [0, 8, 7, 4, 1, 0, 0, 3, 0],
            [3, 0, 5, 2, 8, 0, 1, 0, 9],
        ],
        solution=[
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
    ),
    PuzzleSpec(
        id="sandbox-classic",
        title_key="puzzle_classic_title",
        description_key="puzzle_classic_desc",
        difficulty="Sandbox · Medium",
        concept_focus="MIXED",
        givens=[
            [5, 3, 0, 0, 7, 0, 0, 0, 0],
            [6, 0, 0, 1, 9, 5, 0, 0, 0],
            [0, 9, 8, 0, 0, 0, 0, 6, 0],
            [8, 0, 0, 0, 6, 0, 0, 0, 3],
            [4, 0, 0, 8, 0, 3, 0, 0, 1],
            [7, 0, 0, 0, 2, 0, 0, 0, 6],
            [0, 6, 0, 0, 0, 0, 2, 8, 0],
            [0, 0, 0, 4, 1, 9, 0, 0, 5],
            [0, 0, 0, 0, 8, 0, 0, 7, 9],
        ],
        solution=[
            [5, 3, 4, 6, 7, 8, 9, 1, 2],
            [6, 7, 2, 1, 9, 5, 3, 4, 8],
            [1, 9, 8, 3, 4, 2, 5, 6, 7],
            [8, 5, 9, 7, 6, 1, 4, 2, 3],
            [4, 2, 6, 8, 5, 3, 7, 9, 1],
            [7, 1, 3, 9, 2, 4, 8, 5, 6],
            [9, 6, 1, 5, 3, 7, 2, 8, 4],
            [2, 8, 7, 4, 1, 9, 6, 3, 5],
            [3, 4, 5, 2, 8, 6, 1, 7, 9],
        ],
    ),
    PuzzleSpec(
        id="sandbox-challenge",
        title_key="puzzle_challenge_title",
        description_key="puzzle_challenge_desc",
        difficulty="Sandbox · Hard",
        concept_focus="MIXED",
        givens=[
            [0, 0, 0, 6, 0, 0, 4, 0, 0],
            [7, 0, 0, 0, 0, 3, 6, 0, 0],
            [0, 0, 0, 0, 9, 1, 0, 8, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 5, 0, 1, 8, 0, 0, 0, 3],
            [0, 0, 0, 3, 0, 6, 0, 4, 5],
            [0, 4, 0, 2, 0, 0, 0, 6, 0],
            [9, 0, 3, 0, 0, 0, 0, 0, 0],
            [0, 2, 0, 0, 0, 0, 1, 0, 0],
        ],
        solution=[
            [5, 8, 1, 6, 7, 2, 4, 3, 9],
            [7, 9, 2, 8, 4, 3, 6, 5, 1],
            [3, 6, 4, 5, 9, 1, 7, 8, 2],
            [4, 3, 8, 9, 5, 7, 2, 1, 6],
            [2, 5, 6, 1, 8, 4, 9, 7, 3],
            [1, 7, 9, 3, 2, 6, 8, 4, 5],
            [8, 4, 5, 2, 1, 9, 3, 6, 7],
            [9, 1, 3, 7, 6, 8, 5, 2, 4],
            [6, 2, 7, 4, 3, 5, 1, 9, 8],
        ],
    ),
]

PUZZLE_MAP: Dict[str, PuzzleSpec] = {p.id: p for p in PUZZLES}
