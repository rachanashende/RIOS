import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// GET current Ideas.RIV settings (which client's audit feeds the Top 5)
router.get("/settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.source_client_id, u.name, u.company
       FROM ideas_settings s
       LEFT JOIN users u ON u.id = s.source_client_id
       WHERE s.id = 1`
    );
    const row = rows[0];
    res.json({
      sourceClient: row?.source_client_id ? { id: row.source_client_id, name: row.name, company: row.company } : null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT { sourceClientId } — choose which client's scored audit populates
// the 5 opportunities. Pass null to clear it.
router.put("/settings", async (req, res, next) => {
  try {
    const { sourceClientId } = req.body || {};
    if (sourceClientId) {
      const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [sourceClientId]);
      if (!rows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    }
    await pool.query(
      "UPDATE ideas_settings SET source_client_id = $1, updated_at = now() WHERE id = 1",
      [sourceClientId || null]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ideas/users?role=employee — list employee or jury accounts
router.get("/users", async (req, res, next) => {
  try {
    const role = req.query.role === "jury" ? "jury" : "employee";
    const { rows } = await pool.query(
      "SELECT id, email, name, company, created_at FROM users WHERE role = $1 ORDER BY created_at DESC",
      [role]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ideas/users — create an employee or jury login
router.post("/users", async (req, res, next) => {
  try {
    const { email, password, name, role, company } = req.body || {};
    if (!email || !password || !name || !["employee", "jury"].includes(role)) {
      return res.status(400).json({ error: "Name, email, temporary password, and role ('employee' or 'jury') are required." });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [normalizedEmail, password_hash, name, role, company || null]
    );

    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role, company });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role IN ('employee','jury')", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
