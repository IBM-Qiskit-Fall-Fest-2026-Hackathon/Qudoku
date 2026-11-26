"""Dynamic Qiskit circuit synthesis, Aer simulation with noise models, and IBM hardware benchmarks."""

from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set

import numpy as np
from pydantic import BaseModel, Field
from qiskit import QuantumCircuit, qasm2, transpile
from qiskit.circuit.library import StatePreparation
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, ReadoutError, depolarizing_error

from backend.entanglement_engine import EntanglementCluster

NoiseProfile = Literal["ideal", "ibm_heron", "ibm_eagle", "custom"]

CACHED_HARDWARE_DIR = Path(__file__).parent / "cached_hardware"


class CircuitSynthesisResult(BaseModel):
    cluster_id: str
    state_type: str
    num_qubits: int
    depth: int
    gate_counts: Dict[str, int]
    qasm: str
    circuit_diagram: str
    state_formula: str
    qubit_labels: List[str]
    valid_bitstrings: List[str]


class SimulationOutcome(BaseModel):
    cluster_id: str
    state_type: str
    noise_profile: str
    shots: int
    counts: Dict[str, int]
    probabilities: Dict[str, float]
    ideal_probabilities: Dict[str, float]
    valid_bitstrings: List[str]
    constraint_satisfaction_rate: float
    sampled_bitstring: str
    sampled_is_valid: bool
    circuit: CircuitSynthesisResult
    backend_label: str


class HardwareBenchmark(BaseModel):
    id: str
    backend_name: str
    processor_family: str
    num_qubits_qpu: int
    state_type: str
    circuit_qubits: int
    shots: int
    calibration_date: str
    median_2q_error: float
    median_readout_error: float
    counts: Dict[str, int]
    valid_bitstrings: List[str]
    constraint_satisfaction_rate: float
    notes: str


def _valid_bitstrings_for_cluster(cluster: EntanglementCluster) -> List[str]:
    n = max(1, len(cluster.cells))
    if cluster.state_type == "SUPERPOSITION":
        k = max(1, len(cluster.candidate_pair or []))
        m = max(1, math.ceil(math.log2(k))) if k > 1 else 1
        return [format(i, f"0{m}b") for i in range(k)]

    if cluster.state_type in ("BELL", "GHZ"):
        parity = cluster.parity if len(cluster.parity) == n else [i % 2 for i in range(n)]
        b0 = "".join(str(p) for p in parity)
        b1 = "".join(str(1 - p) for p in parity)
        return sorted({b0, b1})

    # W-state: exact Hamming weight == 1
    return [("0" * i) + "1" + ("0" * (n - i - 1)) for i in range(n)]


def _state_formula(cluster: EntanglementCluster) -> str:
    n = max(1, len(cluster.cells))
    if cluster.state_type == "SUPERPOSITION":
        cands = cluster.candidate_pair or [1]
        k = len(cands)
        terms = " + ".join(f"|{d}⟩" for d in cands)
        return f"|ψ⟩ = (1/√{k})({terms})" if k > 1 else f"|ψ⟩ = |{cands[0]}⟩"

    if cluster.state_type == "BELL":
        valid = _valid_bitstrings_for_cluster(cluster)
        return f"|Φ/Ψ⟩ = (1/√2)({ ' + '.join(f'|{b}⟩' for b in valid) })"

    if cluster.state_type == "GHZ":
        valid = _valid_bitstrings_for_cluster(cluster)
        return f"|GHZ_{n}⟩ = (1/√2)({ ' + '.join(f'|{b}⟩' for b in valid) })"

    valid = _valid_bitstrings_for_cluster(cluster)
    preview = " + ".join(f"|{b}⟩" for b in valid[:4])
    suffix = " + ..." if len(valid) > 4 else ""
    return f"|W_{n}⟩ = (1/√{n})({preview}{suffix})"


def synthesize_cluster_circuit(cluster: EntanglementCluster) -> tuple[QuantumCircuit, CircuitSynthesisResult]:
    """Synthesize a real Qiskit QuantumCircuit representing the Sudoku constraint cluster."""
    n = max(1, len(cluster.cells))
    qubit_labels = [f"q{i}: R{c.row + 1}C{c.col + 1}" for i, c in enumerate(cluster.cells)]

    if cluster.state_type == "SUPERPOSITION":
        cands = cluster.candidate_pair or [1]
        k = len(cands)
        m = max(1, math.ceil(math.log2(k))) if k > 1 else 1
        qc = QuantumCircuit(m, m, name=f"sup_{k}")
        if k == 2:
            qc.h(0)
        elif k == 4:
            qc.h(0)
            qc.h(1)
        elif k == 8:
            qc.h(0)
            qc.h(1)
            qc.h(2)
        elif k > 1:
            amps = np.zeros(2**m, dtype=complex)
            amps[:k] = 1.0 / math.sqrt(k)
            qc.append(StatePreparation(amps), list(range(m)))
            qc = transpile(qc, basis_gates=["u", "cx"], optimization_level=1)
        qc.measure(range(m), range(m))
        qubit_labels = [f"q{i}: R{cluster.cells[0].row + 1}C{cluster.cells[0].col + 1}[b{i}]" for i in range(m)]

    elif cluster.state_type == "BELL":
        qc = QuantumCircuit(2, 2, name="bell_constraint")
        parity = cluster.parity if len(cluster.parity) == 2 else [0, 1]
        qc.h(0)
        qc.cx(0, 1)
        if parity[0] == 1:
            qc.x(0)
        if parity[1] == 1:
            qc.x(1)
        qc.measure([0, 1], [0, 1])

    elif cluster.state_type == "GHZ":
        qc = QuantumCircuit(n, n, name=f"ghz_{n}q")
        parity = cluster.parity if len(cluster.parity) == n else [i % 2 for i in range(n)]
        qc.h(0)
        for i in range(1, n):
            qc.cx(0, i)
        for i in range(n):
            if parity[i] == 1:
                qc.x(i)
        qc.measure(range(n), range(n))

    else:
        # Exact W-state |W_n> over n qubits via sequential CRY + CX cascade
        qc = QuantumCircuit(n, n, name=f"w_state_{n}q")
        qc.x(0)
        for i in range(n - 1):
            remaining = n - i
            theta = 2.0 * math.acos(math.sqrt(1.0 / remaining))
            qc.cry(theta, i, i + 1)
            qc.cx(i + 1, i)
        qc.measure(range(n), range(n))

    gate_counts = {str(k): int(v) for k, v in qc.count_ops().items()}
    # qasm2 fails on StatePreparation unless already decomposed (handled above)
    qasm_str = qasm2.dumps(qc)
    diagram_str = str(qc.draw(output="text", fold=-1))
    valid_bits = _valid_bitstrings_for_cluster(cluster)

    meta = CircuitSynthesisResult(
        cluster_id=cluster.id,
        state_type=cluster.state_type,
        num_qubits=qc.num_qubits,
        depth=qc.depth() or 1,
        gate_counts=gate_counts,
        qasm=qasm_str,
        circuit_diagram=diagram_str,
        state_formula=_state_formula(cluster),
        qubit_labels=qubit_labels,
        valid_bitstrings=valid_bits,
    )
    return qc, meta


def _build_noise_model(noise_profile: NoiseProfile, custom_noise_level: float) -> Optional[NoiseModel]:
    if noise_profile == "ideal":
        return None

    if noise_profile == "ibm_heron":
        p1, p2, p_ro = 0.0006, 0.0045, 0.012
    elif noise_profile == "ibm_eagle":
        p1, p2, p_ro = 0.0014, 0.013, 0.026
    else:
        lvl = max(0.0, min(0.20, custom_noise_level))
        p1, p2, p_ro = lvl * 0.15, lvl, min(0.25, lvl * 1.3)

    if p1 == 0 and p2 == 0 and p_ro == 0:
        return None

    noise_model = NoiseModel()
    err_1q = depolarizing_error(p1, 1)
    err_2q = depolarizing_error(p2, 2)
    ro_err = ReadoutError([[1.0 - p_ro, p_ro], [p_ro, 1.0 - p_ro]])

    noise_model.add_all_qubit_quantum_error(err_1q, ["h", "x", "u", "ry", "rz", "sx"])
    noise_model.add_all_qubit_quantum_error(err_2q, ["cx", "cry"])
    noise_model.add_all_qubit_readout_error(ro_err)
    return noise_model


def _reverse_qiskit_counts(raw_counts: Dict[str, int]) -> Dict[str, int]:
    """Convert Qiskit little-endian bitstrings (c_{n-1}..c_0) to qubit-indexed q_0..q_{n-1}."""
    converted: Dict[str, int] = {}
    for bitstr, count in raw_counts.items():
        clean = bitstr.replace(" ", "")[::-1]
        converted[clean] = converted.get(clean, 0) + int(count)
    return converted


def run_cluster_circuit(
    cluster: EntanglementCluster,
    shots: int = 1024,
    noise_profile: NoiseProfile = "ideal",
    custom_noise_level: float = 0.02,
    use_ibm_hardware: bool = False,
) -> SimulationOutcome:
    """Execute the cluster circuit on Qiskit Aer (or optional IBM Runtime) and analyze validity."""
    shots = max(64, min(4096, shots))
    qc, meta = synthesize_cluster_circuit(cluster)

    # Ideal baseline probabilities
    ideal_sim = AerSimulator()
    ideal_tqc = transpile(qc, basis_gates=["u", "cx", "h", "x"], optimization_level=1)
    ideal_res = ideal_sim.run(ideal_tqc, shots=shots).result()
    ideal_counts = _reverse_qiskit_counts(ideal_res.get_counts())
    ideal_probs = {k: round(v / shots, 4) for k, v in sorted(ideal_counts.items())}

    backend_label = "Qiskit AerSimulator (Ideal)"
    counts = ideal_counts

    if use_ibm_hardware and os.getenv("QISKIT_IBM_TOKEN"):
        # Optional live IBM Quantum Runtime path when user supplies token
        try:
            from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2

            service = QiskitRuntimeService(channel="ibm_quantum", token=os.getenv("QISKIT_IBM_TOKEN"))
            backend = service.least_busy(operational=True, simulator=False, min_num_qubits=qc.num_qubits)
            isa_qc = transpile(qc, backend=backend, optimization_level=1)
            sampler = SamplerV2(mode=backend)
            job = sampler.run([isa_qc], shots=shots)
            pub_result = job.result()[0]
            raw_counts = pub_result.data.c.get_counts()
            counts = _reverse_qiskit_counts(raw_counts)
            backend_label = f"IBM Quantum ({backend.name})"
        except Exception:
            noise_profile = "ibm_heron"

    if backend_label == "Qiskit AerSimulator (Ideal)" and noise_profile != "ideal":
        noise_model = _build_noise_model(noise_profile, custom_noise_level)
        noisy_sim = AerSimulator(noise_model=noise_model) if noise_model else ideal_sim
        noisy_tqc = transpile(qc, basis_gates=["u", "cx", "h", "x"], optimization_level=1)
        noisy_res = noisy_sim.run(noisy_tqc, shots=shots).result()
        counts = _reverse_qiskit_counts(noisy_res.get_counts())
        label_map = {
            "ibm_heron": "Qiskit Aer · IBM Heron Noise Model",
            "ibm_eagle": "Qiskit Aer · IBM Eagle Noise Model",
            "custom": f"Qiskit Aer · Custom Noise ({custom_noise_level * 100:.1f}%)",
        }
        backend_label = label_map.get(noise_profile, "Qiskit AerSimulator")

    total = sum(counts.values()) or shots
    probs = {k: round(v / total, 4) for k, v in sorted(counts.items(), key=lambda kv: -kv[1])}
    valid_set: Set[str] = set(meta.valid_bitstrings)

    valid_shots = sum(v for k, v in counts.items() if k in valid_set)
    satisfaction_rate = round(valid_shots / total, 4)

    # Sample one measurement outcome according to the executed distribution
    keys = list(counts.keys())
    weights = [counts[k] for k in keys]
    sampled = random.choices(keys, weights=weights, k=1)[0]

    return SimulationOutcome(
        cluster_id=cluster.id,
        state_type=cluster.state_type,
        noise_profile=noise_profile,
        shots=total,
        counts=dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        probabilities=probs,
        ideal_probabilities=ideal_probs,
        valid_bitstrings=meta.valid_bitstrings,
        constraint_satisfaction_rate=satisfaction_rate,
        sampled_bitstring=sampled,
        sampled_is_valid=sampled in valid_set,
        circuit=meta,
        backend_label=backend_label,
    )


def load_cached_hardware_benchmarks() -> List[HardwareBenchmark]:
    """Load pre-run IBM Quantum Eagle / Heron benchmark JSON files from cached_hardware/."""
    benchmarks: List[HardwareBenchmark] = []
    if not CACHED_HARDWARE_DIR.exists():
        return benchmarks
    for path in sorted(CACHED_HARDWARE_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        benchmarks.append(HardwareBenchmark(**data))
    return benchmarks
