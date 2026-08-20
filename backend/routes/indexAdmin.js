import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  QUESTIONS, SECTIONS, INDEX_DIMENSIONS, sanitizeAnswers, scoreAnswers,
  computeIndexScore, cohortAverage, cohortDimensionAverages, stageForScore,
} from "../lib/indexScoring.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/index/campaigns — every campaign, open or closed, with
// entry counts. Mirrors GET /api/admin/rise/opportunities's shape.
router.get("/campaigns", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM index_entries e WHERE e.campaign_id = c.id) AS entry_count
       FROM index_campaigns c ORDER BY c.created_at DESC`
    );
    res.json({ campaigns: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/index/campaigns — create a new quarterly/geo cohort, e.g.
// { name: "Q4 2026 Dubai Retail AI and Innovation Index", geo: "Dubai",
//   quarterLabel: "Q4 2026", startsAt, endsAt }. Defaults to open=true
// (unlike Rise.RIV's opportunities, which default closed) since campaigns
// aren't mutually exclusive here — creating one shouldn't require a
// separate "now open it" step for the common case of launching a new
// quarter's campaign right away.
router.post("/campaigns", async (req, res, next) => {
  try {
    const { name, geo, quarterLabel, startsAt, endsAt, isOpen } = req.body || {};
    if (!name) return res.status(400).json({ error: "Name is required." });
    const { rows } = await pool.query(
      `INSERT INTO index_campaigns (name, geo, quarter_label, starts_at, ends_at, is_open)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [String(name).trim(), geo || null, quarterLabel || null, startsAt || null, endsAt || null, isOpen !== false]
    );
    res.status(201).json({ campaign: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/index/campaigns/:id — edit a campaign's details.
router.put("/campaigns/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, geo, quarterLabel, startsAt, endsAt } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE index_campaigns SET
         name = COALESCE($2, name), geo = COALESCE($3, geo),
         quarter_label = COALESCE($4, quarter_label),
         starts_at = COALESCE($5, starts_at), ends_at = COALESCE($6, ends_at)
       WHERE id = $1 RETURNING *`,
      [id, name || null, geo || null, quarterLabel || null, startsAt || null, endsAt || null]
    );
    if (!rows.length) return res.status(404).json({ error: "Campaign not found." });
    res.json({ campaign: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/index/campaigns/:id/open — open this campaign. Does NOT
// close any other campaign (see db.index.js's comment — campaigns aren't
// mutually exclusive the way Rise.RIV's opportunities are).
router.put("/campaigns/:id/open", async (req, res, next) => {
  try {
    await pool.query("UPDATE index_campaigns SET is_open = true WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/index/campaigns/:id/close — close this campaign. This is
// also the trigger that makes the collated report visible to that
// campaign's respondents (see routes/index.js GET .../report).
router.put("/campaigns/:id/close", async (req, res, next) => {
  try {
    await pool.query("UPDATE index_campaigns SET is_open = false WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/index/campaigns/:id/entries — every entry in a campaign,
// admin-only full view (individual respondent scores — never exposed to
// other respondents, only to admin here).
router.get("/campaigns/:id/entries", async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT e.*, u.email AS account_email
       FROM index_entries e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.campaign_id = $1
       ORDER BY e.created_at DESC`,
      [campaignId]
    );
    res.json({ entries: rows.map((r) => ({ ...r, score: r.score != null ? Number(r.score) : null })) });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/index/entries — admin keys in an entry on behalf of a
// respondent (e.g. straight from the interview-capture sheet), no account
// required. If an index_respondent account with a matching email already
// exists, it's linked automatically (user_id set) so it shows up on that
// respondent's own dashboard immediately; if not, user_id stays null until
// they self-signup later (routes/index.js's signup handler links it then).
router.post("/entries", async (req, res, next) => {
  try {
    const { campaignId, respondentName, respondentEmail, company, answers } = req.body || {};
    if (!campaignId || !respondentName || !respondentEmail) {
      return res.status(400).json({ error: "campaignId, respondentName, and respondentEmail are required." });
    }
    const normalizedEmail = String(respondentEmail).toLowerCase().trim();

    const { rows: campaignRows } = await pool.query("SELECT id FROM index_campaigns WHERE id = $1", [Number(campaignId)]);
    if (!campaignRows.length) return res.status(404).json({ error: "Campaign not found." });

    const { rows: userRows } = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND role = 'index_respondent'",
      [normalizedEmail]
    );
    const userId = userRows[0]?.id || null;

    const scored = scoreAnswers(answers || {});

    const { rows } = await pool.query(
      `INSERT INTO index_entries (campaign_id, user_id, respondent_name, respondent_email, company, answers, score, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'admin', now())
       ON CONFLICT (campaign_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET
         answers = EXCLUDED.answers, score = EXCLUDED.score, company = EXCLUDED.company,
         respondent_name = EXCLUDED.respondent_name, updated_at = now()
       RETURNING *`,
      [Number(campaignId), userId, String(respondentName).trim(), normalizedEmail, company || null, JSON.stringify(scored.answers), scored.overallScore]
    );
    const entry = rows[0];
    res.status(201).json({ entry: { ...entry, score: entry.score != null ? Number(entry.score) : null }, dimensionScores: scored.dimensionScores });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/index/entries/:id — admin edits an existing entry's
// answers (e.g. correcting a value transcribed from the interview sheet).
router.put("/entries/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { answers, respondentName, company } = req.body || {};
    const { rows: existingRows } = await pool.query("SELECT * FROM index_entries WHERE id = $1", [id]);
    if (!existingRows.length) return res.status(404).json({ error: "Entry not found." });

    const mergedAnswers = { ...(existingRows[0].answers || {}), ...sanitizeAnswers(answers || {}) };
    const scored = scoreAnswers(mergedAnswers);

    const { rows } = await pool.query(
      `UPDATE index_entries SET
         answers = $2, score = $3, respondent_name = COALESCE($4, respondent_name),
         company = COALESCE($5, company), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(scored.answers), scored.overallScore, respondentName || null, company || null]
    );
    res.json({ entry: { ...rows[0], score: rows[0].score != null ? Number(rows[0].score) : null }, dimensionScores: scored.dimensionScores });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/index/entries/:id
router.delete("/entries/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM index_entries WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/index/campaigns/:id/report — admin's own view of the
// collated report data (same aggregate the respondent-facing report uses,
// plus the full entry list with per-entry dimension breakdowns and stage,
// since admin is allowed to see individual scores where a respondent
// isn't — matches the sample report's leaderboard + "Five Dimensions"
// table shape).
router.get("/campaigns/:id/report", async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { rows: campaignRows } = await pool.query("SELECT * FROM index_campaigns WHERE id = $1", [campaignId]);
    const campaign = campaignRows[0];
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const { rows: entries } = await pool.query(
      "SELECT id, respondent_name, company, answers, score, created_at FROM index_entries WHERE campaign_id = $1 ORDER BY score DESC NULLS LAST",
      [campaignId]
    );
    const scoredEntries = entries.map((r) => {
      const { dimensionScores } = computeIndexScore(r.answers || {});
      return {
        id: r.id, respondent_name: r.respondent_name, company: r.company,
        score: r.score != null ? Number(r.score) : null,
        stage: stageForScore(r.score), dimensionScores, created_at: r.created_at,
      };
    });
    const { average, count } = cohortAverage(entries.map((r) => r.score));
    const dimensionAverages = cohortDimensionAverages(scoredEntries.map((r) => r.dimensionScores));

    res.json({
      campaign,
      cohortAverage: average,
      cohortSize: count,
      dimensionAverages,
      indexDimensions: INDEX_DIMENSIONS,
      entries: scoredEntries,
      questions: QUESTIONS,
      sections: SECTIONS,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
