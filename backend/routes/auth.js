import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "../db.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";

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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company,
        emailVerified: user.email_verified,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Looks up fresh from the DB (rather than just decoding the JWT) so
// emailVerified reflects a verification that happened in another tab
// since login.
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, name, role, company, email_verified FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Account not found." });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company: user.company,
        emailVerified: user.email_verified,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "Missing verification token." });

    const { rows } = await pool.query(
      "SELECT id, verification_token_expiry FROM users WHERE verification_token = $1",
      [token]
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "This verification link is invalid or has already been used." });
    if (new Date(user.verification_token_expiry) < new Date()) {
      return res.status(400).json({ error: "This verification link has expired. Ask your admin to resend it, or request a new one." });
    }

    await pool.query(
      "UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expiry = NULL WHERE id = $1",
      [user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/resend-verification", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, email, name, email_verified FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Account not found." });
    if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      "UPDATE users SET verification_token = $1, verification_token_expiry = $2 WHERE id = $3",
      [token, expiry, user.id]
    );
    await sendVerificationEmail(user.email, user.name, token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Always responds the same way whether or not the email exists, so this
// endpoint can't be used to enumerate registered accounts.
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required." });

    const { rows } = await pool.query("SELECT id, name, email FROM users WHERE email = $1", [
      String(email).toLowerCase().trim(),
    ]);
    const user = rows[0];

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await pool.query("UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3", [
        token,
        expiry,
        user.id,
      ]);
      sendPasswordResetEmail(user.email, user.name, token).catch((err) => {
        console.error("Failed to send password reset email:", err);
      });
    }

    res.json({ ok: true, message: "If that email has an account, a reset link is on its way." });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "Missing token or new password." });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const { rows } = await pool.query("SELECT id, reset_token_expiry FROM users WHERE reset_token = $1", [token]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "This reset link is invalid or has already been used." });
    if (new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).json({ error: "This reset link has expired. Request a new one." });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2",
      [password_hash, user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
