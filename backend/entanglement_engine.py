"""Generic Exact Cover Sudoku solver, implication graph analyzer, and entanglement cluster detector."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, List, Literal, Optional, Set, Tuple

from pydantic import BaseModel, Field

StateType = Literal["SUPERPOSITION", "BELL", "GHZ", "W"]


class CellCoord(BaseModel):
    row: int = Field(ge=0, le=8)
    col: int = Field(ge=0, le=8)


class EntanglementCluster(BaseModel):
    id: str
    state_type: StateType
    cells: List[CellCoord]
    # For BELL / GHZ: digit_map[i] = [digit_for_0, digit_for_1] (or [0, digit] for presence)
    # For W: target_digit is the shared digit where exactly one cell holds |1> -> target_digit
    target_digit: Optional[int] = None
    candidate_pair: Optional[List[int]] = None
    parity: List[int] = Field(default_factory=list)
    house_label: str = ""
    mechanism: str = ""
    consistent: bool = True
    diagnostic: str = ""
    is_manual: bool = False


class SuperpositionCell(BaseModel):
    row: int
    col: int
    candidates: List[int]
    amplitude: float
    entropy_bits: float


class CollapseStep(BaseModel):
    row: int
    col: int
    digit: int
    reason: str


def box_index(row: int, col: int) -> int:
    return (row // 3) * 3 + (col // 3)


def are_peers(a: Tuple[int, int], b: Tuple[int, int]) -> bool:
    if a == b:
        return False
    return a[0] == b[0] or a[1] == b[1] or box_index(a[0], a[1]) == box_index(b[0], b[1])


def all_houses() -> List[Tuple[str, List[Tuple[int, int]]]]:
    houses: List[Tuple[str, List[Tuple[int, int]]]] = []
    for r in range(9):
        houses.append((f"Row {r + 1}", [(r, c) for c in range(9)]))
    for c in range(9):
        houses.append((f"Col {c + 1}", [(r, c) for r in range(9)]))
    for b in range(9):
        br, bc = (b // 3) * 3, (b % 3) * 3
        houses.append((f"Box {b + 1}", [(br + dr, bc + dc) for dr in range(3) for dc in range(3)]))
    return houses


def validate_board(board: List[List[int]]) -> Tuple[bool, List[Tuple[int, int]]]:
    """Check for duplicate digits in any row, column, or 3x3 box."""
    conflicts: Set[Tuple[int, int]] = set()
    for _, cells in all_houses():
        seen: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
        for r, c in cells:
            val = board[r][c]
            if val != 0:
                seen[val].append((r, c))
        for positions in seen.values():
            if len(positions) > 1:
                conflicts.update(positions)
    return len(conflicts) == 0, sorted(conflicts)


def compute_candidates(
    board: List[List[int]],
    eliminated: Optional[Dict[str, List[int]]] = None,
) -> List[List[List[int]]]:
    """Compute legal candidates for every cell, respecting optional per-cell eliminations."""
    eliminated = eliminated or {}
    row_used = [set() for _ in range(9)]
    col_used = [set() for _ in range(9)]
    box_used = [set() for _ in range(9)]

    for r in range(9):
        for c in range(9):
            v = board[r][c]
            if v != 0:
                row_used[r].add(v)
                col_used[c].add(v)
                box_used[box_index(r, c)].add(v)

    grid: List[List[List[int]]] = [[[] for _ in range(9)] for _ in range(9)]
    for r in range(9):
        for c in range(9):
            if board[r][c] != 0:
                continue
            elim_set = set(eliminated.get(f"{r},{c}", []))
            b = box_index(r, c)
            used = row_used[r] | col_used[c] | box_used[b] | elim_set
            grid[r][c] = [d for d in range(1, 10) if d not in used]
    return grid


# ---------------------------------------------------------------------------
# Generic Exact Cover Solver (Algorithm X over 324 Sudoku Constraints)
# ---------------------------------------------------------------------------

def solve_exact_cover(board: List[List[int]], limit: int = 2) -> List[List[List[int]]]:
    """Solve Sudoku via Exact Cover (Algorithm X with MRV column selection)."""
    valid, _ = validate_board(board)
    if not valid:
        return []

    # Build constraint universe: 324 constraints
    # 0..80: cell (r,c) filled
    # 81..161: row r has digit d (1..9)
    # 162..242: col c has digit d
    # 243..323: box b has digit d
    row_has = [[False] * 10 for _ in range(9)]
    col_has = [[False] * 10 for _ in range(9)]
    box_has = [[False] * 10 for _ in range(9)]
    working = [row[:] for row in board]

    satisfied_cols: Set[int] = set()
    for r in range(9):
        for c in range(9):
            d = working[r][c]
            if d != 0:
                b = box_index(r, c)
                row_has[r][d] = True
                col_has[c][d] = True
                box_has[b][d] = True
                satisfied_cols.update(
                    [
                        r * 9 + c,
                        81 + r * 9 + (d - 1),
                        162 + c * 9 + (d - 1),
                        243 + b * 9 + (d - 1),
                    ]
                )

    # Candidate rows in the exact cover matrix: (r, c, d) -> 4 constraint indices
    options: Dict[Tuple[int, int, int], Tuple[int, int, int, int]] = {}
    col_to_options: Dict[int, Set[Tuple[int, int, int]]] = defaultdict(set)

    for r in range(9):
        for c in range(9):
            if working[r][c] != 0:
                continue
            b = box_index(r, c)
            for d in range(1, 10):
                if row_has[r][d] or col_has[c][d] or box_has[b][d]:
                    continue
                cols = (
                    r * 9 + c,
                    81 + r * 9 + (d - 1),
                    162 + c * 9 + (d - 1),
                    243 + b * 9 + (d - 1),
                )
                opt = (r, c, d)
                options[opt] = cols
                for col_idx in cols:
                    col_to_options[col_idx].add(opt)

    active_cols: Set[int] = set(range(324)) - satisfied_cols
    solutions: List[List[List[int]]] = []

    def search() -> None:
        if len(solutions) >= limit:
            return
        if not active_cols:
            solutions.append([r[:] for r in working])
            return

        # Choose active column with minimum remaining options (MRV heuristic)
        best_col = min(active_cols, key=lambda col_idx: len(col_to_options[col_idx]))
        candidates_for_col = list(col_to_options[best_col])
        if not candidates_for_col:
            return

        for opt in candidates_for_col:
            r, c, d = opt
            cols = options[opt]

            # Cover all 4 columns of `opt`
            removed_cols: List[int] = []
            removed_opts: List[Tuple[int, Tuple[int, int, int]]] = []

            for col_idx in cols:
                if col_idx in active_cols:
                    active_cols.remove(col_idx)
                    removed_cols.append(col_idx)

            for col_idx in removed_cols:
                for other_opt in list(col_to_options[col_idx]):
                    for other_col in options[other_opt]:
                        if other_col != col_idx and other_opt in col_to_options[other_col]:
                            col_to_options[other_col].remove(other_opt)
                            removed_opts.append((other_col, other_opt))

            working[r][c] = d
            search()
            working[r][c] = 0

            # Uncover in reverse
            for other_col, other_opt in reversed(removed_opts):
                col_to_options[other_col].add(other_opt)
            for col_idx in removed_cols:
                active_cols.add(col_idx)

            if len(solutions) >= limit:
                return

    search()
    return solutions


# ---------------------------------------------------------------------------
# Entanglement Cluster Detection (Bell, GHZ, W-State)
# ---------------------------------------------------------------------------

def detect_entanglement_clusters(
    board: List[List[int]],
    candidates: List[List[List[int]]],
    max_clusters: int = 12,
) -> Tuple[List[EntanglementCluster], List[SuperpositionCell]]:
    """
    Detect quantum-mapped constraint structures from the live Sudoku state:
    1. GHZ clusters: connected components (>=3 cells) of bivalue {a,b} conjugate links
       where every cell alternates cleanly between `a` and `b`.
    2. Bell clusters: 2-qubit anti-correlated bivalue pairs {a,b} in a shared house,
       or 2-cell conjugate digit links (digit `d` appears in exactly 2 cells of a house).
    3. W-State clusters: 3..5 cells in a house where a digit `d` appears as a candidate
       in exactly those k cells (exactly-one-hot constraint |W_k>).
    """
    import math

    superposition_cells: List[SuperpositionCell] = []
    for r in range(9):
        for c in range(9):
            cands = candidates[r][c]
            if board[r][c] == 0 and cands:
                k = len(cands)
                superposition_cells.append(
                    SuperpositionCell(
                        row=r,
                        col=c,
                        candidates=cands,
                        amplitude=round(1.0 / math.sqrt(k), 4),
                        entropy_bits=round(math.log2(k), 3),
                    )
                )

    clusters: List[EntanglementCluster] = []
    used_bell_pairs: Set[Tuple[Tuple[int, int], Tuple[int, int]]] = set()
    ghz_cell_sets: List[Tuple[Set[Tuple[int, int]], Tuple[int, int]]] = []

    # 1. Detect bivalue {a,b} peer graphs -> GHZ (>=3 cells) and Bell (2 cells)
    bivalue_by_pair: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
    for r in range(9):
        for c in range(9):
            if board[r][c] == 0 and len(candidates[r][c]) == 2:
                pair = (candidates[r][c][0], candidates[r][c][1])
                bivalue_by_pair[pair].append((r, c))

    for pair, cells in sorted(bivalue_by_pair.items()):
        if len(cells) < 2:
            continue
        adj: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
        for i in range(len(cells)):
            for j in range(i + 1, len(cells)):
                if are_peers(cells[i], cells[j]):
                    adj[cells[i]].append(cells[j])
                    adj[cells[j]].append(cells[i])

        visited: Set[Tuple[int, int]] = set()
        for start in cells:
            if start in visited or start not in adj:
                continue
            # BFS 2-coloring for bipartite implication component
            comp: List[Tuple[int, int]] = []
            color: Dict[Tuple[int, int], int] = {start: 0}
            queue = deque([start])
            bipartite = True
            visited.add(start)
            while queue:
                curr = queue.popleft()
                comp.append(curr)
                for nxt in adj[curr]:
                    if nxt not in color:
                        color[nxt] = 1 - color[curr]
                        visited.add(nxt)
                        queue.append(nxt)
                    elif color[nxt] == color[curr]:
                        bipartite = False

            if not bipartite:
                continue

            if len(comp) >= 3:
                comp_sorted = sorted(comp)
                # Cap GHZ cluster at 5 qubits for crisp circuit rendering & fast Qiskit simulation
                if len(comp_sorted) > 5:
                    comp_sorted = comp_sorted[:5]
                parity = [color[pt] for pt in comp_sorted]
                cid = f"ghz-{'-'.join(f'r{r+1}c{c+1}' for r, c in comp_sorted)}-d{pair[0]}{pair[1]}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="GHZ",
                        cells=[CellCoord(row=r, col=c) for r, c in comp_sorted],
                        candidate_pair=[pair[0], pair[1]],
                        parity=parity,
                        house_label=f"Chain {{{pair[0]},{pair[1]}}}",
                        mechanism=f"Bivalue implication chain over {{{pair[0]}, {pair[1]}}} across {len(comp_sorted)} linked cells",
                    )
                )
                ghz_cell_sets.append((set(comp_sorted), pair))
            elif len(comp) == 2:
                a_pt, b_pt = sorted(comp)
                used_bell_pairs.add((a_pt, b_pt))
                cid = f"bell-r{a_pt[0]+1}c{a_pt[1]+1}-r{b_pt[0]+1}c{b_pt[1]+1}-d{pair[0]}{pair[1]}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="BELL",
                        cells=[CellCoord(row=a_pt[0], col=a_pt[1]), CellCoord(row=b_pt[0], col=b_pt[1])],
                        candidate_pair=[pair[0], pair[1]],
                        parity=[0, 1],
                        house_label=f"Pair {{{pair[0]},{pair[1]}}}",
                        mechanism=f"Anti-correlated bivalue Bell pair {{{pair[0]}, {pair[1]}}}",
                    )
                )

    # 2. Detect strong conjugate digit pairs (Bell) and W-state groups (3..5 cells) per house
    seen_w_keys: Set[Tuple[Tuple[Tuple[int, int], ...], int]] = set()
    for house_name, house_cells in all_houses():
        digit_positions: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
        for r, c in house_cells:
            if board[r][c] == 0:
                for d in candidates[r][c]:
                    digit_positions[d].append((r, c))

        for d in range(1, 10):
            pts = sorted(digit_positions[d])
            if len(pts) == 2:
                pair_pts = (pts[0], pts[1])
                # Skip if already captured as a bivalue Bell pair or inside a GHZ for the same digit
                if pair_pts in used_bell_pairs:
                    continue
                if any(pts[0] in s and pts[1] in s and d in p for s, p in ghz_cell_sets):
                    continue
                used_bell_pairs.add(pair_pts)
                cid = f"bell-r{pts[0][0]+1}c{pts[0][1]+1}-r{pts[1][0]+1}c{pts[1][1]+1}-conj{d}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="BELL",
                        cells=[CellCoord(row=pts[0][0], col=pts[0][1]), CellCoord(row=pts[1][0], col=pts[1][1])],
                        target_digit=d,
                        candidate_pair=[0, d],
                        parity=[0, 1],
                        house_label=f"{house_name} · Digit {d}",
                        mechanism=f"Conjugate pair: digit {d} occurs in exactly 2 cells of {house_name}",
                    )
                )
            elif 3 <= len(pts) <= 5:
                w_key = (tuple(pts), d)
                if w_key in seen_w_keys:
                    continue
                seen_w_keys.add(w_key)
                cid = f"w-{'-'.join(f'r{r+1}c{c+1}' for r, c in pts)}-d{d}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="W",
                        cells=[CellCoord(row=r, col=c) for r, c in pts],
                        target_digit=d,
                        parity=[1] + [0] * (len(pts) - 1),
                        house_label=f"{house_name} · Digit {d}",
                        mechanism=f"Exactly-one-hot constraint: digit {d} must occupy 1 of {len(pts)} cells in {house_name}",
                    )
                )

    # Balance representation across GHZ, BELL, and W so no state type is starved by max_clusters
    ghz_list = [c for c in clusters if c.state_type == "GHZ"]
    bell_list = [c for c in clusters if c.state_type == "BELL"]
    w_list = sorted([c for c in clusters if c.state_type == "W"], key=lambda cl: (len(cl.cells), cl.id))

    selected: List[EntanglementCluster] = []
    # Guarantee up to 4 of each category first, then fill remaining quota
    for bucket in (ghz_list, bell_list, w_list):
        selected.extend(bucket[:4])
    used_ids = {c.id for c in selected}
    for bucket in (ghz_list, bell_list, w_list):
        for cl in bucket:
            if len(selected) >= max_clusters:
                break
            if cl.id not in used_ids:
                selected.append(cl)
                used_ids.add(cl.id)

    return selected[:max_clusters], superposition_cells


# ---------------------------------------------------------------------------
# Manual Entanglement Builder
# ---------------------------------------------------------------------------

def build_manual_cluster(
    board: List[List[int]],
    candidates: List[List[List[int]]],
    cells: List[CellCoord],
    state_type: StateType,
    target_digit: Optional[int] = None,
) -> EntanglementCluster:
    """Validate and construct a user-selected manual entanglement cluster."""
    unique_pts: List[Tuple[int, int]] = []
    for cell in cells:
        pt = (cell.row, cell.col)
        if pt not in unique_pts:
            unique_pts.append(pt)

    if len(unique_pts) < 2 and state_type != "SUPERPOSITION":
        return EntanglementCluster(
            id="manual-invalid",
            state_type=state_type,
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            consistent=False,
            is_manual=True,
            diagnostic="Select at least 2 empty cells to entangle.",
        )

    for r, c in unique_pts:
        if board[r][c] != 0:
            return EntanglementCluster(
                id="manual-invalid",
                state_type=state_type,
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic=f"Cell R{r+1}C{c+1} is already collapsed to {board[r][c]}.",
            )

    if state_type == "SUPERPOSITION":
        r, c = unique_pts[0]
        cands = candidates[r][c]
        return EntanglementCluster(
            id=f"manual-sup-r{r+1}c{c+1}",
            state_type="SUPERPOSITION",
            cells=[CellCoord(row=r, col=c)],
            candidate_pair=cands,
            house_label=f"R{r+1}C{c+1}",
            mechanism=f"Single-cell superposition over {len(cands)} candidates: {cands}",
            consistent=len(cands) > 0,
            is_manual=True,
            diagnostic="Valid superposition register." if cands else "No legal candidates remain.",
        )

    if state_type == "BELL":
        if len(unique_pts) != 2:
            return EntanglementCluster(
                id="manual-bell-invalid",
                state_type="BELL",
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic="A Bell state requires exactly 2 cells.",
            )
        p1, p2 = unique_pts[0], unique_pts[1]
        c1, c2 = set(candidates[p1[0]][p1[1]]), set(candidates[p2[0]][p2[1]])
        shared = sorted(c1 & c2)
        if not are_peers(p1, p2):
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}",
                state_type="BELL",
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                candidate_pair=shared[:2] if len(shared) >= 2 else [0, target_digit or (shared[0] if shared else 1)],
                parity=[0, 1],
                consistent=False,
                is_manual=True,
                house_label="Non-peer pair",
                mechanism="Custom Bell pair (cells do not share a row, column, or 3x3 box)",
                diagnostic="Warning: These two cells do not share a row, column, or box, so Sudoku rules do not directly anti-correlate them.",
            )
        if len(c1) == 2 and len(c2) == 2 and c1 == c2:
            pair = sorted(c1)
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}",
                state_type="BELL",
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                candidate_pair=pair,
                parity=[0, 1],
                consistent=True,
                is_manual=True,
                house_label=f"Manual Pair {{{pair[0]},{pair[1]}}}",
                mechanism=f"Exact anti-correlated Bell pair over {{{pair[0]}, {pair[1]}}}",
                diagnostic=f"Consistent Bell pair: both cells share exact candidates {{{pair[0]}, {pair[1]}}}.",
            )
        d = target_digit if (target_digit and target_digit in shared) else (shared[0] if shared else 0)
        if d == 0:
            return EntanglementCluster(
                id="manual-bell-invalid",
                state_type="BELL",
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                consistent=False,
                is_manual=True,
                diagnostic="Selected peer cells share no common candidate digits.",
            )
        return EntanglementCluster(
            id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}-d{d}",
            state_type="BELL",
            cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
            target_digit=d,
            candidate_pair=[0, d],
            parity=[0, 1],
            consistent=True,
            is_manual=True,
            house_label=f"Manual Link · Digit {d}",
            mechanism=f"Binary exclusion link for digit {d} between peer cells",
            diagnostic=f"Consistent exclusion link: at most one of these peers can take digit {d}.",
        )

    if state_type == "GHZ":
        if len(unique_pts) < 3 or len(unique_pts) > 6:
            return EntanglementCluster(
                id="manual-ghz-invalid",
                state_type="GHZ",
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic="Select 3 to 6 cells for a GHZ implication cluster.",
            )
        common = set.intersection(*(set(candidates[r][c]) for r, c in unique_pts))
        pair_vals = sorted(common)[:2]
        # Check if cells form a connected bipartite peer graph
        adj: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
        for i in range(len(unique_pts)):
            for j in range(i + 1, len(unique_pts)):
                if are_peers(unique_pts[i], unique_pts[j]):
                    adj[unique_pts[i]].append(unique_pts[j])
                    adj[unique_pts[j]].append(unique_pts[i])
        color: Dict[Tuple[int, int], int] = {unique_pts[0]: 0}
        queue = deque([unique_pts[0]])
        bipartite = True
        while queue:
            curr = queue.popleft()
            for nxt in adj[curr]:
                if nxt not in color:
                    color[nxt] = 1 - color[curr]
                    queue.append(nxt)
                elif color[nxt] == color[curr]:
                    bipartite = False
        connected = len(color) == len(unique_pts)
        consistent = connected and bipartite and len(pair_vals) >= 2
        parity = [color.get(pt, i % 2) for i, pt in enumerate(unique_pts)]
        diag = (
            f"Consistent GHZ chain over {{{pair_vals[0]}, {pair_vals[1]}}}."
            if consistent
            else "Note: Selected cells do not form a bipartite peer chain with 2 shared digits (synthesizing demo GHZ state)."
        )
        return EntanglementCluster(
            id=f"manual-ghz-{'-'.join(f'r{r+1}c{c+1}' for r, c in unique_pts)}",
            state_type="GHZ",
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            candidate_pair=pair_vals if len(pair_vals) == 2 else [0, target_digit or 1],
            parity=parity,
            consistent=consistent,
            is_manual=True,
            house_label=f"Manual GHZ ({len(unique_pts)}q)",
            mechanism=f"Multi-qubit GHZ implication over {len(unique_pts)} cells",
            diagnostic=diag,
        )

    # W-State
    if len(unique_pts) < 2 or len(unique_pts) > 6:
        return EntanglementCluster(
            id="manual-w-invalid",
            state_type="W",
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            consistent=False,
            is_manual=True,
            diagnostic="Select 2 to 6 cells for a W-state cluster.",
        )
    common = set.intersection(*(set(candidates[r][c]) for r, c in unique_pts))
    d = target_digit if (target_digit and target_digit in common) else (sorted(common)[0] if common else None)
    # Check if all selected cells belong to at least one common house and contain all occurrences of d in that house
    shared_house_name = None
    exact_one_hot = False
    if d is not None:
        pt_set = set(unique_pts)
        for h_name, h_cells in all_houses():
            if pt_set.issubset(set(h_cells)):
                shared_house_name = h_name
                all_d_in_house = {pt for pt in h_cells if board[pt[0]][pt[1]] == 0 and d in candidates[pt[0]][pt[1]]}
                if all_d_in_house == pt_set:
                    exact_one_hot = True
                    break

    diag = (
        f"Exact W-state: digit {d} must occupy exactly one of these {len(unique_pts)} cells in {shared_house_name}."
        if exact_one_hot
        else (
            f"Partial house group for digit {d} (other cells in the house can also hold {d})."
            if d is not None and shared_house_name
            else "Selected cells do not share a single house & common candidate digit."
        )
    )
    return EntanglementCluster(
        id=f"manual-w-{'-'.join(f'r{r+1}c{c+1}' for r, c in unique_pts)}",
        state_type="W",
        cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
        target_digit=d,
        parity=[1] + [0] * (len(unique_pts) - 1),
        consistent=exact_one_hot,
        is_manual=True,
        house_label=shared_house_name or "Custom W-State",
        mechanism=f"One-hot |W_{len(unique_pts)}> state for digit {d or '?'}",
        diagnostic=diag,
    )


# ---------------------------------------------------------------------------
# Measurement Collapse & Cascade Propagation
# ---------------------------------------------------------------------------

def apply_measurement_collapse(
    board: List[List[int]],
    cluster: EntanglementCluster,
    bitstring: str,
    cascade: bool = True,
    eliminated: Optional[Dict[str, List[int]]] = None,
) -> Tuple[List[List[int]], Dict[str, List[int]], List[CollapseStep], bool]:
    """
    Apply a measured Qiskit bitstring (in q0..q_{n-1} order) to the Sudoku board,
    optionally propagating forced naked singles in a collapse cascade.
    """
    new_board = [row[:] for row in board]
    new_elim: Dict[str, List[int]] = {k: list(v) for k, v in (eliminated or {}).items()}
    trace: List[CollapseStep] = []

    bits = [int(ch) for ch in bitstring if ch in ("0", "1")]

    if cluster.state_type == "SUPERPOSITION" and cluster.cells:
        r, c = cluster.cells[0].row, cluster.cells[0].col
        cands = cluster.candidate_pair or compute_candidates(new_board, new_elim)[r][c]
        if cands:
            idx = int("".join(str(b) for b in bits), 2) % len(cands)
            digit = cands[idx]
            new_board[r][c] = digit
            trace.append(CollapseStep(row=r, col=c, digit=digit, reason="Superposition measurement collapse"))

    elif cluster.state_type in ("BELL", "GHZ"):
        pair = cluster.candidate_pair or []
        if len(pair) == 2 and pair[0] != 0:
            # Bivalue assignment: bit 0 -> pair[0], bit 1 -> pair[1]
            for i, cell in enumerate(cluster.cells):
                if i < len(bits) and new_board[cell.row][cell.col] == 0:
                    digit = pair[bits[i]]
                    new_board[cell.row][cell.col] = digit
                    reason = (
                        "Measured anchor qubit"
                        if i == 0
                        else f"Entangled {cluster.state_type} collapse"
                    )
                    trace.append(CollapseStep(row=cell.row, col=cell.col, digit=digit, reason=reason))
        elif cluster.target_digit is not None:
            d = cluster.target_digit
            for i, cell in enumerate(cluster.cells):
                if i >= len(bits) or new_board[cell.row][cell.col] != 0:
                    continue
                if bits[i] == 1:
                    new_board[cell.row][cell.col] = d
                    trace.append(CollapseStep(row=cell.row, col=cell.col, digit=d, reason=f"{cluster.state_type} conjugate collapse"))
                else:
                    key = f"{cell.row},{cell.col}"
                    if d not in new_elim.get(key, []):
                        new_elim.setdefault(key, []).append(d)

    elif cluster.state_type == "W" and cluster.target_digit is not None:
        d = cluster.target_digit
        for i, cell in enumerate(cluster.cells):
            if i >= len(bits) or new_board[cell.row][cell.col] != 0:
                continue
            if bits[i] == 1:
                new_board[cell.row][cell.col] = d
                trace.append(CollapseStep(row=cell.row, col=cell.col, digit=d, reason="W-state |1> excitation collapse"))
            else:
                key = f"{cell.row},{cell.col}"
                if d not in new_elim.get(key, []):
                    new_elim.setdefault(key, []).append(d)

    # Propagate forced naked singles if cascade is enabled (cap at 12 steps per measurement)
    if cascade:
        for _ in range(12):
            cands = compute_candidates(new_board, new_elim)
            forced: Optional[Tuple[int, int, int]] = None
            for r in range(9):
                for c in range(9):
                    if new_board[r][c] == 0 and len(cands[r][c]) == 1:
                        forced = (r, c, cands[r][c][0])
                        break
                if forced:
                    break
            if not forced:
                break
            fr, fc, fd = forced
            new_board[fr][fc] = fd
            trace.append(CollapseStep(row=fr, col=fc, digit=fd, reason="Cascade forced naked single"))

    valid, _ = validate_board(new_board)
    return new_board, new_elim, trace, valid
