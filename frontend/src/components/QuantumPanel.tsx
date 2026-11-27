import React, { useState } from "react";
import {
  Activity,
  Cpu,
  GitBranch,
  MousePointerClick,
  Play,
  Radio,
  Server,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { TranslationDict } from "../i18n/translations";
import type {
  CellCoord,
  CollapseStep,
  EntanglementCluster,
  EntanglementMode,
  GateOverride,
  HardwareBenchmark,
  NoiseProfile,
  SimulationOutcome,
  StateType,
  ThemeMode,
} from "../types/quantum";
import { getGridSpec, valueToSymbol } from "../utils/sudokuConfig";
import { HistogramChart } from "./HistogramChart";
import { InfoBadge, Tooltip } from "./InfoTooltip";

interface QuantumPanelProps {
  t: TranslationDict;
  gridSize: number;
  entanglementMode: EntanglementMode;
  onModeChange: (mode: EntanglementMode) => void;
  clusters: EntanglementCluster[];
  manualClusters: EntanglementCluster[];
  activeCluster: EntanglementCluster | null;
  onSelectCluster: (id: string) => void;
  onSelectManualCluster: (id: string) => void;
  onDeleteManualCluster: (id: string) => void;
  manualPicking: boolean;
  onToggleManualPicking: () => void;
  manualCells: CellCoord[];
  manualStateType: StateType;
  manualDigitA: number | null;
  manualDigitB: string | null;
  manualCustomState: string;
  onManualStateTypeChange: (st: StateType) => void;
  onManualDigitAChange: (d: number | null) => void;
  onManualDigitBChange: (d: string | null) => void;
  onManualCustomStateChange: (expr: string) => void;
  onSynthesizeManual: () => void;
  onClearManual: () => void;
  noiseProfile: NoiseProfile;
  onNoiseProfileChange: (p: NoiseProfile) => void;
  customNoiseLevel: number;
  onCustomNoiseChange: (v: number) => void;
  shots: number;
  onShotsChange: (s: number) => void;
  mitigateReadout: boolean;
  onMitigateReadoutChange: (v: boolean) => void;
  gateOverride: GateOverride;
  onGateOverrideChange: (g: GateOverride) => void;
  cascadeEnabled: boolean;
  onCascadeChange: (v: boolean) => void;
  autoFillSingleNote: boolean;
  onToggleAutoFillSingleNote: () => void;
  simulation: SimulationOutcome | null;
  isRunning: boolean;
  onRunCircuit: () => void;
  lastCollapseTrace: CollapseStep[];
  hardwareBenchmarks: HardwareBenchmark[];
  theme?: ThemeMode;
  isInspectingSingleCell?: boolean;
  onExitSingleCell?: () => void;
}

const BADGE_STYLE: Record<StateType, string> = {
  BELL: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  GHZ: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  W: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  SUPERPOSITION: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  CUSTOM: "bg-pink-500/15 text-pink-300 border-pink-500/40",
};

export const QuantumPanel: React.FC<QuantumPanelProps> = ({
  t,
  gridSize,
  entanglementMode,
  onModeChange,
  clusters,
  manualClusters,
  activeCluster,
  onSelectCluster,
  onSelectManualCluster,
  onDeleteManualCluster,
  manualPicking,
  onToggleManualPicking,
  manualCells,
  manualStateType,
  manualDigitA,
  manualDigitB,
  manualCustomState,
  onManualStateTypeChange,
  onManualDigitAChange,
  onManualDigitBChange,
  onManualCustomStateChange,
  onSynthesizeManual,
  onClearManual,
  noiseProfile,
  onNoiseProfileChange,
  customNoiseLevel,
  onCustomNoiseChange,
  shots,
  onShotsChange,
  mitigateReadout,
  onMitigateReadoutChange,
  gateOverride,
  onGateOverrideChange,
  cascadeEnabled,
  onCascadeChange,
  autoFillSingleNote,
  onToggleAutoFillSingleNote,
  simulation,
  isRunning,
  onRunCircuit,
  lastCollapseTrace,
  hardwareBenchmarks,
  theme = "dark",
  isInspectingSingleCell,
  onExitSingleCell,
}) => {
  const [activeTab, setActiveTab] = useState<"circuit" | "histogram" | "hardware">("circuit");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0F1629]/95 p-4 sm:p-5 shadow-2xl min-w-0 overflow-visible">
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base sm:text-lg font-bold text-slate-100">
            {t.quantum_panel_title}
          </h2>
        </div>
        <div className="inline-flex rounded-lg bg-slate-900 p-1 border border-slate-800">
          <Tooltip text={t.tip_mode_auto} position="bottom">
            <button
              type="button"
              onClick={() => onModeChange("auto")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                entanglementMode === "auto"
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title={t.tip_mode_auto}
            >
              {t.mode_auto}
            </button>
          </Tooltip>
          <Tooltip text={t.tip_mode_manual} position="bottom">
            <button
              type="button"
              onClick={() => onModeChange("manual")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                entanglementMode === "manual"
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title={t.tip_mode_manual}
            >
              {t.mode_manual}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Auto Clusters OR Manual Builder */}
      {entanglementMode === "auto" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t.clusters_title} ({clusters.length})
            </span>
            {isInspectingSingleCell && onExitSingleCell && clusters.length > 0 && (
              <button
                type="button"
                onClick={onExitSingleCell}
                className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 underline"
              >
                {t.btn_back_to_clusters}
              </button>
            )}
          </div>
          {clusters.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
              {t.no_clusters}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {clusters.map((cl) => {
                const isSelected = activeCluster?.id === cl.id;
                return (
                  <button
                    key={cl.id}
                    type="button"
                    onClick={() => onSelectCluster(cl.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      isSelected
                        ? `${BADGE_STYLE[cl.state_type]} ring-1 ring-white/25`
                        : "border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span className="font-mono font-bold">{cl.state_type}</span>
                    <span className="text-[11px] opacity-80">({cl.cells.length}q)</span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {cl.house_label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Saved Manual Clusters List */}
          {manualClusters.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t.manual_saved_clusters} ({manualClusters.length})
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {manualClusters.map((cl) => {
                  const isSelected = activeCluster?.id === cl.id;
                  return (
                    <div
                      key={cl.id}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
                        isSelected
                          ? `${BADGE_STYLE[cl.state_type]} ring-1 ring-white/25`
                          : "border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectManualCluster(cl.id)}
                        className="inline-flex items-center gap-1.5 text-left"
                      >
                        <span className="font-mono font-bold">{cl.state_type}</span>
                        <span className="text-[11px] opacity-80">({cl.cells.length}q)</span>
                        <span className="text-[11px] text-slate-300 truncate max-w-[115px]">
                          {cl.house_label}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteManualCluster(cl.id)}
                        className="ml-0.5 rounded p-0.5 text-slate-400 hover:text-rose-300"
                        title="Remove cluster"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Draft Manual Cluster Builder */}
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4" />
                {t.manual_builder_title}
              </span>
              <div className="flex items-center gap-2">
                <Tooltip text={t.tip_pick_cells} position="top">
                  <button
                    type="button"
                    onClick={onToggleManualPicking}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                      manualPicking
                        ? "border-violet-400 bg-violet-500 text-slate-950 shadow-sm"
                        : "border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                    }`}
                    title={t.tip_pick_cells}
                  >
                    <MousePointerClick className="w-3.5 h-3.5" />
                    {t.manual_pick_cells} {manualPicking ? "ON" : "OFF"}
                  </button>
                </Tooltip>
                <Tooltip text={t.tip_clear_manual} position="top">
                  <button
                    type="button"
                    onClick={onClearManual}
                    className="text-xs text-slate-400 hover:text-rose-300 flex items-center gap-1"
                    title={t.tip_clear_manual}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.manual_clear}
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400">{t.manual_cells_selected}:</span>
              {manualCells.length === 0 ? (
                <span className="text-slate-400/90 italic text-[11px]">
                  {t.manual_pick_hint}
                </span>
              ) : (
                manualCells.map((c, idx) => (
                  <span
                    key={`${c.row}-${c.col}`}
                    className="rounded bg-violet-500/20 border border-violet-400/40 px-2 py-0.5 font-mono text-violet-200"
                  >
                    +{idx}: R{c.row + 1}C{c.col + 1}
                  </span>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {t.manual_state_type}
                </label>
                <select
                  value={manualStateType}
                  onChange={(e) => onManualStateTypeChange(e.target.value as StateType)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="BELL">Bell (2q Pair)</option>
                  <option value="GHZ">GHZ (3-6q Chain)</option>
                  <option value="W">W-State (One-Hot)</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              {manualStateType === "CUSTOM" ? (
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {t.manual_custom_label}
                  </label>
                  <input
                    type="text"
                    value={manualCustomState}
                    onChange={(e) => onManualCustomStateChange(e.target.value)}
                    placeholder={t.manual_custom_placeholder}
                    className="w-full rounded-lg border border-pink-500/40 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-pink-100 focus:border-pink-400 focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {t.manual_digit_1}
                    </label>
                    <select
                      value={manualDigitA ?? ""}
                      onChange={(e) =>
                        onManualDigitAChange(e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="">Auto</option>
                      {getGridSpec(gridSize).symbols.map((sym, idx) => {
                        const val = idx + 1;
                        return (
                          <option key={sym} value={val}>
                            {sym}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      {t.manual_digit_2}
                    </label>
                    <select
                      value={manualDigitB ?? ""}
                      onChange={(e) =>
                        onManualDigitBChange(e.target.value ? e.target.value : null)
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="">Auto</option>
                      <option value="*">* (Any other symbol)</option>
                      {getGridSpec(gridSize).symbols.map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <Tooltip text={t.tip_manual_synthesize} position="top" className="w-full">
              <button
                type="button"
                onClick={onSynthesizeManual}
                disabled={manualCells.length === 0}
                className="w-full rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-slate-950 font-bold text-xs py-2 px-3 transition"
                title={t.tip_manual_synthesize}
              >
                {t.manual_synthesize}
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Active Cluster Summary Banner */}
      {activeCluster && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-mono font-bold shrink-0 ${
                  BADGE_STYLE[activeCluster.state_type]
                }`}
              >
                {activeCluster.state_type}
              </span>
              <span className="text-xs font-semibold text-slate-200">
                {activeCluster.house_label}
              </span>
            </div>
            {isInspectingSingleCell && onExitSingleCell && (
              <button
                type="button"
                onClick={onExitSingleCell}
                className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 transition shrink-0"
              >
                <X className="w-3 h-3" />
                {t.btn_back_to_clusters}
              </button>
            )}
          </div>
          {simulation && (
            <div className="text-xs font-mono text-cyan-300 break-words">
              {simulation.circuit.state_formula}
            </div>
          )}
          <p className="text-xs text-slate-400 break-words">{activeCluster.mechanism}</p>
          {activeCluster.diagnostic && (
            <p
              className={`text-xs break-words ${
                activeCluster.consistent ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {activeCluster.diagnostic}
            </p>
          )}
        </div>
      )}

      {/* Execution & Automation Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-3">
        {/* Automation Checkboxes above Shots & Execution Backend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 hover:border-cyan-400/60 transition">
            <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={cascadeEnabled}
                onChange={(e) => onCascadeChange(e.target.checked)}
                className="rounded border-slate-600 accent-cyan-400 w-4 h-4 shrink-0 cursor-pointer"
              />
              <span className="truncate">{t.cascade_label}</span>
            </label>
            <InfoBadge text={t.tip_cascade} position="top" />
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200 hover:border-emerald-400/60 transition">
            <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={autoFillSingleNote}
                onChange={onToggleAutoFillSingleNote}
                className="rounded border-slate-600 accent-emerald-400 w-4 h-4 shrink-0 cursor-pointer"
              />
              <span className="truncate">{t.btn_auto_single_note}</span>
            </label>
            <InfoBadge text={t.auto_single_note_title} position="top" />
          </div>
        </div>

        {/* Execution Backend & Shots */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
              <span>{t.noise_profile}</span>
              <InfoBadge text={t.tip_noise_profile} position="top" />
            </label>
            <select
              value={noiseProfile}
              onChange={(e) => onNoiseProfileChange(e.target.value as NoiseProfile)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="ideal">{t.noise_ideal}</option>
              <option value="ibm_heron">{t.noise_heron}</option>
              <option value="ibm_eagle">{t.noise_eagle}</option>
              <option value="custom">{t.noise_custom}</option>
            </select>
            {noiseProfile === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={0.15}
                  step={0.005}
                  value={customNoiseLevel}
                  onChange={(e) => onCustomNoiseChange(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <span className="text-xs font-mono text-cyan-300 w-12 text-right">
                  {(customNoiseLevel * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
              <span>{t.shots_label}</span>
              <InfoBadge text={t.tip_shots} position="top" />
            </label>
            <select
              value={shots}
              onChange={(e) => onShotsChange(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-100"
            >
              <option value={256}>256</option>
              <option value={512}>512</option>
              <option value={1024}>1024</option>
            </select>
          </div>
        </div>

        {/* Gate Lab Perturbation & Readout Error Mitigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 items-end">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
              <span>{t.gate_experiment_label}</span>
              <InfoBadge text={t.tip_gate_lab} position="top" />
            </label>
            <select
              value={gateOverride}
              onChange={(e) => onGateOverrideChange(e.target.value as GateOverride)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="normal">{t.gate_normal}</option>
              <option value="flip_q0">{t.gate_flip_q0}</option>
              <option value="no_entangle">{t.gate_no_entangle}</option>
            </select>
          </div>

          <div
            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
              noiseProfile === "ideal"
                ? "border-slate-800 bg-slate-950/30 text-slate-500"
                : "border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-violet-400/60"
            }`}
          >
            <label
              className={`flex items-center gap-1.5 flex-1 min-w-0 ${
                noiseProfile === "ideal" ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={mitigateReadout}
                disabled={noiseProfile === "ideal"}
                onChange={(e) => onMitigateReadoutChange(e.target.checked)}
                className="rounded border-slate-600 accent-violet-400 w-4 h-4 shrink-0 cursor-pointer disabled:opacity-40"
              />
              <span className="truncate">{t.readout_mitigation_label}</span>
            </label>
            <InfoBadge text={t.tip_readout_mitigation} position="top" />
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <Tooltip text={t.tip_run_circuit} position="top" className="w-full">
        <button
          type="button"
          onClick={onRunCircuit}
          disabled={!activeCluster || isRunning}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 hover:opacity-95 disabled:opacity-40 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-lg transition"
          title={t.tip_run_circuit}
        >
          <Play className="w-4 h-4" />
          {t.btn_run_circuit}
        </button>
      </Tooltip>

      {/* Workbench Tabs */}
      <div className="flex flex-wrap border-b border-slate-800 gap-1">
        <Tooltip text={t.tip_tab_circuit} position="top">
          <button
            type="button"
            onClick={() => setActiveTab("circuit")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === "circuit"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t.tab_circuit}
          </button>
        </Tooltip>
        <Tooltip text={t.tip_tab_histogram} position="top">
          <button
            type="button"
            onClick={() => setActiveTab("histogram")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === "histogram"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {t.tab_histogram}
          </button>
        </Tooltip>
        <Tooltip text={t.tip_tab_hardware} position="top">
          <button
            type="button"
            onClick={() => setActiveTab("hardware")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === "hardware"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            {t.tab_hardware}
          </button>
        </Tooltip>
      </div>

      {/* Tab Content */}
      {activeTab === "circuit" && (
        <div className="space-y-3 min-w-0">
          {simulation ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {simulation.circuit.qubit_labels.map((lbl, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-slate-300"
                  >
                    {lbl}
                  </span>
                ))}
                <span className="rounded-md bg-slate-900 border border-slate-700 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                  Depth: {simulation.circuit.depth}
                </span>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  {t.circuit_diagram}
                </div>
                <pre className="rounded-xl border border-slate-800 bg-[#070B14] p-3 text-[11px] leading-snug font-mono text-cyan-200 max-w-full overflow-x-auto whitespace-pre">
                  {simulation.circuit.circuit_diagram}
                </pre>
              </div>
              <details className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 min-w-0">
                <summary className="cursor-pointer text-xs font-semibold text-slate-300">
                  {t.circuit_qasm}
                </summary>
                <pre className="mt-2 text-[11px] font-mono text-slate-400 max-w-full overflow-x-auto whitespace-pre">
                  {simulation.circuit.qasm}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">{t.no_clusters}</p>
          )}
        </div>
      )}

      {activeTab === "histogram" && (
        <div className="space-y-3">
          {simulation ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="text-[11px] text-slate-400">{t.fidelity_label}</div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <div
                      className={`text-lg font-bold font-mono ${
                        simulation.constraint_satisfaction_rate >= 0.95
                          ? "text-emerald-400"
                          : simulation.constraint_satisfaction_rate >= 0.8
                            ? "text-amber-300"
                            : "text-rose-400"
                      }`}
                    >
                      {(simulation.constraint_satisfaction_rate * 100).toFixed(1)}%
                    </div>
                    {simulation.mitigated &&
                      simulation.unmitigated_satisfaction_rate != null && (
                        <span className="text-[10px] font-mono text-violet-300">
                          (raw {(simulation.unmitigated_satisfaction_rate * 100).toFixed(1)}% → M⁻¹)
                        </span>
                      )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="text-[11px] text-slate-400">{t.sampled_outcome}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold font-mono text-slate-100">
                      |{simulation.sampled_label || simulation.sampled_bitstring}⟩
                    </span>
                    {simulation.sampled_label &&
                      simulation.sampled_label !== simulation.sampled_bitstring && (
                        <span className="text-[10px] font-mono text-slate-400">
                          (bits {simulation.sampled_bitstring})
                        </span>
                      )}
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        simulation.sampled_is_valid
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {simulation.sampled_is_valid ? t.valid_outcome : t.invalid_outcome}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                <span>{simulation.backend_label}</span>
              </div>
              <HistogramChart
                counts={simulation.counts}
                shots={simulation.shots}
                validBitstrings={simulation.valid_bitstrings}
                idealProbabilities={simulation.ideal_probabilities}
                displayLabels={simulation.display_labels}
                theme={theme}
              />
            </>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">{t.no_clusters}</p>
          )}
        </div>
      )}

      {activeTab === "hardware" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-2.5 text-xs text-cyan-200">
            <div className="font-semibold">{t.hardware_banner}</div>
            <div className="text-cyan-300/80 text-[11px] mt-0.5">{t.compare_hardware_note}</div>
          </div>
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {hardwareBenchmarks.map((bm) => (
              <div
                key={bm.id}
                className="rounded-xl border border-slate-800 bg-slate-900/75 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-100">
                      {bm.backend_name}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-400">
                      {bm.processor_family} ({bm.num_qubits_qpu}q)
                    </span>
                  </div>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
                    {(bm.constraint_satisfaction_rate * 100).toFixed(1)}% valid
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex flex-wrap gap-3 font-mono">
                  <span>State: {bm.state_type} ({bm.circuit_qubits}q)</span>
                  <span>2Q Err: {(bm.median_2q_error * 100).toFixed(2)}%</span>
                  <span>RO Err: {(bm.median_readout_error * 100).toFixed(2)}%</span>
                </div>
                <p className="text-[11px] text-slate-400">{bm.notes}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(bm.counts)
                    .slice(0, 6)
                    .map(([bs, cnt]) => {
                      const isOk = bm.valid_bitstrings.includes(bs);
                      return (
                        <span
                          key={bs}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono border ${
                            isOk
                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                          }`}
                        >
                          |{bs}⟩: {((cnt / bm.shots) * 100).toFixed(1)}%
                        </span>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapse Cascade Trace */}
      {lastCollapseTrace.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5">
          <div className="text-xs font-bold text-emerald-300">
            {t.cascade_trace_title} ({lastCollapseTrace.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lastCollapseTrace.map((step, idx) => (
              <span
                key={`${step.row}-${step.col}-${idx}`}
                className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono text-emerald-200"
                title={step.reason}
              >
                R{step.row + 1}C{step.col + 1} → {valueToSymbol(step.digit, gridSize)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
