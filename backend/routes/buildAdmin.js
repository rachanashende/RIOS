// Build.RIV -- RIV Admin console (workflow v2, Oct 2026): the Ready for
// Build list, creating projects with their people, managing Product Owner
// / RIV Client Partner / Startup POC logins, delete requests from Client
// Partners, the re-assess loop and the overdue digest.
//
// RIV Admin only. A RIV Client Partner has no Admin menu and asks RIV
// Admin for anything here (create, assign, delete).
import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS } from "../lib/scoring.js";
import { STAGES } from "../lib/buildWorkflow.js";
import { notifyBuild, recipientsForProject } from "../lib/buildNotify.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

const clean = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

// Every *Id field comes straight from request input; toId() turns anything
// that isn't a clean positive integer into null so routes can reject it
// with a normal 400 instead of a raw Postgres error.
function toId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function nextCode() {
  const { rows } = await pool.query("SELECT nextval('build_project_code_seq') AS n");
  return `BLD-${String(rows[0].n).padStart(4, "0")}`;
}

// Admin-only router, so every client is in scope. Kept as a function so
// the re-assess routes below read the same as before.
async function assertClientInScope() {
  return true;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Checks the people picked for a project belong to that client and have
// the right role. Returns the cleaned ids.
async function validatePeople(clientId, { pocUserId, ownerUserId, rivManagerId }, ownerRole) {
  if (pocUserId) {
    const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client_poc' AND client_id = $2", [pocUserId, clientId]);
    if (!rows.length) throw httpError(400, "The Product Owner must be a Product Owner login of this client.");
  }
  if (ownerUserId) {
    const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = $2 AND client_id = $3", [ownerUserId, ownerRole, clientId]);
    if (!rows.length) throw httpError(400, ownerRole === "startup_poc" ? "The Startup POC must be a Startup POC login for this client." : "The Employee must be an employee login of this client.");
  }
  if (rivManagerId) {
    const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'riv_manager'", [rivManagerId]);
    if (!rows.length) throw httpError(400, "The RIV Client Partner must be a RIV Client Partner login.");
  }
}

// Creates a Startup POC login inline (from the Create project form).
async function createStartupPocLogin(clientId, { name, email, password, company }) {
  if (!name || !email || !password) throw httpError(400, "Startup POC name, email and a temporary password are required.");
  if (String(password).length < 8) throw httpError(400, "The temporary password must be at least 8 characters.");
  const normalizedEmail = String(email).toLowerCase().trim();
  const { rows: existing } = await pool.query("SELECT id, role, client_id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.length) {
    if (existing[0].role === "startup_poc" && Number(existing[0].client_id) === Number(clientId)) return existing[0].id;
    throw httpError(409, "A user with that email already exists.");
  }
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, company, client_id, must_change_password)
     VALUES ($1,$2,$3,'startup_poc',$4,$5,true) RETURNING id`,
    [normalizedEmail, bcrypt.hashSync(password, 10), String(name).trim(), clean(company), clientId]
  );
  return rows[0].id;
}

async function insertProject({ code, type, title, description, clientId, ownerUserId, pocUserId, rivManagerId, targetEnd, createdBy }) {
  const stage = STAGES[type][0];
  const { rows } = await pool.query(
    `INSERT INTO build_projects (code, type, title, description, client_id, owner_user_id, poc_user_id, riv_manager_id, stage, stage_entered_at, target_end, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11) RETURNING *`,
    [code, type, title, description, clientId, ownerUserId, pocUserId, rivManagerId, stage, targetEnd, createdBy]
  );
  const project = rows[0];
  await pool.query(
    `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, reason, by_user_id) VALUES ($1,NULL,$2,'advance','Project created',$3)`,
    [project.id, stage, createdBy]
  );
  return project;
}

async function notifyCreated(project, sourceLine) {
  const recipients = await recipientsForProject(project, ["owner", "poc", "riv_manager", "client"]);
  await notifyBuild(recipients, {
    projectId: project.id, projectCode: project.code, kind: "created",
    message: `${project.code} "${project.title}" was created${sourceLine ? ` ${sourceLine}` : ""}. It starts in Requirements.`,
    subject: `RIOS Build: ${project.code} created`,
    heading: "A new Build project was created",
    body: `${project.title} (${project.code}) was created${sourceLine ? ` ${sourceLine}` : ""} and starts in Requirements. Log in to RIOS Build to see your first steps.`,
  });
}

function validateQuestion(questionId) {
  const qid = toId(questionId);
  if (!qid) return null;
  if (!QUESTIONS.find((q) => q.id === qid)) throw httpError(400, "That audit question doesn't exist.");
  return qid;
}

/* =========================================================================
   PEOPLE PICKERS for the Create project form
   ========================================================================= */

// GET /api/admin/build/people?clientId= -- Product Owners, Employees and
// Startup POCs of a client, plus every RIV Client Partner.
router.get("/people", async (req, res, next) => {
  try {
    const clientId = toId(req.query.clientId);
    if (!clientId) return res.status(400).json({ error: "clientId is required." });
    const { rows } = await pool.query(
      `SELECT id, name, email, role FROM users
       WHERE (client_id = $1 AND role IN ('client_poc','junior_employee','startup_poc')) OR role = 'riv_manager'
       ORDER BY name`,
      [clientId]
    );
    const { rows: leader } = await pool.query("SELECT id, name, email, company FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    res.json({
      clientLeader: leader[0] || null,
      productOwners: rows.filter((r) => r.role === "client_poc"),
      employees: rows.filter((r) => r.role === "junior_employee"),
      startupPocs: rows.filter((r) => r.role === "startup_poc"),
      partners: rows.filter((r) => r.role === "riv_manager"),
    });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   READY FOR BUILD -- selected Ideathon winners and startups that aren't
   projects yet. Filled automatically; nobody types an ID.
   ========================================================================= */

// GET /api/admin/build/ready
router.get("/ready", async (req, res, next) => {
  try {
    const { rows: ideas } = await pool.query(`
      SELECT i.id, i.title, i.description, i.question_id, i.selected_for_build_at AS selected_at,
             i.submitted_by AS author_id, au.name AS author_name,
             i.source_client_id AS client_id, c.company AS client_company, c.name AS client_name,
             (SELECT AVG(score) FROM idea_ratings r WHERE r.idea_id = i.id) AS avg_score,
             d.action AS decision, d.until_date, d.reason AS decision_reason
      FROM ideas i
      LEFT JOIN users au ON au.id = i.submitted_by
      LEFT JOIN users c ON c.id = i.source_client_id
      LEFT JOIN build_ready_decisions d ON d.source_type = 'idea' AND d.source_id = i.id
      WHERE i.selected_for_build_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type = 'idea' AND s.source_id = i.id)
        AND (d.action IS NULL OR d.action = 'defer')
      ORDER BY i.selected_for_build_at ASC`);
    const { rows: apps } = await pool.query(`
      SELECT a.id, a.startup_name, a.founder_name, a.email, a.website, a.sector, a.stage AS startup_stage, a.pitch,
             a.decided_at AS selected_at, o.client_id, c.company AS client_company, c.name AS client_name,
             (SELECT AVG(total) FROM rise_scores r WHERE r.application_id = a.id) AS avg_score,
             d.action AS decision, d.until_date, d.reason AS decision_reason
      FROM rise_applications a
      LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
      LEFT JOIN users c ON c.id = o.client_id
      LEFT JOIN build_ready_decisions d ON d.source_type = 'rise_application' AND d.source_id = a.id
      WHERE a.decision = 'selected_for_pilot'
        AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type = 'rise_application' AND s.source_id = a.id)
        AND (d.action IS NULL OR d.action = 'defer')
      ORDER BY a.decided_at ASC NULLS LAST`);

    const days = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : null);
    const items = [
      ...ideas.map((i) => {
        const q = QUESTIONS.find((x) => x.id === Number(i.question_id));
        return {
          sourceType: "idea", sourceId: i.id, workflow: "internal",
          title: i.title, description: i.description, subtitle: `Idea by ${i.author_name || "an employee"}`,
          authorId: i.author_id, authorName: i.author_name,
          clientId: i.client_id, clientName: i.client_company || i.client_name,
          selectedAt: i.selected_at, waitingDays: days(i.selected_at),
          score: i.avg_score != null ? Number(Number(i.avg_score).toFixed(1)) : null,
          questionId: i.question_id, questionLabel: q ? `${q.submodule} (${q.module})` : null,
          deferredUntil: i.decision === "defer" ? i.until_date : null, deferReason: i.decision === "defer" ? i.decision_reason : null,
        };
      }),
      ...apps.map((a) => ({
        sourceType: "rise_application", sourceId: a.id, workflow: "startup",
        title: a.startup_name, description: a.pitch, subtitle: `RISE-${String(a.id).padStart(5, "0")} · founder ${a.founder_name}`,
        reference: `RISE-${String(a.id).padStart(5, "0")}`,
        founderName: a.founder_name, founderEmail: a.email, sector: a.sector,
        clientId: a.client_id, clientName: a.client_company || a.client_name,
        selectedAt: a.selected_at, waitingDays: days(a.selected_at),
        score: a.avg_score != null ? Number(Number(a.avg_score).toFixed(1)) : null,
        deferredUntil: a.decision === "defer" ? a.until_date : null, deferReason: a.decision === "defer" ? a.decision_reason : null,
      })),
    ].sort((x, y) => (y.waitingDays || 0) - (x.waitingDays || 0));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/ready/:sourceType/:sourceId/not-now { action: 'defer'|'decline', untilDate?, reason }
router.post("/ready/:sourceType/:sourceId/not-now", async (req, res, next) => {
  try {
    const sourceType = req.params.sourceType;
    const sourceId = toId(req.params.sourceId);
    if (!["idea", "rise_application"].includes(sourceType) || !sourceId) return res.status(400).json({ error: "Unknown item." });
    const { action, untilDate, reason } = req.body || {};
    if (!["defer", "decline"].includes(action)) return res.status(400).json({ error: "Choose Defer or Decline." });
    if (!clean(reason)) return res.status(400).json({ error: "Give a reason." });
    if (action === "defer" && !untilDate) return res.status(400).json({ error: "Pick the date to come back to it." });
    await pool.query(
      `INSERT INTO build_ready_decisions (source_type, source_id, action, until_date, reason, by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (source_type, source_id) DO UPDATE SET action = EXCLUDED.action, until_date = EXCLUDED.until_date,
         reason = EXCLUDED.reason, by_user_id = EXCLUDED.by_user_id, at = now()`,
      [sourceType, sourceId, action, action === "defer" ? untilDate : null, clean(reason), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/build/ready/:sourceType/:sourceId/not-now -- undo a defer.
router.delete("/ready/:sourceType/:sourceId/not-now", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM build_ready_decisions WHERE source_type = $1 AND source_id = $2", [req.params.sourceType, toId(req.params.sourceId)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   PROJECT CREATION -- always with its people.
   Internal: Client Leader (the client account) + Product Owner + Employee
   (+ RIV Client Partner). Startup: Client Leader + Product Owner + Startup
   POC (+ RIV Client Partner).
   ========================================================================= */

// POST /api/admin/build/projects -- manual creation (an idea or startup
// that didn't come through RIOS).
//   { type, title, description?, clientId, pocUserId, ownerUserId?, rivManagerId?, targetEnd,
//     questionId?, startupPoc?: { name, email, password, company } }
router.post("/projects", async (req, res, next) => {
  try {
    const { type, title, description, targetEnd } = req.body || {};
    const clientId = toId(req.body?.clientId);
    const pocUserId = toId(req.body?.pocUserId);
    let ownerUserId = toId(req.body?.ownerUserId);
    const rivManagerId = toId(req.body?.rivManagerId);
    if (!["internal", "startup"].includes(type)) return res.status(400).json({ error: "Choose Internal idea or Startup pilot." });
    if (!clean(title)) return res.status(400).json({ error: "Title is required." });
    if (!clientId) return res.status(400).json({ error: "Choose the client." });
    if (!pocUserId) return res.status(400).json({ error: "Choose the Product Owner." });
    if (!targetEnd) return res.status(400).json({ error: "Target end date is required." });
    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const questionId = validateQuestion(req.body?.questionId);

    if (type === "startup" && !ownerUserId && req.body?.startupPoc) {
      ownerUserId = await createStartupPocLogin(clientId, req.body.startupPoc);
    }
    await validatePeople(clientId, { pocUserId, ownerUserId, rivManagerId }, type === "startup" ? "startup_poc" : "junior_employee");

    const project = await insertProject({
      code: await nextCode(), type, title: clean(title), description: clean(description),
      clientId, ownerUserId, pocUserId, rivManagerId, targetEnd, createdBy: req.user.id,
    });
    await pool.query("INSERT INTO build_project_sources (project_id, source_type, source_id, question_id) VALUES ($1,'manual',NULL,$2)", [project.id, questionId]);
    await notifyCreated(project, "by RIV Admin");
    res.status(201).json({ project });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/admin/build/from-idea/:ideaId
//   { pocUserId, ownerUserId? (defaults to the idea's author), rivManagerId?, targetEnd, title?, questionId? }
router.post("/from-idea/:ideaId", async (req, res, next) => {
  try {
    const { rows: ideaRows } = await pool.query("SELECT * FROM ideas WHERE id = $1", [req.params.ideaId]);
    const idea = ideaRows[0];
    if (!idea) return res.status(404).json({ error: "Idea not found." });
    if (!idea.selected_for_build_at) return res.status(400).json({ error: "This idea hasn't been selected for Build yet." });
    if (!idea.source_client_id) return res.status(400).json({ error: "This idea has no client to attach the project to." });
    const { rows: existing } = await pool.query(
      "SELECT p.code FROM build_project_sources s JOIN build_projects p ON p.id = s.project_id WHERE s.source_type = 'idea' AND s.source_id = $1",
      [idea.id]
    );
    if (existing.length) return res.status(409).json({ error: `Already in Build as ${existing[0].code}.` });

    const clientId = idea.source_client_id;
    const pocUserId = toId(req.body?.pocUserId);
    const ownerUserId = toId(req.body?.ownerUserId) || idea.submitted_by;
    const rivManagerId = toId(req.body?.rivManagerId);
    const targetEnd = req.body?.targetEnd;
    if (!pocUserId) return res.status(400).json({ error: "Choose the Product Owner." });
    if (!targetEnd) return res.status(400).json({ error: "Target end date is required." });
    // The idea's own author is always allowed as the Employee, even if their
    // login predates per-client employee accounts (client_id not set).
    await validatePeople(clientId, { pocUserId, ownerUserId: ownerUserId === idea.submitted_by ? null : ownerUserId, rivManagerId }, "junior_employee");
    const questionId = validateQuestion(req.body?.questionId) || idea.question_id;

    const project = await insertProject({
      code: await nextCode(), type: "internal", title: clean(req.body?.title) || idea.title, description: idea.description,
      clientId, ownerUserId, pocUserId, rivManagerId, targetEnd, createdBy: req.user.id,
    });
    await pool.query("INSERT INTO build_project_sources (project_id, source_type, source_id, question_id) VALUES ($1,'idea',$2,$3)", [project.id, idea.id, questionId]);
    await pool.query("DELETE FROM build_ready_decisions WHERE source_type = 'idea' AND source_id = $1", [idea.id]);
    await notifyCreated(project, "from your Ideathon winner");
    res.status(201).json({ project });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/admin/build/from-application/:applicationId
//   { pocUserId, rivManagerId?, targetEnd, title?, questionId?, clientId? (only if the call has none),
//     ownerUserId? (existing Startup POC) | startupPoc?: { name, email, password } }
router.post("/from-application/:applicationId", async (req, res, next) => {
  try {
    const { rows: appRows } = await pool.query(
      `SELECT a.*, o.client_id AS opportunity_client_id
       FROM rise_applications a LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
       WHERE a.id = $1`,
      [req.params.applicationId]
    );
    const app = appRows[0];
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.decision !== "selected_for_pilot") return res.status(400).json({ error: "This application hasn't been selected for pilot yet." });
    const clientId = app.opportunity_client_id || toId(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: "This startup call has no client. Set the client on the call first." });
    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const { rows: existing } = await pool.query(
      "SELECT p.code FROM build_project_sources s JOIN build_projects p ON p.id = s.project_id WHERE s.source_type = 'rise_application' AND s.source_id = $1",
      [app.id]
    );
    if (existing.length) return res.status(409).json({ error: `Already in Build as ${existing[0].code}.` });

    const pocUserId = toId(req.body?.pocUserId);
    const rivManagerId = toId(req.body?.rivManagerId);
    const targetEnd = req.body?.targetEnd;
    if (!pocUserId) return res.status(400).json({ error: "Choose the Product Owner." });
    if (!targetEnd) return res.status(400).json({ error: "Target end date is required." });
    let ownerUserId = toId(req.body?.ownerUserId);
    if (!ownerUserId && req.body?.startupPoc) {
      ownerUserId = await createStartupPocLogin(clientId, { company: app.startup_name, ...req.body.startupPoc });
    }
    if (!ownerUserId) return res.status(400).json({ error: "Add the Startup POC (create their login here or pick an existing one)." });
    await validatePeople(clientId, { pocUserId, ownerUserId, rivManagerId }, "startup_poc");
    const questionId = validateQuestion(req.body?.questionId);

    const project = await insertProject({
      code: await nextCode(), type: "startup", title: clean(req.body?.title) || `${app.startup_name}: pilot`, description: app.pitch,
      clientId, ownerUserId, pocUserId, rivManagerId, targetEnd, createdBy: req.user.id,
    });
    await pool.query("INSERT INTO build_project_sources (project_id, source_type, source_id, question_id) VALUES ($1,'rise_application',$2,$3)", [project.id, app.id, questionId]);
    await pool.query("DELETE FROM build_ready_decisions WHERE source_type = 'rise_application' AND source_id = $1", [app.id]);
    await notifyCreated(project, `from startup call RISE-${String(app.id).padStart(5, "0")}`);
    res.status(201).json({ project });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// PUT /api/admin/build/projects/:id/assign { ownerUserId?, pocUserId?, rivManagerId? }
router.put("/projects/:id/assign", async (req, res, next) => {
  try {
    const projectId = toId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project ID." });
    const { rows } = await pool.query("SELECT * FROM build_projects WHERE id = $1", [projectId]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: "Project not found." });
    const ownerUserId = toId(req.body?.ownerUserId);
    const pocUserId = toId(req.body?.pocUserId);
    const rivManagerId = toId(req.body?.rivManagerId);
    await validatePeople(project.client_id, { pocUserId, ownerUserId, rivManagerId }, project.type === "startup" ? "startup_poc" : "junior_employee");
    const { rows: outRows } = await pool.query(
      `UPDATE build_projects SET
         owner_user_id = COALESCE($1, owner_user_id),
         poc_user_id = COALESCE($2, poc_user_id),
         riv_manager_id = COALESCE($3, riv_manager_id),
         updated_at = now()
       WHERE id = $4 RETURNING *`,
      [ownerUserId, pocUserId, rivManagerId, project.id]
    );
    const changed = outRows[0];
    const newPeople = { owner_user_id: ownerUserId, poc_user_id: pocUserId, riv_manager_id: rivManagerId, client_id: null };
    const recipients = await recipientsForProject(newPeople, ["owner", "poc", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: changed.id, projectCode: changed.code, kind: "assigned",
      message: `You were added to ${changed.code} "${changed.title}".`,
      subject: `RIOS Build: you were added to ${changed.code}`,
      heading: "You were added to a Build project",
      body: `RIV Admin added you to ${changed.title} (${changed.code}).`,
    });
    res.json({ project: changed });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/admin/build/projects/:id -- RIV Admin only, permanent.
router.delete("/projects/:id", async (req, res, next) => {
  try {
    const projectId = toId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project ID." });
    const { rows } = await pool.query("DELETE FROM build_projects WHERE id = $1 RETURNING code", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
    res.json({ ok: true, code: rows[0].code });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   DELETE REQUESTS from RIV Client Partners
   ========================================================================= */

// GET /api/admin/build/delete-requests?status=pending
router.get("/delete-requests", async (req, res, next) => {
  try {
    const status = ["pending", "approved", "declined"].includes(req.query.status) ? req.query.status : "pending";
    const { rows } = await pool.query(
      `SELECT r.*, p.code AS project_code, p.title AS project_title, u.name AS requested_by_name, d.name AS decided_by_name
       FROM build_delete_requests r
       JOIN build_projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.requested_by
       LEFT JOIN users d ON d.id = r.decided_by
       WHERE r.status = $1 ORDER BY r.requested_at DESC LIMIT 100`,
      [status]
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/delete-requests/:id { decision: 'approve'|'decline' }
router.put("/delete-requests/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM build_delete_requests WHERE id = $1", [toId(req.params.id)]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status !== "pending") return res.status(400).json({ error: "This request was already decided." });
    const { decision } = req.body || {};
    if (!["approve", "decline"].includes(decision)) return res.status(400).json({ error: "Approve or decline." });
    if (decision === "approve") {
      const table = request.target_type === "file" ? "build_files" : "build_updates";
      await pool.query(`DELETE FROM ${table} WHERE id = $1 AND project_id = $2`, [request.target_id, request.project_id]);
    }
    await pool.query(
      "UPDATE build_delete_requests SET status = $1, decided_by = $2, decided_at = now() WHERE id = $3",
      [decision === "approve" ? "approved" : "declined", req.user.id, request.id]
    );
    if (request.requested_by) {
      const { rows: who } = await pool.query("SELECT id, email, name FROM users WHERE id = $1", [request.requested_by]);
      const { rows: proj } = await pool.query("SELECT code FROM build_projects WHERE id = $1", [request.project_id]);
      await notifyBuild(who, {
        projectId: request.project_id, projectCode: proj[0]?.code, kind: "delete_request",
        message: `Your delete request for "${request.target_label}" was ${decision === "approve" ? "approved" : "declined"}.`,
        subject: `RIOS Build: delete request ${decision === "approve" ? "approved" : "declined"}`,
        heading: "Your delete request was decided",
        body: `RIV Admin ${decision === "approve" ? "approved and deleted" : "declined"} "${request.target_label}" on ${proj[0]?.code || "the project"}.`,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   CLIENT POC + RIV MANAGER LOGINS
   ========================================================================= */

// GET /api/admin/build/poc?clientId=
router.get("/poc", requireRole("admin"), async (req, res, next) => {
  try {
    const where = ["u.role = 'client_poc'"];
    const params = [];
    if (req.query.clientId) { params.push(Number(req.query.clientId)); where.push(`u.client_id = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.client_id, c.company AS client_company, u.created_at
       FROM users u LEFT JOIN users c ON c.id = u.client_id
       WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC`,
      params
    );
    res.json({ pocs: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/poc -- RIV Admin only, same top-down-issued-login
// convention as every other role in RIOS (no self-registration).
router.post("/poc", requireRole("admin"), async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    const clientId = toId(req.body?.clientId);
    if (!email || !password || !name || !clientId) return res.status(400).json({ error: "Name, email, temporary password, and a valid numeric clientId are required." });
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    const { rows: clientRows } = await pool.query("SELECT id, company FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const normalizedEmail = String(email).toLowerCase().trim();
    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company, client_id, must_change_password) VALUES ($1,$2,$3,'client_poc',$4,$5,true) RETURNING id",
      [normalizedEmail, password_hash, String(name).trim(), clientRows[0].company || null, clientRows[0].id]
    );
    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role: "client_poc", clientId: clientRows[0].id });
  } catch (err) {
    next(err);
  }
});

router.delete("/poc/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'client_poc'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   BUILD-SCOPED CLIENT LOGINS -- a Client Leader login issued specifically
   for a Build/Transform engagement. Still role='client' (so it works as
   project.client_id and as Client Leader everywhere Build already checks
   for that role -- see isClientLeaderOf in lib/buildPermissions.js), but
   flagged build_scoped so the frontend shows it only the Build nav item
   and redirects it straight there, and the backend actually refuses the
   audit/scorecard routes (routes/responses.js, routes/export.js) rather
   than just hiding the button. Kept separate from the main site's own
   "Manage Clients" (routes/admin.js POST /clients), which still creates
   ordinary full-access clients exactly as before.
   ========================================================================= */

// GET /api/admin/build/clients -- list build-scoped client logins only.
router.get("/clients", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, company, created_at FROM users
       WHERE role = 'client' AND build_scoped = true ORDER BY created_at DESC`
    );
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/clients -- RIV Admin only, same top-down-issued-login
// convention as every other role in RIOS (no self-registration).
router.post("/clients", requireRole("admin"), async (req, res, next) => {
  try {
    const { email, password, name, company } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: "Name, email, and a temporary password are required." });
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    const normalizedEmail = String(email).toLowerCase().trim();
    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company, build_scoped, must_change_password)
       VALUES ($1,$2,$3,'client',$4,true,true) RETURNING id`,
      [normalizedEmail, password_hash, String(name).trim(), clean(company)]
    );
    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, company: clean(company) });
  } catch (err) {
    next(err);
  }
});

// Guarded by "AND build_scoped = true" so this panel can only ever delete
// a login it (or another admin, through this same endpoint) created --
// never a full-access client from the main site's Manage Clients.
router.delete("/clients/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'client' AND build_scoped = true", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/build/managers -- RIV Manager roster with assigned clients.
router.get("/managers", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.created_at,
             COALESCE(ARRAY_AGG(c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS client_ids,
             COALESCE(ARRAY_AGG(COALESCE(NULLIF(c.company,''), c.name)) FILTER (WHERE c.id IS NOT NULL), '{}') AS client_names
      FROM users u
      LEFT JOIN build_manager_clients mc ON mc.manager_user_id = u.id
      LEFT JOIN users c ON c.id = mc.client_id
      WHERE u.role = 'riv_manager'
      GROUP BY u.id ORDER BY u.created_at DESC
    `);
    res.json({ managers: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/managers", requireRole("admin"), async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: "Name, email, and a temporary password are required." });
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    // clientIds is optional, but anything in it must resolve to a real
    // numeric client ID -- otherwise the INSERT below throws the same raw
    // Postgres integer-syntax error the Client ID text field used to.
    const rawClientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds : [];
    const clientIds = rawClientIds.map(toId);
    if (clientIds.some((id) => id === null)) return res.status(400).json({ error: "Assigned client IDs must all be valid numbers." });
    const normalizedEmail = String(email).toLowerCase().trim();
    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, must_change_password) VALUES ($1,$2,$3,'riv_manager',true) RETURNING id",
      [normalizedEmail, password_hash, String(name).trim()]
    );
    const managerId = rows[0].id;
    if (clientIds.length) {
      const values = clientIds.map((_, i) => `($1,$${i + 2})`).join(",");
      await pool.query(`INSERT INTO build_manager_clients (manager_user_id, client_id) VALUES ${values} ON CONFLICT DO NOTHING`, [managerId, ...clientIds]);
    }
    res.status(201).json({ id: managerId, email: normalizedEmail, name, role: "riv_manager" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/managers/:id/clients { clientIds: [] } -- replaces the full assignment set.
router.put("/managers/:id/clients", requireRole("admin"), async (req, res, next) => {
  try {
    const managerId = toId(req.params.id);
    if (!managerId) return res.status(400).json({ error: "Invalid manager ID." });
    const rawClientIds = req.body?.clientIds;
    if (!Array.isArray(rawClientIds)) return res.status(400).json({ error: "clientIds must be an array." });
    const clientIds = rawClientIds.map(toId);
    if (clientIds.some((id) => id === null)) return res.status(400).json({ error: "clientIds must all be valid numbers." });
    await pool.query("DELETE FROM build_manager_clients WHERE manager_user_id = $1", [managerId]);
    if (clientIds.length) {
      const values = clientIds.map((_, i) => `($1,$${i + 2})`).join(",");
      await pool.query(`INSERT INTO build_manager_clients (manager_user_id, client_id) VALUES ${values} ON CONFLICT DO NOTHING`, [managerId, ...clientIds]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/managers/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'riv_manager'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   RE-ASSESS LOOP (PRD 8.5, BLD-AC15)
   ========================================================================= */

// POST /api/admin/build/reassess-link { projectId, questionId }
router.post("/reassess-link", async (req, res, next) => {
  try {
    const projectId = toId(req.body?.projectId);
    const questionId = toId(req.body?.questionId);
    if (!projectId || !questionId) return res.status(400).json({ error: "projectId and questionId must both be valid numbers." });
    const { rows } = await pool.query("SELECT * FROM build_projects WHERE id = $1", [projectId]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.status !== "closed" || project.outcome !== "scaled") {
      return res.status(400).json({ error: "Only a project closed as Scaled can be linked back to an audit question." });
    }
    await assertClientInScope(req, project.client_id);
    await pool.query(
      `INSERT INTO build_reassess_links (project_id, client_id, question_id) VALUES ($1,$2,$3)
       ON CONFLICT (project_id, question_id) DO NOTHING`,
      [project.id, project.client_id, questionId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/build/reassess/:clientId -- "Addressed by BLD-xxxx (Scaled, <date>)" lookups for the next audit view.
router.get("/reassess/:clientId", async (req, res, next) => {
  try {
    const clientId = toId(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: "Invalid client ID." });
    await assertClientInScope(req, clientId);
    const { rows } = await pool.query(
      `SELECT l.question_id, p.code, p.title, p.closed_at
       FROM build_reassess_links l JOIN build_projects p ON p.id = l.project_id
       WHERE l.client_id = $1`,
      [clientId]
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
   OVERDUE DIGEST (PRD 10.3, Phase 3)
   ========================================================================= */

// POST /api/admin/build/run-overdue-check -- RIV Admin only. Finds every
// active project with no status update in >14 days, notifies its POC +
// RIV Manager, and sends RIV Admin one digest. Idempotent to run more than
// once a day (it just re-notifies; harmless, not duplicated into separate
// digest emails per run beyond what's actually overdue right now).
//
// This endpoint does the work; nothing in this codebase schedules it yet
// (RIOS has no in-process cron and none is added here -- see PR notes).
// Call it from an external scheduler (a Render Cron Job hitting this route,
// or any other daily trigger) once one is set up.
router.post("/run-overdue-check", requireRole("admin"), async (req, res, next) => {
  try {
    const { rows: overdue } = await pool.query(`
      SELECT * FROM (
        SELECT p.*,
               GREATEST(COALESCE((SELECT MAX(u.update_date) FROM build_updates u WHERE u.project_id = p.id), p.started_at::date), p.started_at::date) AS last_update_date
        FROM build_projects p WHERE p.status = 'active'
      ) x WHERE CURRENT_DATE - x.last_update_date > 14
    `);

    for (const project of overdue) {
      const recipients = await recipientsForProject(project, ["poc", "riv_manager"]);
      await notifyBuild(recipients, {
        projectId: project.id, projectCode: project.code, kind: "overdue",
        message: `${project.code} has had no status update in over 14 days.`,
        subject: `RIOS Build: ${project.code} is overdue for an update`,
        heading: "A project update is overdue",
        body: `${project.title} (${project.code}) hasn't had a status update in more than 14 days.`,
      });
    }

    if (overdue.length) {
      const { rows: admins } = await pool.query("SELECT id, email, name FROM users WHERE role = 'admin'");
      await notifyBuild(admins, {
        kind: "overdue_digest",
        message: `${overdue.length} project(s) overdue for an update: ${overdue.map((o) => o.code).join(", ")}.`,
        subject: `RIOS Build: ${overdue.length} project(s) overdue for an update`,
        heading: "Weekly overdue-update digest",
        body: `${overdue.length} project(s) have had no status update in over 14 days: ${overdue.map((o) => o.code).join(", ")}.`,
      });
    }

    res.json({ ok: true, overdueCount: overdue.length, codes: overdue.map((o) => o.code) });
  } catch (err) {
    next(err);
  }
});

export default router;
