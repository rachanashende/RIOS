import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { CRITERIA, clamp1to5, averageScore } from "../lib/riseScoring.js";

const router = Router();

function enrichScore(row) {
  return { ...row, total: row.total != null ? Number(row.total) : null };
}

/* =========================================================================
   PUBLIC — no auth. Anyone with the link can view the open opportunity
   and submit an application.
   ========================================================================= */

// GET /api/rise/opportunity — the currently open posting, for the public
// landing page copy. Returns { opportunity: null } if nothing is open.
router.get("/opportunity", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, title, description, benefits, eligibility, to_char(deadline, 'YYYY-MM-DD') AS deadline, created_at FROM rise_opportunities WHERE is_open = true ORDER BY created_at DESC LIMIT 1"
    );
    res.json({ opportunity: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/rise/criteria — the 5 jury scoring criteria (public so the
// applicant-facing page can, if it wants, show what startups are judged
// on — no scores are exposed here, just the rubric labels).
router.get("/criteria", (req, res) => {
  res.json({ criteria: CRITERIA });
});

// POST /api/rise/apply — startup application intake.
// No login, no account created. Deliberately returns only a bare
// acknowledgment — never the inserted row's id or any other applicant's
// data — so there is nothing in the response an applicant could use to
// look up or infer other entries.
router.post("/apply", async (req, res, next) => {
  try {
    const { startupName, founderName, email, phone, website, sector, stage, pitch, ...extra } = req.body || {};
    if (!startupName || !founderName || !email) {
      return res.status(400).json({ error: "Startup name, founder name, and email are required." });
    }

    const { rows: openRows } = await pool.query(
      "SELECT id FROM rise_opportunities WHERE is_open = true ORDER BY created_at DESC LIMIT 1"
    );
    const opportunityId = openRows[0]?.id || null;
    if (!opportunityId) {
      return res.status(400).json({ error: "Applications aren't open right now." });
    }

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO rise_applications
         (opportunity_id, startup_name, founder_name, email, phone, website, sector, stage, pitch, extra)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`,
      [
        opportunityId,
        String(startupName).trim(),
        String(founderName).trim(),
        String(email).toLowerCase().trim(),
        phone || null,
        website || null,
        sector || null,
        stage || null,
        pitch || null,
        JSON.stringify(extra || {}),
      ]
    );

    // ST8: give the founder something to keep -- a reference number they can quote.
    const appId = insertedRows[0].id;
    res.status(201).json({
      ok: true,
      reference: `RISE-${String(appId).padStart(5, "0")}`,
      submittedAt: insertedRows[0].created_at,
      message: "Thanks for filling in your details. We will get back to you.",
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rise/jury/signup — REMOVED. RIOS's rule is that every account
// is issued top-down (admin issues client; admin issues Rise.RIV jury via
// POST /api/admin/rise/jury below) — no role self-registers. A juror logs
// in with admin-issued credentials at the existing /api/auth/login below.

/* =========================================================================
   JURY — authenticated as 'rise_jury' (admins can also access, to spot-
   check). No jury member can see another juror's individual score for the
   same application — each juror's rating stands alone; only the admin
   view aggregates them.

   PRD: "Startup review process: add an RIV quality check before
   submissions reach the retailer's jury" + "Startup jury: the retailer's
   internal leadership acts as the jury, rather than treating RIV users as
   the retailer's jury." A rise_jury login is now scoped to one retailer
   (users.client_id, same I1 pattern as Ideathon's jury role) and only
   ever sees applications that are (a) riv_status='approved' and (b) for
   a call belonging to their own retailer. An opportunity with no
   client_id set (legacy/unassigned) is visible only to a juror who also
   has no client_id -- never broadened the other way. Admin keeps
   unrestricted access, same as before, to spot-check anything.
   ========================================================================= */
router.use(requireAuth, requireRole("rise_jury", "admin"));

// Resolves the scoping this juror's queries must respect. null clientId +
// isAdmin=true means "no restriction"; null clientId + isAdmin=false means
// "this juror has no retailer assigned yet" (sees only unassigned calls).
async function jurorScope(user) {
  if (user.role === "admin") return { isAdmin: true, clientId: null };
  const { rows } = await pool.query("SELECT client_id FROM users WHERE id = $1", [user.id]);
  return { isAdmin: false, clientId: rows[0]?.client_id ?? null };
}

// GET /api/rise/applications — list of applications for the currently
// open opportunity, each flagged with whether the logged-in juror has
// already scored it (drives the "X of Y scored" dashboard).
router.get("/applications", async (req, res, next) => {
  try {
    const scope = await jurorScope(req.user);
    const params = [req.user.id];
    let scopeClause = "";
    if (!scope.isAdmin) {
      if (scope.clientId == null) {
        scopeClause = "AND a.riv_status = 'approved' AND o.client_id IS NULL";
      } else {
        params.push(scope.clientId);
        scopeClause = `AND a.riv_status = 'approved' AND o.client_id = $${params.length}`;
      }
    }
    const { rows } = await pool.query(
      `SELECT a.id, a.startup_name, a.founder_name, a.sector, a.stage, a.created_at,
              a.opportunity_id, o.title AS opportunity_title, o.is_open AS opportunity_is_open,
              s.total AS my_total, (s.id IS NOT NULL) AS scored_by_me
       FROM rise_applications a
       LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
       LEFT JOIN rise_scores s ON s.application_id = a.id AND s.jury_user_id = $1
       WHERE true ${scopeClause}
       ORDER BY (o.is_open IS NOT FALSE) DESC, o.created_at DESC NULLS LAST, a.opportunity_id, a.created_at DESC`,
      params
    );
    res.json({
      applications: rows.map((r) => ({ ...r, my_total: r.my_total != null ? Number(r.my_total) : null })),
    });
  } catch (err) {
    next(err);
  }
});

// Shared visibility check for a single application -- GET /:id, POST
// /:id/score. Returns the application row (with its opportunity's
// client_id) if this juror may see it, or null if not.
async function visibleApplicationFor(user, id) {
  const scope = await jurorScope(user);
  const { rows } = await pool.query(
    `SELECT a.*, o.client_id AS opportunity_client_id FROM rise_applications a
     LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id WHERE a.id = $1`,
    [id]
  );
  const found = rows[0];
  if (!found) return null;
  if (scope.isAdmin) return found;
  if (found.riv_status !== "approved") return null;
  if ((found.opportunity_client_id ?? null) !== (scope.clientId ?? null)) return null;
  return found;
}

// GET /api/rise/applications/:id — full detail for one application, plus
// the logged-in juror's own score if they've already submitted one.
router.get("/applications/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const found = await visibleApplicationFor(req.user, id);
    if (!found) return res.status(404).json({ error: "Application not found." });
    // ST10: founder contact details are for RIV admin only (see admin application
    // screen). Jurors score on the merits, so email and phone are not sent to them.
    const { email, phone, opportunity_client_id, ...application } = found;

    const { rows: myScoreRows } = await pool.query(
      "SELECT * FROM rise_scores WHERE application_id = $1 AND jury_user_id = $2",
      [id, req.user.id]
    );
    res.json({ application, myScore: myScoreRows[0] ? enrichScore(myScoreRows[0]) : null });
  } catch (err) {
    next(err);
  }
});

// POST /api/rise/applications/:id/score
// Body: { scores: { [criterionKey]: 1-5, ... }, comments? }
// Every one of the 5 fixed criteria must be present — the average is
// always computed server-side from clamped 1-5 values, never trusted
// as-sent. Upsert: a juror can revise their own score any time.
router.post("/applications/:id/score", async (req, res, next) => {
  try {
    const applicationId = Number(req.params.id);
    const { scores, comments } = req.body || {};
    if (!scores || typeof scores !== "object") {
      return res.status(400).json({ error: "scores is required." });
    }

    const found = await visibleApplicationFor(req.user, applicationId);
    if (!found) return res.status(404).json({ error: "Application not found." });

    const clamped = {};
    for (const c of CRITERIA) {
      const v = clamp1to5(scores[c.key]);
      if (v === null) return res.status(400).json({ error: `Missing or invalid score for "${c.label}".` });
      clamped[c.key] = v;
    }
    const total = averageScore(clamped);

    const { rows } = await pool.query(
      `INSERT INTO rise_scores (application_id, jury_user_id, scores, total, comments, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (application_id, jury_user_id) DO UPDATE SET
         scores = EXCLUDED.scores, total = EXCLUDED.total, comments = EXCLUDED.comments, updated_at = now()
       RETURNING *`,
      [applicationId, req.user.id, JSON.stringify(clamped), total, (comments || "").trim() || null]
    );
    res.status(201).json({ score: enrichScore(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// GET /api/rise/dashboard — the logged-in juror's own progress summary.
router.get("/dashboard", async (req, res, next) => {
  try {
    const scope = await jurorScope(req.user);
    const params = [req.user.id];
    let scopeClause = "";
    if (!scope.isAdmin) {
      if (scope.clientId == null) {
        scopeClause = "AND a.riv_status = 'approved' AND o.client_id IS NULL";
      } else {
        params.push(scope.clientId);
        scopeClause = `AND a.riv_status = 'approved' AND o.client_id = $${params.length}`;
      }
    }
    // O7: progress counts only applications to calls that are still open; closed calls are listed but not counted.
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.is_open IS NOT FALSE)::int AS total,
         COUNT(*) FILTER (WHERE o.is_open IS NOT FALSE AND s.id IS NOT NULL)::int AS scored,
         COUNT(*) FILTER (WHERE o.is_open = FALSE)::int AS closed
       FROM rise_applications a
       LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
       LEFT JOIN rise_scores s ON s.application_id = a.id AND s.jury_user_id = $1
       WHERE true ${scopeClause}`,
      params
    );
    res.json({ total: rows[0].total, scored: rows[0].scored, closed: rows[0].closed });
  } catch (err) {
    next(err);
  }
});

export default router;
