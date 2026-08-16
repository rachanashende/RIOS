import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { CRITERIA } from "../lib/riseScoring.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/rise/opportunities
router.get("/opportunities", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, (SELECT COUNT(*)::int FROM rise_applications a WHERE a.opportunity_id = o.id) AS application_count
       FROM rise_opportunities o ORDER BY o.created_at DESC`
    );
    res.json({ opportunities: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/rise/opportunities — create a new posting. Does not
// auto-open it (see PUT .../open below) so an admin can prep the copy
// before it goes live.
router.post("/opportunities", async (req, res, next) => {
  try {
    const { title, description } = req.body || {};
    if (!title) return res.status(400).json({ error: "Title is required." });
    const { rows } = await pool.query(
      "INSERT INTO rise_opportunities (title, description, is_open) VALUES ($1,$2,false) RETURNING *",
      [String(title).trim(), description || null]
    );
    res.status(201).json({ opportunity: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id/open — mark this one open and
// every other one closed. Only one opportunity accepts applications at a
// time in this v1 (see rise.js POST /apply).
router.put("/opportunities/:id/open", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query("UPDATE rise_opportunities SET is_open = (id = $1)", [id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id/close
router.put("/opportunities/:id/close", async (req, res, next) => {
  try {
    await pool.query("UPDATE rise_opportunities SET is_open = false WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/applications — every startup application, with
// aggregate jury stats. Admin is the only role that ever sees the average
// across all jurors here.
router.get("/applications", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, o.title AS opportunity_title,
             COUNT(s.id)::int AS score_count,
             AVG(s.total) AS avg_total
      FROM rise_applications a
      LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
      LEFT JOIN rise_scores s ON s.application_id = a.id
      GROUP BY a.id, o.title
      ORDER BY a.created_at DESC
    `);
    res.json({
      applications: rows.map((r) => ({ ...r, avg_total: r.avg_total != null ? Number(r.avg_total) : null })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/applications/:id — one application with every
// individual jury score broken out (admin-only view of who scored what).
router.get("/applications/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows: appRows } = await pool.query("SELECT * FROM rise_applications WHERE id = $1", [id]);
    const application = appRows[0];
    if (!application) return res.status(404).json({ error: "Application not found." });

    const { rows: scoreRows } = await pool.query(
      `SELECT s.*, u.name AS jury_name, u.email AS jury_email
       FROM rise_scores s JOIN users u ON u.id = s.jury_user_id
       WHERE s.application_id = $1 ORDER BY s.updated_at DESC`,
      [id]
    );
    res.json({
      application,
      scores: scoreRows.map((r) => ({ ...r, total: Number(r.total) })),
      criteria: CRITERIA,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/jury — jury roster with scoring progress
router.get("/jury", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.company, u.created_at,
             COUNT(s.id)::int AS scored_count
      FROM users u
      LEFT JOIN rise_scores s ON s.jury_user_id = u.id
      WHERE u.role = 'rise_jury'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ jury: rows });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/rise/jury/:id — remove a jury account (their scores
// cascade-delete with them, per the FK ON DELETE CASCADE in db.rise.js)
router.delete("/jury/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'rise_jury'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
