// Build.RIV -- shared authenticated routes (project list/detail, status
// updates, stage actions, ROI, lessons, files, notifications). Unlike
// Ideas.RIV/Rise.RIV, Build has no single role that owns this router: an
// admin, riv_manager, client (leader), product_owner, startup_poc, or a
// linked junior_employee can all reach it, each scoped to what they're
// allowed to see (Oct 2026 "Proposed Screens" permission table) -- so
// permission checks happen per-route via lib/buildPermissions.js rather
// than one router.use(requireRole(...)) gate.
import { Router } from "express";
import multer from "multer";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  STAGES, STAGE_LABELS, nextStage, prevStage, isValidStage,
  gateApprovers, missingFieldsForStage, computeRoi, computeAutoHealth,
} from "../lib/buildWorkflow.js";
import {
  canSeeProject, canAddUpdate, canEditDetails, canEditRoi, canHoldOrStop, canClose, canApproveGate, canSendBack, isClientLeaderOf,
  canRequestDelete, stripMoneyForStartupPoc,
} from "../lib/buildPermissions.js";
import { notifyBuild, recipientsForProject } from "../lib/buildNotify.js";
import { QUESTIONS } from "../lib/scoring.js";

const router = Router();
router.use(requireAuth);

// Startup POC never sees PO / contract / cost / benefit amounts (approved
// workflow v2). Done once here, on the way out, so no individual route can
// forget it.
router.use((req, res, next) => {
  if (req.user?.role !== "startup_poc") return next();
  const json = res.json.bind(res);
  res.json = (body) => json(stripMoneyForStartupPoc(body));
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
]);

async function assignedClientIds(user) {
  if (user.role !== "riv_manager") return [];
  const { rows } = await pool.query("SELECT client_id FROM build_manager_clients WHERE manager_user_id = $1", [user.id]);
  return rows.map((r) => r.id ?? r.client_id);
}

// A product_owner login's own client_id -- not in the JWT, so canSeeProject
// needs it looked up to scope viewing to "my client's projects", matching
// GET /projects' own list-scoping query for this role (see buildPermissions.js).
async function pocClientId(user) {
  if (user.role !== "product_owner") return null;
  const { rows } = await pool.query("SELECT client_id FROM users WHERE id = $1", [user.id]);
  return rows[0]?.client_id ?? null;
}

// A junior_employee only sees/acts on the project(s) built from the idea
// THEY submitted (permission table: Employee -> "Own project"). Resolved
// via build_project_sources (source_type='idea') joined to ideas.submitted_by,
// since there's no column on build_projects itself for this -- an idea can
// in principle feed more than one project, so this returns a set of ids.
async function employeeProjectIds(user) {
  if (user.role !== "junior_employee") return [];
  // The Employee the Admin assigned on the project (approved workflow v2),
  // plus -- for older projects created before that field existed -- the
  // person who submitted the source idea.
  const { rows } = await pool.query(
    `SELECT p.id AS project_id FROM build_projects p WHERE p.employee_user_id = $1
     UNION
     SELECT s.project_id FROM build_project_sources s
     JOIN ideas i ON i.id = s.source_id AND s.source_type = 'idea'
     JOIN build_projects p2 ON p2.id = s.project_id AND p2.employee_user_id IS NULL
     WHERE i.submitted_by = $1`,
    [user.id]
  );
  return rows.map((r) => r.project_id);
}

async function loadProject(id) {
  const { rows } = await pool.query(
    `SELECT p.*, m.kpi_name, m.kpi_unit, m.baseline, m.target, m.currency,
            m.est_cost, m.actual_cost, m.est_benefit, m.realised_benefit,
            c.name AS client_name, c.company AS client_company,
            po.name AS product_owner_name, po.email AS product_owner_email,
            sp.name AS startup_poc_name, sp.email AS startup_poc_email,
            rm.name AS riv_manager_name, rm.email AS riv_manager_email,
            em.name AS employee_name, em.email AS employee_email,
            c.email AS client_email
     FROM build_projects p
     LEFT JOIN build_metrics m ON m.project_id = p.id
     LEFT JOIN users c ON c.id = p.client_id
     LEFT JOIN users po ON po.id = p.product_owner_user_id
     LEFT JOIN users sp ON sp.id = p.startup_poc_user_id
     LEFT JOIN users rm ON rm.id = p.riv_manager_id
     LEFT JOIN users em ON em.id = p.employee_user_id
     WHERE p.id = $1`,
    [Number(id)]
  );
  return rows[0] || null;
}

function projectOut(row) {
  if (!row) return row;
  const metrics = {
    kpi_name: row.kpi_name, kpi_unit: row.kpi_unit,
    baseline: row.baseline != null ? Number(row.baseline) : null,
    target: row.target != null ? Number(row.target) : null,
    currency: row.currency || "USD",
    est_cost: row.est_cost != null ? Number(row.est_cost) : null,
    actual_cost: row.actual_cost != null ? Number(row.actual_cost) : null,
    est_benefit: row.est_benefit != null ? Number(row.est_benefit) : null,
    realised_benefit: row.realised_benefit != null ? Number(row.realised_benefit) : null,
  };
  const { kpi_name, kpi_unit, baseline, target, currency, est_cost, actual_cost, est_benefit, realised_benefit, ...project } = row;
  return { ...project, metrics, roi: computeRoi(metrics), stageLabel: STAGE_LABELS[row.stage] || row.stage };
}

/* =========================================================================
   CLIENT JURY -- read-only visibility (PRD role table: "Client Jury: read-
   only access to projects they selected"). A jury member never gets a
   Build login of their own -- this is reached with their existing
   Ideas.RIV/Rise.RIV token, same shared-JWT pattern every other module
   uses. Deliberately a flat status list, not full canSeeProject access:
   no edit path anywhere here, and no detail-page view -- just "what
   happened to the thing I picked."
   ========================================================================= */
router.get("/my-picks", requireRole("jury", "rise_jury"), async (req, res, next) => {
  try {
    const isIdeasJury = req.user.role === "jury";
    const { rows } = await pool.query(
      isIdeasJury
        ? `SELECT DISTINCT p.id, p.code, p.title, p.type, p.stage, p.status, p.health, p.outcome, p.created_at
           FROM build_projects p
           JOIN build_project_sources s ON s.project_id = p.id AND s.source_type = 'idea'
           JOIN idea_ratings r ON r.idea_id = s.source_id AND r.jury_user_id = $1
           ORDER BY p.created_at DESC`
        : `SELECT DISTINCT p.id, p.code, p.title, p.type, p.stage, p.status, p.health, p.outcome, p.created_at
           FROM build_projects p
           JOIN build_project_sources s ON s.project_id = p.id AND s.source_type = 'rise_application'
           JOIN rise_scores r ON r.application_id = s.source_id AND r.jury_user_id = $1
           ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ projects: rows.map((r) => ({ ...r, stageLabel: STAGE_LABELS[r.stage] || r.stage })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/my-reassess-links -- a client's own "addressed by" notes
// for their scorecard view (PRD "Audit/Scorecard: preserve the link
// between the original audit opportunity and the Build project, then
// show when that opportunity has been addressed"). Same data as admin's
// GET /admin/build/reassess/:clientId -- self-scoped so a client can read
// it with their own login, which has no admin/riv_manager access.
router.get("/my-reassess-links", async (req, res, next) => {
  try {
    if (req.user.role !== "client") return res.status(403).json({ error: "Not available for this role." });
    const { rows } = await pool.query(
      `SELECT l.question_id, p.code, p.title, p.closed_at
       FROM build_reassess_links l JOIN build_projects p ON p.id = l.project_id
       WHERE l.client_id = $1`,
      [req.user.id]
    );
    res.json({
      links: rows.map((r) => ({
        questionId: r.question_id,
        note: `Addressed by ${r.code} (Scaled, ${new Date(r.closed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })})`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/my-clients -- RIV Client Partner's own assigned-clients
// roster (id/name/company), for the Leader dashboard's client picker. Was
// missing entirely -- assignedClientIds() already computed this set for
// permission checks, but nothing exposed it with names attached, so the
// dashboard's riv_manager view showed a placeholder instead of a picker.
router.get("/my-clients", async (req, res, next) => {
  try {
    if (req.user.role !== "riv_manager") return res.status(403).json({ error: "Not available for this role." });
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.company FROM build_manager_clients mc
       JOIN users c ON c.id = mc.client_id
       WHERE mc.manager_user_id = $1 ORDER BY COALESCE(c.company, c.name)`,
      [req.user.id]
    );
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   MY WORK (Oct 2026 "Proposed Screens" -- new personal homepage, screen 5)
   ========================================================================= */

const ROLE_LABELS = {
  admin: "RIV Admin", riv_manager: "RIV Client Partner", client: "Client Leader",
  product_owner: "Product Owner", startup_poc: "Startup POC", junior_employee: "Employee",
};

// Narrower than GET /projects' list-scoping: "my projects" means personally
// assigned (or, for admin/riv_manager, the clients they cover), not "every
// project I'm allowed to view" -- a Product Owner's homepage shows their
// own handful of projects, not their whole client's portfolio.
async function myProjectWhere(req) {
  const { role, id: userId } = req.user;
  if (role === "admin") return { where: "TRUE", params: [] };
  if (role === "riv_manager") {
    const ids = await assignedClientIds(req.user);
    return ids.length ? { where: "p.client_id = ANY($1::int[])", params: [ids] } : { where: "FALSE", params: [] };
  }
  if (role === "client") return { where: "p.client_id = $1", params: [userId] };
  if (role === "product_owner") return { where: "p.product_owner_user_id = $1", params: [userId] };
  if (role === "startup_poc") return { where: "p.startup_poc_user_id = $1", params: [userId] };
  if (role === "junior_employee") {
    const ids = await employeeProjectIds(req.user);
    return ids.length ? { where: "p.id = ANY($1::int[])", params: [ids] } : { where: "FALSE", params: [] };
  }
  return { where: "FALSE", params: [] };
}

router.get("/my-work", async (req, res, next) => {
  try {
    const { where, params } = await myProjectWhere(req);
    const { rows } = await pool.query(
      `SELECT p.*, m.baseline, m.target, m.actual_cost, m.est_cost,
              (SELECT k.value FROM build_kpi_readings k WHERE k.project_id = p.id ORDER BY k.reading_date DESC, k.id DESC LIMIT 1) AS kpi_now,
              EXISTS(SELECT 1 FROM build_updates u2 WHERE u2.project_id = p.id) AS has_update,
              (SELECT u3.needs_help FROM build_updates u3 WHERE u3.project_id = p.id ORDER BY u3.update_date DESC, u3.created_at DESC LIMIT 1) AS latest_needs_help,
              GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date) AS last_update_date,
              (CURRENT_DATE - GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date)) AS days_since_update,
              (CURRENT_DATE - p.updated_at::date) AS days_in_stage
       FROM build_projects p
       LEFT JOIN build_metrics m ON m.project_id = p.id
       WHERE ${where}
       ORDER BY p.created_at DESC`,
      params
    );

    const projects = rows.map((r) => {
      const updateOverdue = Number(r.days_since_update) > 14 && r.status === "active";
      const stageList = STAGES[r.type] || [];
      const stageIndex = stageList.indexOf(r.stage);
      const missing = r.status === "active" && r.stage !== "closed" ? missingFieldsForStage(r.type, r.stage, r, r) : [];
      const auto = computeAutoHealth({
        project: r, metrics: { actual_cost: r.actual_cost, est_cost: r.est_cost, baseline: r.baseline, target: r.target },
        daysSinceUpdate: r.has_update ? Number(r.days_since_update) : null,
        daysInStage: Number(r.days_in_stage),
        latestKpiValue: r.kpi_now, needsHelp: r.latest_needs_help,
      });
      const rank = { on_track: 0, at_risk: 1, off_track: 2 };
      const effectiveHealth = rank[auto.health] > rank[r.health || "on_track"] ? auto.health : (r.health || "on_track");
      return {
        ...r, hasUpdate: !!r.has_update, updateOverdue, missing, effectiveHealth,
        healthReason: effectiveHealth === r.health ? null : auto.reason,
        stageLabel: STAGE_LABELS[r.stage] || r.stage,
        stagePosition: stageIndex >= 0 ? stageIndex + 1 : null,
        stageCount: stageList.length || null,
      };
    });

    const assigned = await assignedClientIds(req.user);
    const actions = [];
    for (const p of projects) {
      if (p.status !== "active") continue;
      const canAct = canAddUpdate(req.user, p, assigned, req.user.role === "junior_employee");
      if (canAct && (p.updateOverdue || !p.hasUpdate)) {
        actions.push({
          projectId: p.id, code: p.code, title: p.title, kind: "update",
          title2: "Add a status update",
          detail: p.hasUpdate ? `Last update ${fmtActionDate(p.last_update_date)}. Over 21 days makes the project red and alerts the Client Leader.` : "No status update has been posted yet.",
          urgent: p.updateOverdue, sortDate: p.last_update_date,
        });
      }
      if (canEditDetails(req.user, p, assigned) && p.missing.length) {
        actions.push({
          projectId: p.id, code: p.code, title: p.title, kind: "stage",
          title2: `Complete the ${p.stageLabel} stage`,
          detail: `Missing: ${p.missing.join(", ")}.`,
          urgent: false, sortDate: p.last_update_date,
        });
      }
    }
    actions.sort((a, b) => new Date(a.sortDate) - new Date(b.sortDate));

    // "Recently changed" feed -- stage moves, status updates, and project
    // creation, across "my projects", newest first. Pulls from the tables
    // that already record each of these (no new schema), joined to users
    // for a "Name (Role)" byline.
    const projectIds = projects.map((p) => p.id);
    let feed = [];
    if (projectIds.length) {
      const [historyRows, updateRows, createdRows] = await Promise.all([
        pool.query(
          `SELECT h.project_id, h.action, h.from_stage, h.to_stage, h.reason, h.at AS at, u.name AS by_name, u.role AS by_role
           FROM build_stage_history h LEFT JOIN users u ON u.id = h.by_user_id
           WHERE h.project_id = ANY($1::int[]) ORDER BY h.at DESC LIMIT 20`,
          [projectIds]
        ),
        pool.query(
          `SELECT up.project_id, up.health, up.created_at AS at, u.name AS by_name, u.role AS by_role
           FROM build_updates up LEFT JOIN users u ON u.id = up.by_user_id
           WHERE up.project_id = ANY($1::int[]) ORDER BY up.created_at DESC LIMIT 20`,
          [projectIds]
        ),
        pool.query(
          `SELECT p.id AS project_id, p.created_at AS at, u.name AS by_name, u.role AS by_role
           FROM build_projects p LEFT JOIN users u ON u.id = p.created_by
           WHERE p.id = ANY($1::int[])`,
          [projectIds]
        ),
      ]);
      const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
      for (const h of historyRows.rows) {
        const code = byId[h.project_id]?.code;
        const by = `${h.by_name || "Someone"} (${ROLE_LABELS[h.by_role] || h.by_role || "—"})`;
        let text;
        if (h.action === "advance") text = `${code} moved from ${STAGE_LABELS[h.from_stage] || h.from_stage} to ${STAGE_LABELS[h.to_stage] || h.to_stage}, approved by ${h.by_name || "someone"}`;
        else if (h.action === "send_back") text = `${code} sent back to ${STAGE_LABELS[h.to_stage] || h.to_stage}${h.reason ? `: ${h.reason}` : ""}`;
        else if (h.action === "hold") text = `${code} put on hold${h.reason ? `: ${h.reason}` : ""}`;
        else if (h.action === "resume") text = `${code} resumed`;
        else if (h.action === "stop") text = `${code} stopped${h.reason ? `: ${h.reason}` : ""}`;
        else if (h.action === "close") text = `${code} closed${h.reason ? ` (${h.reason})` : ""}`;
        else if (h.action === "iterate") text = `${code} sent back to iterate${h.reason ? `: ${h.reason}` : ""}`;
        else text = `${code} updated`;
        feed.push({ by, text, at: h.at });
      }
      for (const u of updateRows.rows) {
        const code = byId[u.project_id]?.code;
        const by = `${u.by_name || "Someone"} (${ROLE_LABELS[u.by_role] || u.by_role || "—"})`;
        feed.push({ by, text: `${by.split(" (")[0]} added a status update to ${code}: ${(u.health || "").replace("_", " ")}`, at: u.at, skipByPrefix: true });
      }
      for (const c of createdRows.rows) {
        const code = byId[c.project_id]?.code;
        const by = `${c.by_name || "RIV"} (${ROLE_LABELS[c.by_role] || c.by_role || "—"})`;
        feed.push({ by, text: `${code} created`, at: c.at, skipByPrefix: true });
      }
      feed = feed.filter((f) => f.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10)
        .map((f) => ({ text: f.skipByPrefix ? f.text : `${f.by} ${f.text}`, at: f.at }));
    }

    const active = projects.filter((p) => p.status === "active");
    res.json({
      summary: {
        toDo: actions.length,
        updateOverdue: active.filter((p) => p.updateOverdue).length,
        redAmber: active.filter((p) => p.effectiveHealth === "off_track" || p.effectiveHealth === "at_risk").length,
        myProjects: projects.length,
        internalCount: projects.filter((p) => p.type === "internal").length,
        startupCount: projects.filter((p) => p.type === "startup").length,
      },
      nextActions: actions.slice(0, 10),
      myProjects: projects.slice(0, 8).map((p) => ({
        id: p.id, code: p.code, title: p.title, type: p.type, stage: p.stage, stageLabel: p.stageLabel,
        stagePosition: p.stagePosition, stageCount: p.stageCount, health: p.hasUpdate ? p.effectiveHealth : "no_update",
      })),
      recentlyChanged: feed,
    });
  } catch (err) {
    next(err);
  }
});
function fmtActionDate(d) { return d ? new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—"; }

/* =========================================================================
   LIST / DETAIL
   ========================================================================= */

// GET /api/build/projects -- scoped list (PRD 8.1 project list). Query
// params: clientId, type, stage, health, q (search by code/title).
router.get("/projects", async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    const where = [];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };

    if (role === "admin") {
      // sees everything; optional ?clientId= narrows
      if (req.query.clientId) where.push(`p.client_id = ${p(Number(req.query.clientId))}`);
    } else if (role === "riv_manager") {
      const ids = await assignedClientIds(req.user);
      if (!ids.length) return res.json({ projects: [] });
      // ?clientId= narrows within their own assigned set -- same optional-narrow
      // shape as admin gets above, just AND'ed with the assigned-clients scope
      // rather than replacing it.
      if (req.query.clientId) where.push(`p.client_id = ${p(Number(req.query.clientId))}`);
      where.push(`p.client_id = ANY(${p(ids)}::int[])`);
    } else if (role === "client") {
      where.push(`p.client_id = ${p(userId)}`);
    } else if (role === "product_owner") {
      // A product_owner login's own client_id (set the same way junior_employee/jury's is, per I1's pattern).
      where.push(`p.client_id = (SELECT client_id FROM users WHERE id = ${p(userId)})`);
    } else if (role === "startup_poc") {
      where.push(`p.startup_poc_user_id = ${p(userId)}`);
    } else if (role === "junior_employee") {
      // Own project only -- the idea this user submitted, per employeeProjectIds().
      const ids = await employeeProjectIds(req.user);
      if (!ids.length) return res.json({ projects: [] });
      where.push(`p.id = ANY(${p(ids)}::int[])`);
    } else {
      return res.json({ projects: [] });
    }

    if (req.query.type) where.push(`p.type = ${p(req.query.type)}`);
    if (req.query.stage) where.push(`p.stage = ${p(req.query.stage)}`);
    // ?health= filters on the *effective* health (stored health raised by
    // the automatic rules), applied after enrichment below -- filtering on
    // the stored column hid new/late projects the list itself shows as red.
    const healthFilter = req.query.health || null;
    if (req.query.status) where.push(`p.status = ${p(req.query.status)}`);
    if (req.query.q) where.push(`(p.code ILIKE ${p("%" + req.query.q + "%")} OR p.title ILIKE ${p("%" + req.query.q + "%")})`);

    const { rows } = await pool.query(
      `SELECT p.*, m.actual_cost, m.est_cost, m.realised_benefit, m.est_benefit, m.currency,
              m.kpi_name, m.kpi_unit, m.baseline, m.target,
              (SELECT k.value FROM build_kpi_readings k WHERE k.project_id = p.id ORDER BY k.reading_date DESC, k.id DESC LIMIT 1) AS kpi_now,
              EXISTS(SELECT 1 FROM build_updates u2 WHERE u2.project_id = p.id) AS has_update,
              (SELECT u3.needs_help FROM build_updates u3 WHERE u3.project_id = p.id ORDER BY u3.update_date DESC, u3.created_at DESC LIMIT 1) AS latest_needs_help,
              c.name AS client_name, c.company AS client_company,
              po.name AS product_owner_name,
              GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date) AS last_update_date,
              (CURRENT_DATE - GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date)) AS days_since_update,
              (CURRENT_DATE - p.updated_at::date) AS days_in_stage
       FROM build_projects p
       LEFT JOIN build_metrics m ON m.project_id = p.id
       LEFT JOIN users c ON c.id = p.client_id
       LEFT JOIN users po ON po.id = p.product_owner_user_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY (p.health = 'off_track') DESC, (p.health = 'at_risk') DESC, p.created_at DESC`,
      params
    );

    const enriched = rows.map((r) => {
        const updateOverdue = Number(r.days_since_update) > 14 && r.status === "active";
        const stageList = STAGES[r.type] || [];
        const stageIndex = stageList.indexOf(r.stage);
        const missing = r.stage !== "closed" ? missingFieldsForStage(r.type, r.stage, r, r) : [];
        // A compact "what to do next" hint for the list row -- the full
        // per-stage form lives on the project detail page; this is just
        // enough to tell someone at a glance what's blocking the gate.
        let nextStep;
        if (r.status === "on_hold") nextStep = r.hold_reason ? `On hold: ${r.hold_reason}` : "On hold";
        else if (r.status === "stopped") nextStep = "Stopped";
        else if (r.stage === "closed") nextStep = null;
        else if (!r.has_update) nextStep = "Post the first status update";
        else if (r.stage === "pilot" && r.pilot_end) nextStep = `Pilot ends ${new Date(r.pilot_end).toLocaleDateString("en-US", { day: "numeric", month: "short" })}: record result and decision`;
        else if (missing.length) nextStep = `Add ${missing[0]} · Product Owner`;
        else nextStep = `Advance to ${STAGE_LABELS[nextStage(r.type, r.stage)] || "next stage"}`;
        const auto = computeAutoHealth({
          project: r, metrics: { actual_cost: r.actual_cost, est_cost: r.est_cost, baseline: r.baseline, target: r.target },
          daysSinceUpdate: r.has_update ? Number(r.days_since_update) : null,
          daysInStage: Number(r.days_in_stage),
          latestKpiValue: r.kpi_now, needsHelp: r.latest_needs_help,
        });
        const rank = { on_track: 0, at_risk: 1, off_track: 2 };
        const effectiveHealth = rank[auto.health] > rank[r.health || "on_track"] ? auto.health : (r.health || "on_track");
        return {
          ...r,
          actual_cost: r.actual_cost != null ? Number(r.actual_cost) : null,
          est_cost: r.est_cost != null ? Number(r.est_cost) : null,
          realised_benefit: r.realised_benefit != null ? Number(r.realised_benefit) : null,
          est_benefit: r.est_benefit != null ? Number(r.est_benefit) : null,
          baseline: r.baseline != null ? Number(r.baseline) : null,
          target: r.target != null ? Number(r.target) : null,
          kpi_now: r.kpi_now != null ? Number(r.kpi_now) : null,
          hasUpdate: !!r.has_update,
          roi: computeRoi({ actual_cost: r.actual_cost, est_cost: r.est_cost, realised_benefit: r.realised_benefit, est_benefit: r.est_benefit }),
          stageLabel: STAGE_LABELS[r.stage] || r.stage,
          stagePosition: stageIndex >= 0 ? stageIndex + 1 : null,
          stageCount: stageList.length || null,
          updateOverdue,
          nextStep,
          effectiveHealth,
          healthReason: effectiveHealth === r.health ? null : auto.reason,
        };
      });
    const filtered = healthFilter ? enriched.filter((r) => r.effectiveHealth === healthFilter) : enriched;
    const hRank = { off_track: 2, at_risk: 1, on_track: 0 };
    filtered.sort((a, b) => (hRank[b.effectiveHealth] ?? 0) - (hRank[a.effectiveHealth] ?? 0));
    res.json({ projects: filtered });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/projects/:id -- full detail: project, sources, stage
// history, updates, lessons, files (metadata), KPI readings.
router.get("/projects/:id", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    const pocClient = await pocClientId(req.user);
    const isLinkedEmployee = req.user.role === "junior_employee" && (await employeeProjectIds(req.user)).includes(project.id);
    if (!canSeeProject(req.user, project, assigned, pocClient, isLinkedEmployee)) return res.status(403).json({ error: "You don't have access to this project." });

    const [sources, history, updates, lessons, files, kpiReadings] = await Promise.all([
      // "Where it came from" (mockup screen 3): the idea / startup by name,
      // who submitted it, and the audit opportunity it answers.
      pool.query(
        `SELECT s.*, i.title AS idea_title, iu.name AS idea_submitted_by_name,
                a.startup_name, a.founder_name, o.title AS opportunity_title
         FROM build_project_sources s
         LEFT JOIN ideas i ON s.source_type = 'idea' AND i.id = s.source_id
         LEFT JOIN users iu ON iu.id = i.submitted_by
         LEFT JOIN rise_applications a ON s.source_type = 'rise_application' AND a.id = s.source_id
         LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
         WHERE s.project_id = $1`,
        [project.id]
      ),
      pool.query(
        `SELECT h.*, u.name AS by_name FROM build_stage_history h LEFT JOIN users u ON u.id = h.by_user_id
         WHERE h.project_id = $1 ORDER BY h.at DESC`,
        [project.id]
      ),
      pool.query(
        `SELECT up.*, u.name AS by_name, a.name AS agreed_with_name FROM build_updates up
         LEFT JOIN users u ON u.id = up.by_user_id LEFT JOIN users a ON a.id = up.agreed_with_user_id
         WHERE up.project_id = $1 ORDER BY up.update_date DESC, up.created_at DESC`,
        [project.id]
      ),
      pool.query("SELECT * FROM build_lessons WHERE project_id = $1", [project.id]),
      pool.query("SELECT id, stage, file_name, content_type, size, by_user_id, at FROM build_files WHERE project_id = $1 ORDER BY at DESC", [project.id]),
      pool.query("SELECT * FROM build_kpi_readings WHERE project_id = $1 ORDER BY reading_date ASC", [project.id]),
    ]);

    const latestUpdate = updates.rows[0] || null;
    const lastActivity = latestUpdate?.update_date || project.started_at;
    const daysSinceUpdate = lastActivity ? Math.max(0, Math.round((Date.now() - new Date(lastActivity).getTime()) / 86400000)) : null;
    const latestKpiRow = kpiReadings.rows[kpiReadings.rows.length - 1];
    const projOut = projectOut(project);
    const daysInStage = project.updated_at ? Math.max(0, Math.round((Date.now() - new Date(project.updated_at).getTime()) / 86400000)) : null;
    const auto = computeAutoHealth({
      project, metrics: projOut.metrics,
      daysSinceUpdate: latestUpdate ? daysSinceUpdate : null,
      daysInStage,
      latestKpiValue: latestKpiRow ? Number(latestKpiRow.value) : null,
      needsHelp: latestUpdate?.needs_help,
    });
    const rank = { on_track: 0, at_risk: 1, off_track: 2 };
    const effectiveHealth = rank[auto.health] > rank[projOut.health || "on_track"] ? auto.health : (projOut.health || "on_track");

    res.json({
      project: {
        ...projOut, effectiveHealth, healthReason: effectiveHealth === projOut.health ? null : auto.reason,
        kpi_now: latestKpiRow ? Number(latestKpiRow.value) : null,
        // A project with no status update shows "No update yet", never a green "On track".
        hasUpdate: updates.rows.length > 0,
      },
      sources: sources.rows.map((r) => ({
        ...r, auditQuestion: r.question_id != null ? ((QUESTIONS.find((q) => q.id === Number(r.question_id)) || {}).q || null) : null,
      })),
      stageOrder: STAGES[project.type],
      stageLabels: STAGE_LABELS,
      history: history.rows,
      updates: updates.rows.map((u) => ({ ...u, pct_complete: u.pct_complete != null ? Number(u.pct_complete) : null })),
      lessons: lessons.rows[0] || null,
      files: files.rows,
      kpiReadings: kpiReadings.rows.map((k) => ({ ...k, value: Number(k.value) })),
      missingForNextStage: project.stage !== "closed" ? missingFieldsForStage(project.type, project.stage, project, project) : [],
      gateApprovers: project.stage !== "closed" ? gateApprovers(project.type, project.stage) : [],
      // Mockup screen 3's "current stage checklist": every item the stage
      // needs (asking missingFieldsForStage with nothing filled in gives
      // the full list), each marked done or not.
      stageChecklist: (() => {
        if (project.stage === "closed") return [];
        const all = missingFieldsForStage(project.type, project.stage, {}, {});
        const missing = new Set(missingFieldsForStage(project.type, project.stage, project, project));
        return all.map((label) => ({ label, done: !missing.has(label) }));
      })(),
      // What *this* viewer may do -- the screen shows/hides buttons from
      // this, so the frontend never re-derives the permission table.
      permissions: {
        addUpdate: canAddUpdate(req.user, project, assigned, isLinkedEmployee),
        editDetails: canEditDetails(req.user, project, assigned),
        editRoi: canEditRoi(req.user, project, assigned),
        approveStage: project.stage !== "closed" && canApproveGate(req.user, project, gateApprovers(project.type, project.stage), assigned),
        holdOrStop: canHoldOrStop(req.user, project),
        close: canClose(req.user),
        requestDelete: canRequestDelete(req.user, project, assigned),
        deleteProject: req.user.role === "admin",
        raiseRequest: isClientLeaderOf(req.user, project) || req.user.role === "admin",
        uploadFile: canAddUpdate(req.user, project, assigned, isLinkedEmployee),
        seeMoney: req.user.role !== "startup_poc",
      },
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STATUS UPDATES (PRD 8.2)
   ========================================================================= */

// POST /api/build/projects/:id/updates  { health, progress, nextSteps, blockers?, needsHelp?, pctComplete?, agreedWithUserId?, kpiActual? }
router.post("/projects/:id/updates", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    const isLinkedEmployee = req.user.role === "junior_employee" && (await employeeProjectIds(req.user)).includes(project.id);
    if (!canAddUpdate(req.user, project, assigned, isLinkedEmployee)) return res.status(403).json({ error: "You can't add an update to this project." });

    const { health, progress, nextSteps, blockers, needsHelp, pctComplete, agreedWithUserId, kpiActual, actualCost } = req.body || {};
    if (!["on_track", "at_risk", "off_track"].includes(health)) return res.status(400).json({ error: "A valid health status is required." });
    if (!progress || !String(progress).trim()) return res.status(400).json({ error: "Progress since last update is required." });
    if (!nextSteps || !String(nextSteps).trim()) return res.status(400).json({ error: "Next steps is required." });
    if (pctComplete != null && (pctComplete < 0 || pctComplete > 100)) return res.status(400).json({ error: "% complete must be between 0 and 100." });

    const { rows } = await pool.query(
      `INSERT INTO build_updates (project_id, health, progress, next_steps, blockers, needs_help, pct_complete, by_user_id, agreed_with_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [project.id, health, String(progress).trim(), String(nextSteps).trim(), (blockers || "").trim() || null,
        !!needsHelp, pctComplete ?? null, req.user.id, agreedWithUserId || null]
    );
    const update = rows[0];

    const wasHealth = project.health;
    await pool.query("UPDATE build_projects SET health = $1, updated_at = now() WHERE id = $2", [health, project.id]);

    if (kpiActual != null && kpiActual !== "") {
      await pool.query(
        "INSERT INTO build_kpi_readings (project_id, value, update_id) VALUES ($1,$2,$3)",
        [project.id, Number(kpiActual), update.id]
      );
    }
    // "Cost to date" (page 4 of the Oct 2026 mockup folds this into the same
    // status-update form, rather than a separate ROI-tab edit). Whoever can
    // post an update can record it -- same permission as the rest of this
    // form, deliberately not the narrower canEditRoi gate on the ROI tab.
    if (actualCost != null && actualCost !== "") {
      await pool.query(
        `INSERT INTO build_metrics (project_id, actual_cost) VALUES ($1,$2)
         ON CONFLICT (project_id) DO UPDATE SET actual_cost = EXCLUDED.actual_cost`,
        [project.id, Number(actualCost)]
      );
    }

    // 10.3 triggers: health turns red, or "needs leadership help" ticked.
    if ((health === "off_track" && wasHealth !== "off_track") || needsHelp) {
      const recipients = await recipientsForProject(project, ["client", "admins"]);
      await notifyBuild(recipients, {
        projectId: project.id, projectCode: project.code,
        kind: needsHelp ? "needs_help" : "health_red",
        message: needsHelp
          ? `${project.code} needs leadership help.`
          : `${project.code} turned red (Off track).`,
        subject: `RIOS Build: ${project.code} ${needsHelp ? "needs leadership help" : "is off track"}`,
        heading: needsHelp ? "A project needs leadership help" : "A project just turned red",
        body: `${project.title} (${project.code}) ${needsHelp ? "has flagged that it needs leadership help." : "was just marked Off track in its latest status update."}`,
      });
    }

    res.status(201).json({ update });
  } catch (err) {
    next(err);
  }
});

// PUT /api/build/updates/:id -- fix a typo within 24h (section 8.2).
router.put("/updates/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM build_updates WHERE id = $1", [req.params.id]);
    const update = rows[0];
    if (!update) return res.status(404).json({ error: "Update not found." });
    if (req.user.role !== "admin" && req.user.id !== update.by_user_id) {
      return res.status(403).json({ error: "You can only edit your own update." });
    }
    const ageMs = Date.now() - new Date(update.created_at).getTime();
    if (req.user.role !== "admin" && ageMs > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "Updates can only be edited within 24 hours." });
    }
    const { progress, nextSteps, blockers, pctComplete } = req.body || {};
    const { rows: out } = await pool.query(
      `UPDATE build_updates SET progress = COALESCE($1, progress), next_steps = COALESCE($2, next_steps),
         blockers = $3, pct_complete = COALESCE($4, pct_complete), edited_at = now()
       WHERE id = $5 RETURNING *`,
      [progress?.trim() || null, nextSteps?.trim() || null, (blockers ?? update.blockers) || null, pctComplete ?? null, update.id]
    );
    res.json({ update: out[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/requests { message } -- "Requests from
// Client Partners" (mockup page 5's admin tab). Client Leader only, per
// the mockup's own naming -- a generic free-text ask against their
// project (a file removal, an access question, anything that doesn't fit
// a structured field) for an admin to see and resolve. Deliberately
// generic rather than inventing specific request "types" the mockup
// didn't spell out.
router.post("/projects/:id/requests", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!isClientLeaderOf(req.user, project) && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only the Client Leader for this project can raise a request." });
    }
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "A message is required." });
    const { rows } = await pool.query(
      "INSERT INTO build_requests (project_id, requested_by, message) VALUES ($1,$2,$3) RETURNING *",
      [project.id, req.user.id, message]
    );
    const recipients = await recipientsForProject(project, ["admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "client_request",
      message: `${project.code}: new request from the Client Partner -- "${message}"`,
      subject: `RIOS Build: new request on ${project.code}`,
      heading: "A Client Partner has a request",
      body: `${project.title} (${project.code}): "${message}"`,
    });
    res.status(201).json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/delete-request { reason } -- a RIV Client
// Partner can't delete a project themselves (approved workflow v2); this
// raises a delete request that only the RIV Admin can approve or reject
// (Admin console -> Requests). Stored in build_requests with kind='delete'.
router.post("/projects/:id/delete-request", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    if (!canRequestDelete(req.user, project, assigned)) {
      return res.status(403).json({ error: "Only the RIV Client Partner assigned to this project can request deletion." });
    }
    const reason = String(req.body?.reason || "").trim();
    if (!reason) return res.status(400).json({ error: "A reason is required." });
    const { rows: open } = await pool.query(
      "SELECT id FROM build_requests WHERE project_id = $1 AND kind = 'delete' AND status = 'open'",
      [project.id]
    );
    if (open.length) return res.status(409).json({ error: "A delete request for this project is already waiting for the RIV Admin." });
    const { rows } = await pool.query(
      "INSERT INTO build_requests (project_id, requested_by, message, kind) VALUES ($1,$2,$3,'delete') RETURNING *",
      [project.id, req.user.id, reason]
    );
    const recipients = await recipientsForProject(project, ["admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "client_request",
      message: `${project.code}: delete requested by the Client Partner -- "${reason}"`,
      subject: `RIOS Build: delete requested for ${project.code}`,
      heading: "A Client Partner asked to delete a project",
      body: `${project.title} (${project.code}). Reason: "${reason}". Approve or reject it in the Admin console.`,
    });
    res.status(201).json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/build/projects/:id/requests -- a project's own request thread,
// visible to anyone who can already see the project (Client Leader sees
// their own asks; Product Owner/RIV Client Partner/admin see what's been
// raised and whether it's resolved).
router.get("/projects/:id/requests", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    const pocClient = await pocClientId(req.user);
    const isLinkedEmployee = req.user.role === "junior_employee" && (await employeeProjectIds(req.user)).includes(project.id);
    if (!canSeeProject(req.user, project, assigned, pocClient, isLinkedEmployee)) return res.status(403).json({ error: "You don't have access to this project." });
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS requested_by_name FROM build_requests r LEFT JOIN users u ON u.id = r.requested_by
       WHERE r.project_id = $1 ORDER BY r.created_at DESC`,
      [project.id]
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STAGE ACTIONS (PRD 6, 7 "Rules")
   ========================================================================= */

async function recordStageHistory(projectId, fromStage, toStage, action, reason, userId) {
  await pool.query(
    `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, reason, by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [projectId, fromStage, toStage, action, reason || null, userId]
  );
}

// POST /api/build/projects/:id/advance { reason? }
// Generic one-stage-forward move for every stage except Pilot (use
// pilot-decision below) and once already Closed.
router.post("/projects/:id/advance", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")} and can't be advanced.` });
    if (project.stage === "pilot") return res.status(400).json({ error: "Use the Pilot decision (Scale / Iterate / Stop) to move on from Pilot." });
    if (project.stage === "closed") return res.status(400).json({ error: "This project has already reached Closed." });

    const assigned = await assignedClientIds(req.user);
    const approvers = gateApprovers(project.type, project.stage);
    if (!canApproveGate(req.user, project, approvers, assigned)) {
      return res.status(403).json({ error: "You're not the approver for this gate." });
    }

    const missing = missingFieldsForStage(project.type, project.stage, project, project);
    if (missing.length) return res.status(400).json({ error: `Fill in before moving on: ${missing.join(", ")}` });

    const to = nextStage(project.type, project.stage);
    await pool.query("UPDATE build_projects SET stage = $1, updated_at = now() WHERE id = $2", [to, project.id]);
    await recordStageHistory(project.id, project.stage, to, "advance", req.body?.reason, req.user.id);

    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} moved to ${STAGE_LABELS[to]}.`,
      subject: `RIOS Build: ${project.code} moved to ${STAGE_LABELS[to]}`,
      heading: "A project moved stage",
      body: `${project.title} (${project.code}) moved from ${STAGE_LABELS[project.stage]} to ${STAGE_LABELS[to]}.`,
    });

    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/send-back { reason, toStage? }  (BLD-AC06)
router.post("/projects/:id/send-back", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")}.` });

    const { reason, toStage } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to send a project back a stage." });

    const assigned = await assignedClientIds(req.user);
    const approvers = gateApprovers(project.type, project.stage);
    if (!canSendBack(req.user, project, approvers, assigned)) return res.status(403).json({ error: "You're not the approver for this gate." });

    const target = toStage && isValidStage(project.type, toStage) ? toStage : prevStage(project.type, project.stage);
    if (!target || STAGES[project.type].indexOf(target) >= STAGES[project.type].indexOf(project.stage)) {
      return res.status(400).json({ error: "Can't send back to that stage." });
    }

    await pool.query("UPDATE build_projects SET stage = $1, updated_at = now() WHERE id = $2", [target, project.id]);
    await recordStageHistory(project.id, project.stage, target, "send_back", reason, req.user.id);

    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} sent back to ${STAGE_LABELS[target]}: ${reason}`,
      subject: `RIOS Build: ${project.code} sent back to ${STAGE_LABELS[target]}`,
      heading: "A project was sent back a stage",
      body: `${project.title} (${project.code}) was sent back from ${STAGE_LABELS[project.stage]} to ${STAGE_LABELS[target]}. Reason: ${reason}`,
    });

    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/pilot-decision { decision: 'scale'|'iterate'|'stop', iterateTo?, reason? }  (BLD-AC05/07)
router.post("/projects/:id/pilot-decision", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.stage !== "pilot") return res.status(400).json({ error: "This project isn't in Pilot." });
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")}.` });

    const assigned = await assignedClientIds(req.user);
    if (!canApproveGate(req.user, project, gateApprovers(project.type, "pilot"), assigned)) {
      return res.status(403).json({ error: "Only the Product Owner (or admin) can decide the Pilot gate." });
    }

    const { decision, iterateTo, reason } = req.body || {};
    if (!["scale", "iterate", "stop"].includes(decision)) return res.status(400).json({ error: "decision must be 'scale', 'iterate', or 'stop'." });

    if (decision === "scale") {
      const missing = missingFieldsForStage(project.type, "pilot", project, project);
      if (missing.length) return res.status(400).json({ error: `Fill in before moving on: ${missing.join(", ")}` });
      const to = nextStage(project.type, "pilot"); // 'production'
      await pool.query("UPDATE build_projects SET stage = $1, updated_at = now() WHERE id = $2", [to, project.id]);
      await recordStageHistory(project.id, "pilot", to, "advance", reason, req.user.id);
    } else if (decision === "iterate") {
      const target = ["design", "build"].includes(iterateTo) ? iterateTo : "design";
      await pool.query("UPDATE build_projects SET stage = $1, updated_at = now() WHERE id = $2", [target, project.id]);
      await recordStageHistory(project.id, "pilot", target, "iterate", reason, req.user.id);
    } else {
      if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to stop a project." });
      await pool.query("UPDATE build_projects SET status = 'stopped', hold_reason = $1, updated_at = now() WHERE id = $2", [reason, project.id]);
      await recordStageHistory(project.id, "pilot", "pilot", "stop", reason, req.user.id);
    }

    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code}: Pilot decision — ${decision}.`,
      subject: `RIOS Build: ${project.code} Pilot decision — ${decision}`,
      heading: "A Pilot decision was made",
      body: `${project.title} (${project.code})'s Pilot gate was decided: ${decision}.${reason ? " Reason: " + reason : ""}`,
    });

    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/hold { reason }
router.post("/projects/:id/hold", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "active") return res.status(400).json({ error: "Only an active project can be put on hold." });
    const assigned = await assignedClientIds(req.user);
    if (!canHoldOrStop(req.user, project, assigned)) return res.status(403).json({ error: "You can't hold this project." });
    const { reason } = req.body || {};
    await pool.query("UPDATE build_projects SET status = 'on_hold', hold_reason = $1, updated_at = now() WHERE id = $2", [(reason || "").trim() || null, project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "hold", reason, req.user.id);
    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} put on hold.`, subject: `RIOS Build: ${project.code} on hold`,
      heading: "A project was put on hold", body: `${project.title} (${project.code}) was put on hold.${reason ? " Reason: " + reason : ""}`,
    });
    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/resume
router.post("/projects/:id/resume", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "on_hold") return res.status(400).json({ error: "Only a project on hold can be resumed." });
    const assigned = await assignedClientIds(req.user);
    if (!canHoldOrStop(req.user, project, assigned)) return res.status(403).json({ error: "You can't resume this project." });
    await pool.query("UPDATE build_projects SET status = 'active', hold_reason = NULL, updated_at = now() WHERE id = $1", [project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "resume", null, req.user.id);
    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/stop { reason }
router.post("/projects/:id/stop", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!["active", "on_hold"].includes(project.status)) return res.status(400).json({ error: "This project can't be stopped from its current status." });
    const assigned = await assignedClientIds(req.user);
    if (!canHoldOrStop(req.user, project, assigned)) return res.status(403).json({ error: "You can't stop this project." });
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to stop a project." });
    await pool.query("UPDATE build_projects SET status = 'stopped', hold_reason = $1, updated_at = now() WHERE id = $2", [reason, project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "stop", reason, req.user.id);
    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} stopped.`, subject: `RIOS Build: ${project.code} stopped`,
      heading: "A project was stopped", body: `${project.title} (${project.code}) was stopped. Reason: ${reason}`,
    });
    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/close { outcome: 'scaled'|'stopped' }  (BLD-AC11, RIV Admin only)
router.post("/projects/:id/close", async (req, res, next) => {
  try {
    if (!canClose(req.user)) return res.status(403).json({ error: "Only RIV Admin can close a project." });
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!["active", "stopped"].includes(project.status)) return res.status(400).json({ error: "This project can't be closed from its current status." });

    const { outcome } = req.body || {};
    if (!["scaled", "stopped"].includes(outcome)) return res.status(400).json({ error: "outcome must be 'scaled' or 'stopped'." });
    if (outcome === "scaled" && project.stage !== "closed") return res.status(400).json({ error: "A project can only be closed as Scaled once it has reached the Closed stage (after Scale)." });

    const { rows: lessonRows } = await pool.query("SELECT 1 FROM build_lessons WHERE project_id = $1", [project.id]);
    if (!lessonRows.length) return res.status(400).json({ error: "Add lessons learned first." });

    await pool.query(
      "UPDATE build_projects SET status = 'closed', outcome = $1, stage = 'closed', closed_at = now(), updated_at = now() WHERE id = $2",
      [outcome, project.id]
    );
    await recordStageHistory(project.id, project.stage, "closed", "close", `Closed as ${outcome}`, req.user.id);

    const recipients = await recipientsForProject(project, ["poc", "startup_poc", "client", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "closed",
      message: `${project.code} closed (${outcome}).`, subject: `RIOS Build: ${project.code} closed`,
      heading: "A project was closed", body: `${project.title} (${project.code}) was closed with outcome: ${outcome}.`,
    });

    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STAGE DETAILS -- the per-stage fields BLD-AC04's "must be filled before
   moving on" check (lib/buildWorkflow.js's missingFieldsForStage) actually
   looks at: target end date, Agreement's NDA/contract details, Design's
   systems-touched note, Build's demo link, Test's result, Pilot's scope/
   dates, Scale's rollout scope + contract value. These were being checked
   for since the start, but nothing let anyone fill them in -- this route
   (and the Overview tab's "Project details" form that calls it) closes
   that gap. Same people who can post a status update can edit these.
   ========================================================================= */

// PUT /api/build/projects/:id/details
router.put("/projects/:id/details", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    if (!canEditDetails(req.user, project, assigned)) return res.status(403).json({ error: "You can't edit this project's details." });

    const body = req.body || {};
    const fields = {
      target_end: body.targetEnd,
      kpi_baseline_note: body.kpiBaselineNote,
      nda_signed_at: body.ndaSignedAt,
      proposal_amount: body.proposalAmount,
      proposal_accepted_at: body.proposalAcceptedAt,
      po_number: body.poNumber,
      po_raised_at: body.poRaisedAt,
      agreement_type: body.agreementType,
      agreement_signed_at: body.agreementSignedAt,
      pilot_fee: body.pilotFee,
      systems_touched: body.systemsTouched,
      data_shared: body.dataShared,
      risks: body.risks,
      security_check_done: body.securityCheckDone,
      demo_link: body.demoLink,
      test_result: body.testResult,
      pilot_scope: body.pilotScope,
      pilot_start: body.pilotStart,
      pilot_end: body.pilotEnd,
      rollout_scope: body.rolloutScope,
      contract_value: body.contractValue,
    };
    const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "Nothing to update." });
    // Blank strings clear a field instead of trying to save "" into a
    // DATE/NUMERIC/BOOLEAN column, which Postgres would reject outright.
    const clean = (v) => (v === "" ? null : v);

    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await pool.query(
      `UPDATE build_projects SET ${setClause}, updated_at = now() WHERE id = $1`,
      [project.id, ...cols.map((c) => clean(fields[c]))]
    );
    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   ROI (PRD 8.3)
   ========================================================================= */

// PUT /api/build/projects/:id/metrics
router.put("/projects/:id/metrics", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    if (!canEditRoi(req.user, project, assigned)) return res.status(403).json({ error: "You can't edit this project's ROI figures." });

    const isClientLeader = req.user.role === "client";
    const body = req.body || {};
    // Client Leader may only confirm realised benefit (permission table 10.2).
    const fields = isClientLeader
      ? { realised_benefit: body.realisedBenefit }
      : {
          kpi_name: body.kpiName, kpi_unit: body.kpiUnit, baseline: body.baseline, target: body.target,
          currency: body.currency, est_cost: body.estCost, actual_cost: body.actualCost,
          est_benefit: body.estBenefit, realised_benefit: body.realisedBenefit,
        };

    const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "Nothing to update." });

    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await pool.query(
      `INSERT INTO build_metrics (project_id) VALUES ($1)
       ON CONFLICT (project_id) DO NOTHING`,
      [project.id]
    );
    await pool.query(
      `UPDATE build_metrics SET ${setClause}, updated_at = now() WHERE project_id = $1`,
      [project.id, ...cols.map((c) => fields[c])]
    );
    res.json({ project: projectOut(await loadProject(project.id)) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   LESSONS LEARNED (PRD 8.4)
   ========================================================================= */

router.put("/projects/:id/lessons", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    if (!canEditDetails(req.user, project, assigned)) return res.status(403).json({ error: "You can't edit lessons learned for this project." });

    const { worked, notWorked, doDifferently, recommendation, tags } = req.body || {};
    if (recommendation && !["scale_to_others", "reuse_approach", "dont_repeat"].includes(recommendation)) {
      return res.status(400).json({ error: "Invalid recommendation." });
    }
    const { rows } = await pool.query(
      `INSERT INTO build_lessons (project_id, worked, not_worked, do_differently, recommendation, tags)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (project_id) DO UPDATE SET
         worked = EXCLUDED.worked, not_worked = EXCLUDED.not_worked, do_differently = EXCLUDED.do_differently,
         recommendation = EXCLUDED.recommendation, tags = EXCLUDED.tags, updated_at = now()
       RETURNING *`,
      [project.id, (worked || "").trim() || null, (notWorked || "").trim() || null, (doDifferently || "").trim() || null,
        recommendation || null, Array.isArray(tags) ? tags : []]
    );
    res.json({ lessons: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   FILES (PRD 8.6)
   ========================================================================= */

router.post("/projects/:id/files", upload.single("file"), async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    const isLinkedEmployee = req.user.role === "junior_employee" && (await employeeProjectIds(req.user)).includes(project.id);
    if (!canAddUpdate(req.user, project, assigned, isLinkedEmployee)) return res.status(403).json({ error: "You can't attach files to this project." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    if (!ALLOWED_FILE_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: "Only PDF, DOCX, XLSX, PPTX, PNG, or JPG files are accepted." });
    }
    const { rows } = await pool.query(
      `INSERT INTO build_files (project_id, stage, file_name, content_type, size, content, by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, stage, file_name, content_type, size, by_user_id, at`,
      [project.id, req.body?.stage || project.stage, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.id]
    );
    res.status(201).json({ file: rows[0] });
  } catch (err) {
    if (err?.message?.includes("File too large")) return res.status(400).json({ error: "Files must be 10MB or smaller." });
    next(err);
  }
});

router.get("/projects/:id/files/:fileId", async (req, res, next) => {
  try {
    const project = await loadProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    const assigned = await assignedClientIds(req.user);
    const pocClient = await pocClientId(req.user);
    const isLinkedEmployee = req.user.role === "junior_employee" && (await employeeProjectIds(req.user)).includes(project.id);
    if (!canSeeProject(req.user, project, assigned, pocClient, isLinkedEmployee)) return res.status(403).json({ error: "You don't have access to this project." });
    const { rows } = await pool.query("SELECT * FROM build_files WHERE id = $1 AND project_id = $2", [req.params.fileId, project.id]);
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found." });
    res.setHeader("Content-Type", file.content_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.file_name.replace(/"/g, "")}"`);
    res.send(file.content);
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */

// The in-app feed behind the nav bar's notification bell (E2E report Issue 7:
// this route and the table behind it existed from the start, but nothing in
// the frontend ever called them, so no bell was ever drawn). `unreadCount`
// is counted in SQL over *all* of the caller's rows, not just the 50 newest
// returned below, so the badge can't under-count a long backlog.
router.get("/notifications", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, p.code AS project_code, p.title AS project_title
       FROM build_notifications n LEFT JOIN build_projects p ON p.id = n.project_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM build_notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    res.json({ notifications: rows, unreadCount: countRows[0].n });
  } catch (err) {
    next(err);
  }
});

// Declared before "/notifications/:id/read" so "read-all" is never taken for an id.
router.put("/notifications/read-all", async (req, res, next) => {
  try {
    await pool.query("UPDATE build_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put("/notifications/:id/read", async (req, res, next) => {
  try {
    await pool.query("UPDATE build_notifications SET read_at = now() WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
