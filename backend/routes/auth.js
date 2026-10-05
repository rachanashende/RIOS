import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import crypto from "crypto";
import { requireAuth, signToken } from "../middleware/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";

const router = Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [String(email).toLowerCase().trim()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company },
    });
  } catch (err) {
    next(err);
  }
});

/* ---- O15: forgot / reset password ---------------------------------------
   POST /forgot  { email }  -> always the same reply, whether or not the email has an account.
   POST /reset   { token, password } -> sets a new password with a valid, unused, unexpired link.
   Links last 1 hour and work once; only a SHA-256 hash of the token is stored. */
const RESET_WINDOW_MS = 60 * 60 * 1000;
const forgotAttempts = new Map(); // email -> timestamps (small in-memory throttle: 3 requests / hour)
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

router.post("/forgot", async (req, res, next) => {
  const reply = () => res.json({ ok: true, message: "If an account exists for that email, a reset link is on its way. It is valid for 1 hour." });
  try {
    const email = String((req.body || {}).email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Please enter your email address." });

    const now = Date.now();
    const recent = (forgotAttempts.get(email) || []).filter((t) => now - t < RESET_WINDOW_MS);
    if (recent.length >= 3) return reply(); // throttled: same answer, nothing sent
    forgotAttempts.set(email, [...recent, now]);

    const { rows } = await pool.query("SELECT id, name, email FROM users WHERE email = $1", [email]);
    if (rows[0]) {
      const token = crypto.randomBytes(32).toString("hex");
      await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [rows[0].id]);
      await pool.query(
        "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [rows[0].id, hashToken(token), new Date(now + RESET_WINDOW_MS)]
      );
      try { await sendPasswordResetEmail(rows[0].email, rows[0].name, token); }
      catch (mailErr) { console.error("[auth] reset email failed:", mailErr.message); }
    }
    reply();
  } catch (err) {
    next(err);
  }
});

router.post("/reset", async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "A reset link and a new password are required." });
    if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const { rows } = await pool.query(
      "SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
      [hashToken(token)]
    );
    if (!rows[0]) return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [bcrypt.hashSync(String(password), 10), rows[0].user_id]);
    await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [rows[0].user_id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Self-service sign-up — always creates a 'client' account. Junior
// employee / jury accounts are still admin-created only (they need to be
// tied to a specific client engagement, not something a stranger should
// be able to grant themselves).
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

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "An account with that email already exists — try logging in instead." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company) VALUES ($1, $2, $3, 'client', $4) RETURNING *",
      [normalizedEmail, password_hash, name, company || null]
    );
    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;