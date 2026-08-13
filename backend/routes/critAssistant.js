import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS } from "../lib/scoring.js";

const router = Router();

// Pick a current model at https://docs.claude.com/en/docs/about-claude/models
// if this ever needs to change — Sonnet is a reasonable default balance of
// quality and per-rating cost for a short 2–4 turn interview.
const CLAUDE_MODEL = "claude-sonnet-5";

function buildSystemPrompt(question, idea) {
  return `You are the AI jury assistant inside "Ideas.RIV", a retail-innovation ideas platform. You help a jury member (a company leader) evaluate an employee-submitted idea, using the CRIT prompting method: Context, Role, Interview me, Task.

CONTEXT
Innovation opportunity (from the Discover Audit, "${question.module} · ${question.submodule}"): diagnostic question: "${question.q}"
Idea submitted: "${idea.title}"
Idea description: "${idea.description || "(no additional description provided)"}"

ROLE
Act as a sharp, fair, retail-innovation jury advisor. You are candid, concise, and never sycophantic. You are talking directly to the jury member, not the idea's author.

INTERVIEW ME
Before you score anything, interview the jury member. Ask short, targeted questions ONE AT A TIME to draw out their honest judgement on the idea's impact, feasibility, innovation and cost-effectiveness relative to the opportunity above. Ask at most 3 questions total, one per turn, waiting for their answer each time. Keep each question to one sentence. Do not summarize or restate the idea back to them at length — get straight to the question.

TASK
Once you've asked your questions (up to 3) and have enough signal, stop the interview and respond with ONLY a raw JSON object, nothing else — no markdown fences, no commentary before or after it — in exactly this shape:
{"impact": <0-10 number>, "feasibility": <0-10 number>, "innovation": <0-10 number>, "cost": <0-10 number>, "rationale": "<2-3 sentence rationale citing what the jury member said>"}
Base the four scores on what the jury member told you during the interview, not on your own independent judgment of the idea.`;
}

/**
 * POST /api/ideas/crit-turn
 * Body: { ideaId, messages: [{ role: "assistant"|"user", text }] }
 * One turn of the CRIT "Interview me" step. The idea/opportunity context is
 * always re-fetched from the database by ideaId — never trusted from the
 * request body — so a jury member can't rate an idea using spoofed context.
 * Returns either another interview question or, once the assistant is
 * ready, a final structured score.
 */
router.post("/crit-turn", requireAuth, requireRole("jury", "admin"), async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    }

    const { ideaId, messages } = req.body || {};
    if (!ideaId) return res.status(400).json({ error: "ideaId is required." });

    const { rows } = await pool.query("SELECT id, question_id, title, description FROM ideas WHERE id = $1", [Number(ideaId)]);
    const idea = rows[0];
    if (!idea) return res.status(404).json({ error: "Idea not found." });

    const question = QUESTIONS.find((q) => q.id === idea.question_id);
    if (!question) return res.status(404).json({ error: "Underlying opportunity question not found." });

    const history = Array.isArray(messages) ? messages : [];
    const apiMessages = history.length
      ? history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.text || "") }))
      : [{ role: "user", content: "Begin the interview with your first question." }];

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1000,
        system: buildSystemPrompt(question, idea),
        messages: apiMessages,
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => "");
      console.error("Anthropic API error:", anthropicRes.status, detail);
      return res.status(502).json({ error: "The AI jury assistant is unavailable right now — please try again." });
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const text = (textBlock ? textBlock.text : "").trim();
    const cleaned = text.replace(/^```json\s*|```$/g, "").trim();

    let parsed = null;
    try { parsed = JSON.parse(cleaned); } catch { parsed = null; }

    if (parsed && typeof parsed.impact === "number") {
      return res.json({
        type: "final",
        scores: {
          impact: parsed.impact,
          feasibility: parsed.feasibility,
          innovation: parsed.innovation,
          cost: parsed.cost,
          rationale: parsed.rationale || "",
        },
      });
    }

    res.json({ type: "question", text: text || "Could you tell me a bit more?" });
  } catch (err) {
    next(err);
  }
});

export default router;
