import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendVerificationEmail } from "../lib/email.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// List all client accounts with completion progress
router.get("/clients", async (req, res, next) => {
  try {
    const { rows: clients } = await pool.query(
      "SELECT id, email, name, company, created_at, email_verified FROM users WHERE role = 'client' ORDER BY created_at DESC"
    );
    const withProgress = await Promise.all(
      clients.map(async (c) => {
        const { rows } = await pool.query(
          "SELECT maturity FROM responses WHERE user_id = $1 AND maturity IS NOT NULL",
          [c.id]
        );
        return { ...c, answered: rows.length };
      })
    );
    res.json({ clients: withProgress });
  } catch (err) {
    next(err);
  }
});

// Create a new client login (admin-issued invite, per PRD FR-2 — no self-signup)
router.post("/clients", async (req, res, next) => {
  try {
    const { email, password, name, company } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and a temporary password are required." });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company, verification_token, verification_token_expiry)
       VALUES ($1, $2, $3, 'client', $4, $5, $6) RETURNING id`,
      [normalizedEmail, password_hash, name, company || null, verificationToken, verificationExpiry]
    );

    sendVerificationEmail(normalizedEmail, name, verificationToken).catch((err) => {
      console.error("Failed to send verification email:", err);
    });

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
      "SELECT question_id, maturity, evidence FROM responses WHERE user_id = $1",
      [req.params.id]
    );
    const responses = {};
    rows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence }; });
    res.json({ client, responses });
  } catch (err) {
    next(err);
  }
});

export default router;
