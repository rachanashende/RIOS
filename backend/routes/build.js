// Build.RIV -- shared authenticated routes (project list/detail, My work,
// status updates, stage actions, ROI, lessons, files, delete requests,
// notifications). Several roles reach this router, each scoped to what
// they may see and do (workflow v2 -- see lib/buildPermissions.js), so
// permission checks happen per-route rather than one requireRole gate.
import { Router } from "express";
import multer from "multer";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS } from "../lib/scoring.js";
import {
  STAGES, STAGE_LABELS, DEAL_STAGES, nextStage, prevStage, isValidStage,
  gateApprovers, missingFieldsForStage,
} from "../lib/buildWorkflow.js";
import {
  canSeeProject, canAddUpdate, canEditDetails, canEditRoi, canHoldOrStop, canClose, canApproveGate,
  canSendBack, canDelete, canRequestDelete, canSeeAmounts, permissionsFor, isClientLeaderOf,
} from "../lib/buildPermissions.js";
import { notifyBuild, recipientsForProject } from "../lib/buildNotify.js";
import {
  assignedClientIds, pocClientId, queryProjects, loadEnrichedProject, stripAmounts,
} from "../lib/buildQueries.js";

const router = Router();
router.use(requireAuth);

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

// Loads the project and checks the caller may see it. Returns
// { project, assigned } or sends the error response and returns null.
async function loadForUser(req, res) {
  const project = await loadEnrichedProject(req.params.id, req.user);
  if (!project) { res.status(404).json({ error: "Project not found." }); return null; }
  const assigned = await assignedClientIds(req.user);
  const pocClient = await pocClientId(req.user);
  if (!canSeeProject(req.user, project, assigned, pocClient)) {
    res.status(403).json({ error: "You don't have access to this project." });
    return null;
  }
  return { project, assigned };
}

function out(project, user) {
  return canSeeAmounts(user) ? project : stripAmounts(project);
}

async function reloadOut(id, user) {
  return out(await loadEnrichedProject(id, user), user);
}

/* =========================================================================
   CLIENT JURY -- read-only "what happened to the thing I picked" list.
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

// GET /api/build/my-reassess-links -- a client's own "addressed by" notes.
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

/* =========================================================================
   LIST / DETAIL
   ========================================================================= */

// GET /api/build/projects?clientId=&type=&stage=&health=&status=&q=&ownerId=
// health also takes 'none' (no update yet) and 'red_amber'; stage takes
// 'deal' for the four startup deal stages.
router.get("/projects", async (req, res, next) => {
  try {
    const rows = await queryProjects(req.user, {
      clientId: req.query.clientId, type: req.query.type, stage: req.query.stage,
      status: req.query.status, q: req.query.q, health: req.query.health, ownerId: req.query.ownerId,
    });
    res.json({ projects: rows.map((r) => out(r, req.user)) });
  } catch (err) {
    next(err);
  }
});

// Human-readable source details: the idea or startup application the
// project came from, and the audit opportunity it addresses.
async function sourceDetails(projectId) {
  const { rows } = await pool.query("SELECT * FROM build_project_sources WHERE project_id = $1", [projectId]);
  const outRows = [];
  for (const s of rows) {
    const item = { ...s };
    if (s.source_type === "idea" && s.source_id) {
      const { rows: ideas } = await pool.query(
        `SELECT i.title, u.name AS author, (SELECT AVG(score) FROM idea_ratings r WHERE r.idea_id = i.id) AS avg_score
         FROM ideas i LEFT JOIN users u ON u.id = i.submitted_by WHERE i.id = $1`,
        [s.source_id]
      );
      if (ideas[0]) Object.assign(item, { label: `Ideathon idea "${ideas[0].title}" by ${ideas[0].author || "an employee"}`, score: ideas[0].avg_score != null ? Number(Number(ideas[0].avg_score).toFixed(1)) : null, scoreOutOf: 5 });
    } else if (s.source_type === "rise_application" && s.source_id) {
      const { rows: apps } = await pool.query(
        `SELECT a.startup_name, a.founder_name, (SELECT AVG(total) FROM rise_scores r WHERE r.application_id = a.id) AS avg_score
         FROM rise_applications a WHERE a.id = $1`,
        [s.source_id]
      );
      if (apps[0]) Object.assign(item, { label: `Startup call · RISE-${String(s.source_id).padStart(5, "0")} · ${apps[0].startup_name}`, score: apps[0].avg_score != null ? Number(Number(apps[0].avg_score).toFixed(1)) : null, scoreOutOf: 5 });
    } else {
      item.label = "Created by RIV Admin";
    }
    const q = s.question_id ? QUESTIONS.find((x) => x.id === Number(s.question_id)) : null;
    if (q) item.question = { id: q.id, module: q.module, submodule: q.submodule, text: q.q };
    outRows.push(item);
  }
  return outRows;
}

// GET /api/build/projects/:id -- full detail plus the caller's permissions.
router.get("/projects/:id", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;

    const [sources, history, updates, lessons, files, kpiReadings, delReqs] = await Promise.all([
      sourceDetails(project.id),
      pool.query(
        `SELECT h.*, u.name AS by_name FROM build_stage_history h LEFT JOIN users u ON u.id = h.by_user_id
         WHERE h.project_id = $1 ORDER BY h.at DESC`,
        [project.id]
      ),
      pool.query(
        `SELECT up.*, u.name AS by_name, u.role AS by_role, a.name AS agreed_with_name FROM build_updates up
         LEFT JOIN users u ON u.id = up.by_user_id LEFT JOIN users a ON a.id = up.agreed_with_user_id
         WHERE up.project_id = $1 ORDER BY up.update_date DESC, up.created_at DESC`,
        [project.id]
      ),
      pool.query("SELECT * FROM build_lessons WHERE project_id = $1", [project.id]),
      pool.query(
        `SELECT f.id, f.stage, f.file_name, f.content_type, f.size, f.by_user_id, f.at, u.name AS by_name
         FROM build_files f LEFT JOIN users u ON u.id = f.by_user_id WHERE f.project_id = $1 ORDER BY f.at DESC`,
        [project.id]
      ),
      pool.query("SELECT * FROM build_kpi_readings WHERE project_id = $1 ORDER BY reading_date ASC, id ASC", [project.id]),
      pool.query("SELECT target_type, target_id, status FROM build_delete_requests WHERE project_id = $1 AND status = 'pending'", [project.id]),
    ]);

    // People the status update form can name in "Agreed with".
    const people = [
      project.poc_user_id && { id: project.poc_user_id, name: project.poc_name, role: "Product Owner" },
      project.riv_manager_id && { id: project.riv_manager_id, name: project.riv_manager_name, role: "RIV Client Partner" },
      project.owner_user_id && { id: project.owner_user_id, name: project.owner_name, role: project.type === "startup" ? "Startup POC" : "Employee" },
    ].filter(Boolean);

    res.json({
      project: out(project, req.user),
      sources,
      stageOrder: STAGES[project.type],
      stageLabels: STAGE_LABELS,
      dealStages: DEAL_STAGES,
      history: history.rows,
      updates: updates.rows.map((u) => ({ ...u, pct_complete: u.pct_complete != null ? Number(u.pct_complete) : null })),
      lessons: lessons.rows[0] || null,
      files: files.rows,
      kpiReadings: kpiReadings.rows.map((k) => ({ ...k, value: Number(k.value) })),
      missingForNextStage: project.missingForStage,
      gateApprovers: gateApprovers(project.type, project.stage),
      permissions: permissionsFor(req.user, project, assigned),
      pendingDeleteRequests: delReqs.rows,
      people,
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   MY WORK -- the landing page: this person's next actions, their
   projects, and what changed recently.
   ========================================================================= */
router.get("/my-work", async (req, res, next) => {
  try {
    const user = req.user;
    const projects = await queryProjects(user, {});
    const live = projects.filter((p) => ["active", "on_hold"].includes(p.status));
    const todos = [];
    const add = (p, kind, action, detail, due, late) => todos.push({
      projectId: p?.id || null, code: p?.code || null, title: p?.title || null, type: p?.type || null,
      kind, action, detail, due, late: !!late,
    });

    for (const p of live) {
      const isPo = user.role === "client_poc" && Number(p.poc_user_id) === Number(user.id);
      const isOwner = Number(p.owner_user_id) === Number(user.id);
      const isPartnerOrAdmin = user.role === "riv_manager" || user.role === "admin";
      const isLeader = user.role === "client";

      if (p.status === "active" && p.updateOverdue && (isPo || isOwner || user.role === "riv_manager")) {
        add(p, "update", "Add a status update", `Last update ${p.daysSinceUpdate} days ago. Over 21 days turns the project red and alerts the Client Leader.`, "Overdue", true);
      }
      if (isPo && p.status === "active" && p.stage !== "closed") {
        if (p.stage === "pilot") {
          add(p, "stage", "Complete the Pilot stage", p.missingForStage.length ? `Missing: ${p.missingForStage.join(", ")}. Then record Scale, Iterate or Stop.` : "Checklist complete. Record the pilot decision: Scale, Iterate or Stop.", p.pilot_end ? `Pilot ends ${new Date(p.pilot_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null, false);
        } else {
          add(p, "stage", `Complete ${p.stageLabel}`, p.missingForStage.length ? `Missing: ${p.missingForStage.join(", ")}.` : `Checklist complete. Approve ${p.stageLabel} to move on.`, p.stage_due ? `Due ${new Date(p.stage_due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : null, false);
        }
      }
      if ((isLeader || user.role === "admin" || isPartnerOrAdmin) && p.effectiveHealth === "off_track") {
        add(p, "red", `Off track: ${p.healthReasons[0]?.text || "needs attention"}`, `Product Owner: ${p.poc_name || "not assigned"}.`, "Review", true);
      }
      if (isLeader && p.stage === "pilot" && p.pilot_end && new Date(p.pilot_end) - Date.now() < 14 * 86400000) {
        add(p, "review", "Pilot result and decision coming up", `Pilot ends ${new Date(p.pilot_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. The Product Owner records the decision; you review it.`, "Review", false);
      }
    }

    if (user.role === "admin") {
      const { rows: ready } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM ideas i WHERE i.selected_for_build_at IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type='idea' AND s.source_id=i.id)
             AND NOT EXISTS (SELECT 1 FROM build_ready_decisions d WHERE d.source_type='idea' AND d.source_id=i.id AND d.action='decline'))
          +
          (SELECT COUNT(*) FROM rise_applications a WHERE a.decision='selected_for_pilot'
             AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type='rise_application' AND s.source_id=a.id)
             AND NOT EXISTS (SELECT 1 FROM build_ready_decisions d WHERE d.source_type='rise_application' AND d.source_id=a.id AND d.action='decline'))
          AS n`);
      const n = Number(ready[0]?.n || 0);
      if (n) add(null, "ready", `${n} selected item${n === 1 ? "" : "s"} ready to become projects`, "Open Admin → Ready for Build to review and create.", null, false);
      const { rows: dr } = await pool.query("SELECT COUNT(*) AS n FROM build_delete_requests WHERE status = 'pending'");
      const d = Number(dr[0]?.n || 0);
      if (d) add(null, "delete", `${d} delete request${d === 1 ? "" : "s"} from Client Partners`, "Open Admin → Delete requests to approve or decline.", null, false);
    }

    const { rows: feed } = await pool.query(
      `SELECT n.id, n.message, n.created_at, n.read_at, n.project_id, p.code AS project_code
       FROM build_notifications n LEFT JOIN build_projects p ON p.id = n.project_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 8`,
      [user.id]
    );

    const mine = projects.filter((p) => {
      if (user.role === "client_poc") return Number(p.poc_user_id) === Number(user.id);
      if (["junior_employee", "startup_poc"].includes(user.role)) return Number(p.owner_user_id) === Number(user.id);
      return true;
    }).slice(0, 8);

    res.json({
      tiles: {
        todo: todos.filter((t) => ["stage", "update", "ready", "delete"].includes(t.kind)).length,
        overdue: todos.filter((t) => t.kind === "update").length,
        redAmber: live.filter((p) => ["off_track", "at_risk"].includes(p.effectiveHealth)).length,
        projects: live.length,
        internal: live.filter((p) => p.type === "internal").length,
        startup: live.filter((p) => p.type === "startup").length,
      },
      todos,
      feed,
      mine: mine.map((p) => ({
        id: p.id, code: p.code, title: p.title, type: p.type, stageLabel: p.stageLabel, stageStep: p.stageStep,
        stageCount: p.stageCount, stagePct: p.stagePct, effectiveHealth: p.effectiveHealth, status: p.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STATUS UPDATES
   ========================================================================= */

// POST /api/build/projects/:id/updates
//   { health, progress, nextSteps, blockers?, needsHelp?, pctComplete?, agreedWithUserId?, kpiActual?, actualCost? }
router.post("/projects/:id/updates", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (!canAddUpdate(req.user, project, assigned)) return res.status(403).json({ error: "You can't add an update to this project." });

    const { health, progress, nextSteps, blockers, needsHelp, pctComplete, agreedWithUserId, kpiActual, actualCost } = req.body || {};
    if (!["on_track", "at_risk", "off_track"].includes(health)) return res.status(400).json({ error: "Pick a health: On track, At risk or Off track." });
    if (!progress || !String(progress).trim()) return res.status(400).json({ error: "\"What moved since the last update\" is required." });
    if (!nextSteps || !String(nextSteps).trim()) return res.status(400).json({ error: "Next steps is required." });
    if (pctComplete != null && pctComplete !== "" && (Number(pctComplete) < 0 || Number(pctComplete) > 100)) return res.status(400).json({ error: "% complete must be between 0 and 100." });

    const { rows } = await pool.query(
      `INSERT INTO build_updates (project_id, health, progress, next_steps, blockers, needs_help, pct_complete, by_user_id, agreed_with_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [project.id, health, String(progress).trim(), String(nextSteps).trim(), (blockers || "").trim() || null,
        !!needsHelp, pctComplete === "" || pctComplete == null ? null : Number(pctComplete), req.user.id, Number(agreedWithUserId) || null]
    );
    const update = rows[0];
    await pool.query("UPDATE build_projects SET health = $1, updated_at = now() WHERE id = $2", [health, project.id]);

    if (kpiActual != null && kpiActual !== "") {
      await pool.query("INSERT INTO build_kpi_readings (project_id, value, update_id) VALUES ($1,$2,$3)", [project.id, Number(kpiActual), update.id]);
    }
    if (actualCost != null && actualCost !== "" && canEditRoi(req.user, project, assigned) && !isClientLeaderOf(req.user, project)) {
      await pool.query("INSERT INTO build_metrics (project_id) VALUES ($1) ON CONFLICT (project_id) DO NOTHING", [project.id]);
      await pool.query("UPDATE build_metrics SET actual_cost = $2, updated_at = now() WHERE project_id = $1", [project.id, Number(actualCost)]);
    }

    // "Needs leadership help" always alerts, even if the project was already red.
    if (needsHelp) {
      const recipients = await recipientsForProject(project, ["client", "admins"]);
      await notifyBuild(recipients, {
        projectId: project.id, projectCode: project.code, kind: "needs_help",
        message: `${project.code} needs leadership help.`,
        subject: `RIOS Build: ${project.code} needs leadership help`,
        heading: "A project needs leadership help",
        body: `${project.title} (${project.code}) has asked for leadership help.${blockers ? " Blocker: " + blockers : ""}`,
      });
    }
    // Red alert (once per turn to red) from any rule or the pick above.
    await loadEnrichedProject(project.id, req.user);

    res.status(201).json({ update });
  } catch (err) {
    next(err);
  }
});

// PUT /api/build/updates/:id -- fix a typo within 24h.
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
    const { rows: outRows } = await pool.query(
      `UPDATE build_updates SET progress = COALESCE($1, progress), next_steps = COALESCE($2, next_steps),
         blockers = $3, pct_complete = COALESCE($4, pct_complete), edited_at = now()
       WHERE id = $5 RETURNING *`,
      [progress?.trim() || null, nextSteps?.trim() || null, (blockers ?? update.blockers) || null, pctComplete ?? null, update.id]
    );
    res.json({ update: outRows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/build/updates/:id -- RIV Admin only.
router.delete("/updates/:id", async (req, res, next) => {
  try {
    if (!canDelete(req.user)) return res.status(403).json({ error: "Only RIV Admin can delete. Use \"Request delete\" instead." });
    await pool.query("DELETE FROM build_updates WHERE id = $1", [req.params.id]);
    await pool.query("UPDATE build_delete_requests SET status = 'approved', decided_by = $2, decided_at = now() WHERE target_type = 'update' AND target_id = $1 AND status = 'pending'", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STAGE ACTIONS -- the Product Owner completes and approves each stage.
   ========================================================================= */

async function recordStageHistory(projectId, fromStage, toStage, action, reason, userId) {
  await pool.query(
    `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, reason, by_user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [projectId, fromStage, toStage, action, reason || null, userId]
  );
}

async function moveStage(projectId, to) {
  await pool.query("UPDATE build_projects SET stage = $1, stage_entered_at = now(), stage_due = NULL, updated_at = now() WHERE id = $2", [to, projectId]);
}

async function notifyStage(project, to, message, body) {
  const recipients = await recipientsForProject(project, ["owner", "poc", "client", "riv_manager"]);
  await notifyBuild(recipients, {
    projectId: project.id, projectCode: project.code, kind: "stage_changed",
    message, subject: `RIOS Build: ${message}`, heading: "A project moved stage", body,
  });
}

// POST /api/build/projects/:id/advance { reason? } -- complete the current stage.
router.post("/projects/:id/advance", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")} and can't move on.` });
    if (project.stage === "pilot") return res.status(400).json({ error: "Use the Pilot decision (Scale, Iterate or Stop) to move on from Pilot." });
    if (project.stage === "closed") return res.status(400).json({ error: "This project has already reached Closed." });
    if (!canApproveGate(req.user, project, gateApprovers(project.type, project.stage), assigned)) {
      return res.status(403).json({ error: "Only the Product Owner (or RIV Admin) can complete this stage." });
    }
    const missing = missingFieldsForStage(project.type, project.stage, project, project.metrics);
    if (missing.length) return res.status(400).json({ error: `Fill in before moving on: ${missing.join(", ")}` });

    const to = nextStage(project.type, project.stage);
    await moveStage(project.id, to);
    await recordStageHistory(project.id, project.stage, to, "advance", req.body?.reason, req.user.id);
    await notifyStage(project, to, `${project.code} moved to ${STAGE_LABELS[to]}`, `${project.title} (${project.code}) moved from ${STAGE_LABELS[project.stage]} to ${STAGE_LABELS[to]}.`);
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/send-back { reason, toStage? }
router.post("/projects/:id/send-back", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")}.` });
    const { reason, toStage } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to send a project back a stage." });
    if (!canSendBack(req.user, project, gateApprovers(project.type, project.stage), assigned)) return res.status(403).json({ error: "Only the Product Owner (or RIV Admin) can send this back." });

    const target = toStage && isValidStage(project.type, toStage) ? toStage : prevStage(project.type, project.stage);
    if (!target || STAGES[project.type].indexOf(target) >= STAGES[project.type].indexOf(project.stage)) {
      return res.status(400).json({ error: "Can't send back to that stage." });
    }
    await moveStage(project.id, target);
    await recordStageHistory(project.id, project.stage, target, "send_back", reason, req.user.id);
    await notifyStage(project, target, `${project.code} sent back to ${STAGE_LABELS[target]}`, `${project.title} (${project.code}) was sent back from ${STAGE_LABELS[project.stage]} to ${STAGE_LABELS[target]}. Reason: ${reason}`);
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/pilot-decision { decision: 'scale'|'iterate'|'stop', iterateTo?, reason }
// Recorded by the Product Owner; the Client Leader is notified to review.
router.post("/projects/:id/pilot-decision", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (project.stage !== "pilot") return res.status(400).json({ error: "This project isn't in Pilot." });
    if (project.status !== "active") return res.status(400).json({ error: `Project is ${project.status.replace("_", " ")}.` });
    if (!canApproveGate(req.user, project, gateApprovers(project.type, "pilot"), assigned)) {
      return res.status(403).json({ error: "Only the Product Owner (or RIV Admin) records the pilot decision." });
    }
    const { decision, iterateTo, reason } = req.body || {};
    if (!["scale", "iterate", "stop"].includes(decision)) return res.status(400).json({ error: "Decision must be Scale, Iterate or Stop." });
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "Give a reason for the pilot decision." });

    let label;
    if (decision === "scale") {
      const missing = missingFieldsForStage(project.type, "pilot", project, project.metrics);
      if (missing.length) return res.status(400).json({ error: `Fill in before moving on: ${missing.join(", ")}` });
      await moveStage(project.id, "production");
      await recordStageHistory(project.id, "pilot", "production", "advance", `Pilot decision: Scale. ${reason}`, req.user.id);
      label = "Scale → Production";
    } else if (decision === "iterate") {
      const target = ["design", "build"].includes(iterateTo) ? iterateTo : "build";
      await moveStage(project.id, target);
      await recordStageHistory(project.id, "pilot", target, "iterate", reason, req.user.id);
      label = `Iterate → back to ${STAGE_LABELS[target]}`;
    } else {
      await pool.query("UPDATE build_projects SET status = 'stopped', hold_reason = $1, updated_at = now() WHERE id = $2", [reason, project.id]);
      await recordStageHistory(project.id, "pilot", "pilot", "stop", `Pilot decision: Stop. ${reason}`, req.user.id);
      label = "Stop";
    }

    const recipients = await recipientsForProject(project, ["owner", "poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "pilot_decision",
      message: `${project.code}: pilot decision recorded: ${label}. Please review.`,
      subject: `RIOS Build: ${project.code} pilot decision: ${label}`,
      heading: "A pilot decision was recorded",
      body: `${project.title} (${project.code}): the Product Owner recorded the pilot decision "${label}". Reason: ${reason}`,
    });
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/hold { reason } -- Product Owner or RIV Admin.
router.post("/projects/:id/hold", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project } = loaded;
    if (project.status !== "active") return res.status(400).json({ error: "Only an active project can be put on hold." });
    if (!canHoldOrStop(req.user, project)) return res.status(403).json({ error: "Only the Product Owner or RIV Admin can put a project on hold." });
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to put a project on hold." });
    await pool.query("UPDATE build_projects SET status = 'on_hold', hold_reason = $1, updated_at = now() WHERE id = $2", [String(reason).trim(), project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "hold", reason, req.user.id);
    const recipients = await recipientsForProject(project, ["owner", "poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} put on hold.`, subject: `RIOS Build: ${project.code} on hold`,
      heading: "A project was put on hold", body: `${project.title} (${project.code}) was put on hold. Reason: ${reason}`,
    });
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/resume
router.post("/projects/:id/resume", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project } = loaded;
    if (project.status !== "on_hold") return res.status(400).json({ error: "Only a project on hold can be resumed." });
    if (!canHoldOrStop(req.user, project)) return res.status(403).json({ error: "Only the Product Owner or RIV Admin can resume a project." });
    await pool.query("UPDATE build_projects SET status = 'active', hold_reason = NULL, updated_at = now() WHERE id = $1", [project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "resume", null, req.user.id);
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/stop { reason }
router.post("/projects/:id/stop", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project } = loaded;
    if (!["active", "on_hold"].includes(project.status)) return res.status(400).json({ error: "This project can't be stopped from its current status." });
    if (!canHoldOrStop(req.user, project)) return res.status(403).json({ error: "Only the Product Owner or RIV Admin can stop a project." });
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A reason is required to stop a project." });
    await pool.query("UPDATE build_projects SET status = 'stopped', hold_reason = $1, updated_at = now() WHERE id = $2", [reason, project.id]);
    await recordStageHistory(project.id, project.stage, project.stage, "stop", reason, req.user.id);
    const recipients = await recipientsForProject(project, ["owner", "poc", "client", "riv_manager", "admins"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "stage_changed",
      message: `${project.code} stopped.`, subject: `RIOS Build: ${project.code} stopped`,
      heading: "A project was stopped", body: `${project.title} (${project.code}) was stopped. Reason: ${reason}`,
    });
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/build/projects/:id/close { outcome: 'scaled'|'stopped' } -- RIV Admin only.
router.post("/projects/:id/close", async (req, res, next) => {
  try {
    if (!canClose(req.user)) return res.status(403).json({ error: "Only RIV Admin can close a project." });
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project } = loaded;
    if (!["active", "stopped"].includes(project.status)) return res.status(400).json({ error: "This project can't be closed from its current status." });
    const { outcome } = req.body || {};
    if (!["scaled", "stopped"].includes(outcome)) return res.status(400).json({ error: "Outcome must be Scaled or Stopped." });
    if (outcome === "scaled" && project.stage !== "closed") return res.status(400).json({ error: "A project can only be closed as Scaled once Production is complete (stage Closed)." });
    const { rows: lessonRows } = await pool.query("SELECT 1 FROM build_lessons WHERE project_id = $1", [project.id]);
    if (!lessonRows.length) return res.status(400).json({ error: "Add lessons learned first." });

    await pool.query(
      "UPDATE build_projects SET status = 'closed', outcome = $1, stage = 'closed', closed_at = now(), updated_at = now() WHERE id = $2",
      [outcome, project.id]
    );
    await recordStageHistory(project.id, project.stage, "closed", "close", `Closed as ${outcome}`, req.user.id);
    const recipients = await recipientsForProject(project, ["owner", "poc", "client", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "closed",
      message: `${project.code} closed (${outcome}).`, subject: `RIOS Build: ${project.code} closed`,
      heading: "A project was closed", body: `${project.title} (${project.code}) was closed with outcome: ${outcome}.`,
    });
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   STAGE DETAILS -- the fields each stage's checklist looks at.
   ========================================================================= */

// PUT /api/build/projects/:id/details -- Product Owner, Client Partner, RIV Admin.
router.put("/projects/:id/details", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (!canEditDetails(req.user, project, assigned)) return res.status(403).json({ error: "You can't edit this project's details." });

    const body = req.body || {};
    const fields = {
      title: body.title,
      description: body.description,
      target_end: body.targetEnd,
      stage_due: body.stageDue,
      kpi_baseline_note: body.kpiBaselineNote,
      nda_signed_at: body.ndaSignedAt,
      proposal_value: body.proposalValue,
      proposal_accepted_at: body.proposalAcceptedAt,
      po_number: body.poNumber,
      po_value: body.poValue,
      po_date: body.poDate,
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
    if (fields.title !== undefined && !String(fields.title || "").trim()) return res.status(400).json({ error: "Title can't be empty." });
    const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "Nothing to update." });
    const clean = (v) => (v === "" ? null : v);
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await pool.query(`UPDATE build_projects SET ${setClause}, updated_at = now() WHERE id = $1`, [project.id, ...cols.map((c) => clean(fields[c]))]);
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   ROI
   ========================================================================= */
router.put("/projects/:id/metrics", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (!canEditRoi(req.user, project, assigned)) return res.status(403).json({ error: "You can't edit this project's ROI figures." });

    const leaderOnly = isClientLeaderOf(req.user, project) && !canEditDetails(req.user, project, assigned);
    const body = req.body || {};
    const fields = leaderOnly
      ? { realised_benefit: body.realisedBenefit }
      : {
          kpi_name: body.kpiName, kpi_unit: body.kpiUnit, baseline: body.baseline, target: body.target,
          currency: body.currency, est_cost: body.estCost, actual_cost: body.actualCost,
          est_benefit: body.estBenefit, realised_benefit: body.realisedBenefit,
        };
    const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (!cols.length) return res.status(400).json({ error: "Nothing to update." });
    const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await pool.query("INSERT INTO build_metrics (project_id) VALUES ($1) ON CONFLICT (project_id) DO NOTHING", [project.id]);
    await pool.query(`UPDATE build_metrics SET ${setClause}, updated_at = now() WHERE project_id = $1`, [project.id, ...cols.map((c) => (fields[c] === "" ? null : fields[c]))]);
    res.json({ project: await reloadOut(project.id, req.user) });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   LESSONS LEARNED
   ========================================================================= */
router.put("/projects/:id/lessons", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
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
   FILES
   ========================================================================= */
router.post("/projects/:id/files", upload.single("file"), async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (!canAddUpdate(req.user, project, assigned)) return res.status(403).json({ error: "You can't attach files to this project." });
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
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project } = loaded;
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

// DELETE /api/build/projects/:id/files/:fileId -- RIV Admin only.
router.delete("/projects/:id/files/:fileId", async (req, res, next) => {
  try {
    if (!canDelete(req.user)) return res.status(403).json({ error: "Only RIV Admin can delete. Use \"Request delete\" instead." });
    await pool.query("DELETE FROM build_files WHERE id = $1 AND project_id = $2", [req.params.fileId, req.params.id]);
    await pool.query("UPDATE build_delete_requests SET status = 'approved', decided_by = $2, decided_at = now() WHERE target_type = 'file' AND target_id = $1 AND status = 'pending'", [req.params.fileId, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   DELETE REQUESTS -- a RIV Client Partner asks; RIV Admin decides
   (admin side lives in buildAdmin.js).
   ========================================================================= */

// POST /api/build/projects/:id/delete-requests { targetType: 'file'|'update', targetId, reason }
router.post("/projects/:id/delete-requests", async (req, res, next) => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { project, assigned } = loaded;
    if (!canRequestDelete(req.user, project, assigned)) return res.status(403).json({ error: "Only a RIV Client Partner on this project can request a delete." });
    const { targetType, targetId, reason } = req.body || {};
    if (!["file", "update"].includes(targetType)) return res.status(400).json({ error: "You can request a delete for a file or a status update." });
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "Say why it should be deleted." });
    const table = targetType === "file" ? "build_files" : "build_updates";
    const labelCol = targetType === "file" ? "file_name" : "progress";
    const { rows: target } = await pool.query(`SELECT id, ${labelCol} AS label FROM ${table} WHERE id = $1 AND project_id = $2`, [Number(targetId), project.id]);
    if (!target[0]) return res.status(404).json({ error: "That item isn't on this project." });
    const { rows: dup } = await pool.query("SELECT 1 FROM build_delete_requests WHERE target_type = $1 AND target_id = $2 AND status = 'pending'", [targetType, target[0].id]);
    if (dup.length) return res.status(409).json({ error: "A delete request for this is already waiting for RIV Admin." });
    const label = targetType === "file" ? target[0].label : `Status update: ${String(target[0].label || "").slice(0, 60)}`;
    const { rows } = await pool.query(
      `INSERT INTO build_delete_requests (project_id, target_type, target_id, target_label, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [project.id, targetType, target[0].id, label, String(reason).trim(), req.user.id]
    );
    const { rows: admins } = await pool.query("SELECT id, email, name FROM users WHERE role = 'admin'");
    await notifyBuild(admins, {
      projectId: project.id, projectCode: project.code, kind: "delete_request",
      message: `${req.user.name || "A Client Partner"} asks to delete "${label}" on ${project.code}.`,
      subject: `RIOS Build: delete request on ${project.code}`,
      heading: "A Client Partner asked for a delete",
      body: `${req.user.name || "A Client Partner"} asks to delete "${label}" on ${project.title} (${project.code}). Reason: ${reason}`,
    });
    res.status(201).json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   NOTIFICATIONS
   ========================================================================= */
router.get("/notifications", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, p.code AS project_code, p.title AS project_title
       FROM build_notifications n LEFT JOIN build_projects p ON p.id = n.project_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: rows });
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
