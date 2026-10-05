import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import crypto from "crypto";
import { requireAuth, signToken } from "../middleware/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";

const router = Router();


/* ---- O23: login throttle ------------------------------------------------
   5 wrong passwords for one email within 15 minutes lock that email for 15 minutes; 30 wrong
   passwords from one IP within 15 minutes lock that IP. A correct login or a completed password
   reset clears the email's count. In memory (resets on restart / not shared across instances). */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 30;
const failsByKey = new Map(); // "e:<email>" | "i:<ip>" -> failure timestamps
function recentFails(key) {
  const now = Date.now();
  const list = (failsByKey.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failsByKey.set(key, list); else failsByKey.delete(key);
  return list;
}
function lockedFor(key, max) {
  const list = recentFails(key);
  return list.length >= max ? Math.ceil((FAIL_WINDOW_MS - (Date.now() - list[0])) / 60000) : 0;
}
function noteFail(key) { failsByKey.set(key, [...recentFails(key), Date.now()]); }
setInterval(() => { for (const k of [...failsByKey.keys()]) recentFails(k); }, 10 * 60 * 1000).unref();

export function clearLoginLock(email) { failsByKey.delete("e:" + String(email).toLowerCase().trim()); }

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const normalizedEmail = String(email).toLowerCase().trim();
    const emailKey = "e:" + normalizedEmail, ipKey = "i:" + (req.ip || "");
    const wait = Math.max(lockedFor(emailKey, MAX_FAILS_PER_EMAIL), lockedFor(ipKey, MAX_FAILS_PER_IP));
    if (wait > 0) {
      res.set("Retry-After", String(wait * 60));
      return res.status(429).json({ error: `Too many failed log-in attempts. Please wait about ${wait} minute${wait === 1 ? "" : "s"} and try again, or use "Forgot password?".` });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      noteFail(emailKey); noteFail(ipKey);
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    failsByKey.delete(emailKey);

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company },
      mustChangePassword: !!user.must_change_password,
    });
  } catch (err) {
    next(err);
  }
});

/* ---- O17: signed-in user sets their own password (clears the temporary-password flag) ---- */
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password are required." });
    if (String(newPassword).length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
    if (newPassword === currentPassword) return res.status(400).json({ error: "Choose a password different from the temporary one." });
    const { rows } = await pool.query("SELECT id, password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0] || !bcrypt.compareSync(String(currentPassword), rows[0].password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    await pool.query("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2", [bcrypt.hashSync(String(newPassword), 10), req.user.id]);
    res.json({ ok: true });
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

    await pool.query("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2", [bcrypt.hashSync(String(password), 10), rows[0].user_id]);
    await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [rows[0].user_id]);
    const { rows: who } = await pool.query("SELECT email FROM users WHERE id = $1", [rows[0].user_id]);
    if (who[0]) failsByKey.delete("e:" + String(who[0].email).toLowerCase().trim()); // O23: a completed reset lifts the lock
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