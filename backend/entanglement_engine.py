"""Generic Sudoku solver (4x4, 6x6, 9x9, 12x12, 16x16), implication graph analyzer, and entanglement cluster detector."""

from __future__ import annotations

import math
import re
from collections import defaultdict, deque
from typing import Dict, List, Literal, Optional, Set, Tuple

from pydantic import BaseModel, Field

StateType = Literal["SUPERPOSITION", "BELL", "GHZ", "W", "CUSTOM"]

GRID_SPECS: Dict[int, Tuple[int, int]] = {
    4: (2, 2),
    6: (2, 3),
    9: (3, 3),
    12: (3, 4),
    16: (4, 4),
}

GRID_SYMBOLS: Dict[int, str] = {
    4: "1234",
    6: "123456",
    9: "123456789",
    12: "123456789ABC",
    16: "0123456789ABCDEF",
}


def infer_grid_spec(board: List[List[int]]) -> Tuple[int, int, int]:
    """Return (size, box_rows, box_cols) for a square 4x4, 6x6, 9x9, 12x12, or 16x16 board."""
    size = len(board)
    if size not in GRID_SPECS:
        raise ValueError(f"Unsupported Sudoku grid size: {size}. Expected one of {sorted(GRID_SPECS)}.")
    for row in board:
        if len(row) != size:
            raise ValueError(f"Non-square Sudoku board row length {len(row)} != {size}.")
    br, bc = GRID_SPECS[size]
    return size, br, bc


def value_to_symbol(val: int, size: int) -> str:
    """Convert internal 1-indexed value (1..size) to display symbol (e.g., 1->'0' in 16x16 hex)."""
    syms = GRID_SYMBOLS.get(size, GRID_SYMBOLS[9])
    if 1 <= val <= len(syms):
        return syms[val - 1]
    return str(val)


def symbol_to_value(ch: str, size: int) -> Optional[int]:
    """Convert display symbol ('0'..'F') to internal 1-indexed value (1..size)."""
    syms = GRID_SYMBOLS.get(size, GRID_SYMBOLS[9])
    idx = syms.find(ch.upper())
    return idx + 1 if idx >= 0 else None


class CellCoord(BaseModel):
    row: int = Field(ge=0, le=15)
    col: int = Field(ge=0, le=15)


class EntanglementCluster(BaseModel):
    id: str
    state_type: StateType
    cells: List[CellCoord]
    grid_size: int = 9
    target_digit: Optional[int] = None
    candidate_pair: Optional[List[int]] = None
    parity: List[int] = Field(default_factory=list)
    custom_terms: List[str] = Field(default_factory=list)
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


def box_index(row: int, col: int, size: int = 9) -> int:
    br, bc = GRID_SPECS[size]
    boxes_per_row = size // bc
    return (row // br) * boxes_per_row + (col // bc)


def are_peers(a: Tuple[int, int], b: Tuple[int, int], size: int = 9) -> bool:
    if a == b:
        return False
    return a[0] == b[0] or a[1] == b[1] or box_index(a[0], a[1], size) == box_index(b[0], b[1], size)


def all_houses(size: int = 9) -> List[Tuple[str, List[Tuple[int, int]]]]:
    br, bc = GRID_SPECS[size]
    boxes_per_row = size // bc
    houses: List[Tuple[str, List[Tuple[int, int]]]] = []
    for r in range(size):
        houses.append((f"Row {r + 1}", [(r, c) for c in range(size)]))
    for c in range(size):
        houses.append((f"Col {c + 1}", [(r, c) for r in range(size)]))
    for b in range(size):
        r0 = (b // boxes_per_row) * br
        c0 = (b % boxes_per_row) * bc
        houses.append((f"Box {b + 1}", [(r0 + dr, c0 + dc) for dr in range(br) for dc in range(bc)]))
    return houses


def validate_board(board: List[List[int]]) -> Tuple[bool, List[Tuple[int, int]]]:
    """Check for duplicate symbols in any row, column, or box."""
    size, _, _ = infer_grid_spec(board)
    conflicts: Set[Tuple[int, int]] = set()
    for _, cells in all_houses(size):
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
    """Compute legal 1-indexed candidate values (1..size) for every empty cell."""
    size, _, _ = infer_grid_spec(board)
    eliminated = eliminated or {}
    row_used = [set() for _ in range(size)]
    col_used = [set() for _ in range(size)]
    box_used = [set() for _ in range(size)]

    for r in range(size):
        for c in range(size):
            v = board[r][c]
            if v != 0:
                row_used[r].add(v)
                col_used[c].add(v)
                box_used[box_index(r, c, size)].add(v)

    grid: List[List[List[int]]] = [[[] for _ in range(size)] for _ in range(size)]
    for r in range(size):
        for c in range(size):
            if board[r][c] != 0:
                continue
            elim_set = set(eliminated.get(f"{r},{c}", []))
            b = box_index(r, c, size)
            used = row_used[r] | col_used[c] | box_used[b] | elim_set
            grid[r][c] = [d for d in range(1, size + 1) if d not in used]
    return grid


# ---------------------------------------------------------------------------
# Generic Bitmask MRV Exact Cover Solver (Supports 4x4, 6x6, 9x9, 12x12, 16x16)
# ---------------------------------------------------------------------------

def solve_exact_cover(
    board: List[List[int]],
    limit: int = 2,
    max_nodes: int = 120_000,
) -> List[List[List[int]]]:
    """Solve generic NxN Sudoku via bitmask MRV backtracking up to `limit` solutions."""
    size, _, _ = infer_grid_spec(board)
    valid, _ = validate_board(board)
    if not valid:
        return []

    all_mask = ((1 << size) - 1) << 1
    row_mask = [0] * size
    col_mask = [0] * size
    box_mask = [0] * size
    working = [row[:] for row in board]
    empties: List[Tuple[int, int]] = []

    for r in range(size):
        for c in range(size):
            v = working[r][c]
            if 1 <= v <= size:
                bit = 1 << v
                row_mask[r] |= bit
                col_mask[c] |= bit
                box_mask[box_index(r, c, size)] |= bit
            else:
                empties.append((r, c))

    solutions: List[List[List[int]]] = []
    nodes = 0

    def backtrack(idx: int) -> None:
        nonlocal nodes
        if len(solutions) >= limit or nodes >= max_nodes:
            return
        nodes += 1
        if idx == len(empties):
            solutions.append([r[:] for r in working])
            return

        best_i = -1
        best_cnt = size + 1
        best_avail = 0
        for i in range(idx, len(empties)):
            r, c = empties[i]
            bx = box_index(r, c, size)
            avail = all_mask & ~(row_mask[r] | col_mask[c] | box_mask[bx])
            cnt = avail.bit_count()
            if cnt == 0:
                return
            if cnt < best_cnt:
                best_cnt = cnt
                best_i = i
                best_avail = avail
                if cnt == 1:
                    break

        empties[idx], empties[best_i] = empties[best_i], empties[idx]
        r, c = empties[idx]
        bx = box_index(r, c, size)

        mask = best_avail
        while mask and len(solutions) < limit and nodes < max_nodes:
            bit = mask & -mask
            mask ^= bit
            d = bit.bit_length() - 1
            working[r][c] = d
            row_mask[r] |= bit
            col_mask[c] |= bit
            box_mask[bx] |= bit

            backtrack(idx + 1)

            working[r][c] = 0
            row_mask[r] ^= bit
            col_mask[c] ^= bit
            box_mask[bx] ^= bit

        empties[idx], empties[best_i] = empties[best_i], empties[idx]

    backtrack(0)
    return solutions


# ---------------------------------------------------------------------------
# Entanglement Cluster Detection (Bell, GHZ, W-State)
# ---------------------------------------------------------------------------

def detect_entanglement_clusters(
    board: List[List[int]],
    candidates: List[List[List[int]]],
    max_clusters: int = 12,
) -> Tuple[List[EntanglementCluster], List[SuperpositionCell]]:
    """Detect Bell, GHZ, and W-state constraint structures on any supported grid size."""
    size, _, _ = infer_grid_spec(board)
    superposition_cells: List[SuperpositionCell] = []
    for r in range(size):
        for c in range(size):
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
    for r in range(size):
        for c in range(size):
            if board[r][c] == 0 and len(candidates[r][c]) == 2:
                pair = (candidates[r][c][0], candidates[r][c][1])
                bivalue_by_pair[pair].append((r, c))

    for pair, cells in sorted(bivalue_by_pair.items()):
        if len(cells) < 2:
            continue
        adj: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
        for i in range(len(cells)):
            for j in range(i + 1, len(cells)):
                if are_peers(cells[i], cells[j], size):
                    adj[cells[i]].append(cells[j])
                    adj[cells[j]].append(cells[i])

        visited: Set[Tuple[int, int]] = set()
        for start in cells:
            if start in visited or start not in adj:
                continue
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

            s0 = value_to_symbol(pair[0], size)
            s1 = value_to_symbol(pair[1], size)

            if len(comp) >= 3:
                comp_sorted = sorted(comp)[:5]
                parity = [color[pt] for pt in comp_sorted]
                cid = f"ghz-{'-'.join(f'r{r+1}c{c+1}' for r, c in comp_sorted)}-d{pair[0]}_{pair[1]}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="GHZ",
                        grid_size=size,
                        cells=[CellCoord(row=r, col=c) for r, c in comp_sorted],
                        candidate_pair=[pair[0], pair[1]],
                        parity=parity,
                        house_label=f"Chain {{{s0},{s1}}}",
                        mechanism=f"Bivalue implication chain over {{{s0}, {s1}}} across {len(comp_sorted)} linked cells",
                    )
                )
                ghz_cell_sets.append((set(comp_sorted), pair))
            elif len(comp) == 2:
                a_pt, b_pt = sorted(comp)
                used_bell_pairs.add((a_pt, b_pt))
                cid = f"bell-r{a_pt[0]+1}c{a_pt[1]+1}-r{b_pt[0]+1}c{b_pt[1]+1}-d{pair[0]}_{pair[1]}"
                clusters.append(
                    EntanglementCluster(
                        id=cid,
                        state_type="BELL",
                        grid_size=size,
                        cells=[CellCoord(row=a_pt[0], col=a_pt[1]), CellCoord(row=b_pt[0], col=b_pt[1])],
                        candidate_pair=[pair[0], pair[1]],
                        parity=[0, 1],
                        house_label=f"Pair {{{s0},{s1}}}",
                        mechanism=f"Anti-correlated bivalue Bell pair {{{s0}, {s1}}}",
                    )
                )

    # 2. Detect strong conjugate digit pairs (Bell) and W-state groups (3..5 cells) per house
    seen_w_keys: Set[Tuple[Tuple[Tuple[int, int], ...], int]] = set()
    for house_name, house_cells in all_houses(size):
        digit_positions: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
        for r, c in house_cells:
            if board[r][c] == 0:
                for d in candidates[r][c]:
                    digit_positions[d].append((r, c))

        for d in range(1, size + 1):
            pts = sorted(digit_positions[d])
            sym = value_to_symbol(d, size)
            if len(pts) == 2:
                pair_pts = (pts[0], pts[1])
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
                        grid_size=size,
                        cells=[CellCoord(row=pts[0][0], col=pts[0][1]), CellCoord(row=pts[1][0], col=pts[1][1])],
                        target_digit=d,
                        candidate_pair=[0, d],
                        parity=[0, 1],
                        house_label=f"{house_name} · {sym}",
                        mechanism=f"Conjugate pair: symbol {sym} occurs in exactly 2 cells of {house_name}",
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
                        grid_size=size,
                        cells=[CellCoord(row=r, col=c) for r, c in pts],
                        target_digit=d,
                        parity=[1] + [0] * (len(pts) - 1),
                        house_label=f"{house_name} · {sym}",
                        mechanism=f"Exactly-one-hot constraint: symbol {sym} must occupy 1 of {len(pts)} cells in {house_name}",
                    )
                )

    ghz_list = [c for c in clusters if c.state_type == "GHZ"]
    bell_list = [c for c in clusters if c.state_type == "BELL"]
    w_list = sorted([c for c in clusters if c.state_type == "W"], key=lambda cl: (len(cl.cells), cl.id))

    selected: List[EntanglementCluster] = []
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

def parse_custom_state_terms(expr: str, expected_len: int, grid_size: int = 9) -> Tuple[List[str], str]:
    """Parse expressions like '|123> + |132>' or '|*AF> + |AF*>' into normalized term strings."""
    if not expr or not expr.strip():
        return [], "Enter a custom state like |123> + |132> or |*12> + |12*>."

    allowed = GRID_SYMBOLS.get(grid_size, GRID_SYMBOLS[9]) + "*"
    raw_tokens = [tok for tok in re.split(r"[\s+,;]+", expr.strip()) if tok]
    terms: List[str] = []
    for tok in raw_tokens:
        clean = tok.strip("|>⟩⟨ ").upper()
        if not clean:
            continue
        if len(clean) != expected_len:
            return [], f"Term '|{clean}⟩' has length {len(clean)}, expected {expected_len} (1 symbol per selected cell)."
        if not all((ch in allowed) for ch in clean):
            return [], f"Term '|{clean}⟩' contains symbols outside [{allowed}]."
        if clean not in terms:
            terms.append(clean)

    if not terms:
        return [], "No valid ket terms found. Example: |123> + |132> + |213>."

    total_qubits = 0
    for i in range(expected_len):
        alpha_sz = len({t[i] for t in terms})
        total_qubits += max(1, math.ceil(math.log2(alpha_sz))) if alpha_sz > 1 else 1
    if total_qubits > 8:
        return [], f"Custom encoding requires {total_qubits} qubits (max 8 qubits supported for live simulation)."

    return terms, ""


def build_manual_cluster(
    board: List[List[int]],
    candidates: List[List[List[int]]],
    cells: List[CellCoord],
    state_type: StateType,
    target_digit: Optional[int] = None,
    digit_a: Optional[int] = None,
    digit_b: Optional[str] = None,
    custom_state: Optional[str] = None,
) -> EntanglementCluster:
    """Validate and construct a user-selected manual entanglement cluster for any supported size."""
    size, _, _ = infer_grid_spec(board)
    unique_pts: List[Tuple[int, int]] = []
    for cell in cells:
        pt = (cell.row, cell.col)
        if pt not in unique_pts:
            unique_pts.append(pt)

    explicit_pair: Optional[List[int]] = None
    resolved_single: Optional[int] = target_digit
    if digit_a is not None:
        if digit_b is not None and digit_b != "*":
            try:
                b_int = int(digit_b)
                if 1 <= b_int <= size and b_int != digit_a:
                    explicit_pair = [digit_a, b_int]
                elif b_int == digit_a:
                    resolved_single = digit_a
            except ValueError:
                resolved_single = digit_a
        else:
            resolved_single = digit_a

    if len(unique_pts) < 1:
        return EntanglementCluster(
            id="manual-invalid",
            state_type=state_type,
            grid_size=size,
            cells=[],
            consistent=False,
            is_manual=True,
            diagnostic="Select empty cells (Ctrl+Click or Pick Cells) first.",
        )

    if len(unique_pts) < 2 and state_type not in ("SUPERPOSITION", "CUSTOM"):
        return EntanglementCluster(
            id="manual-invalid",
            state_type=state_type,
            grid_size=size,
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            consistent=False,
            is_manual=True,
            diagnostic="Select at least 2 empty cells (Ctrl+Click or Pick Cells) to entangle.",
        )

    for r, c in unique_pts:
        if board[r][c] != 0:
            return EntanglementCluster(
                id="manual-invalid",
                state_type=state_type,
                grid_size=size,
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic=f"Cell R{r+1}C{c+1} is already filled with {value_to_symbol(board[r][c], size)}.",
            )

    if state_type == "CUSTOM":
        terms, err = parse_custom_state_terms(custom_state or "", len(unique_pts), size)
        if err:
            return EntanglementCluster(
                id="manual-custom-invalid",
                state_type="CUSTOM",
                grid_size=size,
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                house_label=f"Custom ({len(unique_pts)} cells)",
                mechanism="Custom user-defined superposition",
                diagnostic=err,
            )

        conflicts_found: List[str] = []
        for term in terms:
            for i, ch in enumerate(term):
                if ch == "*":
                    continue
                d = symbol_to_value(ch, size)
                ri, ci = unique_pts[i]
                if d is None or d not in candidates[ri][ci]:
                    conflicts_found.append(f"|{term}⟩: R{ri+1}C{ci+1} cannot take {ch}")
                    break
                for j in range(i + 1, len(term)):
                    if term[j] == ch and are_peers(unique_pts[i], unique_pts[j], size):
                        rj, cj = unique_pts[j]
                        conflicts_found.append(f"|{term}⟩: peers R{ri+1}C{ci+1} & R{rj+1}C{cj+1} share {ch}")
                        break

        consistent = len(conflicts_found) == 0
        diag = (
            f"All {len(terms)} custom ket terms are Sudoku-consistent."
            if consistent
            else f"Custom superposition synthesized (Sudoku warning: {conflicts_found[0]})."
        )
        preview = " + ".join(f"|{t}⟩" for t in terms[:3]) + (" + ..." if len(terms) > 3 else "")
        return EntanglementCluster(
            id=f"manual-custom-{'-'.join(f'r{r+1}c{c+1}' for r, c in unique_pts)}-{'_'.join(terms[:4])}",
            state_type="CUSTOM",
            grid_size=size,
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            custom_terms=terms,
            consistent=consistent,
            is_manual=True,
            house_label=f"Custom ({len(terms)} terms)",
            mechanism=f"Custom quantum state: {preview}",
            diagnostic=diag,
        )

    if state_type == "SUPERPOSITION":
        r, c = unique_pts[0]
        cands = candidates[r][c]
        return EntanglementCluster(
            id=f"manual-sup-r{r+1}c{c+1}",
            state_type="SUPERPOSITION",
            grid_size=size,
            cells=[CellCoord(row=r, col=c)],
            candidate_pair=cands,
            house_label=f"R{r+1}C{c+1}",
            mechanism=f"Single-cell superposition over {len(cands)} candidates",
            consistent=len(cands) > 0,
            is_manual=True,
            diagnostic="Valid superposition register." if cands else "No legal candidates remain.",
        )

    if state_type == "BELL":
        if len(unique_pts) != 2:
            return EntanglementCluster(
                id="manual-bell-invalid",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic="A Bell state requires exactly 2 cells.",
            )
        p1, p2 = unique_pts[0], unique_pts[1]
        c1, c2 = set(candidates[p1[0]][p1[1]]), set(candidates[p2[0]][p2[1]])
        shared = sorted(c1 & c2)
        peers = are_peers(p1, p2, size)

        if explicit_pair is not None:
            a, b = explicit_pair
            sa, sb = value_to_symbol(a, size), value_to_symbol(b, size)
            consistent = peers and ({a, b}.issubset(c1)) and ({a, b}.issubset(c2))
            diag = (
                f"Consistent Bell pair over {{{sa}, {sb}}}."
                if consistent
                else f"Custom Bell hypothesis {{{sa}, {sb}}} (cells do not share a house or both candidates)."
            )
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}-d{a}_{b}",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                candidate_pair=[a, b],
                parity=[0, 1],
                consistent=consistent,
                is_manual=True,
                house_label=f"Manual {{{sa},{sb}}}",
                mechanism=f"Anti-correlated Bell pair over {{{sa}, {sb}}}",
                diagnostic=diag,
            )

        if resolved_single is not None:
            d = resolved_single
            sd = value_to_symbol(d, size)
            consistent = peers and (d in c1) and (d in c2)
            diag = (
                f"Consistent single-symbol link {{{sd}, *}}: at most one peer can take {sd}."
                if consistent
                else f"Custom link {{{sd}, *}} (cells are not peers or symbol {sd} is not shared)."
            )
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}-d{d}w",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                target_digit=d,
                candidate_pair=[0, d],
                parity=[0, 1],
                consistent=consistent,
                is_manual=True,
                house_label=f"Manual {{{sd},*}}",
                mechanism=f"Single-symbol Bell exclusion link {{{sd}, *}}",
                diagnostic=diag,
            )

        if not peers:
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                candidate_pair=shared[:2] if len(shared) >= 2 else [0, shared[0] if shared else 1],
                parity=[0, 1],
                consistent=False,
                is_manual=True,
                house_label="Non-peer pair",
                mechanism="Custom Bell pair (cells do not share a row, column, or box)",
                diagnostic="Warning: These two cells do not share a row, column, or box.",
            )
        if len(c1) == 2 and len(c2) == 2 and c1 == c2:
            pair = sorted(c1)
            sa, sb = value_to_symbol(pair[0], size), value_to_symbol(pair[1], size)
            return EntanglementCluster(
                id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                candidate_pair=pair,
                parity=[0, 1],
                consistent=True,
                is_manual=True,
                house_label=f"Manual Pair {{{sa},{sb}}}",
                mechanism=f"Exact anti-correlated Bell pair over {{{sa}, {sb}}}",
                diagnostic=f"Consistent Bell pair: both cells share exact candidates {{{sa}, {sb}}}.",
            )
        d = shared[0] if shared else 0
        if d == 0:
            return EntanglementCluster(
                id="manual-bell-invalid",
                state_type="BELL",
                grid_size=size,
                cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
                consistent=False,
                is_manual=True,
                diagnostic="Selected peer cells share no common candidates. Choose explicit symbols.",
            )
        sd = value_to_symbol(d, size)
        return EntanglementCluster(
            id=f"manual-bell-r{p1[0]+1}c{p1[1]+1}-r{p2[0]+1}c{p2[1]+1}-d{d}",
            state_type="BELL",
            grid_size=size,
            cells=[CellCoord(row=p1[0], col=p1[1]), CellCoord(row=p2[0], col=p2[1])],
            target_digit=d,
            candidate_pair=[0, d],
            parity=[0, 1],
            consistent=True,
            is_manual=True,
            house_label=f"Manual {{{sd},*}}",
            mechanism=f"Binary exclusion link for {sd} (|*{sd}⟩ + |{sd}*⟩)",
            diagnostic=f"Consistent exclusion link: at most one peer can take {sd}.",
        )

    if state_type == "GHZ":
        if len(unique_pts) < 3 or len(unique_pts) > 6:
            return EntanglementCluster(
                id="manual-ghz-invalid",
                state_type="GHZ",
                grid_size=size,
                cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
                consistent=False,
                is_manual=True,
                diagnostic="Select 3 to 6 cells for a GHZ implication cluster.",
            )
        common = set.intersection(*(set(candidates[r][c]) for r, c in unique_pts))
        adj: Dict[Tuple[int, int], List[Tuple[int, int]]] = defaultdict(list)
        for i in range(len(unique_pts)):
            for j in range(i + 1, len(unique_pts)):
                if are_peers(unique_pts[i], unique_pts[j], size):
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
        parity = [color.get(pt, i % 2) for i, pt in enumerate(unique_pts)]

        if explicit_pair is not None:
            pair_vals = explicit_pair
            consistent = connected and bipartite and set(pair_vals).issubset(common)
            chosen_target = None
            label = f"Manual GHZ {{{value_to_symbol(pair_vals[0], size)},{value_to_symbol(pair_vals[1], size)}}}"
        elif resolved_single is not None:
            pair_vals = [0, resolved_single]
            consistent = connected and bipartite and (resolved_single in common)
            chosen_target = resolved_single
            label = f"Manual GHZ {{{value_to_symbol(resolved_single, size)},*}}"
        else:
            auto_pair = sorted(common)[:2]
            pair_vals = auto_pair if len(auto_pair) == 2 else [0, sorted(common)[0] if common else 1]
            consistent = connected and bipartite and len(auto_pair) >= 2
            chosen_target = pair_vals[1] if pair_vals[0] == 0 else None
            label = f"Manual GHZ ({len(unique_pts)}q)"

        diag = (
            f"Consistent GHZ chain ({label})."
            if consistent
            else "Note: Selected cells do not form a connected bipartite peer chain with those candidates (synthesizing custom GHZ state)."
        )
        return EntanglementCluster(
            id=f"manual-ghz-{'-'.join(f'r{r+1}c{c+1}' for r, c in unique_pts)}",
            state_type="GHZ",
            grid_size=size,
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            target_digit=chosen_target,
            candidate_pair=pair_vals,
            parity=parity,
            consistent=consistent,
            is_manual=True,
            house_label=label,
            mechanism=f"Multi-qubit GHZ implication over {len(unique_pts)} cells",
            diagnostic=diag,
        )

    # W-State
    if len(unique_pts) < 2 or len(unique_pts) > 6:
        return EntanglementCluster(
            id="manual-w-invalid",
            state_type="W",
            grid_size=size,
            cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
            consistent=False,
            is_manual=True,
            diagnostic="Select 2 to 6 cells for a W-state cluster.",
        )
    common = set.intersection(*(set(candidates[r][c]) for r, c in unique_pts))
    d = resolved_single if resolved_single is not None else (sorted(common)[0] if common else None)
    sd = value_to_symbol(d, size) if d is not None else "?"
    shared_house_name = None
    exact_one_hot = False
    if d is not None:
        pt_set = set(unique_pts)
        for h_name, h_cells in all_houses(size):
            if pt_set.issubset(set(h_cells)):
                shared_house_name = h_name
                all_d_in_house = {pt for pt in h_cells if board[pt[0]][pt[1]] == 0 and d in candidates[pt[0]][pt[1]]}
                if all_d_in_house == pt_set:
                    exact_one_hot = True
                    break

    diag = (
        f"Exact W-state: symbol {sd} must occupy exactly one of these {len(unique_pts)} cells in {shared_house_name}."
        if exact_one_hot
        else (
            f"Partial house group for {{{sd}, *}} (other cells in {shared_house_name} can also hold {sd})."
            if d is not None and shared_house_name
            else f"Custom W-state for {{{sd}, *}} across {len(unique_pts)} selected cells."
        )
    )
    return EntanglementCluster(
        id=f"manual-w-{'-'.join(f'r{r+1}c{c+1}' for r, c in unique_pts)}-d{d or 0}",
        state_type="W",
        grid_size=size,
        cells=[CellCoord(row=r, col=c) for r, c in unique_pts],
        target_digit=d,
        parity=[1] + [0] * (len(unique_pts) - 1),
        consistent=exact_one_hot,
        is_manual=True,
        house_label=shared_house_name or f"Manual W {{{sd},*}}",
        mechanism=f"One-hot |W_{len(unique_pts)}> state for {{{sd}, *}}",
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
    """Apply a measured Qiskit bitstring (q0..q_{n-1}) to any supported Sudoku board size."""
    size, _, _ = infer_grid_spec(board)
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
            for i, cell in enumerate(cluster.cells):
                if i < len(bits) and new_board[cell.row][cell.col] == 0:
                    digit = pair[bits[i]]
                    new_board[cell.row][cell.col] = digit
                    reason = "Measured anchor qubit" if i == 0 else f"Entangled {cluster.state_type} collapse"
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

    elif cluster.state_type == "CUSTOM" and cluster.custom_terms:
        n_cells = len(cluster.cells)
        alphabets = [
            sorted({t[i] for t in cluster.custom_terms}, key=lambda ch: (0, "") if ch == "*" else (1, ch))
            for i in range(n_cells)
        ]
        bits_per_cell = [max(1, math.ceil(math.log2(len(a)))) if len(a) > 1 else 1 for a in alphabets]
        bits_to_term: Dict[str, str] = {}
        for term in cluster.custom_terms:
            enc = "".join(
                format(alphabets[i].index(term[i]), f"0{bits_per_cell[i]}b")
                for i in range(n_cells)
            )
            bits_to_term[enc] = term

        clean_bits = "".join(str(b) for b in bits)
        chosen_term = bits_to_term.get(clean_bits)
        if chosen_term:
            for i, cell in enumerate(cluster.cells):
                ch = chosen_term[i]
                if ch != "*" and new_board[cell.row][cell.col] == 0:
                    d = symbol_to_value(ch, size)
                    if d is not None:
                        new_board[cell.row][cell.col] = d
                        trace.append(CollapseStep(row=cell.row, col=cell.col, digit=d, reason=f"Custom state |{chosen_term}⟩ collapse"))

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

    if cascade:
        for _ in range(12):
            cands = compute_candidates(new_board, new_elim)
            forced: Optional[Tuple[int, int, int]] = None
            for r in range(size):
                for c in range(size):
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
