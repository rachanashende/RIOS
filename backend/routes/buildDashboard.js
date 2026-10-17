// Build.RIV -- Leader dashboard (PRD section 9): a Client Leader view and
// an RIV portfolio view on the same screen, answering "what's in flight,
// what's in trouble, what has it returned" in under a minute.
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeRoi, fmtUSD } from "../lib/buildWorkflow.js";
import { canSeeClientDashboard, canSeePortfolioDashboard } from "../lib/buildPermissions.js";
import { QUESTIONS, computeScores } from "../lib/scoring.js";

const router = Router();
router.use(requireAuth);

async function assignedClientIds(user) {
  if (user.role !== "riv_manager") return [];
  const { rows } = await pool.query("SELECT client_id FROM build_manager_clients WHERE manager_user_id = $1", [user.id]);
  return rows.map((r) => r.client_id);
}

function num(v) { return v != null ? Number(v) : null; }

// GET /api/build/dashboard/client/:clientId?type=&period=
// period is months back (default 12, matching PRD's default); type filters
// internal/startup/both.
router.get("/client/:clientId", async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId);
    const assigned = await assignedClientIds(req.user);
    if (!canSeeClientDashboard(req.user, clientId, assigned)) return res.status(403).json({ error: "You don't have access to this client's dashboard." });

    const months = Number(req.query.period) || 12;
    const typeFilter = ["internal", "startup"].includes(req.query.type) ? req.query.type : null;

    const params = [clientId, months];
    let where = "p.client_id = $1 AND p.started_at >= now() - ($2 || ' months')::interval";
    if (typeFilter) { params.push(typeFilter); where += ` AND p.type = $${params.length}`; }

    const { rows: projects } = await pool.query(
      `SELECT p.*, m.actual_cost, m.est_cost, m.realised_benefit, m.est_benefit,
              GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date) AS last_update_date,
              o.name AS owner_name
       FROM build_projects p
       LEFT JOIN build_metrics m ON m.project_id = p.id
       LEFT JOIN users o ON o.id = p.owner_user_id
       WHERE ${where}
       ORDER BY (p.health = 'off_track') DESC, (p.health = 'at_risk') DESC, p.created_at DESC`,
      params
    );

    const enriched = projects.map((p) => {
      const metrics = { actual_cost: num(p.actual_cost), est_cost: num(p.est_cost), realised_benefit: num(p.realised_benefit), est_benefit: num(p.est_benefit) };
      const roi = computeRoi(metrics);
      const overdue = p.status === "active" && (new Date() - new Date(p.last_update_date)) / 86400000 > 14;
      return { ...p, ...metrics, roi, overdue };
    });

    const active = enriched.filter((p) => ["active", "on_hold"].includes(p.status));
    const redAmber = active.filter((p) => p.health === "off_track" || p.health === "at_risk");
    const overdue = active.filter((p) => p.overdue);
    const investedToDate = active.reduce((s, p) => s + (p.actual_cost || 0), 0);
    const realisedBenefit = active.reduce((s, p) => s + (p.realised_benefit || 0), 0);
    const anyEstimated = active.some((p) => p.realised_benefit == null && (p.est_benefit != null || p.actual_cost != null));
    const portfolioRoi = investedToDate > 0 ? ((realisedBenefit - investedToDate) / investedToDate) * 100 : null;

    const stageCounts = {};
    for (const p of active) stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;

    const needsAttention = [
      ...redAmber.map((p) => ({ projectId: p.id, code: p.code, title: p.title, reason: p.health === "off_track" ? "Off track" : "At risk" })),
      ...overdue.filter((p) => !redAmber.includes(p)).map((p) => ({ projectId: p.id, code: p.code, title: p.title, reason: "Update overdue" })),
    ];

    // Per-workflow breakdown -- "Enterprise Innovation Management" (type
    // 'internal') vs "Open Innovation Management" (type 'startup'), the
    // same split the Projects tab's sub-tabs use. Leadership-level ask: how
    // many opportunities per workflow, and their invested/benefit/ROI.
    const byType = { internal: { count: 0, invested: 0, benefit: 0 }, startup: { count: 0, invested: 0, benefit: 0 } };
    for (const p of active) {
      byType[p.type].count += 1;
      byType[p.type].invested += p.actual_cost || 0;
      byType[p.type].benefit += p.realised_benefit || 0;
    }
    for (const t of Object.keys(byType)) {
      const b = byType[t];
      b.roi = b.invested > 0 ? ((b.benefit - b.invested) / b.invested) * 100 : null;
    }

    // Lessons learned from completed implementations (PRD 8.4 data, surfaced
    // at leadership level per this change's request). Most-recently-closed
    // first; capped rather than paginated -- this dashboard is a one-minute
    // read, not a lessons-learned archive browser.
    const { rows: lessonRows } = await pool.query(
      `SELECT p.id, p.code, p.title, p.type, p.outcome, p.closed_at,
              l.recommendation, l.worked, l.not_worked, l.do_differently
       FROM build_projects p
       JOIN build_lessons l ON l.project_id = p.id
       WHERE p.client_id = $1 AND p.status = 'closed'${typeFilter ? " AND p.type = $2" : ""}
       ORDER BY p.closed_at DESC
       LIMIT 8`,
      typeFilter ? [clientId, typeFilter] : [clientId]
    );

    res.json({
      summary: {
        activeCount: active.length,
        redAmberCount: redAmber.length,
        overdueCount: overdue.length,
        investedToDate, investedToDateFmt: fmtUSD(investedToDate),
        realisedBenefit, realisedBenefitFmt: fmtUSD(realisedBenefit),
        portfolioRoi, estimated: anyEstimated,
      },
      pipelineByStage: stageCounts,
      needsAttention,
      investmentVsBenefit: active.map((p) => ({ code: p.code, title: p.title, actualCost: p.actual_cost, realisedBenefit: p.realised_benefit, estimated: p.realised_benefit == null })),
      projects: enriched.map((p) => ({
        id: p.id, code: p.code, title: p.title, type: p.type, stage: p.stage, status: p.status, health: p.health,
        lastUpdateDate: p.last_update_date, ownerName: p.owner_name, roi: p.roi, overdue: p.overdue,
      })),
      byType,
      recentLessons: lessonRows.map((l) => ({
        projectId: l.id, code: l.code, title: l.title, type: l.type, outcome: l.outcome, closedAt: l.closed_at,
        recommendation: l.recommendation, worked: l.worked, notWorked: l.not_worked, doDifferently: l.do_differently,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/dashboard/portfolio -- RIV Admin only: one row per client.
router.get("/portfolio", async (req, res, next) => {
  try {
    if (!canSeePortfolioDashboard(req.user)) return res.status(403).json({ error: "RIV portfolio view is admin-only." });

    const { rows: clients } = await pool.query("SELECT id, name, company FROM users WHERE role = 'client' ORDER BY company NULLS LAST, name");
    const rows = [];
    for (const c of clients) {
      const { rows: projects } = await pool.query(
        `SELECT p.status, p.health, m.actual_cost, m.est_cost, m.realised_benefit, m.est_benefit
         FROM build_projects p LEFT JOIN build_metrics m ON m.project_id = p.id
         WHERE p.client_id = $1`,
        [c.id]
      );
      if (!projects.length) continue; // only list clients with at least one Build project
      const active = projects.filter((p) => ["active", "on_hold"].includes(p.status));
      const redAmber = active.filter((p) => p.health === "off_track" || p.health === "at_risk");
      const invested = active.reduce((s, p) => s + num(p.actual_cost || 0), 0);
      const benefit = active.reduce((s, p) => s + num(p.realised_benefit || 0), 0);
      const roi = invested > 0 ? ((benefit - invested) / invested) * 100 : null;

      const { rows: respRows } = await pool.query("SELECT question_id, maturity, not_applicable FROM responses WHERE user_id = $1", [c.id]);
      let latestAuditScore = null;
      if (respRows.length) {
        const responses = {};
        respRows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, na: !!r.not_applicable }; });
        latestAuditScore = computeScores(responses).overallScore;
      }

      rows.push({
        clientId: c.id, name: c.name, company: c.company,
        active: active.length, redAmber: redAmber.length,
        invested, investedFmt: fmtUSD(invested), benefit, benefitFmt: fmtUSD(benefit),
        roi, latestAuditScore: latestAuditScore != null ? Number(latestAuditScore.toFixed(1)) : null,
      });
    }
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
