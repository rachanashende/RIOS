// The 5 criteria a jury member rates every idea on. Each is a plain 1-5
// star pick — no weighting, no AI interview. Overall score is just the
// average of these five, always on a 1-5 scale.
export const CRITERIA = [
  { key: "impact", label: "Impact", question: "How much could this move the needle on the opportunity?" },
  { key: "feasibility", label: "Feasibility", question: "How realistic is this to actually build and roll out?" },
  { key: "innovation", label: "Innovation", question: "How novel is this compared to what's already out there?" },
  { key: "cost", label: "Cost-effectiveness", question: "Is the likely payoff worth the likely investment?" },
  { key: "strategicFit", label: "Strategic fit", question: "How directly does this address the specific gap the audit identified?" },
];

// A star rating is always a whole number 1-5.
export function clamp5(n) {
  n = Math.round(Number(n));
  if (isNaN(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

// Plain average across whichever criteria were actually rated (a rating
// must include every criterion in CRITERIA, but this stays defensive in
// case that ever changes). Returned on the same 1-5 scale as the inputs.
export function averageScore(criteriaScores) {
  const values = CRITERIA.map((c) => criteriaScores[c.key]).filter((v) => v !== undefined && v !== null);
  if (!values.length) return 0;
  const total = values.reduce((sum, v) => sum + v, 0);
  return total / values.length;
}