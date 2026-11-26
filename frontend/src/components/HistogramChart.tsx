import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistogramChartProps {
  counts: Record<string, number>;
  shots: number;
  validBitstrings: string[];
  idealProbabilities?: Record<string, number>;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({
  counts,
  shots,
  validBitstrings,
  idealProbabilities,
}) => {
  const validSet = new Set(validBitstrings);

  // Merge observed keys and ideal keys so learners see missing/leaked states cleanly
  const allKeys = new Set<string>([
    ...Object.keys(counts),
    ...Object.keys(idealProbabilities ?? {}),
  ]);

  const data = Array.from(allKeys)
    .map((bitstring) => {
      const count = counts[bitstring] ?? 0;
      const prob = shots > 0 ? Number(((count / shots) * 100).toFixed(1)) : 0;
      const ideal = idealProbabilities?.[bitstring]
        ? Number((idealProbabilities[bitstring] * 100).toFixed(1))
        : 0;
      return {
        bitstring: `|${bitstring}⟩`,
        raw: bitstring,
        probability: prob,
        ideal,
        count,
        isValid: validSet.has(bitstring),
      };
    })
    .sort((a, b) => b.probability - a.probability || a.raw.localeCompare(b.raw))
    .slice(0, 12);

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
          <XAxis
            dataKey="bitstring"
            tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            unit="%"
            domain={[0, 100]}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0F172A",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#F1F5F9",
              fontSize: "12px",
            }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === "probability" ? "Measured" : "Ideal",
            ]}
          />
          <Bar dataKey="probability" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((entry) => (
              <Cell
                key={entry.raw}
                fill={entry.isValid ? "#22D3EE" : "#FB7185"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
