import type {
  AnalyzeBoardResponse,
  CellCoord,
  CollapseResponse,
  EntanglementCluster,
  HardwareBenchmark,
  HintResponse,
  NoiseProfile,
  PuzzleSpec,
  SimulationOutcome,
  StateType,
} from "../types/quantum";

const API_BASE = "/api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  getPuzzles: () => getJson<PuzzleSpec[]>("/puzzles"),
  analyzeBoard: (board: number[][], eliminated: Record<string, number[]>) =>
    postJson<AnalyzeBoardResponse>("/analyze", { board, eliminated, max_clusters: 14 }),
  buildManualCluster: (
    board: number[][],
    eliminated: Record<string, number[]>,
    cells: CellCoord[],
    state_type: StateType,
    target_digit?: number
  ) =>
    postJson<EntanglementCluster>("/manual-cluster", {
      board,
      eliminated,
      cells,
      state_type,
      target_digit: target_digit ?? null,
    }),
  runCircuit: (
    cluster: EntanglementCluster,
    shots: number,
    noise_profile: NoiseProfile,
    custom_noise_level: number
  ) =>
    postJson<SimulationOutcome>("/circuit/run", {
      cluster,
      shots,
      noise_profile,
      custom_noise_level,
    }),
  collapseCluster: (
    board: number[][],
    eliminated: Record<string, number[]>,
    cluster: EntanglementCluster,
    shots: number,
    noise_profile: NoiseProfile,
    custom_noise_level: number,
    cascade: boolean,
    bitstring?: string
  ) =>
    postJson<CollapseResponse>("/collapse", {
      board,
      eliminated,
      cluster,
      bitstring: bitstring ?? null,
      shots,
      noise_profile,
      custom_noise_level,
      cascade,
    }),
  getHint: (board: number[][]) => postJson<HintResponse>("/hint", { board }),
  getHardwareBenchmarks: () => getJson<HardwareBenchmark[]>("/hardware-benchmarks"),
};
