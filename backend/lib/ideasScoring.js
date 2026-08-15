// The 5 criteria a jury member rates every application on, per the PRD
// (opportunities-platform-prd-v1.md §7). Each is a plain 1-5 star pick —
// no weighting. Overall score is just the average of these five, always
// on a 1-5 scale.
export const CRITERIA = [
  { key: "team", label: "Team", question: "Founder/team strength and relevant experience." },
  { key: "marketOpportunity", label: "Market Opportunity", question: "Size and timing of the market being addressed." },
  { key: "product", label: "Product", question: "Maturity, differentiation, and quality of the product." },
  { key: "traction", label: "Traction", question: "Evidence of validation -- users, revenue, pilots, partnerships." },
  { key: "gtmStrategy", label: "GTM Strategy", question: "Clarity and credibility of the go-to-market plan." },
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