"""FastAPI application exposing Qudoku solver, entanglement detection, Qiskit execution, and hardware benchmarks."""

from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.entanglement_engine import (
    CellCoord,
    CollapseStep,
    EntanglementCluster,
    StateType,
    SuperpositionCell,
    apply_measurement_collapse,
    build_manual_cluster,
    compute_candidates,
    detect_entanglement_clusters,
    solve_exact_cover,
    validate_board,
)
from backend.puzzles import PUZZLES, PUZZLE_MAP, PuzzleSpec
from backend.quantum_service import (
    CircuitSynthesisResult,
    HardwareBenchmark,
    NoiseProfile,
    SimulationOutcome,
    load_cached_hardware_benchmarks,
    run_cluster_circuit,
    synthesize_cluster_circuit,
)

app = FastAPI(
    title="Qudoku API",
    description="Interactive Quantum Sudoku Learning Platform backed by Exact Cover & Qiskit",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeBoardRequest(BaseModel):
    board: List[List[int]]
    eliminated: Dict[str, List[int]] = Field(default_factory=dict)
    max_clusters: int = Field(default=12, ge=1, le=30)


class AnalyzeBoardResponse(BaseModel):
    valid: bool
    conflicts: List[CellCoord]
    solvable: bool
    unique_solution: bool
    candidates: List[List[List[int]]]
    superposition_cells: List[SuperpositionCell]
    clusters: List[EntanglementCluster]


class ManualClusterRequest(BaseModel):
    board: List[List[int]]
    eliminated: Dict[str, List[int]] = Field(default_factory=dict)
    cells: List[CellCoord]
    state_type: StateType
    target_digit: Optional[int] = Field(default=None, ge=1, le=9)


class RunCircuitRequest(BaseModel):
    cluster: EntanglementCluster
    shots: int = Field(default=1024, ge=64, le=4096)
    noise_profile: NoiseProfile = "ideal"
    custom_noise_level: float = Field(default=0.02, ge=0.0, le=0.20)
    use_ibm_hardware: bool = False


class CollapseRequest(BaseModel):
    board: List[List[int]]
    eliminated: Dict[str, List[int]] = Field(default_factory=dict)
    cluster: EntanglementCluster
    bitstring: Optional[str] = None
    shots: int = Field(default=1024, ge=64, le=4096)
    noise_profile: NoiseProfile = "ideal"
    custom_noise_level: float = Field(default=0.02, ge=0.0, le=0.20)
    cascade: bool = True


class CollapseResponse(BaseModel):
    board: List[List[int]]
    eliminated: Dict[str, List[int]]
    trace: List[CollapseStep]
    valid: bool
    simulation: SimulationOutcome


class HintRequest(BaseModel):
    board: List[List[int]]


class HintResponse(BaseModel):
    found: bool
    row: Optional[int] = None
    col: Optional[int] = None
    digit: Optional[int] = None
    reason: str


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "engine": "qiskit-aer + exact-cover"}


@app.get("/api/puzzles", response_model=List[PuzzleSpec])
def list_puzzles() -> List[PuzzleSpec]:
    return PUZZLES


@app.get("/api/puzzles/{puzzle_id}", response_model=PuzzleSpec)
def get_puzzle(puzzle_id: str) -> PuzzleSpec:
    puzzle = PUZZLE_MAP.get(puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=404, detail=f"Unknown puzzle_id: {puzzle_id}")
    return puzzle


@app.post("/api/analyze", response_model=AnalyzeBoardResponse)
def analyze_board(req: AnalyzeBoardRequest) -> AnalyzeBoardResponse:
    valid, conflict_pts = validate_board(req.board)
    candidates = compute_candidates(req.board, req.eliminated)
    clusters, sup_cells = detect_entanglement_clusters(req.board, candidates, max_clusters=req.max_clusters)

    sols = solve_exact_cover(req.board, limit=2) if valid else []
    return AnalyzeBoardResponse(
        valid=valid,
        conflicts=[CellCoord(row=r, col=c) for r, c in conflict_pts],
        solvable=len(sols) >= 1,
        unique_solution=len(sols) == 1,
        candidates=candidates,
        superposition_cells=sup_cells,
        clusters=clusters,
    )


@app.post("/api/manual-cluster", response_model=EntanglementCluster)
def create_manual_cluster(req: ManualClusterRequest) -> EntanglementCluster:
    candidates = compute_candidates(req.board, req.eliminated)
    return build_manual_cluster(
        board=req.board,
        candidates=candidates,
        cells=req.cells,
        state_type=req.state_type,
        target_digit=req.target_digit,
    )


@app.post("/api/circuit/synthesize", response_model=CircuitSynthesisResult)
def synthesize_circuit(cluster: EntanglementCluster) -> CircuitSynthesisResult:
    _, meta = synthesize_cluster_circuit(cluster)
    return meta


@app.post("/api/circuit/run", response_model=SimulationOutcome)
def execute_circuit(req: RunCircuitRequest) -> SimulationOutcome:
    return run_cluster_circuit(
        cluster=req.cluster,
        shots=req.shots,
        noise_profile=req.noise_profile,
        custom_noise_level=req.custom_noise_level,
        use_ibm_hardware=req.use_ibm_hardware,
    )


@app.post("/api/collapse", response_model=CollapseResponse)
def collapse_cluster(req: CollapseRequest) -> CollapseResponse:
    sim = run_cluster_circuit(
        cluster=req.cluster,
        shots=req.shots,
        noise_profile=req.noise_profile,
        custom_noise_level=req.custom_noise_level,
    )
    chosen_bits = req.bitstring or sim.sampled_bitstring
    new_board, new_elim, trace, valid = apply_measurement_collapse(
        board=req.board,
        cluster=req.cluster,
        bitstring=chosen_bits,
        cascade=req.cascade,
        eliminated=req.eliminated,
    )
    return CollapseResponse(
        board=new_board,
        eliminated=new_elim,
        trace=trace,
        valid=valid,
        simulation=sim,
    )


@app.post("/api/hint", response_model=HintResponse)
def get_hint(req: HintRequest) -> HintResponse:
    sols = solve_exact_cover(req.board, limit=1)
    if not sols:
        return HintResponse(found=False, reason="Current board has no valid solution.")
    solution = sols[0]
    candidates = compute_candidates(req.board)
    best_cell = None
    best_len = 10
    for r in range(9):
        for c in range(9):
            if req.board[r][c] == 0:
                clen = len(candidates[r][c])
                if 0 < clen < best_len:
                    best_len = clen
                    best_cell = (r, c)
    if not best_cell:
        return HintResponse(found=False, reason="Board is already solved!")
    hr, hc = best_cell
    return HintResponse(
        found=True,
        row=hr,
        col=hc,
        digit=solution[hr][hc],
        reason=f"Cell R{hr+1}C{hc+1} had {best_len} superposition candidate(s) and collapses to {solution[hr][hc]}.",
    )


@app.get("/api/hardware-benchmarks", response_model=List[HardwareBenchmark])
def get_hardware_benchmarks() -> List[HardwareBenchmark]:
    return load_cached_hardware_benchmarks()
