// Build.RIV -- Leader dashboard (PRD section 9): a Client Leader view and
// an RIV portfolio view on the same screen, answering "what's in flight,
// what's in trouble, what has it returned" in under a minute.
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeRoi, fmtUSD, computeAutoHealth, STAGE_LABELS } from "../lib/buildWorkflow.js";
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
      `SELECT p.*, m.actual_cost, m.est_cost, m.realised_benefit, m.est_benefit, m.baseline, m.target,
              (SELECT k.value FROM build_kpi_readings k WHERE k.project_id = p.id ORDER BY k.reading_date DESC, k.id DESC LIMIT 1) AS kpi_now,
              (SELECT u3.needs_help FROM build_updates u3 WHERE u3.project_id = p.id ORDER BY u3.update_date DESC, u3.created_at DESC LIMIT 1) AS latest_needs_help,
              GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date) AS last_update_date,
              po.name AS product_owner_name
       FROM build_projects p
       LEFT JOIN build_metrics m ON m.project_id = p.id
       LEFT JOIN users po ON po.id = p.product_owner_user_id
       WHERE ${where}
       ORDER BY (p.health = 'off_track') DESC, (p.health = 'at_risk') DESC, p.created_at DESC`,
      params
    );

    const healthRank = { on_track: 0, at_risk: 1, off_track: 2 };
    const enriched = projects.map((p) => {
      const metrics = { actual_cost: num(p.actual_cost), est_cost: num(p.est_cost), realised_benefit: num(p.realised_benefit), est_benefit: num(p.est_benefit) };
      const roi = computeRoi(metrics);
      const overdue = p.status === "active" && (new Date() - new Date(p.last_update_date)) / 86400000 > 14;
      const auto = computeAutoHealth({
        project: p, metrics: { actual_cost: p.actual_cost, est_cost: p.est_cost, baseline: p.baseline, target: p.target },
        daysSinceUpdate: Math.round((new Date() - new Date(p.last_update_date)) / 86400000),
        daysInStage: p.updated_at ? Math.round((new Date() - new Date(p.updated_at)) / 86400000) : null,
        latestKpiValue: p.kpi_now, needsHelp: p.latest_needs_help,
      });
      const effectiveHealth = healthRank[auto.health] > healthRank[p.health] ? auto.health : p.health;
      return { ...p, ...metrics, roi, overdue, effectiveHealth, healthReason: effectiveHealth === p.health ? null : auto.reason };
    });

    const active = enriched.filter((p) => ["active", "on_hold"].includes(p.status));
    const redAmber = active.filter((p) => p.effectiveHealth === "off_track" || p.effectiveHealth === "at_risk");
    const overdue = active.filter((p) => p.overdue);
    const investedToDate = active.reduce((s, p) => s + (p.actual_cost || 0), 0);
    const realisedBenefit = active.reduce((s, p) => s + (p.realised_benefit || 0), 0);
    const anyEstimated = active.some((p) => p.realised_benefit == null && (p.est_benefit != null || p.actual_cost != null));
    const portfolioRoi = investedToDate > 0 ? ((realisedBenefit - investedToDate) / investedToDate) * 100 : null;

    const stageCounts = {};
    for (const p of active) stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;

    // Stage-by-workflow breakdown (Oct 2026 mockup page_6's stacked bar --
    // Internal vs Startup side by side per stage), same `active` set as
    // the flat stageCounts above, just split by p.type too.
    const stageCountsByType = { internal: {}, startup: {} };
    for (const p of active) stageCountsByType[p.type][p.stage] = (stageCountsByType[p.type][p.stage] || 0) + 1;

    const needsAttention = [
      ...redAmber.map((p) => ({
        projectId: p.id, code: p.code, title: p.title,
        reason: (p.healthReason || (p.effectiveHealth === "off_track" ? "Off track" : "At risk")),
      })),
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

    // "From audit to impact" (Oct 2026 mockup page_6): this client's top-5
    // $-value audit opportunities (same computeScores() ranking the
    // scorecard itself uses), cross-referenced against two real links:
    // build_reassess_links (written only once a project closes Scaled --
    // authoritative "Addressed") and build_project_sources (written when a
    // project is first created from an idea/application, carries the same
    // question_id, and exists for the whole life of the project -- this is
    // the genuine link to an *open* project a prior pass of this feature
    // said didn't exist in the schema; it does, it just wasn't queried
    // here). So "In Build" is a real status now, not an invented one: it
    // means a live, non-closed project traces back to this question.
    const { rows: clientResponseRows } = await pool.query("SELECT question_id, maturity, not_applicable FROM responses WHERE user_id = $1", [clientId]);
    let auditToImpact = [];
    if (clientResponseRows.length) {
      const responses = {};
      clientResponseRows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, na: !!r.not_applicable }; });
      const { opportunities } = computeScores(responses);
      const { rows: linkRows } = await pool.query(
        `SELECT l.question_id, p.code, p.closed_at FROM build_reassess_links l JOIN build_projects p ON p.id = l.project_id WHERE l.client_id = $1`,
        [clientId]
      );
      const linkByQ = Object.fromEntries(linkRows.map((r) => [r.question_id, r]));
      const { rows: sourceRows } = await pool.query(
        `SELECT s.question_id, p.code, p.status, p.stage, p.outcome FROM build_project_sources s
         JOIN build_projects p ON p.id = s.project_id
         WHERE p.client_id = $1 AND s.question_id IS NOT NULL
         ORDER BY (p.status != 'closed') DESC, p.created_at DESC`,
        [clientId]
      );
      // Several projects could in principle trace back to the same
      // question (re-attempted after a Stopped outcome, say) -- keep the
      // first row per question, which the ORDER BY above biases toward an
      // open project over a closed one, so "In Build" wins over a stale
      // "Stopped" attempt when both exist.
      const sourceByQ = {};
      for (const r of sourceRows) if (!sourceByQ[r.question_id]) sourceByQ[r.question_id] = r;
      auditToImpact = opportunities.map((o) => {
        const link = linkByQ[o.id];
        const src = sourceByQ[o.id];
        if (link) {
          return { questionId: o.id, text: o.text, midpoint: o.midpoint, status: "addressed", note: `Addressed by ${link.code} (${new Date(link.closed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })})` };
        }
        if (src && src.status !== "closed") {
          return { questionId: o.id, text: o.text, midpoint: o.midpoint, status: "in_build", note: `In Build via ${src.code} (${STAGE_LABELS[src.stage] || src.stage})` };
        }
        if (src && src.status === "closed" && src.outcome !== "scaled") {
          return { questionId: o.id, text: o.text, midpoint: o.midpoint, status: "not_addressed", note: `Tried via ${src.code}, stopped -- not yet addressed` };
        }
        return { questionId: o.id, text: o.text, midpoint: o.midpoint, status: "not_addressed", note: "Not yet addressed" };
      });
    }

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
      stageCountsByType,
      auditToImpact,
      needsAttention,
      investmentVsBenefit: active.map((p) => ({ code: p.code, title: p.title, actualCost: p.actual_cost, realisedBenefit: p.realised_benefit, estimated: p.realised_benefit == null })),
      projects: enriched.map((p) => ({
        id: p.id, code: p.code, title: p.title, type: p.type, stage: p.stage, status: p.status, health: p.effectiveHealth,
        lastUpdateDate: p.last_update_date, productOwnerName: p.product_owner_name, roi: p.roi, overdue: p.overdue,
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
