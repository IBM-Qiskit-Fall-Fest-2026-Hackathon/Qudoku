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
from qiskit_aer.primitives import SamplerV2 as AerSamplerV2

from backend.entanglement_engine import EntanglementCluster, value_to_symbol

NoiseProfile = Literal["ideal", "ibm_heron", "ibm_eagle", "custom"]
GateOverride = Literal["normal", "flip_q0", "no_entangle"]

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
    display_labels: Dict[str, str] = Field(default_factory=dict)


class SimulationOutcome(BaseModel):
    cluster_id: str
    state_type: str
    noise_profile: str
    shots: int
    counts: Dict[str, int]
    probabilities: Dict[str, float]
    ideal_probabilities: Dict[str, float]
    valid_bitstrings: List[str]
    display_labels: Dict[str, str] = Field(default_factory=dict)
    constraint_satisfaction_rate: float
    sampled_bitstring: str
    sampled_label: str = ""
    sampled_is_valid: bool
    mitigated: bool = False
    unmitigated_satisfaction_rate: Optional[float] = None
    gate_override: str = "normal"
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


def _custom_encoding(
    cluster: EntanglementCluster,
) -> tuple[List[List[str]], List[int], Dict[str, str], Dict[str, str]]:
    """Build per-cell symbol alphabets, bit widths, and bidirectional term<->bitstring maps."""
    n = max(1, len(cluster.cells))
    terms = cluster.custom_terms or ["*" * n]
    alphabets: List[List[str]] = [
        sorted({t[i] for t in terms}, key=lambda ch: (0, "") if ch == "*" else (1, ch))
        for i in range(n)
    ]
    bits_per_cell = [max(1, math.ceil(math.log2(len(a)))) if len(a) > 1 else 1 for a in alphabets]
    term_to_bits: Dict[str, str] = {}
    bits_to_term: Dict[str, str] = {}
    for term in terms:
        enc = "".join(
            format(alphabets[i].index(term[i]), f"0{bits_per_cell[i]}b")
            for i in range(n)
        )
        term_to_bits[term] = enc
        bits_to_term[enc] = term
    return alphabets, bits_per_cell, term_to_bits, bits_to_term


def _valid_bitstrings_for_cluster(cluster: EntanglementCluster) -> List[str]:
    n = max(1, len(cluster.cells))
    if cluster.state_type == "CUSTOM":
        _, _, term_to_bits, _ = _custom_encoding(cluster)
        return [term_to_bits[t] for t in (cluster.custom_terms or []) if t in term_to_bits]

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


def _format_bitstring(cluster: EntanglementCluster, bitstr: str) -> str:
    """Convert raw computational bitstring (e.g. '01') into Sudoku digit state (e.g. '24')."""
    if cluster.state_type == "CUSTOM":
        _, _, _, bits_to_term = _custom_encoding(cluster)
        return bits_to_term.get(bitstr, f"⊥({bitstr})")

    if cluster.state_type == "SUPERPOSITION":
        cands = cluster.candidate_pair or [1]
        idx = int(bitstr, 2) if bitstr else 0
        return value_to_symbol(cands[idx], cluster.grid_size) if idx < len(cands) else f"⊥({bitstr})"

    if cluster.state_type in ("BELL", "GHZ"):
        pair = cluster.candidate_pair or []
        if len(pair) == 2 and pair[0] != 0:
            s0 = value_to_symbol(pair[0], cluster.grid_size)
            s1 = value_to_symbol(pair[1], cluster.grid_size)
            return "".join(s0 if b == "0" else s1 for b in bitstr)
        if cluster.target_digit is not None:
            sd = value_to_symbol(cluster.target_digit, cluster.grid_size)
            return "".join(sd if b == "1" else "*" for b in bitstr)
        return bitstr

    # W-state: digit d sits at the |1> cell(s)
    if cluster.target_digit is not None:
        sd = value_to_symbol(cluster.target_digit, cluster.grid_size)
        return "".join(sd if b == "1" else "*" for b in bitstr)
    return bitstr


def _build_display_labels(cluster: EntanglementCluster, bitstrings: Set[str]) -> Dict[str, str]:
    return {b: _format_bitstring(cluster, b) for b in sorted(bitstrings)}


def _state_formula(cluster: EntanglementCluster) -> str:
    n = max(1, len(cluster.cells))
    if cluster.state_type == "CUSTOM":
        terms = cluster.custom_terms or ["*" * n]
        k = len(terms)
        preview = " + ".join(f"|{t}⟩" for t in terms[:5])
        suffix = " + ..." if k > 5 else ""
        return f"|ψ_custom⟩ = (1/√{k})({preview}{suffix})" if k > 1 else f"|ψ_custom⟩ = |{terms[0]}⟩"

    if cluster.state_type == "SUPERPOSITION":
        cands = cluster.candidate_pair or [1]
        k = len(cands)
        terms = " + ".join(f"|{value_to_symbol(d, cluster.grid_size)}⟩" for d in cands)
        return f"|ψ⟩ = (1/√{k})({terms})" if k > 1 else f"|ψ⟩ = |{value_to_symbol(cands[0], cluster.grid_size)}⟩"

    valid = _valid_bitstrings_for_cluster(cluster)
    labels = [_format_bitstring(cluster, b) for b in valid]

    if cluster.state_type == "BELL":
        return f"|Ψ⟩ = (1/√2)({ ' + '.join(f'|{lbl}⟩' for lbl in labels) })"

    if cluster.state_type == "GHZ":
        return f"|GHZ_{n}⟩ = (1/√2)({ ' + '.join(f'|{lbl}⟩' for lbl in labels) })"

    preview = " + ".join(f"|{lbl}⟩" for lbl in labels[:4])
    suffix = " + ..." if len(labels) > 4 else ""
    return f"|W_{n}⟩ = (1/√{n})({preview}{suffix})"


def synthesize_cluster_circuit(
    cluster: EntanglementCluster, gate_override: GateOverride = "normal"
) -> tuple[QuantumCircuit, CircuitSynthesisResult]:
    """Synthesize a real Qiskit QuantumCircuit representing the Sudoku constraint cluster."""
    n = max(1, len(cluster.cells))
    pair = cluster.candidate_pair or []
    if cluster.state_type in ("BELL", "GHZ") and len(pair) == 2 and pair[0] != 0:
        s0 = value_to_symbol(pair[0], cluster.grid_size)
        s1 = value_to_symbol(pair[1], cluster.grid_size)
        qubit_labels = [
            f"q{i}: R{c.row + 1}C{c.col + 1} (0→{s0}, 1→{s1})"
            for i, c in enumerate(cluster.cells)
        ]
    elif cluster.target_digit is not None:
        sd = value_to_symbol(cluster.target_digit, cluster.grid_size)
        qubit_labels = [
            f"q{i}: R{c.row + 1}C{c.col + 1} (0→*, 1→{sd})"
            for i, c in enumerate(cluster.cells)
        ]
    else:
        qubit_labels = [f"q{i}: R{c.row + 1}C{c.col + 1}" for i, c in enumerate(cluster.cells)]

    if cluster.state_type == "CUSTOM":
        alphabets, bits_per_cell, term_to_bits, _ = _custom_encoding(cluster)
        m = sum(bits_per_cell)
        qc = QuantumCircuit(m, m, name=f"custom_{m}q")
        terms = cluster.custom_terms or ["*" * n]
        amps = np.zeros(2**m, dtype=complex)
        for term in terms:
            bstr = term_to_bits[term]
            le_idx = int(bstr[::-1], 2)
            amps[le_idx] += 1.0
        norm = np.linalg.norm(amps)
        if norm > 0:
            amps = amps / norm
            qc.append(StatePreparation(amps), list(range(m)))
            qc = transpile(qc, basis_gates=["u", "cx"], optimization_level=1)

        qubit_labels = []
        offset = 0
        for i, cell in enumerate(cluster.cells):
            w = bits_per_cell[i]
            mapping = ", ".join(f"{format(j, f'0{w}b')}→{sym}" for j, sym in enumerate(alphabets[i]))
            q_range = f"q{offset}" if w == 1 else f"q{offset}..q{offset + w - 1}"
            qubit_labels.append(f"{q_range}: R{cell.row + 1}C{cell.col + 1} ({mapping})")
            offset += w

    elif cluster.state_type == "SUPERPOSITION":
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
            for i in range(k):
                # Map q0..q_{m-1} index i into Qiskit little-endian StatePreparation slot
                le_idx = int(format(i, f"0{m}b")[::-1], 2)
                amps[le_idx] = 1.0 / math.sqrt(k)
            qc.append(StatePreparation(amps), list(range(m)))
            qc = transpile(qc, basis_gates=["u", "cx"], optimization_level=1)
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

    elif cluster.state_type == "GHZ":
        qc = QuantumCircuit(n, n, name=f"ghz_{n}q")
        parity = cluster.parity if len(cluster.parity) == n else [i % 2 for i in range(n)]
        qc.h(0)
        for i in range(1, n):
            qc.cx(0, i)
        for i in range(n):
            if parity[i] == 1:
                qc.x(i)

    else:
        # Exact W-state |W_n> over n qubits via sequential CRY + CX cascade
        qc = QuantumCircuit(n, n, name=f"w_state_{n}q")
        qc.x(0)
        for i in range(n - 1):
            remaining = n - i
            theta = 2.0 * math.acos(math.sqrt(1.0 / remaining))
            qc.cry(theta, i, i + 1)
            qc.cx(i + 1, i)

    if gate_override == "no_entangle" and qc.num_qubits >= 2:
        # Educational gate perturbation: drop 2-qubit entangling gates to show constraint leakage
        stripped = QuantumCircuit(qc.num_qubits, qc.num_clbits, name=f"{qc.name}_unentangled")
        for inst in qc.data:
            if inst.operation.num_qubits == 1:
                stripped.append(inst.operation, inst.qubits, inst.clbits)
        qc = stripped
    elif gate_override == "flip_q0" and qc.num_qubits >= 1:
        qc.x(0)

    qc.measure(range(qc.num_qubits), range(qc.num_qubits))

    gate_counts = {str(k): int(v) for k, v in qc.count_ops().items()}
    # qasm2 fails on StatePreparation unless already decomposed (handled above)
    qasm_str = qasm2.dumps(qc)
    diagram_str = str(qc.draw(output="text", fold=68))
    valid_bits = _valid_bitstrings_for_cluster(cluster)
    display_labels = _build_display_labels(cluster, set(valid_bits))

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
        display_labels=display_labels,
    )
    return qc, meta


def _noise_params(noise_profile: NoiseProfile, custom_noise_level: float) -> tuple[float, float, float]:
    if noise_profile == "ideal":
        return 0.0, 0.0, 0.0
    if noise_profile == "ibm_heron":
        return 0.0006, 0.0045, 0.012
    if noise_profile == "ibm_eagle":
        return 0.0014, 0.013, 0.026
    lvl = max(0.0, min(0.20, custom_noise_level))
    return lvl * 0.15, lvl, min(0.25, lvl * 1.3)


def _build_noise_model(noise_profile: NoiseProfile, custom_noise_level: float) -> Optional[NoiseModel]:
    p1, p2, p_ro = _noise_params(noise_profile, custom_noise_level)
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


def _apply_readout_mitigation(
    counts: Dict[str, int], num_qubits: int, p_ro: float, total_shots: int
) -> Dict[str, int]:
    """Invert symmetric tensor-product readout confusion matrix M^{-1} in O(m * 2^m) time."""
    if p_ro <= 0.0 or p_ro >= 0.45 or num_qubits < 1 or num_qubits > 6:
        return counts
    dim = 1 << num_qubits
    probs = np.zeros(dim, dtype=float)
    total = max(1, sum(counts.values()))
    for bs, cnt in counts.items():
        if len(bs) == num_qubits:
            probs[int(bs, 2)] += cnt / total

    det = 1.0 - 2.0 * p_ro
    a = (1.0 - p_ro) / det
    b = -p_ro / det
    for q in range(num_qubits):
        step = 1 << (num_qubits - 1 - q)
        for base in range(0, dim, step * 2):
            for idx in range(base, base + step):
                p0, p1 = probs[idx], probs[idx + step]
                probs[idx] = a * p0 + b * p1
                probs[idx + step] = b * p0 + a * p1

    # Clip small negative sampling fluctuations and project back onto the simplex
    probs = np.maximum(probs, 0.0)
    s = float(probs.sum())
    if s <= 0:
        return counts
    probs /= s

    mitigated_counts: Dict[str, int] = {}
    for idx in range(dim):
        c = int(round(float(probs[idx]) * total_shots))
        if c > 0:
            mitigated_counts[format(idx, f"0{num_qubits}b")] = c
    return mitigated_counts or counts


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
    mitigate_readout: bool = False,
    gate_override: GateOverride = "normal",
) -> SimulationOutcome:
    """Execute the cluster circuit via Qiskit SamplerV2 primitives and analyze constraint fidelity."""
    shots = max(64, min(4096, shots))
    qc, meta = synthesize_cluster_circuit(cluster, gate_override=gate_override)

    # Ideal baseline via Aer SamplerV2 primitive
    ideal_sampler = AerSamplerV2()
    ideal_tqc = transpile(qc, basis_gates=["u", "cx", "h", "x"], optimization_level=1)
    ideal_pub = ideal_sampler.run([ideal_tqc], shots=shots).result()[0]
    ideal_counts = _reverse_qiskit_counts(ideal_pub.data.c.get_counts())
    ideal_probs = {k: round(v / shots, 4) for k, v in sorted(ideal_counts.items())}

    backend_label = "Qiskit Aer SamplerV2 (Ideal)"
    counts = ideal_counts
    _, _, p_ro = _noise_params(noise_profile, custom_noise_level)

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
            _, _, p_ro = _noise_params(noise_profile, custom_noise_level)

    if backend_label == "Qiskit Aer SamplerV2 (Ideal)" and noise_profile != "ideal":
        noise_model = _build_noise_model(noise_profile, custom_noise_level)
        noisy_sampler = (
            AerSamplerV2(options={"backend_options": {"noise_model": noise_model}})
            if noise_model
            else ideal_sampler
        )
        noisy_tqc = transpile(qc, basis_gates=["u", "cx", "h", "x"], optimization_level=1)
        noisy_pub = noisy_sampler.run([noisy_tqc], shots=shots).result()[0]
        counts = _reverse_qiskit_counts(noisy_pub.data.c.get_counts())
        label_map = {
            "ibm_heron": "Qiskit Aer SamplerV2 · IBM Heron Noise Model",
            "ibm_eagle": "Qiskit Aer SamplerV2 · IBM Eagle Noise Model",
            "custom": f"Qiskit Aer SamplerV2 · Custom Noise ({custom_noise_level * 100:.1f}%)",
        }
        backend_label = label_map.get(noise_profile, "Qiskit Aer SamplerV2")

    valid_set: Set[str] = set(meta.valid_bitstrings)
    raw_total = sum(counts.values()) or shots
    unmitigated_rate = round(
        sum(v for k, v in counts.items() if k in valid_set) / raw_total, 4
    )

    applied_mitigation = False
    if mitigate_readout and p_ro > 0.0 and qc.num_qubits <= 6:
        counts = _apply_readout_mitigation(counts, qc.num_qubits, p_ro, shots)
        applied_mitigation = True
        backend_label = f"{backend_label} + Readout Mitigation"

    total = sum(counts.values()) or shots
    probs = {k: round(v / total, 4) for k, v in sorted(counts.items(), key=lambda kv: -kv[1])}

    valid_shots = sum(v for k, v in counts.items() if k in valid_set)
    satisfaction_rate = round(valid_shots / total, 4)

    # Sample one measurement outcome according to the executed distribution
    keys = list(counts.keys())
    weights = [counts[k] for k in keys]
    sampled = random.choices(keys, weights=weights, k=1)[0]
    all_seen_bits = set(counts.keys()) | set(ideal_probs.keys()) | valid_set
    display_labels = _build_display_labels(cluster, all_seen_bits)

    return SimulationOutcome(
        cluster_id=cluster.id,
        state_type=cluster.state_type,
        noise_profile=noise_profile,
        shots=total,
        counts=dict(sorted(counts.items(), key=lambda kv: -kv[1])),
        probabilities=probs,
        ideal_probabilities=ideal_probs,
        valid_bitstrings=meta.valid_bitstrings,
        display_labels=display_labels,
        constraint_satisfaction_rate=satisfaction_rate,
        sampled_bitstring=sampled,
        sampled_label=display_labels.get(sampled, sampled),
        sampled_is_valid=sampled in valid_set,
        mitigated=applied_mitigation,
        unmitigated_satisfaction_rate=unmitigated_rate if applied_mitigation else None,
        gate_override=gate_override,
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
