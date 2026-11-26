"""Unit and API integration tests for Qudoku backend."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.entanglement_engine import (
    CellCoord,
    apply_measurement_collapse,
    build_manual_cluster,
    compute_candidates,
    detect_entanglement_clusters,
    solve_exact_cover,
    validate_board,
)
from backend.main import app
from backend.puzzles import PUZZLES, PUZZLE_MAP
from backend.quantum_service import (
    load_cached_hardware_benchmarks,
    run_cluster_circuit,
    synthesize_cluster_circuit,
)

client = TestClient(app)


def test_all_puzzles_have_unique_valid_solutions():
    for puzzle in PUZZLES:
        valid, conflicts = validate_board(puzzle.givens)
        assert valid, f"{puzzle.id} givens invalid: {conflicts}"
        sols = solve_exact_cover(puzzle.givens, limit=2)
        assert len(sols) == 1, f"{puzzle.id} expected 1 unique solution, got {len(sols)}"
        assert sols[0] == puzzle.solution, f"{puzzle.id} solution mismatch"


def test_tutorial_puzzles_expose_target_quantum_concepts():
    # Superposition puzzle should have cells with >= 2 candidates
    sup_puz = PUZZLE_MAP["tutorial-superposition"]
    sup_cands = compute_candidates(sup_puz.givens)
    _, sup_cells = detect_entanglement_clusters(sup_puz.givens, sup_cands)
    assert any(len(sc.candidates) >= 2 for sc in sup_cells)

    # Bell puzzle should detect at least one BELL cluster
    bell_puz = PUZZLE_MAP["tutorial-bell"]
    bell_clusters, _ = detect_entanglement_clusters(
        bell_puz.givens, compute_candidates(bell_puz.givens)
    )
    assert any(c.state_type == "BELL" for c in bell_clusters)

    # GHZ puzzle should detect at least one GHZ cluster
    ghz_puz = PUZZLE_MAP["tutorial-ghz"]
    ghz_clusters, _ = detect_entanglement_clusters(
        ghz_puz.givens, compute_candidates(ghz_puz.givens)
    )
    assert any(c.state_type == "GHZ" for c in ghz_clusters)

    # W-state puzzle should detect at least one W cluster
    w_puz = PUZZLE_MAP["tutorial-wstate"]
    w_clusters, _ = detect_entanglement_clusters(
        w_puz.givens, compute_candidates(w_puz.givens)
    )
    assert any(c.state_type == "W" for c in w_clusters)


def test_qiskit_circuit_synthesis_and_ideal_distributions():
    bell = PUZZLE_MAP["tutorial-bell"]
    bell_clusters, _ = detect_entanglement_clusters(bell.givens, compute_candidates(bell.givens))
    bell_cl = next(c for c in bell_clusters if c.state_type == "BELL")
    sim_bell = run_cluster_circuit(bell_cl, shots=512, noise_profile="ideal")
    assert sim_bell.constraint_satisfaction_rate == 1.0
    assert set(sim_bell.counts.keys()).issubset(set(sim_bell.valid_bitstrings))

    w_puz = PUZZLE_MAP["tutorial-wstate"]
    w_clusters, _ = detect_entanglement_clusters(w_puz.givens, compute_candidates(w_puz.givens))
    w_cl = next(c for c in w_clusters if c.state_type == "W")
    sim_w = run_cluster_circuit(w_cl, shots=512, noise_profile="ideal")
    assert sim_w.constraint_satisfaction_rate == 1.0
    for bitstr in sim_w.counts:
        assert bitstr.count("1") == 1


def test_noisy_simulation_reduces_or_maintains_fidelity_bound():
    bell = PUZZLE_MAP["tutorial-bell"]
    bell_clusters, _ = detect_entanglement_clusters(bell.givens, compute_candidates(bell.givens))
    bell_cl = next(c for c in bell_clusters if c.state_type == "BELL")
    sim_noisy = run_cluster_circuit(
        bell_cl, shots=1024, noise_profile="custom", custom_noise_level=0.10
    )
    assert 0.4 <= sim_noisy.constraint_satisfaction_rate < 1.0


def test_collapse_cascade_and_manual_cluster():
    classic = PUZZLE_MAP["sandbox-classic"]
    cands = compute_candidates(classic.givens)
    clusters, _ = detect_entanglement_clusters(classic.givens, cands)
    assert len(clusters) > 0
    cl = clusters[0]
    sim = run_cluster_circuit(cl, shots=256, noise_profile="ideal")
    new_board, _, trace, valid = apply_measurement_collapse(
        classic.givens, cl, sim.sampled_bitstring, cascade=True
    )
    assert valid
    assert len(trace) >= 1
    assert new_board != classic.givens

    # Manual single-cell superposition check
    manual_sup = build_manual_cluster(
        classic.givens, cands, [CellCoord(row=0, col=2)], "SUPERPOSITION"
    )
    _, meta = synthesize_cluster_circuit(manual_sup)
    assert meta.num_qubits >= 1


def test_cached_hardware_benchmarks_load():
    benchmarks = load_cached_hardware_benchmarks()
    assert len(benchmarks) >= 4
    for bm in benchmarks:
        assert sum(bm.counts.values()) == bm.shots


def test_api_endpoints():
    r_health = client.get("/api/health")
    assert r_health.status_code == 200

    r_puzzles = client.get("/api/puzzles")
    assert r_puzzles.status_code == 200
    puzzles = r_puzzles.json()
    assert len(puzzles) == 6

    r_analyze = client.post("/api/analyze", json={"board": puzzles[4]["givens"]})
    assert r_analyze.status_code == 200
    data = r_analyze.json()
    assert data["valid"] is True
    assert data["unique_solution"] is True
    assert len(data["clusters"]) > 0
