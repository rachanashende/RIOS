import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The 5 fixed jury criteria, star-rated 1-5 each. Kept as its own static
// instrument file (same convention as backend/data/questions.json for the
// Discover instrument) so the rubric can be edited without touching code.
export const CRITERIA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/riseCriteria.json"), "utf8")
);

export function clamp1to5(n) {
  n = Number(n);
  if (isNaN(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

// scores: { [criterionKey]: 1-5 }. Returns null if any criterion is missing
// so the caller can reject an incomplete submission rather than silently
// averaging a partial rating.
export function averageScore(scores) {
  const values = CRITERIA.map((c) => scores[c.key]);
  if (values.some((v) => v === null || v === undefined || isNaN(Number(v)))) return null;
  const total = values.reduce((sum, v) => sum + Number(v), 0);
  return total / CRITERIA.length; // 1-5 scale
}
