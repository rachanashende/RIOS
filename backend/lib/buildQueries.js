// Build.RIV -- shared project query used by the project list, My work and
// the Leader dashboard, so all three show the same numbers: role scoping,
// the latest status update, latest KPI reading, automatic health (with
// reasons), stage progress and the "next step" line.
import pool from "../db.js";
import { STAGE_LABELS, DEAL_STAGES, missingFieldsForStage, evaluateHealth, computeRoi, stageProgress } from "./buildWorkflow.js";
import { isPocOf, isOwnerOf } from "./buildPermissions.js";
import { notifyBuild, recipientsForProject } from "./buildNotify.js";

export async function assignedClientIds(user) {
  if (user?.role !== "riv_manager") return [];
  const { rows } = await pool.query("SELECT client_id FROM build_manager_clients WHERE manager_user_id = $1", [user.id]);
  return rows.map((r) => r.client_id);
}

export async function pocClientId(user) {
  if (user?.role !== "client_poc") return null;
  const { rows } = await pool.query("SELECT client_id FROM users WHERE id = $1", [user.id]);
  return rows[0]?.client_id ?? null;
}

const num = (v) => (v != null ? Number(v) : null);

// Fields hidden from a Startup POC (PO / contract amounts, the retailer's
// budget and benefit figures).
const AMOUNT_FIELDS = ["po_value", "contract_value", "pilot_fee", "est_cost", "actual_cost", "est_benefit", "realised_benefit"];
export function stripAmounts(row) {
  const out = { ...row };
  for (const f of AMOUNT_FIELDS) if (f in out) out[f] = null;
  if (out.metrics) {
    out.metrics = { ...out.metrics, est_cost: null, actual_cost: null, est_benefit: null, realised_benefit: null };
  }
  out.roi = { roiPct: null, paybackMonths: null, estimated: true };
  return out;
}

function nextStepFor(row, missing) {
  if (row.status === "closed") return `Closed${row.outcome ? ` (${row.outcome === "scaled" ? "Scaled" : "Stopped"})` : ""}`;
  if (row.status === "stopped") return "Stopped. RIV Admin to close with lessons learned";
  if (row.status === "on_hold") return `On hold${row.hold_reason ? `: ${row.hold_reason}` : ""}`;
  if (row.stage === "closed") return "Ready to close. RIV Admin";
  if (!row.poc_user_id) return "Product Owner not assigned yet. RIV Admin";
  if (missing.length) {
    return `Add ${missing[0]}${missing.length > 1 ? ` (+${missing.length - 1} more)` : ""} · Product Owner`;
  }
  if (row.stage === "pilot") return "Record the pilot decision · Product Owner";
  return `Ready to complete ${STAGE_LABELS[row.stage] || row.stage} · Product Owner`;
}

// Turns a raw joined row into the shape every screen uses.
export function enrich(row, user) {
  const metrics = {
    kpi_name: row.kpi_name, kpi_unit: row.kpi_unit,
    baseline: num(row.baseline), target: num(row.target), currency: row.currency || "USD",
    est_cost: num(row.est_cost), actual_cost: num(row.actual_cost),
    est_benefit: num(row.est_benefit), realised_benefit: num(row.realised_benefit),
  };
  const stageLabel = STAGE_LABELS[row.stage] || row.stage;
  const evaluated = evaluateHealth({
    ...row, ...metrics, stageLabel,
    manual_health: row.manual_health || row.health || null,
    kpi_latest: num(row.kpi_latest),
  });
  const missing = row.stage && row.stage !== "closed" ? missingFieldsForStage(row.type, row.stage, row, metrics) : [];
  const progress = stageProgress(row.type, row.stage);
  const daysSinceUpdate = row.last_update_date
    ? Math.floor((Date.now() - new Date(row.last_update_date).getTime()) / 86400000)
    : Math.floor((Date.now() - new Date(row.started_at).getTime()) / 86400000);
  const updateOverdue = row.status === "active" && daysSinceUpdate > 14;
  const waitingOnMe = !!user && row.status === "active" && (
    (isPocOf(user, row) && row.stage !== "closed") ||
    (isOwnerOf(user, row) && updateOverdue)
  );
  return {
    ...row,
    ...metrics,
    metrics,
    kpi_latest: num(row.kpi_latest),
    roi: computeRoi(metrics),
    stageLabel,
    stageGroup: DEAL_STAGES.includes(row.stage) ? "deal" : row.stage,
    stageStep: progress.step, stageCount: progress.of, stagePct: progress.pct,
    days_in_stage: row.days_in_stage != null ? Number(row.days_in_stage) : null,
    daysSinceUpdate,
    updateOverdue,
    manualHealth: row.manual_health || row.health || null,
    effectiveHealth: evaluated.health,
    healthReasons: evaluated.reasons,
    missingForStage: missing,
    nextStep: nextStepFor(row, missing),
    waitingOnMe,
  };
}

const SELECT_PROJECTS = `
  SELECT p.*, m.kpi_name, m.kpi_unit, m.baseline, m.target, m.currency,
         m.est_cost, m.actual_cost, m.est_benefit, m.realised_benefit,
         c.name AS client_name, c.company AS client_company,
         o.name AS owner_name, o.role AS owner_role, o.email AS owner_email,
         poc.name AS poc_name, poc.email AS poc_email,
         rm.name AS riv_manager_name, rm.email AS riv_manager_email,
         lu.update_date AS last_update_date, lu.health AS manual_health, lu.needs_help,
         kr.value AS kpi_latest,
         (CURRENT_DATE - COALESCE(p.stage_entered_at, p.updated_at)::date) AS days_in_stage
  FROM build_projects p
  LEFT JOIN build_metrics m ON m.project_id = p.id
  LEFT JOIN users c ON c.id = p.client_id
  LEFT JOIN users o ON o.id = p.owner_user_id
  LEFT JOIN users poc ON poc.id = p.poc_user_id
  LEFT JOIN users rm ON rm.id = p.riv_manager_id
  LEFT JOIN LATERAL (
    SELECT update_date, health, needs_help FROM build_updates u
    WHERE u.project_id = p.id ORDER BY u.update_date DESC, u.created_at DESC LIMIT 1
  ) lu ON true
  LEFT JOIN LATERAL (
    SELECT value FROM build_kpi_readings k
    WHERE k.project_id = p.id ORDER BY k.reading_date DESC, k.id DESC LIMIT 1
  ) kr ON true
`;

const SEV = { off_track: 0, at_risk: 1, on_track: 3 };

// filters: { clientId, type, stage, status, q, health, ids }
// opts.scope: 'user' (default -- what this user may see) or 'client' (the
// caller has already checked access to filters.clientId).
export async function queryProjects(user, filters = {}, opts = {}) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const scope = opts.scope || "user";

  if (scope === "user") {
    const role = user.role;
    if (role === "admin") {
      // everything
    } else if (role === "riv_manager") {
      const ids = await assignedClientIds(user);
      if (!ids.length) return [];
      where.push(`(p.client_id = ANY(${p(ids)}::int[]) OR p.riv_manager_id = ${p(user.id)})`);
    } else if (role === "client") {
      where.push(`p.client_id = ${p(user.id)}`);
    } else if (role === "client_poc") {
      where.push(`p.client_id = (SELECT client_id FROM users WHERE id = ${p(user.id)})`);
    } else {
      // Employee / Startup POC: only projects they are named on.
      where.push(`p.owner_user_id = ${p(user.id)}`);
    }
  }

  if (filters.clientId) where.push(`p.client_id = ${p(Number(filters.clientId))}`);
  if (filters.type) where.push(`p.type = ${p(filters.type)}`);
  if (filters.stage === "deal") where.push(`p.stage = ANY(${p(DEAL_STAGES)}::text[])`);
  else if (filters.stage) where.push(`p.stage = ${p(filters.stage)}`);
  if (filters.status) where.push(`p.status = ${p(filters.status)}`);
  if (filters.ownerId) where.push(`p.poc_user_id = ${p(Number(filters.ownerId))}`);
  if (Array.isArray(filters.ids)) where.push(`p.id = ANY(${p(filters.ids.map(Number))}::int[])`);
  if (filters.q) {
    const like = p("%" + filters.q + "%");
    where.push(`(p.code ILIKE ${like} OR p.title ILIKE ${like} OR poc.name ILIKE ${like} OR o.name ILIKE ${like})`);
  }

  const { rows } = await pool.query(
    `${SELECT_PROJECTS} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC`,
    params
  );
  let out = rows.map((r) => enrich(r, user));
  if (filters.health === "none") out = out.filter((r) => !r.effectiveHealth);
  else if (filters.health === "red_amber") out = out.filter((r) => ["off_track", "at_risk"].includes(r.effectiveHealth));
  else if (filters.health) out = out.filter((r) => r.effectiveHealth === filters.health);

  out.sort((a, b) => {
    const sa = a.status === "active" ? (SEV[a.effectiveHealth] ?? 2) : 4;
    const sb = b.status === "active" ? (SEV[b.effectiveHealth] ?? 2) : 4;
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  if (opts.syncAlerts !== false) await syncHealthAlerts(out);
  return out;
}

// Same-day red alert, once per turn to red: when a project's effective
// health becomes Off track (by any rule or the Product Owner's pick), tell
// the Client Leader and RIV Admin once, with the reason. Runs whenever
// projects are loaded, so time-based rules (overdue, late) fire on the
// first page view that day; no repeat alerts while it stays red.
export async function syncHealthAlerts(rows) {
  for (const r of rows) {
    const nowRed = r.status === "active" && r.effectiveHealth === "off_track";
    if (nowRed && r.last_alerted_health !== "off_track") {
      await pool.query("UPDATE build_projects SET last_alerted_health = 'off_track' WHERE id = $1", [r.id]);
      r.last_alerted_health = "off_track";
      const reason = r.healthReasons?.find((x) => x.level === "off_track")?.text || "Off track";
      try {
        const recipients = await recipientsForProject(r, ["client", "admins"]);
        await notifyBuild(recipients, {
          projectId: r.id, projectCode: r.code, kind: "health_red",
          message: `${r.code} is red: ${reason}.`,
          subject: `RIOS Build: ${r.code} is off track`,
          heading: "A project just turned red",
          body: `${r.title} (${r.code}) is now Off track. Reason: ${reason}.`,
        });
      } catch (err) {
        console.error("[build] red alert failed:", err);
      }
    } else if (!nowRed && r.last_alerted_health === "off_track") {
      await pool.query("UPDATE build_projects SET last_alerted_health = NULL WHERE id = $1", [r.id]);
      r.last_alerted_health = null;
    }
  }
}

// One project, fully enriched (for the detail page and after actions).
export async function loadEnrichedProject(id, user) {
  const { rows } = await pool.query(`${SELECT_PROJECTS} WHERE p.id = $1`, [Number(id)]);
  if (!rows[0]) return null;
  const row = enrich(rows[0], user);
  await syncHealthAlerts([row]);
  return row;
}
