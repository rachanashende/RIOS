import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real Q3 2026 instrument, ported from the interview-capture sheet — see
// backend/data/indexQuestions.json's _meta/_indexDimensionsNote for what's
// covered and the one known gap (Retail AI Use Cases has no scored item
// yet in the sheet as supplied).
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/indexQuestions.json"), "utf8"));
export const QUESTIONS = DATA.questions;
export const SECTIONS = DATA.sections;
export const INDEX_DIMENSIONS = DATA.indexDimensions;

// The RIV Retail AI Maturity Model's 5 stages — same 1-5 scale used both by
// C01's self-reported answer and by the computed Index score, so a score
// can be translated to a stage label the same way the sample report's
// leaderboard does (e.g. 4.2 -> "Scaling").
export const MATURITY_STAGES = ["Curious", "Experimenting", "Deploying", "Scaling", "AI-Native"];
export function stageForScore(score) {
  if (score === null || score === undefined) return null;
  const idx = Math.min(5, Math.max(1, Math.round(Number(score)))) - 1;
  return MATURITY_STAGES[idx];
}

function clampToScale(n, scale) {
  n = Number(n);
  if (isNaN(n)) return null;
  return Math.max(1, Math.min(scale, Math.round(n)));
}

const QUESTIONS_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Coerces + validates a raw answers object against the real instrument's
// question types before it's ever written to the DB. Every question type
// is preserved (not just scored ones) — the JSONB `answers` column stores
// the whole audit response, not just the numbers that happen to feed the
// Index score.
export function sanitizeAnswers(rawAnswers) {
  const out = {};
  for (const q of QUESTIONS) {
    const raw = rawAnswers?.[q.id];
    if (raw === undefined || raw === null || raw === "") continue;

    if (q.type === "scored") {
      const n = clampToScale(raw, q.scale || 5);
      if (n !== null) out[q.id] = n;
    } else if (q.type === "multi_select") {
      const arr = Array.isArray(raw) ? raw : [raw];
      out[q.id] = arr.map((v) => String(v).slice(0, 200)).filter((v) => !q.options || q.options.includes(v));
    } else if (q.type === "single_select") {
      const v = String(raw);
      if (!q.options || q.options.includes(v)) out[q.id] = v;
    } else if (q.type === "yesno" || q.type === "consent") {
      out[q.id] = raw === true || raw === "Yes" || raw === "yes" ? "Yes" : "No";
    } else {
      // profile, open
      out[q.id] = String(raw).slice(0, 4000);
    }
  }
  return out;
}

// Computes the per-dimension breakdown (Leadership & Strategy, Retail AI
// Use Cases, Technology & Data, Organisation & Operating Model, Agentic
// AI — see the Executive Conversation deck's "Five Dimensions") plus an
// overall Index score, from a SANITIZED answers object. A dimension with
// no scored question mapped to it yet (currently: Retail AI Use Cases —
// see indexQuestions.json's _indexDimensionsNote) comes back as null
// rather than 0, so it's visibly "not yet measurable" rather than
// silently dragging the average down.
export function computeIndexScore(sanitizedAnswers) {
  const dimensionScores = {};
  for (const dim of INDEX_DIMENSIONS) {
    const items = QUESTIONS.filter((q) => q.type === "scored" && q.indexDimension === dim);
    const values = items.map((q) => sanitizedAnswers[q.id]).filter((v) => v !== undefined && v !== null);
    dimensionScores[dim] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }
  const populated = Object.values(dimensionScores).filter((v) => v !== null);
  const overallScore = populated.length ? populated.reduce((s, v) => s + v, 0) / populated.length : null;

  return {
    dimensionScores,
    overallScore,
    stage: stageForScore(overallScore),
    selfReportedStage: sanitizedAnswers.C01 != null ? MATURITY_STAGES[sanitizedAnswers.C01 - 1] : null,
    dimensionsScored: populated.length,
    dimensionsTotal: INDEX_DIMENSIONS.length,
  };
}

// Convenience wrapper: sanitize + score in one call, used by the submit
// endpoints. Returns everything a caller needs to both persist the entry
// (answers, overallScore) and show immediate feedback (dimensionScores).
export function scoreAnswers(rawAnswers) {
  const answers = sanitizeAnswers(rawAnswers);
  return { answers, ...computeIndexScore(answers) };
}

// Cohort average of a single scalar (overall Index scores) — used for the
// simple "you vs. cohort" headline number. Aggregate only, never the
// underlying list, so callers can't accidentally leak one respondent's
// score to another (per RIOS-PRD-RIndex-Module.md §3's access rule).
export function cohortAverage(scores) {
  const values = scores.filter((s) => s !== null && s !== undefined).map(Number);
  if (!values.length) return { average: null, count: 0 };
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  return { average, count: values.length };
}

// Same idea as cohortAverage but per-dimension, for the "Five Dimensions"
// breakdown view. Takes an array of dimensionScores objects (one per
// entry, as returned by computeIndexScore) and averages each dimension
// independently, skipping entries that don't have data for that dimension.
export function cohortDimensionAverages(dimensionScoresList) {
  const result = {};
  for (const dim of INDEX_DIMENSIONS) {
    const values = dimensionScoresList.map((ds) => ds?.[dim]).filter((v) => v !== null && v !== undefined);
    result[dim] = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }
  return result;
}
