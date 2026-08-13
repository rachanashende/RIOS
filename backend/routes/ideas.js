import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS, computeScores } from "../lib/scoring.js";
import { weightedAvg, clamp10 } from "../lib/ideasScoring.js";

const router = Router();
router.use(requireAuth);

function questionById(id) {
  return QUESTIONS.find((q) => q.id === Number(id)) || null;
}

// Attach the static question text/module/submodule to a DB row that only
// stores question_id, and coerce the aggregate columns Postgres returns
// as strings (COUNT/AVG) back into numbers.
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
router.get("/opportunities", requireRole("employee", "jury", "admin"), async (req, res, next) => {
  try {
    const { rows: settingsRows } = await pool.query("SELECT source_client_id FROM ideas_settings WHERE id = 1");
    const sourceClientId = settingsRows[0]?.source_client_id;
    if (!sourceClientId) {
      return res.json({ opportunities: [], sourceClient: null });
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
 * GET /api/ideas?questionId=123
 * All submitted ideas (optionally filtered to one opportunity), with each
 * idea's current rating count and average score.
 */
router.get("/", requireRole("employee", "jury", "admin"), async (req, res, next) => {
  try {
    const { questionId } = req.query;
    const params = [];
    let sql = `
      SELECT i.id, i.question_id, i.title, i.description, i.created_at,
             u.name AS submitted_by_name,
             COUNT(r.id)::int AS rating_count,
             AVG(r.score) AS avg_score
      FROM ideas i
      JOIN users u ON u.id = i.submitted_by
      LEFT JOIN idea_ratings r ON r.idea_id = i.id
    `;
    if (questionId) {
      params.push(Number(questionId));
      sql += ` WHERE i.question_id = $${params.length}`;
    }
    sql += ` GROUP BY i.id, u.name ORDER BY i.created_at DESC`;

    const { rows } = await pool.query(sql, params);
    res.json({ ideas: rows.map(enrich) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/mine
 * The logged-in employee's own submissions, for the "My submissions" tab.
 */
router.get("/mine", requireRole("employee", "admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.question_id, i.title, i.description, i.created_at,
              COUNT(r.id)::int AS rating_count, AVG(r.score) AS avg_score
       FROM ideas i
       LEFT JOIN idea_ratings r ON r.idea_id = i.id
       WHERE i.submitted_by = $1
       GROUP BY i.id
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json({ ideas: rows.map(enrich) });
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
router.post("/", requireRole("employee", "admin"), async (req, res, next) => {
  try {
    const { ideas } = req.body || {};
    if (!Array.isArray(ideas) || ideas.length === 0) {
      return res.status(400).json({ error: "Expected a non-empty array of ideas." });
    }

    const { rows: settingsRows } = await pool.query("SELECT source_client_id FROM ideas_settings WHERE id = 1");
    const sourceClientId = settingsRows[0]?.source_client_id || null;

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
 * GET /api/ideas/:id/ratings/mine
 * Whether (and how) the logged-in jury member already rated this idea —
 * lets the frontend reopen an existing rating instead of starting a new
 * CRIT interview from scratch.
 */
router.get("/:id/ratings/mine", requireRole("jury", "admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM idea_ratings WHERE idea_id = $1 AND jury_user_id = $2",
      [Number(req.params.id), req.user.id]
    );
    res.json({ rating: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ideas/:id/ratings
 * Body: { impact, feasibility, innovation, cost, rationale, transcript }
 * Saves (or updates) this jury member's CRIT rating for one idea. Scores
 * are always clamped and the weighted average is always recomputed
 * server-side — the client-submitted "score" is never trusted directly.
 */
router.post("/:id/ratings", requireRole("jury", "admin"), async (req, res, next) => {
  try {
    const ideaId = Number(req.params.id);
    const { impact, feasibility, innovation, cost, rationale, transcript } = req.body || {};

    const { rows: ideaRows } = await pool.query("SELECT id FROM ideas WHERE id = $1", [ideaId]);
    if (!ideaRows.length) return res.status(404).json({ error: "Idea not found." });

    const scores = {
      impact: clamp10(impact),
      feasibility: clamp10(feasibility),
      innovation: clamp10(innovation),
      cost: clamp10(cost),
    };
    const score = weightedAvg(scores);

    const { rows } = await pool.query(
      `INSERT INTO idea_ratings (idea_id, jury_user_id, impact, feasibility, innovation, cost, rationale, transcript, score, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (idea_id, jury_user_id) DO UPDATE SET
         impact = EXCLUDED.impact, feasibility = EXCLUDED.feasibility, innovation = EXCLUDED.innovation,
         cost = EXCLUDED.cost, rationale = EXCLUDED.rationale, transcript = EXCLUDED.transcript,
         score = EXCLUDED.score, updated_at = now()
       RETURNING *`,
      [
        ideaId, req.user.id,
        scores.impact, scores.feasibility, scores.innovation, scores.cost,
        (rationale || "").trim() || null,
        JSON.stringify(Array.isArray(transcript) ? transcript : []),
        score,
      ]
    );
    res.status(201).json({ rating: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ideas/leaderboard
 * Ideas ranked by overall weighted-average jury score (mean of every
 * jury member's weighted score for that idea). Top 3 are "published".
 * Ideas with zero ratings are excluded — nothing to rank yet.
 */
router.get("/leaderboard", requireRole("employee", "jury", "admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.question_id, i.title, i.description, i.created_at,
             u.name AS submitted_by_name,
             COUNT(r.id)::int AS rating_count,
             AVG(r.score) AS avg_score
      FROM ideas i
      JOIN users u ON u.id = i.submitted_by
      JOIN idea_ratings r ON r.idea_id = i.id
      GROUP BY i.id, u.name
      ORDER BY avg_score DESC
    `);
    const ranked = rows.map(enrich).map((row, i) => ({ ...row, published: i < 3 }));
    res.json({ leaderboard: ranked });
  } catch (err) {
    next(err);
  }
});

export default router;
