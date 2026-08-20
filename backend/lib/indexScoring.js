import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PLACEHOLDER instrument — see backend/data/indexQuestions.json's _note.
// Same "static JSON file is the source of truth" convention as
// riseCriteria.json / questions.json, so swapping in the real question
// set later is a data-file edit, not a code change.
export const QUESTIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/indexQuestions.json"), "utf8")
).questions;

function clampToScale(n, scale) {
  n = Number(n);
  if (isNaN(n)) return null;
  return Math.max(1, Math.min(scale, Math.round(n)));
}

// answers: { [questionId]: number }. Returns { clamped, score } where score
// is a plain 1-5 average across every question actually answered (partial
// submissions are allowed — unlike Rise.RIV's all-5-required rule, since an
// Index respondent filling this out live shouldn't be blocked by one
// unanswered question). Returns score: null if nothing was answered at all.
//
// NOTE: this is a placeholder averaging approach, explicitly called out as
// undecided in RIOS-PRD-RIndex-Module.md §11 ("Scoring/averaging formula
// ... pending, to be decided once the question set is in hand"). Swap this
// function's body when that's settled — every caller (routes/index.js,
// routes/indexAdmin.js, indexExport.js) only depends on this one function,
// not on the formula itself.
export function scoreAnswers(answers) {
  const clamped = {};
  const values = [];
  for (const q of QUESTIONS) {
    const raw = answers?.[q.id];
    if (raw === undefined || raw === null || raw === "") continue;
    const v = clampToScale(raw, q.scale || 5);
    if (v === null) continue;
    clamped[q.id] = v;
    values.push(v);
  }
  const score = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  return { clamped, score, answeredCount: values.length, totalCount: QUESTIONS.length };
}

// Cohort average across every scored entry in a campaign — used by both the
// respondent's own "you vs. average" dashboard and the admin report.
// Deliberately returns only the aggregate, never the underlying list of
// individual scores, so callers can't accidentally leak one respondent's
// score to another (per RIOS-PRD-RIndex-Module.md §3's access rule).
export function cohortAverage(scores) {
  const values = scores.filter((s) => s !== null && s !== undefined).map(Number);
  if (!values.length) return { average: null, count: 0 };
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { average, count: values.length };
}
