import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireRole, signToken } from "../middleware/auth.js";
import { QUESTIONS, scoreAnswers, cohortAverage } from "../lib/indexScoring.js";

const router = Router();

/* =========================================================================
   PUBLIC — no auth. Landing page copy + the question set.
   ========================================================================= */

// GET /api/index/campaigns — every currently open campaign, for the public
// landing page. Unlike Rise.RIV's single "the" open opportunity, R-Index
// can have several open at once (different geos/quarters), so this returns
// a list, not a single object.
router.get("/campaigns", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, geo, quarter_label, starts_at, ends_at, created_at
       FROM index_campaigns WHERE is_open = true ORDER BY created_at DESC`
    );
    res.json({ campaigns: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/index/questions — the (placeholder, pending) instrument.
router.get("/questions", (req, res) => {
  res.json({ questions: QUESTIONS });
});

// POST /api/index/signup — self-service sign-up, always creates an
// 'index_respondent' account. Kept as its own endpoint rather than
// widening /api/auth/signup, which is hardcoded to always create 'client'
// — same reasoning as Rise.RIV's applicants: this role has its own
// self-service rule, distinct from the main site's.
router.post("/signup", async (req, res, next) => {
  try {
    const { email, password, name, company } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const { rows: existing } = await pool.query("SELECT id, role FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "An account with that email already exists — try logging in instead." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company) VALUES ($1,$2,$3,'index_respondent',$4) RETURNING *",
      [normalizedEmail, password_hash, name, company || null]
    );
    const user = rows[0];

    // If an admin already keyed in entries for this email (from the
    // interview-capture sheet) before this person ever signed up, link
    // those existing rows to the new account now, so their history and
    // dashboard aren't orphaned from the account they just created.
    await pool.query(
      "UPDATE index_entries SET user_id = $1 WHERE user_id IS NULL AND lower(respondent_email) = $2",
      [user.id, normalizedEmail]
    );

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company },
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   RESPONDENT — authenticated as 'index_respondent' (admins can also access,
   to spot-check the form/dashboard). Login itself reuses the shared
   /api/auth/login endpoint — the role on the returned token is whatever
   the account actually has, no separate index-specific login needed.
   ========================================================================= */
router.use(requireAuth, requireRole("index_respondent", "admin"));

// GET /api/index/my-entries — every entry this respondent has ever
// submitted, across every campaign they've participated in (re-
// participation across quarters/geos is allowed — see PRD §7).
router.get("/my-entries", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.campaign_id, e.score, e.created_at, e.updated_at,
              c.name AS campaign_name, c.geo, c.quarter_label, c.is_open AS campaign_is_open
       FROM index_entries e
       JOIN index_campaigns c ON c.id = e.campaign_id
       WHERE e.user_id = $1
       ORDER BY e.updated_at DESC`,
      [req.user.id]
    );
    res.json({ entries: rows.map((r) => ({ ...r, score: r.score != null ? Number(r.score) : null })) });
  } catch (err) {
    next(err);
  }
});

// POST /api/index/entries — submit (or re-submit) this respondent's answers
// for a given campaign. Upsert scoped to (campaign_id, user_id) — matches
// the partial unique index in db.index.js: one entry per respondent per
// campaign, but a *different* campaign_id always creates a new row, which
// is exactly how re-participation across quarters is meant to work.
router.post("/entries", async (req, res, next) => {
  try {
    const { campaignId, answers, company } = req.body || {};
    if (!campaignId) return res.status(400).json({ error: "campaignId is required." });

    const { rows: campaignRows } = await pool.query(
      "SELECT id, is_open FROM index_campaigns WHERE id = $1",
      [Number(campaignId)]
    );
    const campaign = campaignRows[0];
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!campaign.is_open) return res.status(400).json({ error: "This campaign is closed and no longer accepting submissions." });

    const { clamped, score } = scoreAnswers(answers || {});

    const { rows } = await pool.query(
      `INSERT INTO index_entries (campaign_id, user_id, respondent_name, respondent_email, company, answers, score, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'self', now())
       ON CONFLICT (campaign_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET
         answers = EXCLUDED.answers, score = EXCLUDED.score, company = EXCLUDED.company, updated_at = now()
       RETURNING *`,
      [campaign.id, req.user.id, req.user.name, req.user.email, company || null, JSON.stringify(clamped), score]
    );
    const entry = rows[0];
    res.status(201).json({ entry: { ...entry, score: entry.score != null ? Number(entry.score) : null } });
  } catch (err) {
    next(err);
  }
});

// GET /api/index/entries/:id — the respondent's own entry in full,
// including their raw answers (to support the "check their responses"
// step from the PRD). Admins may also fetch any entry by id here for
// spot-checking; the full cross-campaign admin list lives in indexAdmin.js.
router.get("/entries/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM index_entries WHERE id = $1", [id]);
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: "Entry not found." });
    if (req.user.role !== "admin" && entry.user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only view your own entry." });
    }
    res.json({ entry: { ...entry, score: entry.score != null ? Number(entry.score) : null } });
  } catch (err) {
    next(err);
  }
});

// GET /api/index/entries/:id/dashboard — this entry's score vs. its
// campaign's cohort average. Aggregate only — see cohortAverage()'s doc
// comment. This is always available once a respondent has an entry (not
// gated to the campaign being closed); the *collated report* below is the
// piece that's gated to closed + that campaign's own respondents/admin.
router.get("/entries/:id/dashboard", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows: entryRows } = await pool.query("SELECT * FROM index_entries WHERE id = $1", [id]);
    const entry = entryRows[0];
    if (!entry) return res.status(404).json({ error: "Entry not found." });
    if (req.user.role !== "admin" && entry.user_id !== req.user.id) {
      return res.status(403).json({ error: "You can only view your own dashboard." });
    }

    const { rows: cohortRows } = await pool.query(
      "SELECT score FROM index_entries WHERE campaign_id = $1 AND score IS NOT NULL",
      [entry.campaign_id]
    );
    const { average, count } = cohortAverage(cohortRows.map((r) => r.score));

    res.json({
      myScore: entry.score != null ? Number(entry.score) : null,
      cohortAverage: average,
      cohortSize: count,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/index/campaigns/:id/report — the collated quarterly report, but
// gated: only visible once the admin closes the campaign, and only to that
// campaign's own respondents (or admin) — per PRD §11 resolution. Returns
// aggregate stats only, same access-control shape as the dashboard above.
router.get("/campaigns/:id/report", async (req, res, next) => {
  try {
    const campaignId = Number(req.params.id);
    const { rows: campaignRows } = await pool.query("SELECT * FROM index_campaigns WHERE id = $1", [campaignId]);
    const campaign = campaignRows[0];
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    if (req.user.role !== "admin") {
      if (campaign.is_open) {
        return res.status(403).json({ error: "The report isn't published yet — it becomes visible once this campaign closes." });
      }
      const { rows: mine } = await pool.query(
        "SELECT id FROM index_entries WHERE campaign_id = $1 AND user_id = $2",
        [campaignId, req.user.id]
      );
      if (!mine.length) {
        return res.status(403).json({ error: "This report is only visible to respondents who participated in this campaign." });
      }
    }

    const { rows: entryRows } = await pool.query(
      "SELECT score FROM index_entries WHERE campaign_id = $1 AND score IS NOT NULL",
      [campaignId]
    );
    const { average, count } = cohortAverage(entryRows.map((r) => r.score));

    res.json({
      campaign,
      cohortAverage: average,
      cohortSize: count,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
