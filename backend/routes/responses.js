import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { QUESTIONS, MODULES } from "../lib/scoring.js";

const router = Router();

// The 165-question instrument itself — not client-sensitive, no auth needed to load it
router.get("/questions", (req, res) => {
  res.json({ questions: QUESTIONS, modules: MODULES });
});

// Logged-in client/admin's own saved responses
router.get("/responses", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT question_id, maturity, evidence FROM responses WHERE user_id = $1",
      [req.user.id]
    );
    const responses = {};
    rows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence }; });
    res.json({ responses });
  } catch (err) {
    next(err);
  }
});

// Upsert a batch of responses: { responses: { [questionId]: { maturity, evidence } } }
router.put("/responses", requireAuth, async (req, res, next) => {
  const { responses } = req.body || {};
  if (!responses || typeof responses !== "object") {
    return res.status(400).json({ error: "Expected a responses object." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [questionId, val] of Object.entries(responses)) {
      await client.query(
        `INSERT INTO responses (user_id, question_id, maturity, evidence, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           maturity = EXCLUDED.maturity,
           evidence = EXCLUDED.evidence,
           updated_at = EXCLUDED.updated_at`,
        [
          req.user.id,
          Number(questionId),
          val && val.maturity != null ? val.maturity : null,
          (val && val.evidence) || null,
        ]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, saved: Object.keys(responses).length });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

router.delete("/responses", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM responses WHERE user_id = $1", [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
