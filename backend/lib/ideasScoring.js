// Rating criteria + weights for the jury's weighted-average idea score.
// Mirrors frontend/src/IdeasRiv.jsx's CRITERIA exactly — kept in sync
// manually, same convention as lib/scoring.js vs frontend/src/scoring.js.
export const CRITERIA = [
  { key: "impact", label: "Impact", weight: 0.35 },
  { key: "feasibility", label: "Feasibility", weight: 0.25 },
  { key: "innovation", label: "Innovation", weight: 0.25 },
  { key: "cost", label: "Cost-effectiveness", weight: 0.15 },
];

export function weightedAvg(scores) {
  let total = 0;
  CRITERIA.forEach((c) => {
    const v = Number(scores[c.key]);
    total += (isNaN(v) ? 0 : v) * c.weight;
  });
  return total; // 0–10 scale
}

export function clamp10(n) {
  n = Number(n);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

export function clamp5(n) {
  n = Number(n);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(5, n));
}