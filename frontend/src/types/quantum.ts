export type Language = "en" | "hi" | "gu";

export type StateType = "SUPERPOSITION" | "BELL" | "GHZ" | "W";

export type NoiseProfile = "ideal" | "ibm_heron" | "ibm_eagle" | "custom";

export type EntanglementMode = "auto" | "manual";

export interface CellCoord {
  row: number;
  col: number;
}

export interface EntanglementCluster {
  id: string;
  state_type: StateType;
  cells: CellCoord[];
  target_digit?: number | null;
  candidate_pair?: number[] | null;
  parity: number[];
  house_label: string;
  mechanism: string;
  consistent: boolean;
  diagnostic: string;
  is_manual: boolean;
}

export interface SuperpositionCell {
  row: number;
  col: number;
  candidates: number[];
  amplitude: number;
  entropy_bits: number;
}

export interface CollapseStep {
  row: number;
  col: number;
  digit: number;
  reason: string;
}

export interface PuzzleSpec {
  id: string;
  title_key: string;
  description_key: string;
  difficulty: string;
  concept_focus: string;
  givens: number[][];
  solution: number[][];
}

export interface AnalyzeBoardResponse {
  valid: boolean;
  conflicts: CellCoord[];
  solvable: boolean;
  unique_solution: boolean;
  candidates: number[][][];
  superposition_cells: SuperpositionCell[];
  clusters: EntanglementCluster[];
}

export interface CircuitSynthesisResult {
  cluster_id: string;
  state_type: StateType;
  num_qubits: number;
  depth: number;
  gate_counts: Record<string, number>;
  qasm: string;
  circuit_diagram: string;
  state_formula: string;
  qubit_labels: string[];
  valid_bitstrings: string[];
}

export interface SimulationOutcome {
  cluster_id: string;
  state_type: StateType;
  noise_profile: NoiseProfile;
  shots: number;
  counts: Record<string, number>;
  probabilities: Record<string, number>;
  ideal_probabilities: Record<string, number>;
  valid_bitstrings: string[];
  constraint_satisfaction_rate: number;
  sampled_bitstring: string;
  sampled_is_valid: boolean;
  circuit: CircuitSynthesisResult;
  backend_label: string;
}

export interface CollapseResponse {
  board: number[][];
  eliminated: Record<string, number[]>;
  trace: CollapseStep[];
  valid: boolean;
  simulation: SimulationOutcome;
}

export interface HardwareBenchmark {
  id: string;
  backend_name: string;
  processor_family: string;
  num_qubits_qpu: number;
  state_type: StateType;
  circuit_qubits: number;
  shots: number;
  calibration_date: string;
  median_2q_error: number;
  median_readout_error: number;
  counts: Record<string, number>;
  valid_bitstrings: string[];
  constraint_satisfaction_rate: number;
  notes: string;
}

export interface HintResponse {
  found: boolean;
  row?: number | null;
  col?: number | null;
  digit?: number | null;
  reason: string;
}

export interface LessonSpec {
  id: string;
  concept: StateType | "NOISE";
  puzzleId: string;
  titleKey: string;
  summaryKey: string;
  bodyKey: string;
  formula: string;
  takeawayKey: string;
}

export interface QuizQuestion {
  id: string;
  questionKey: string;
  optionKeys: string[];
  correctIndex: number;
  explanationKey: string;
}
