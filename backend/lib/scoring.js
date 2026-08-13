import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const QUESTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/questions.json"), "utf8"));
export const MODULES = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/modules.json"), "utf8"));

export const TIER_BANDS = [
  { min: 90, max: 100, name: "Vanguard" },
  { min: 75, max: 89.999, name: "AI-Native Leader" },
  { min: 60, max: 74.999, name: "Competitive" },
  { min: 40, max: 59.999, name: "Building" },
  { min: 0, max: 39.999, name: "Exposed" },
];

export function tierFor(score) {
  return TIER_BANDS.find((b) => score >= b.min && score <= b.max) || TIER_BANDS[TIER_BANDS.length - 1];
}

/**
 * responses: { [questionId]: { maturity: 0-4|null, evidence: string } }
 * Mirrors the scoring rules in the RIOS PRD §10.
 */
export function computeScores(responses) {
  const perModule = {};
  MODULES.forEach((m) => (perModule[m] = { achieved: 0, max: 0, answered: 0, total: 0 }));
  let achievedAll = 0, maxAll = 0, answeredAll = 0;

  QUESTIONS.forEach((q) => {
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

  const moduleScores = MODULES.map((m) => {
    const d = perModule[m];
    const score = d.max > 0 ? (d.achieved / d.max) * 100 : 0;
    return { module: m, score, tier: tierFor(score), answered: d.answered, total: d.total };
  });

  const overallScore = maxAll > 0 ? (achievedAll / maxAll) * 100 : 0;

  const opportunities = QUESTIONS
    .map((q) => {
      const r = responses[q.id];
      if (!r || r.maturity == null || r.maturity >= 4 || !q.hasDollar) return null;
      const midpoint = (q.revLow + q.revHigh) / 2 + (q.costLow + q.costHigh) / 2;
      return { ...q, maturity: r.maturity, evidence: r.evidence || "", midpoint };
    })
    .filter(Boolean)
    .sort((a, b) => b.midpoint - a.midpoint)
    .slice(0, 5);

  const priorityGaps = QUESTIONS
    .map((q) => {
      const r = responses[q.id];
      if (!r || r.maturity == null || r.maturity >= 4 || q.hasDollar) return null;
      const severity = q.weight * (4 - r.maturity);
      return { ...q, maturity: r.maturity, evidence: r.evidence || "", severity };
    })
    .filter(Boolean)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);

  return { moduleScores, overallScore, overallTier: tierFor(overallScore), answeredAll, totalAll: QUESTIONS.length, opportunities, priorityGaps };
}
