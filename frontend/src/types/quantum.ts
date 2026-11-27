export type Language = "en" | "hi" | "gu" | "mr" | "kn" | "ta" | "te" | "bn";

export type ThemeMode = "dark" | "light";

export type StateType = "SUPERPOSITION" | "BELL" | "GHZ" | "W" | "CUSTOM";

export type NoiseProfile = "ideal" | "ibm_heron" | "ibm_eagle" | "custom";

export type GateOverride = "normal" | "flip_q0" | "no_entangle";

export type EntanglementMode = "auto" | "manual";

export interface CellCoord {
  row: number;
  col: number;
}

export interface EntanglementCluster {
  id: string;
  state_type: StateType;
  grid_size?: number;
  cells: CellCoord[];
  target_digit?: number | null;
  candidate_pair?: number[] | null;
  parity: number[];
  custom_terms?: string[];
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
  grid_size?: number;
  box_rows?: number;
  box_cols?: number;
  symbols?: string[];
  givens: number[][];
  solution: number[][];
  customTitle?: string;
  isCustom?: boolean;
}

export interface SessionGameRecord {
  puzzle: PuzzleSpec;
  board: number[][];
  notes: number[][][];
  eliminated: Record<string, number[]>;
  elapsedSeconds: number;
  solved: boolean;
  updatedAt: string;
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
  display_labels: Record<string, string>;
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
  display_labels: Record<string, string>;
  constraint_satisfaction_rate: number;
  sampled_bitstring: string;
  sampled_label: string;
  sampled_is_valid: boolean;
  mitigated?: boolean;
  unmitigated_satisfaction_rate?: number | null;
  gate_override?: GateOverride;
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
  concept: StateType | "NOISE" | "SCALING";
  puzzleId: string;
  warmupPuzzleId: string;
  duration: string;
  titleKey: string;
  summaryKey: string;
  analogyKey: string;
  bodyKey: string;
  formula: string;
  formulaExplainKey: string;
  stepsKey: string;
  misconceptionKey: string;
  takeawayKey: string;
}

export interface QuizQuestion {
  id: string;
  topic: string;
  questionKey: string;
  optionKeys: string[];
  correctIndex: number;
  explanationKey: string;
  tipKey: string;
}
