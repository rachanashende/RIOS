import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// List all client accounts with completion progress
router.get("/clients", async (req, res, next) => {
  try {
    const { rows: clients } = await pool.query(
      "SELECT id, email, name, company, created_at, audit_submitted_at FROM users WHERE role = 'client' AND audit_owner_id IS NULL ORDER BY created_at DESC"
    );
    const { rows: members } = await pool.query(
      "SELECT id, email, name, audit_owner_id FROM users WHERE role = 'client' AND audit_owner_id IS NOT NULL ORDER BY created_at"
    );
    const withProgress = await Promise.all(
      clients.map(async (c) => {
        const { rows } = await pool.query(
          "SELECT maturity FROM responses WHERE user_id = $1 AND (maturity IS NOT NULL OR not_applicable)",
          [c.id]
        );
        return { ...c, answered: rows.length, members: members.filter((m) => m.audit_owner_id === c.id) };
      })
    );
    res.json({ clients: withProgress });
  } catch (err) {
    next(err);
  }
});

// A7: reopen a submitted audit so the client can edit it again
router.post("/clients/:id/reopen", async (req, res, next) => {
  try {
    const r = await pool.query(
      "UPDATE users SET audit_submitted_at = NULL WHERE id = $1 AND role = 'client' RETURNING id",
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: "Client not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Create a new client login (admin-issued invite, per PRD FR-2 — no self-signup)
router.post("/clients", async (req, res, next) => {
  try {
    const { email, password, name, ownerId } = req.body || {};
    let company = (req.body || {}).company;
    // A9: ownerId = add another login that shares an existing retailer's audit
    let owner = null;
    if (ownerId) {
      const o = await pool.query("SELECT id, company FROM users WHERE id = $1 AND role = 'client' AND audit_owner_id IS NULL", [ownerId]);
      if (!o.rows.length) return res.status(404).json({ error: "That retailer account was not found." });
      owner = o.rows[0].id; company = o.rows[0].company;
    }
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and a temporary password are required." });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company, audit_owner_id) VALUES ($1, $2, $3, 'client', $4, $5) RETURNING id",
      [normalizedEmail, password_hash, name, company || null, owner]
    );

    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, company });
  } catch (err) {
    next(err);
  }
});

router.delete("/clients/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'client'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Admin viewing a specific client's scorecard
router.get("/clients/:id/responses", async (req, res, next) => {
  try {
    const { rows: clientRows } = await pool.query(
      "SELECT id, email, name, company FROM users WHERE id = $1 AND role = 'client'",
      [req.params.id]
    );
    const client = clientRows[0];
    if (!client) return res.status(404).json({ error: "Client not found." });

    const { rows } = await pool.query(
      "SELECT question_id, maturity, evidence, not_applicable, updated_at FROM responses WHERE user_id = $1",
      [req.params.id]
    );
    const responses = {};
    rows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence, na: !!r.not_applicable, updated_at: r.updated_at }; });
    res.json({ client, responses });
  } catch (err) {
    next(err);
  }
});

export default router;
