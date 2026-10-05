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
  MODULES.forEach((m) => (perModule[m] = { achieved: 0, max: 0, answered: 0, total: 0, na: 0 }));
  let achievedAll = 0, maxAll = 0, answeredAll = 0, naAll = 0;

  QUESTIONS.forEach((q) => {
    const r = responses[q.id];
    // A6: a question marked "Not applicable" is left out of the score entirely (neither points
    // earned nor points possible), and counts as answered for progress.
    if (r && r.na) {
      perModule[q.module].total += 1;
      perModule[q.module].answered += 1;
      perModule[q.module].na += 1;
      answeredAll += 1; naAll += 1;
      return;
    }
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
    return { module: m, score, tier: tierFor(score), answered: d.answered, total: d.total, na: d.na, achieved: d.achieved, max: d.max };
  });

  const overallScore = maxAll > 0 ? (achievedAll / maxAll) * 100 : 0;

  const opportunities = QUESTIONS
    .map((q) => {
      const r = responses[q.id];
      if (!r || r.maturity == null || r.maturity >= 4 || !q.hasDollar) return null;
      // SC2: the stored $ values are the full potential at maturity 0. Scale them by how much
      // improvement is actually left, so a question scored 3/4 is worth a quarter of one scored 0/4.
      const gapFactor = (4 - r.maturity) / 4;
      const revLow = q.revLow * gapFactor, revHigh = q.revHigh * gapFactor;
      const costLow = q.costLow * gapFactor, costHigh = q.costHigh * gapFactor;
      const midpoint = (revLow + revHigh) / 2 + (costLow + costHigh) / 2;
      return { ...q, revLow, revHigh, costLow, costHigh, gapFactor, maturity: r.maturity, evidence: r.evidence || "", midpoint };
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

  return { moduleScores, overallScore, overallTier: tierFor(overallScore), answeredAll, naAll, totalAll: QUESTIONS.length, opportunities, priorityGaps };
}
