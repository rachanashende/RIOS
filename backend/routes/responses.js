import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { QUESTIONS, MODULES } from "../lib/scoring.js";

const router = Router();

// The 165-question instrument itself — not client-sensitive, no auth needed to load it
router.get("/questions", (req, res) => {
  res.json({ questions: QUESTIONS, modules: MODULES });
});

// A7: a submitted audit is read-only until an admin reopens it
// A9: a retailer can have several logins that share one audit; answers live on the primary client's id
async function ownerOf(userId) {
  const { rows } = await pool.query("SELECT COALESCE(audit_owner_id, id) AS owner FROM users WHERE id = $1", [userId]);
  return rows[0] ? rows[0].owner : userId;
}
async function submittedAt(userId) {
  const { rows } = await pool.query("SELECT audit_submitted_at FROM users WHERE id = $1", [await ownerOf(userId)]);
  return rows[0] ? rows[0].audit_submitted_at : null;
}
const LOCKED = { error: "Your audit has been submitted and is locked. Ask RIV to reopen it if you need to change an answer.", code: "audit_submitted" };

// Logged-in client/admin's own saved responses
router.get("/responses", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT question_id, maturity, evidence, not_applicable FROM responses WHERE user_id = $1",
      [await ownerOf(req.user.id)]
    );
    const responses = {};
    rows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence, na: !!r.not_applicable }; });
    res.json({ responses, submittedAt: await submittedAt(req.user.id) });
  } catch (err) {
    next(err);
  }
});

// A7: client submits the audit -- locks their answers
router.post("/responses/submit", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM responses WHERE user_id = $1 AND (maturity IS NOT NULL OR not_applicable)",
      [await ownerOf(req.user.id)]
    );
    if (!rows[0].n) return res.status(400).json({ error: "Score at least one question before submitting." });
    const r = await pool.query(
      "UPDATE users SET audit_submitted_at = COALESCE(audit_submitted_at, now()) WHERE id = $1 RETURNING audit_submitted_at",
      [await ownerOf(req.user.id)]
    );
    res.json({ ok: true, submittedAt: r.rows[0].audit_submitted_at });
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
  if (await submittedAt(req.user.id)) return res.status(409).json(LOCKED);

  const owner = await ownerOf(req.user.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [questionId, val] of Object.entries(responses)) {
      await client.query(
        `INSERT INTO responses (user_id, question_id, maturity, evidence, not_applicable, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, question_id) DO UPDATE SET
           maturity = EXCLUDED.maturity,
           evidence = EXCLUDED.evidence,
           not_applicable = EXCLUDED.not_applicable,
           updated_at = EXCLUDED.updated_at`,
        [
          owner,
          Number(questionId),
          val && val.na ? null : (val && val.maturity != null ? val.maturity : null),
          (val && val.evidence) || null,
          !!(val && val.na),
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
    if (await submittedAt(req.user.id)) return res.status(409).json(LOCKED);
    await pool.query("DELETE FROM responses WHERE user_id = $1", [await ownerOf(req.user.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
