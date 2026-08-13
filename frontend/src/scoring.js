export const TIER_BANDS = [
  { min: 90, max: 100, name: "Vanguard", color: "#1B7A5A", bg: "#E7F5EF" },
  { min: 75, max: 89.999, name: "AI-Native Leader", color: "#2E9E6B", bg: "#EAF8F1" },
  { min: 60, max: 74.999, name: "Competitive", color: "#C98A1A", bg: "#FBF1DF" },
  { min: 40, max: 59.999, name: "Building", color: "#C9601A", bg: "#FCEEE1" },
  { min: 0, max: 39.999, name: "Exposed", color: "#B23A3D", bg: "#FBEAEA" },
];

export function tierFor(score) {
  return TIER_BANDS.find((b) => score >= b.min && score <= b.max) || TIER_BANDS[TIER_BANDS.length - 1];
}

/**
 * Mirrors backend/lib/scoring.js exactly — kept in sync manually since
 * the frontend needs live scores while the user is still typing, before
 * anything is saved to the server.
 */
export function computeScores(questions, modules, responses) {
  const perModule = {};
  modules.forEach((m) => (perModule[m] = { achieved: 0, max: 0, answered: 0, total: 0 }));
  let achievedAll = 0, maxAll = 0, answeredAll = 0;

  questions.forEach((q) => {
    const r = responses[q.id];
    const maturity = r && r.maturity != null ? r.maturity : 0;
    const achieved = maturity * q.weight;
    const max = 4 * q.weight;
    perModule[q.module].achieved += achieved;
    perModule[q.module].max += max;
    perModule[q.module].total += 1;
    if (r && r.maturity != null) { perModule[q.module].answered += 1; answeredAll += 1; }
    achievedAll += achieved;
    maxAll += max;
  });

  const moduleScores = modules.map((m) => {
    const d = perModule[m];
    const score = d.max > 0 ? (d.achieved / d.max) * 100 : 0;
    return { module: m, score, tier: tierFor(score), answered: d.answered, total: d.total };
  });

  const overallScore = maxAll > 0 ? (achievedAll / maxAll) * 100 : 0;

  const opportunities = questions
    .map((q) => {
      const r = responses[q.id];
      if (!r || r.maturity == null || r.maturity >= 4 || !q.hasDollar) return null;
      const midpoint = (q.revLow + q.revHigh) / 2 + (q.costLow + q.costHigh) / 2;
      return { ...q, maturity: r.maturity, evidence: r.evidence || "", midpoint };
    })
    .filter(Boolean)
    .sort((a, b) => b.midpoint - a.midpoint)
    .slice(0, 5);

  const priorityGaps = questions
    .map((q) => {
      const r = responses[q.id];
      if (!r || r.maturity == null || r.maturity >= 4 || q.hasDollar) return null;
      const severity = q.weight * (4 - r.maturity);
      return { ...q, maturity: r.maturity, evidence: r.evidence || "", severity };
    })
    .filter(Boolean)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);

  return { moduleScores, overallScore, answeredAll, totalAll: questions.length, opportunities, priorityGaps };
}

export const CATEGORY_GROUPS = [
  {
    name: "Store & Digital Operations",
    modules: ["Store Operations & POS", "E-commerce & Marketplace Management", "Omnichannel Experience & Customer Journey", "Inventory, Fulfillment & Logistics"],
  },
  {
    name: "Commerce & Customer",
    modules: ["Payments, Promotions & Checkout", "Customer Data & CRM", "Marketing & Engagement", "Merchandising & Pricing"],
  },
  {
    name: "Data, Analytics & AI Foundation",
    modules: ["Analytics & Reporting", "Data & AI Infrastructure", "Integration & Middleware", "Agentic AI", "Emerging Tech & Innovation Layer"],
  },
  {
    name: "People & Leadership",
    modules: ["Leadership & Governance", "HR, Training & Store Talent", "Organization & Talent"],
  },
  {
    name: "Enterprise & Risk",
    modules: ["Finance & Compliance", "Security & Infrastructure", "Innovation & Open Innovation Practice"],
  },
];

/** Simple unweighted average of member module scores — a presentational
 * rollup for an exec-level glance, not a new official scoring formula. */
export function computeCategoryScores(moduleScores) {
  const byModule = Object.fromEntries(moduleScores.map((m) => [m.module, m]));
  return CATEGORY_GROUPS.map((cat) => {
    const members = cat.modules.map((m) => byModule[m]).filter(Boolean);
    const score = members.length ? members.reduce((s, m) => s + m.score, 0) / members.length : 0;
    return { name: cat.name, score, tier: tierFor(score), moduleCount: members.length };
  });
}


export function fmtMoney(n) {
  if (!n) return "$0";
  if (n >= 1e7) return "$" + (n / 1e7).toFixed(1) + "Cr";
  if (n >= 1e5) return "$" + (n / 1e5).toFixed(1) + "L";
  return "$" + Math.round(n).toLocaleString();
}
