"""Unit and API integration tests for Qudoku backend."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.entanglement_engine import (
    CellCoord,
    EntanglementCluster,
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
    for puzzle in PUZZLES:
        if "tutorial" not in puzzle.id:
            continue
        cands = compute_candidates(puzzle.givens)
        clusters, sup_cells = detect_entanglement_clusters(puzzle.givens, cands)
        if puzzle.concept_focus == "SUPERPOSITION":
            assert any(len(sc.candidates) >= 2 for sc in sup_cells), puzzle.id
        else:
            assert any(c.state_type == puzzle.concept_focus for c in clusters), puzzle.id


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
    assert "SamplerV2" in sim_noisy.backend_label
    assert 0.4 <= sim_noisy.constraint_satisfaction_rate < 1.0

    # Readout error mitigation recovers constraint fidelity on noisy runs
    sim_mit = run_cluster_circuit(
        bell_cl,
        shots=1024,
        noise_profile="custom",
        custom_noise_level=0.10,
        mitigate_readout=True,
    )
    assert sim_mit.mitigated is True
    assert sim_mit.unmitigated_satisfaction_rate is not None
    assert sim_mit.constraint_satisfaction_rate > sim_mit.unmitigated_satisfaction_rate

    # Live gate perturbations break expected anti-correlation cleanly
    sim_flip = run_cluster_circuit(bell_cl, shots=256, noise_profile="ideal", gate_override="flip_q0")
    assert sim_flip.constraint_satisfaction_rate == 0.0
    sim_unent = run_cluster_circuit(bell_cl, shots=512, noise_profile="ideal", gate_override="no_entangle")
    assert 0.35 <= sim_unent.constraint_satisfaction_rate <= 0.65


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

    # Manual single-cell superposition check for k = 1..9
    for k in range(1, 10):
        cands_k = list(range(1, k + 1))
        from backend.entanglement_engine import EntanglementCluster

        sup_cl = EntanglementCluster(
            id=f"test-sup-{k}",
            state_type="SUPERPOSITION",
            cells=[CellCoord(row=0, col=2)],
            candidate_pair=cands_k,
        )
        sim_sup = run_cluster_circuit(sup_cl, shots=128, noise_profile="ideal")
        assert sim_sup.constraint_satisfaction_rate == 1.0

    # Bivalue Bell digit-basis display labels check (e.g., {2,4} -> |24> + |42>)
    from backend.entanglement_engine import EntanglementCluster

    bell_24 = EntanglementCluster(
        id="test-bell-24",
        state_type="BELL",
        cells=[CellCoord(row=0, col=0), CellCoord(row=0, col=1)],
        candidate_pair=[2, 4],
        parity=[0, 1],
    )
    sim_24 = run_cluster_circuit(bell_24, shots=128, noise_profile="ideal")
    assert "|24⟩" in sim_24.circuit.state_formula
    assert "|42⟩" in sim_24.circuit.state_formula
    assert set(sim_24.display_labels.values()).issuperset({"24", "42"})

    # Manual Bell with explicit digit_a=2, digit_b="4" and wildcard digit_a=5, digit_b="*"
    m_pair = build_manual_cluster(
        classic.givens,
        cands,
        [CellCoord(row=0, col=2), CellCoord(row=0, col=3)],
        "BELL",
        digit_a=2,
        digit_b="4",
    )
    assert m_pair.candidate_pair == [2, 4]
    m_wild = build_manual_cluster(
        classic.givens,
        cands,
        [CellCoord(row=0, col=2), CellCoord(row=0, col=6)],
        "BELL",
        digit_a=4,
        digit_b="*",
    )
    sim_wild = run_cluster_circuit(m_wild, shots=128, noise_profile="ideal")
    assert "|*4⟩" in sim_wild.circuit.state_formula
    assert "|4*⟩" in sim_wild.circuit.state_formula

    # Custom ket superposition state: |124> + |142> + |*12>
    m_custom = build_manual_cluster(
        classic.givens,
        cands,
        [CellCoord(row=0, col=2), CellCoord(row=0, col=3), CellCoord(row=0, col=5)],
        "CUSTOM",
        custom_state="|124> + |142> + |*12>",
    )
    assert m_custom.custom_terms == ["124", "142", "*12"]
    sim_custom = run_cluster_circuit(m_custom, shots=256, noise_profile="ideal")
    assert sim_custom.constraint_satisfaction_rate == 1.0
    assert set(sim_custom.display_labels.values()).issuperset({"124", "142", "*12"})
    collapsed_b, _, c_trace, _ = apply_measurement_collapse(
        classic.givens, m_custom, sim_custom.sampled_bitstring, cascade=False
    )
    assert len(c_trace) >= 2
    assert collapsed_b != classic.givens


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
    assert len(puzzles) == 22

    r_analyze = client.post("/api/analyze", json={"board": puzzles[4]["givens"]})
    assert r_analyze.status_code == 200
    data = r_analyze.json()
    assert data["valid"] is True
    assert data["unique_solution"] is True
    assert len(data["clusters"]) > 0

    # Verify 16x16 hex puzzle analysis and Qiskit synthesis
    hex_puz = PUZZLE_MAP["size-16x16-tutorial-bell"]
    r_hex = client.post("/api/analyze", json={"board": hex_puz.givens})
    assert r_hex.status_code == 200
    hex_data = r_hex.json()
    assert hex_data["valid"] is True
    assert hex_data["unique_solution"] is True
    assert len(hex_data["clusters"]) > 0
    sim_hex = run_cluster_circuit(
        EntanglementCluster(**hex_data["clusters"][0]), shots=128, noise_profile="ideal"
    )
    assert sim_hex.constraint_satisfaction_rate == 1.0
