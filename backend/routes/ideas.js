import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS, computeScores } from "../lib/scoring.js";
import { CRITERIA, clamp5, averageScore } from "../lib/ideasScoring.js";

const router = Router();
router.use(requireAuth);

function questionById(id) {
  return QUESTIONS.find((q) => q.id === Number(id)) || null;
}

// I1: which client's Ideathon is this request about?
// Employees and jury only ever see their own client's Ideathon (users.client_id).
// Admins choose one with ?clientId=, falling back to the legacy global source setting.
async function resolveClientId(req) {
  if (req.user.role === "admin") {
    const q = Number(req.query.clientId);
    if (q) return q;
    const { rows } = await pool.query("SELECT source_client_id FROM ideas_settings WHERE id = 1");
    return rows[0]?.source_client_id || null;
  }
  const { rows } = await pool.query("SELECT client_id FROM users WHERE id = $1", [req.user.id]);
  return rows[0]?.client_id || null;
}

// Attach the static question text/module/submodule to a DB row that only
// stores question_id, and coerce the aggregate columns Postgres returns
// as strings (COUNT/AVG) back into numbers. Every score is always on a
// plain 1-5 scale now (the old CRIT 0-10 flow is gone), so there's no
// per-row scale detection needed anymore.
function enrich(row) {
  return {
    ...row,
    avg_score: row.avg_score != null ? Number(row.avg_score) : null,
    rating_count: row.rating_count != null ? Number(row.rating_count) : 0,
    question: questionById(row.question_id),
  };
}

/**
 * GET /api/ideas/opportunities
 * The Top 5 Innovation Opportunities from whichever client's audit is
 * currently configured as the Ideas.RIV source (admin-set — see
 * routes/ideasAdmin.js). Reuses the exact same computeScores() logic that
 * powers that client's own Discover Scorecard, so the numbers always
 * match what they see on their dashboard.
 */
router.get("/opportunities", requireRole("junior_employee", "jury", "admin"), async (req, res, next) => {
  try {
    const sourceClientId = await resolveClientId(req);
    if (!sourceClientId) {
      return res.json({ opportunities: [], sourceClient: null, unassigned: req.user.role !== "admin" });
    }

    const { rows: clientRows } = await pool.query(
      "SELECT id, name, company FROM users WHERE id = $1 AND role = 'client'",
      [sourceClientId]
    );
    const client = clientRows[0];
    if (!client) return res.json({ opportunities: [], sourceClient: null });

    const { rows: respRows } = await pool.query(
      "SELECT question_id, maturity, evidence FROM responses WHERE user_id = $1",
      [sourceClientId]
    );
    const responses = {};
    respRows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence }; });

    const scores = computeScores(responses);
    res.json({
      opportunities: scores.opportunities,
      sourceClient: { id: client.id, name: client.name, company: client.company },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/criteria
 * The 5 rating criteria (key, label, question) the jury rates every idea
 * on — lets the frontend render the rating form without hardcoding them.
 */
router.get("/criteria", requireRole("junior_employee", "jury", "admin"), (req, res) => {
  res.json({ criteria: CRITERIA });
});

/**
 * GET /api/ideas?questionId=123
 * All submitted ideas (optionally filtered to one opportunity), with each
 * idea's current rating count and average score.
 */
/**
 * GET /api/ideas?questionId=123
 * All submitted ideas (optionally filtered to one opportunity). Jury/admin
 * get each idea's rating count and average score (needed to work the
 * queue and see what's already scored). Junior employees get the same
 * list but with score data stripped — they see what's been submitted,
 * not how the jury has scored it.
 */
router.get("/", requireRole("junior_employee", "jury", "admin"), async (req, res, next) => {
  try {
    const { questionId } = req.query;
    const clientId = await resolveClientId(req);
    if (!clientId) return res.json({ ideas: [] });
    const params = [clientId];
    let sql = `
      SELECT i.id, i.question_id, i.title, i.description, i.created_at,
             u.name AS submitted_by_name,
             COUNT(r.id)::int AS rating_count,
             AVG(r.score) AS avg_score
      FROM ideas i
      JOIN users u ON u.id = i.submitted_by
      LEFT JOIN idea_ratings r ON r.idea_id = i.id
      WHERE i.source_client_id = $1
    `;
    if (questionId) {
      params.push(Number(questionId));
      sql += ` AND i.question_id = $${params.length}`;
    }
    sql += ` GROUP BY i.id, u.name ORDER BY i.created_at DESC`;

    const { rows } = await pool.query(sql, params);
    let ideas = rows.map(enrich);
    if (req.user.role === "junior_employee" || req.user.role === "jury") {
      // Employees never see scores; jurors don't either (blind scoring, I16).
      ideas = ideas.map(({ rating_count, avg_score, ...rest }) => rest);
    }
    res.json({ ideas });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/mine
 * The logged-in junior employee's own submissions, for "My submissions".
 */
/**
 * GET /api/ideas/mine
 * The logged-in junior employee's own submissions, for "My submissions".
 * Deliberately excludes rating/score data — junior employees see only
 * what they submitted, not how the jury scored it.
 */
router.get("/mine", requireRole("junior_employee", "admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_id, title, description, created_at
       FROM ideas
       WHERE submitted_by = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ ideas: rows.map((row) => ({ ...row, question: questionById(row.question_id) })) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ideas
 * Body: { ideas: [{ questionId, title, description }, ...] }
 * Batch insert — this is the "1 idea, then + to add more" submission form:
 * the frontend always posts an array, even for a single idea.
 */
router.post("/", requireRole("junior_employee", "admin"), async (req, res, next) => {
  try {
    const { ideas } = req.body || {};
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return res.status(400).json({ error: "Expected a non-empty array of ideas." });
    }

    const sourceClientId = await resolveClientId(req);
    if (!sourceClientId) {
      return res.status(403).json({ error: "Your account isn't linked to a client yet — please ask RIV to assign you." });
    }

    const inserted = [];
    for (const idea of ideas) {
      const { questionId, title, description } = idea || {};
      const cleanTitle = (title || "").trim();
      if (!questionId || !cleanTitle) continue; // skip blank rows silently — the frontend already filters these
      const { rows } = await pool.query(
        `INSERT INTO ideas (question_id, title, description, submitted_by, source_client_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, question_id, title, description, created_at`,
        [Number(questionId), cleanTitle, (description || "").trim() || null, req.user.id, sourceClientId]
      );
      inserted.push({ ...rows[0], question: questionById(rows[0].question_id) });
    }

    if (inserted.length === 0) {
      return res.status(400).json({ error: "None of the submitted ideas had a title." });
    }
    res.status(201).json({ ideas: inserted });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/:id/ratings
 * Every individual jury rating for one idea — admin only. Per PRD §7/§8,
 * scoring is blind: a jury member must never see another jury member's
 * scores. Jury use GET /:id/ratings/mine for their own rating instead.
 */
router.get("/:id/ratings", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.idea_id, r.jury_user_id, r.criteria_scores, r.score, r.rationale AS comment, r.created_at, r.updated_at,
              u.name AS jury_name
       FROM idea_ratings r
       JOIN users u ON u.id = r.jury_user_id
       WHERE r.idea_id = $1
       ORDER BY r.updated_at DESC`,
      [Number(req.params.id)]
    );
    res.json({ ratings: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/:id/ratings/mine
 * Whether (and how) the logged-in jury member already rated this idea —
 * lets the frontend pre-fill the star pickers instead of starting blank.
 * This is the ONLY ratings-read endpoint a jury member can call — by
 * design, it only ever returns their own rating (blind scoring, PRD §7).
 */
router.get("/:id/ratings/mine", requireRole("jury", "admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, idea_id, jury_user_id, criteria_scores, score, rationale AS comment, created_at, updated_at FROM idea_ratings WHERE idea_id = $1 AND jury_user_id = $2",
      [Number(req.params.id), req.user.id]
    );
    res.json({ rating: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ideas/:id/ratings
 * Body: { criteria: { team, marketOpportunity, product, traction, gtmStrategy }, comment? }
 * Every criteria value 1-5. comment is optional free text (PRD §7). The
 * overall score is always the plain average, recomputed here
 * server-side — the client can't submit a fabricated overall score
 * directly.
 */
router.post("/:id/ratings", requireRole("jury", "admin"), async (req, res, next) => {
  try {
    const ideaId = Number(req.params.id);
    const { criteria, comment } = req.body || {};

    const { rows: ideaRows } = await pool.query("SELECT id, source_client_id FROM ideas WHERE id = $1", [ideaId]);
    if (!ideaRows.length) return res.status(404).json({ error: "Idea not found." });
    // I1: jury may only rate ideas from their own client's Ideathon
    if (req.user.role !== "admin") {
      const clientId = await resolveClientId(req);
      if (!clientId || ideaRows[0].source_client_id !== clientId) {
        return res.status(403).json({ error: "You can only rate ideas from your own client's Ideathon." });
      }
    }

    if (!criteria || typeof criteria !== "object") {
      return res.status(400).json({ error: "criteria is required — an object with a 1-5 rating for each of: " + CRITERIA.map((c) => c.key).join(", ") });
    }

    const missing = CRITERIA.filter((c) => criteria[c.key] === undefined || criteria[c.key] === null);
    if (missing.length) {
      return res.status(400).json({ error: `Missing rating for: ${missing.map((c) => c.label).join(", ")}` });
    }

    const clamped = {};
    CRITERIA.forEach((c) => { clamped[c.key] = clamp5(criteria[c.key]); });
    const score = averageScore(clamped);
    const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 2000) || null : null;

    const { rows } = await pool.query(
      `INSERT INTO idea_ratings (idea_id, jury_user_id, criteria_scores, score, rationale, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (idea_id, jury_user_id) DO UPDATE SET
         criteria_scores = EXCLUDED.criteria_scores, score = EXCLUDED.score,
         rationale = EXCLUDED.rationale, updated_at = now()
       RETURNING id, idea_id, jury_user_id, criteria_scores, score, rationale AS comment, created_at, updated_at`,
      [ideaId, req.user.id, JSON.stringify(clamped), score, cleanComment]
    );
    res.status(201).json({ rating: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/leaderboard
 * Ideas ranked by average jury score. Originally admin-only (see git log)
 * to protect blind scoring -- a juror seeing the aggregate could infer how
 * far their own score sits from the group's. That restriction has since
 * been explicitly reversed: jury now gets a Leaderboard tab too. Still
 * closed to junior_employee/applicants.
 */
router.get("/leaderboard", requireRole("admin", "jury"), async (req, res, next) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return res.json({ leaderboard: [] });
    const { rows } = await pool.query(`
      SELECT i.id, i.question_id, i.title, i.description, i.created_at,
             u.name AS submitted_by_name,
             COUNT(r.id)::int AS rating_count,
             AVG(r.score) AS avg_score
      FROM ideas i
      JOIN users u ON u.id = i.submitted_by
      JOIN idea_ratings r ON r.idea_id = i.id
      WHERE i.source_client_id = $1
      GROUP BY i.id, u.name
      ORDER BY ROUND(AVG(r.score)::numeric, 1) DESC, COUNT(r.id) DESC, i.created_at ASC, i.id ASC
    `, [clientId]);
    // Tie rule (I15): ideas are compared on the average as displayed (1 decimal).
    // Equal averages share the same rank ("tied") and are all published together
    // if that rank is in the top 3; within a tie the list is ordered by more jury
    // ratings first, then earlier submission, so the order is stable and explainable.
    const enriched = rows.map(enrich);
    let rank = 0, prevScore = null;
    const ranked = enriched.map((row, i) => {
      const score = Math.round(Number(row.avg_score) * 10) / 10;
      if (score !== prevScore) { rank = i + 1; prevScore = score; }
      return { ...row, rank, published: rank <= 3 };
    });
    for (const row of ranked) row.tied = ranked.filter((o) => o.rank === row.rank).length > 1;
    // I16: blind scoring. Jurors get rank / published / tied only -- never the
    // average or the rating count, which would let them back out another
    // juror's score (e.g. avg minus their own rating). Admin sees everything.
    if (req.user.role === "jury") {
      return res.json({ leaderboard: ranked.map(({ avg_score, rating_count, ...rest }) => rest) });
    }
    res.json({ leaderboard: ranked });
  } catch (err) {
    next(err);
  }
});

export default router;