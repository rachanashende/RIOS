// Build.RIV -- Leader dashboard (workflow v2, Oct 2026). One client's
// innovation portfolio for the Client Leader (also Product Owners of that
// client, the RIV Client Partner for assigned clients, and RIV Admin),
// plus the RIV Admin's all-retailers portfolio. Every number comes from
// the same project query as the project list (lib/buildQueries.js), so
// the dashboard and the list always agree. Periods are calendar years.
import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { fmtUSD, STAGE_LABELS, DEAL_STAGES } from "../lib/buildWorkflow.js";
import { canSeeClientDashboard, canSeePortfolioDashboard } from "../lib/buildPermissions.js";
import { QUESTIONS, computeScores } from "../lib/scoring.js";
import { assignedClientIds, pocClientId, queryProjects } from "../lib/buildQueries.js";

const router = Router();
router.use(requireAuth);

const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

// GET /api/build/dashboard/clients -- the clients this person can open a
// dashboard for (drives the client picker).
router.get("/clients", async (req, res, next) => {
  try {
    const u = req.user;
    let rows;
    if (u.role === "admin") {
      ({ rows } = await pool.query(
        `SELECT DISTINCT c.id, c.name, c.company FROM users c JOIN build_projects p ON p.client_id = c.id
         WHERE c.role = 'client' ORDER BY c.company NULLS LAST, c.name`
      ));
    } else if (u.role === "riv_manager") {
      const ids = await assignedClientIds(u);
      ({ rows } = await pool.query("SELECT id, name, company FROM users WHERE id = ANY($1::int[]) ORDER BY company NULLS LAST, name", [ids]));
    } else if (u.role === "client") {
      ({ rows } = await pool.query("SELECT id, name, company FROM users WHERE id = $1", [u.id]));
    } else if (u.role === "client_poc") {
      const cid = await pocClientId(u);
      ({ rows } = await pool.query("SELECT id, name, company FROM users WHERE id = $1", [cid]));
    } else {
      rows = [];
    }
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

function inPeriod(p, period, year) {
  if (period === "all") return true;
  if (["active", "on_hold"].includes(p.status)) return true;
  const end = p.closed_at || p.updated_at;
  const start = new Date(Date.UTC(year, 0, 1));
  const stop = new Date(Date.UTC(year + 1, 0, 1));
  return new Date(p.started_at) < stop && new Date(end) >= start;
}

function kpiText(p) {
  if (p.baseline == null || p.target == null) return null;
  const unit = p.kpi_unit ? ` ${p.kpi_unit}` : "";
  const now = p.kpi_latest != null ? ` → ${p.kpi_latest}` : "";
  return `${p.baseline}${now} (target ${p.target}${unit})`;
}

function kpiBeatTarget(p) {
  if (p.kpi_latest == null || p.baseline == null || p.target == null || p.baseline === p.target) return false;
  return p.target < p.baseline ? p.kpi_latest <= p.target : p.kpi_latest >= p.target;
}

// GET /api/build/dashboard/client/:clientId?type=internal|startup&period=year|all&year=2026
router.get("/client/:clientId", async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId);
    const assigned = await assignedClientIds(req.user);
    const pocClient = await pocClientId(req.user);
    if (!canSeeClientDashboard(req.user, clientId, assigned, pocClient)) {
      return res.status(403).json({ error: "You don't have access to this client's dashboard." });
    }
    const { rows: clientRows } = await pool.query("SELECT id, name, company FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "Client not found." });

    const period = req.query.period === "all" ? "all" : "year";
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const typeFilter = ["internal", "startup"].includes(req.query.type) ? req.query.type : null;

    const all = await queryProjects(req.user, { clientId, type: typeFilter || undefined }, { scope: "client" });
    const projects = all.filter((p) => inPeriod(p, period, year));
    const live = projects.filter((p) => ["active", "on_hold"].includes(p.status));

    // Items selected but not yet projects ("being set up by RIV").
    const { rows: readyRows } = await pool.query(
      `SELECT 'idea' AS t, i.id, i.question_id FROM ideas i
       WHERE i.source_client_id = $1 AND i.selected_for_build_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type='idea' AND s.source_id=i.id)
         AND NOT EXISTS (SELECT 1 FROM build_ready_decisions d WHERE d.source_type='idea' AND d.source_id=i.id AND d.action='decline')
       UNION ALL
       SELECT 'app' AS t, a.id, NULL AS question_id FROM rise_applications a JOIN rise_opportunities o ON o.id = a.opportunity_id
       WHERE o.client_id = $1 AND a.decision = 'selected_for_pilot'
         AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type='rise_application' AND s.source_id=a.id)
         AND NOT EXISTS (SELECT 1 FROM build_ready_decisions d WHERE d.source_type='rise_application' AND d.source_id=a.id AND d.action='decline')`,
      [clientId]
    );

    // Money: cost = actual if known else estimate; value = realised if known else estimate.
    const costOf = (p) => (p.actual_cost != null ? p.actual_cost : p.est_cost);
    const valueOf = (p) => (p.realised_benefit != null ? p.realised_benefit : p.est_benefit);
    const invested = sum(projects, (p) => p.actual_cost);
    const estValue = sum(projects, (p) => valueOf(p));
    const realised = sum(projects, (p) => p.realised_benefit);
    const anyEstimated = projects.some((p) => p.realised_benefit == null && p.est_benefit != null);
    const totalCost = sum(projects, costOf);
    const roiPct = totalCost > 0 && estValue > 0 ? ((estValue - totalCost) / totalCost) * 100 : null;
    const paybackMonths = totalCost > 0 && estValue > 0 ? totalCost / (estValue / 12) : null;

    const health = { on_track: 0, at_risk: 0, off_track: 0, none: 0 };
    for (const p of live) health[p.status === "active" ? (p.effectiveHealth || "none") : "none"] += 1;

    // Pipeline: startup deal stages as one group, then the delivery stages.
    const groups = [["deal", "Deal stages"], ["requirements", "Requirements"], ["design", "Design"], ["build", "Build"], ["test", "Test"], ["pilot", "Pilot"], ["production", "Production"], ["closed", "Closed"]];
    const pipeline = groups.map(([key, label]) => {
      const inGroup = projects.filter((p) => (key === "closed" ? p.status === "closed" || p.stage === "closed" : p.status !== "closed" && p.stageGroup === key));
      return { key, label, internal: inGroup.filter((p) => p.type === "internal").length, startup: inGroup.filter((p) => p.type === "startup").length };
    });

    const attention = [];
    for (const p of live) {
      if (p.status === "active" && ["off_track", "at_risk"].includes(p.effectiveHealth)) {
        attention.push({
          projectId: p.id, code: p.code, title: p.title, level: p.effectiveHealth,
          why: `${p.effectiveHealth === "off_track" ? "Off track" : "At risk"}: ${p.healthReasons[0]?.text || "see project"}`,
          meta: `${p.stageLabel} · Product Owner ${p.poc_name || "not assigned"}`,
        });
      } else if (p.stage === "pilot" && p.pilot_end && new Date(p.pilot_end) - Date.now() < 14 * 86400000) {
        attention.push({
          projectId: p.id, code: p.code, title: p.title, level: "info",
          why: `Pilot ends ${new Date(p.pilot_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: result and decision due`,
          meta: `Product Owner ${p.poc_name || "not assigned"}`,
        });
      }
    }
    attention.sort((a, b) => ({ off_track: 0, at_risk: 1, info: 2 }[a.level] - { off_track: 0, at_risk: 1, info: 2 }[b.level]));

    const value = projects
      .filter((p) => costOf(p) != null || valueOf(p) != null)
      .map((p) => ({ projectId: p.id, code: p.code, title: p.title, cost: costOf(p), benefit: valueOf(p), estimated: p.realised_benefit == null }))
      .sort((a, b) => (b.benefit || 0) - (a.benefit || 0))
      .slice(0, 8);

    // From audit to impact: the client's Discover top 5 and what is being done.
    const { rows: respRows } = await pool.query("SELECT question_id, maturity, not_applicable, evidence FROM responses WHERE user_id = $1", [clientId]);
    let audit = null;
    if (respRows.length) {
      const responses = {};
      respRows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, na: !!r.not_applicable, evidence: r.evidence }; });
      const { opportunities } = computeScores(responses);
      const { rows: srcRows } = await pool.query(
        `SELECT s.question_id, p.code, p.status, p.stage, p.outcome FROM build_project_sources s JOIN build_projects p ON p.id = s.project_id
         WHERE p.client_id = $1 AND s.question_id IS NOT NULL`,
        [clientId]
      );
      const items = opportunities.map((o, i) => {
        const linked = srcRows.filter((s) => Number(s.question_id) === Number(o.id));
        const live = linked.some((s) => s.stage === "production" || (s.status === "closed" && s.outcome === "scaled"));
        const inBuild = linked.some((s) => ["active", "on_hold"].includes(s.status));
        const settingUp = readyRows.some((r) => Number(r.question_id) === Number(o.id));
        const status = live ? "Live" : inBuild ? "In Build" : settingUp ? "Being set up" : "Not started";
        return {
          rank: i + 1, questionId: o.id, name: o.submodule, module: o.module,
          valueFmt: `~${fmtUSD(o.midpoint)}`, status, links: linked.map((s) => s.code),
        };
      });
      audit = {
        items,
        identifiedFmt: fmtUSD(sum(opportunities, (o) => o.midpoint)),
        withAction: items.filter((x) => x.status !== "Not started").length,
        inBuild: items.filter((x) => x.status === "In Build").length,
        live: items.filter((x) => x.status === "Live").length,
      };
    }

    const { rows: lessonRows } = await pool.query(
      `SELECT p.id, p.code, p.title, p.type, p.outcome, p.closed_at, l.recommendation, l.worked, l.not_worked, l.do_differently
       FROM build_projects p JOIN build_lessons l ON l.project_id = p.id
       WHERE p.client_id = $1 AND (l.worked IS NOT NULL OR l.do_differently IS NOT NULL)
       ORDER BY COALESCE(p.closed_at, l.updated_at) DESC LIMIT 4`,
      [clientId]
    );
    const { rows: wentLive } = await pool.query(
      `SELECT h.project_id, h.at, p.code, p.title FROM build_stage_history h JOIN build_projects p ON p.id = h.project_id
       WHERE p.client_id = $1 AND h.to_stage = 'production' AND h.action = 'advance' AND h.at > now() - interval '90 days'
       ORDER BY h.at DESC LIMIT 3`,
      [clientId]
    );
    const wins = [
      ...wentLive.map((w) => ({ projectId: w.project_id, code: w.code, text: `${w.title} moved into Production`, when: w.at })),
      ...projects.filter(kpiBeatTarget).map((p) => ({ projectId: p.id, code: p.code, text: `${p.title} beat its KPI target: ${p.kpi_name || "KPI"} ${p.baseline} → ${p.kpi_latest} (target ${p.target})`, when: null })),
    ].slice(0, 4);

    res.json({
      client: clientRows[0],
      period: { period, year, label: period === "all" ? "All time" : `${year} (Jan–Dec)` },
      summary: {
        live: live.length,
        internal: live.filter((p) => p.type === "internal").length,
        startup: live.filter((p) => p.type === "startup").length,
        readyCount: readyRows.length,
        health,
        overdueCount: live.filter((p) => p.updateOverdue).length,
        invested, investedFmt: fmtUSD(invested) || "US$0",
        estValue, estValueFmt: fmtUSD(estValue) || "US$0",
        realised, realisedFmt: fmtUSD(realised) || "US$0",
        valueEstimated: anyEstimated,
        roiPct, paybackMonths, roiEstimated: anyEstimated || realised === 0,
      },
      pipeline,
      attention: attention.slice(0, 6),
      value,
      audit,
      projects: projects.map((p) => ({
        id: p.id, code: p.code, title: p.title, type: p.type, status: p.status,
        stageLabel: p.status === "closed" ? "Closed" : p.stageLabel, stagePct: p.status === "closed" ? 100 : p.stagePct,
        effectiveHealth: p.status === "active" ? p.effectiveHealth : null,
        kpiText: kpiText(p), kpiBeat: kpiBeatTarget(p),
        roiPct: p.roi?.roiPct ?? null, roiEstimated: p.roi?.estimated ?? true,
        poName: p.poc_name || null,
      })),
      wins,
      lessons: lessonRows.map((l) => ({
        projectId: l.id, code: l.code, title: l.title, type: l.type, outcome: l.outcome, closedAt: l.closed_at,
        recommendation: l.recommendation, text: l.do_differently || l.worked,
      })),
      stageLabels: STAGE_LABELS,
      dealStages: DEAL_STAGES,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/dashboard/portfolio -- RIV Admin only: one row per client.
router.get("/portfolio", async (req, res, next) => {
  try {
    if (!canSeePortfolioDashboard(req.user)) return res.status(403).json({ error: "The all-retailers view is for RIV Admin." });
    const all = await queryProjects(req.user, {});
    const byClient = new Map();
    for (const p of all) {
      if (!byClient.has(p.client_id)) byClient.set(p.client_id, { clientId: p.client_id, name: p.client_name, company: p.client_company, projects: [] });
      byClient.get(p.client_id).projects.push(p);
    }
    const rows = [];
    for (const c of byClient.values()) {
      const live = c.projects.filter((p) => ["active", "on_hold"].includes(p.status));
      const invested = sum(c.projects, (p) => p.actual_cost);
      const value = sum(c.projects, (p) => (p.realised_benefit != null ? p.realised_benefit : p.est_benefit));
      const cost = sum(c.projects, (p) => (p.actual_cost != null ? p.actual_cost : p.est_cost));
      const { rows: respRows } = await pool.query("SELECT question_id, maturity, not_applicable FROM responses WHERE user_id = $1", [c.clientId]);
      let latestAuditScore = null;
      if (respRows.length) {
        const responses = {};
        respRows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, na: !!r.not_applicable }; });
        latestAuditScore = Number(computeScores(responses).overallScore.toFixed(1));
      }
      rows.push({
        clientId: c.clientId, name: c.name, company: c.company,
        live: live.length,
        red: live.filter((p) => p.status === "active" && p.effectiveHealth === "off_track").length,
        amber: live.filter((p) => p.status === "active" && p.effectiveHealth === "at_risk").length,
        invested, investedFmt: fmtUSD(invested) || "US$0",
        value, valueFmt: fmtUSD(value) || "US$0",
        roiPct: cost > 0 && value > 0 ? ((value - cost) / cost) * 100 : null,
        latestAuditScore,
      });
    }
    rows.sort((a, b) => (b.red - a.red) || (b.amber - a.amber) || String(a.company || a.name).localeCompare(String(b.company || b.name)));
    res.json({
      clients: rows,
      totals: {
        clients: rows.length,
        live: sum(rows, (r) => r.live), red: sum(rows, (r) => r.red), amber: sum(rows, (r) => r.amber),
        investedFmt: fmtUSD(sum(rows, (r) => r.invested)) || "US$0", valueFmt: fmtUSD(sum(rows, (r) => r.value)) || "US$0",
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
