// Build.RIV -- admin + RIV Manager console: creating projects (manual, or
// from a published Ideathon winner / shortlisted startup), issuing
// client_poc and riv_manager logins, assigning people to a project, closing
// the re-assess loop, and the overdue-update digest (PRD sections 6 "How a
// project starts", 7 "How a project starts", 10.1, 10.3, 12.1).
import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { QUESTIONS } from "../lib/scoring.js";
import { STAGES } from "../lib/buildWorkflow.js";
import { notifyBuild, recipientsForProject } from "../lib/buildNotify.js";
import { sendBuildLoginInviteEmail } from "../lib/email.js";

// Fire-and-forget invite email for a freshly-created login. Never blocks or
// fails the account-creation response -- if Resend isn't configured or the
// send throws, the admin still sees the temp password on screen to share
// manually, exactly as before this existed; this just adds an email on top
// when it's available, using the same Resend path every other RIOS email
// (verification, password reset) already goes through.
function inviteLogin(email, name, roleLabel, tempPassword) {
  sendBuildLoginInviteEmail(email, name, { roleLabel, tempPassword, loginPath: "/build" }).catch((err) => {
    console.warn(`[build-admin] Invite email to ${email} failed (login still created):`, err.message || err);
  });
}

const router = Router();
// RIV Admin and RIV Manager both reach this console; individual routes
// narrow further where the PRD's permission table says "RIV Admin only"
// (e.g. closing stays in build.js, gated there).
router.use(requireAuth, requireRole("admin", "riv_manager"));

const clean = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

// Every *Id/*Ids field below comes straight from request input, so its name
// alone doesn't make it a number -- a non-numeric value (e.g. someone typing
// "client 1" into the admin console's Client ID field instead of the actual
// numeric id) used to reach pool.query() unvalidated and surface as a raw
// Postgres "invalid input syntax for type integer" error. toId() turns
// anything that isn't a clean positive integer into null so routes can
// reject it with a normal 400 instead.
function toId(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const adminOnly = requireRole("admin");

// Approved workflow v2: every new project names its people up front --
// Product Owner (required, both types), Employee (Enterprise), Startup POC
// (Open Innovation, optional until the deal starts), Client Partner. Each id
// must be a login of the right role (and, for client-side people, belong to
// the project's client) so a typo can't silently attach the wrong person.
async function resolvePeople(body, clientId, type) {
  const productOwnerUserId = toId(body?.productOwnerUserId);
  const employeeUserId = toId(body?.employeeUserId);
  const startupPocUserId = toId(body?.startupPocUserId);
  const rivManagerId = toId(body?.rivManagerId);
  const fail = (msg) => { const e = new Error(msg); e.status = 400; throw e; };
  if (!productOwnerUserId) fail("Pick the Product Owner -- every project needs one.");
  const check = async (id, role, label, sameClient) => {
    if (!id) return;
    const { rows } = await pool.query("SELECT id, role, client_id FROM users WHERE id = $1", [id]);
    if (!rows.length || rows[0].role !== role) fail(`${label} must be an existing ${label} login.`);
    if (sameClient && rows[0].client_id != null && Number(rows[0].client_id) !== Number(clientId)) fail(`${label} belongs to a different client.`);
  };
  await check(productOwnerUserId, "product_owner", "Product Owner", true);
  if (type === "internal") await check(employeeUserId, "junior_employee", "Employee", true);
  if (type === "startup") await check(startupPocUserId, "startup_poc", "Startup POC", false);
  await check(rivManagerId, "riv_manager", "Client Partner", false);
  return {
    productOwnerUserId,
    employeeUserId: type === "internal" ? employeeUserId : null,
    startupPocUserId: type === "startup" ? startupPocUserId : null,
    rivManagerId,
  };
}

async function nextCode() {
  const { rows } = await pool.query("SELECT nextval('build_project_code_seq') AS n");
  return `BLD-${String(rows[0].n).padStart(4, "0")}`;
}

async function assignedClientIds(user) {
  if (user.role !== "riv_manager") return null; // null = no restriction (admin)
  const { rows } = await pool.query("SELECT client_id FROM build_manager_clients WHERE manager_user_id = $1", [user.id]);
  return rows.map((r) => r.client_id);
}

async function assertClientInScope(req, clientId) {
  const ids = await assignedClientIds(req.user);
  if (ids === null) return true; // admin
  if (!ids.map(Number).includes(Number(clientId))) {
    const err = new Error("That client isn't assigned to you.");
    err.status = 403;
    throw err;
  }
  return true;
}

// GET /api/admin/build/client-options -- id/name/company of the clients the
// caller may pick in Build's client dropdowns (Create project, the Projects
// list's client filter, Dashboard -> One client, the Logins panel).
// Admin: every client. RIV Client Partner: only their assigned clients.
//
// This is a Build-token-reachable twin of the main site's heavier
// GET /api/admin/clients. The dropdowns used to call that main-site route
// with the *main-site* token, which doesn't exist for anyone who entered
// through Build.RIV's own login screen -- the call 401'd, the error was
// swallowed, and the pickers silently degraded to a free-text box (E2E
// report Issue 3) or disappeared (Issue 6).
router.get("/client-options", async (req, res, next) => {
  try {
    const assigned = await assignedClientIds(req.user); // null = admin, no restriction
    const params = [];
    let where = "role = 'client' AND audit_owner_id IS NULL";
    if (assigned !== null) { params.push(assigned); where += " AND id = ANY($1::int[])"; }
    const { rows } = await pool.query(
      `SELECT id, name, company FROM users WHERE ${where} ORDER BY COALESCE(NULLIF(company, ''), name)`,
      params
    );
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   READY FOR BUILD (Oct 2026 "Proposed Screens" -- admin console, screen 3)
   ========================================================================= */

// GET /api/admin/build/ready-for-build -- the queue of ideas/applications
// that have cleared selection but have no Build project yet (page 5 of the
// mockup). Built from the same "already selected, not yet converted" check
// the from-idea/from-application routes already do one-at-a-time; this
// just surfaces the list so an admin doesn't have to already know an idea
// or application's numeric ID to act on it.
router.get("/ready-for-build", adminOnly, async (req, res, next) => {
  try {
    const assigned = await assignedClientIds(req.user); // null = admin, no restriction
    const clientParam = assigned === null ? [] : [assigned];
    const clientClause = (col) => (assigned === null ? "" : `AND ${col} = ANY($1::int[])`);

    // ?includeDeferred=1 shows "Not now"-ed rows too (admin can un-defer
    // one); otherwise a row whose build_deferred_until is still in the
    // future is hidden, same idea as a snoozed notification.
    const includeDeferred = req.query.includeDeferred === "1";
    const deferredClause = includeDeferred ? "" : "AND (build_deferred_until IS NULL OR build_deferred_until <= now())";

    const { rows: ideaRows } = await pool.query(
      `SELECT i.id, i.title, i.selected_for_build_at AS selected_at, i.source_client_id AS client_id,
              i.submitted_by, i.question_id, i.description, sb.name AS submitted_by_name,
              i.build_deferred_until, COALESCE(cl.company, cl.name) AS client_name
       FROM ideas i
       LEFT JOIN users cl ON cl.id = i.source_client_id
       LEFT JOIN users sb ON sb.id = i.submitted_by
       WHERE i.selected_for_build_at IS NOT NULL
         AND i.build_declined_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type = 'idea' AND s.source_id = i.id)
         ${clientClause("i.source_client_id")} ${deferredClause.replace("build_deferred_until", "i.build_deferred_until")}
       ORDER BY i.selected_for_build_at ASC`,
      clientParam
    );
    const { rows: appRows } = await pool.query(
      `SELECT a.id, a.startup_name AS title, a.decided_at AS selected_at, o.client_id,
              a.founder_name, a.email AS founder_email, a.pitch AS description, o.title AS opportunity_title,
              a.build_deferred_until, COALESCE(cl.company, cl.name) AS client_name,
              (SELECT AVG(sc.total) FROM rise_scores sc WHERE sc.application_id = a.id) AS jury_score
       FROM rise_applications a
       LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
       LEFT JOIN users cl ON cl.id = o.client_id
       WHERE a.decision = 'selected_for_pilot'
         AND a.build_declined_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM build_project_sources s WHERE s.source_type = 'rise_application' AND s.source_id = a.id)
         ${clientClause("o.client_id")} ${deferredClause.replace("build_deferred_until", "a.build_deferred_until")}
       ORDER BY a.decided_at ASC`,
      clientParam
    );

    const now = Date.now();
    const waitingDays = (d) => (d ? Math.max(0, Math.round((now - new Date(d)) / 86400000)) : null);
    const items = [
      ...ideaRows.map((r) => ({
        source: "idea", sourceId: r.id, title: r.title, clientId: r.client_id, clientName: r.client_name || "—",
        selectedAt: r.selected_at, waitingDays: waitingDays(r.selected_at), juryScore: null, deferredUntil: r.build_deferred_until,
        description: r.description, submittedById: r.submitted_by, submittedByName: r.submitted_by_name,
        questionId: r.question_id, auditQuestion: (QUESTIONS.find((q) => q.id === Number(r.question_id)) || {}).q || null,
      })),
      ...appRows.map((r) => ({
        source: "rise_application", sourceId: r.id, title: r.title, clientId: r.client_id, clientName: r.client_name || "—",
        selectedAt: r.selected_at, waitingDays: waitingDays(r.selected_at),
        juryScore: r.jury_score != null ? Number(r.jury_score).toFixed(1) : null, deferredUntil: r.build_deferred_until,
        description: r.description, founderName: r.founder_name, founderEmail: r.founder_email, opportunityTitle: r.opportunity_title,
      })),
    ].sort((a, b) => new Date(a.selectedAt || 0) - new Date(b.selectedAt || 0));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/ready-for-build/defer { source, sourceId, days } --
// the mockup's "Not now" action: hides the row from the default Ready for
// Build queue for `days` (default 14, same documented-default convention
// used elsewhere in this change) without declining or losing it. days: 0
// clears the defer immediately (the admin console's "un-defer" case).
router.post("/ready-for-build/defer", adminOnly, async (req, res, next) => {
  try {
    const { source } = req.body || {};
    const sourceId = toId(req.body?.sourceId);
    const days = Number.isFinite(Number(req.body?.days)) ? Number(req.body.days) : 14;
    if (!["idea", "rise_application"].includes(source) || !sourceId) return res.status(400).json({ error: "A valid source ('idea' or 'rise_application') and sourceId are required." });
    const table = source === "idea" ? "ideas" : "rise_applications";
    const value = days > 0 ? `now() + interval '${days} days'` : "NULL";
    await pool.query(`UPDATE ${table} SET build_deferred_until = ${value} WHERE id = $1`, [sourceId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/ready-for-build/decline { source, sourceId, reason }
// Permanent "not going to Build" (unlike "Not now", it doesn't come back).
router.post("/ready-for-build/decline", adminOnly, async (req, res, next) => {
  try {
    const { source } = req.body || {};
    const sourceId = toId(req.body?.sourceId);
    const reason = clean(req.body?.reason);
    if (!["idea", "rise_application"].includes(source) || !sourceId) return res.status(400).json({ error: "A valid source ('idea' or 'rise_application') and sourceId are required." });
    if (!reason) return res.status(400).json({ error: "A reason is required to decline." });
    const table = source === "idea" ? "ideas" : "rise_applications";
    const { rowCount } = await pool.query(`UPDATE ${table} SET build_declined_at = now(), build_declined_reason = $1 WHERE id = $2`, [reason, sourceId]);
    if (!rowCount) return res.status(404).json({ error: "Not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   REQUESTS FROM CLIENT PARTNERS (Oct 2026 "Proposed Screens" admin console)
   ========================================================================= */

// GET /api/admin/build/requests?status=open -- every build_requests row
// across a RIV Client Partner's assigned clients (unrestricted for admin),
// newest first. Default to open-only, matching the mockup's queue framing;
// ?status=all shows resolved ones too.
router.get("/requests", async (req, res, next) => {
  try {
    const assigned = await assignedClientIds(req.user); // null = admin
    const statusClause = req.query.status === "all" ? "" : "AND r.status = 'open'";
    // Delete requests are the RIV Admin's alone to decide.
    const kindClause = assigned === null ? "" : "AND r.kind <> 'delete'";
    const clientClause = assigned === null ? "" : "AND p.client_id = ANY($1::int[])";
    const params = assigned === null ? [] : [assigned];
    const { rows } = await pool.query(
      `SELECT r.*, p.code AS project_code, p.title AS project_title, p.client_id,
              COALESCE(cl.company, cl.name) AS client_name, u.name AS requested_by_name,
              ru.name AS resolved_by_name
       FROM build_requests r
       JOIN build_projects p ON p.id = r.project_id
       LEFT JOIN users cl ON cl.id = p.client_id
       LEFT JOIN users u ON u.id = r.requested_by
       LEFT JOIN users ru ON ru.id = r.resolved_by
       WHERE 1=1 ${statusClause} ${kindClause} ${clientClause}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/requests/:id/resolve -- marks it handled. No
// "response" field is modeled (the mockup doesn't spell out a reply flow
// for this), just who resolved it and when; any actual follow-up happens
// through the project's own Updates/Files, which already notify everyone.
router.put("/requests/:id/resolve", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE build_requests SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE id = $2 AND kind <> 'delete' RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Request not found." });
    res.json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/requests/:id/approve-delete { note? } -- RIV Admin
// only. Deletes the project (all its updates, files, history cascade) and
// records the decision on the request row first, so the audit trail of who
// asked and who approved survives in notifications/email even though the
// request row itself cascades with the project.
router.put("/requests/:id/approve-delete", adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, p.code, p.title, p.client_id, p.riv_manager_id, p.product_owner_user_id, p.startup_poc_user_id, p.id AS pid
       FROM build_requests r JOIN build_projects p ON p.id = r.project_id
       WHERE r.id = $1 AND r.kind = 'delete'`,
      [req.params.id]
    );
    const r = rows[0];
    if (!r) return res.status(404).json({ error: "Delete request not found." });
    if (r.status !== "open") return res.status(400).json({ error: "This request was already decided." });
    const project = { id: r.pid, code: r.code, title: r.title, client_id: r.client_id, riv_manager_id: r.riv_manager_id, product_owner_user_id: r.product_owner_user_id, startup_poc_user_id: r.startup_poc_user_id };
    // Work out who to tell before the project (and its links) are gone.
    const recipients = await recipientsForProject(project, ["riv_manager", "poc"]);
    if (r.requested_by && !recipients.some((x) => Number(x.id) === Number(r.requested_by))) {
      const { rows: rq } = await pool.query("SELECT id, email, name FROM users WHERE id = $1", [r.requested_by]);
      recipients.push(...rq);
    }
    // One statement -- updates, files, history, requests all cascade.
    await pool.query("DELETE FROM build_projects WHERE id = $1", [r.pid]);
    try {
      await notifyBuild(recipients, {
        projectId: null, projectCode: r.code, kind: "closed",
        message: `${r.code} was deleted by RIV Admin (requested by the Client Partner).`,
        subject: `RIOS Build: ${r.code} deleted`, heading: "A project was deleted",
        body: `${r.title} (${r.code}) was deleted by the RIV Admin. Reason given: "${r.message}".${req.body?.note ? " Admin note: " + req.body.note : ""}`,
      });
    } catch (e) {
      console.warn("[build-admin] delete notice failed:", e.message || e);
    }
    res.json({ ok: true, deletedProjectCode: r.code });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/requests/:id/reject-delete { note } -- RIV Admin only.
router.put("/requests/:id/reject-delete", adminOnly, async (req, res, next) => {
  try {
    const note = clean(req.body?.note);
    const { rows } = await pool.query(
      `UPDATE build_requests SET status = 'rejected', resolution = $1, resolved_by = $2, resolved_at = now()
       WHERE id = $3 AND kind = 'delete' AND status = 'open' RETURNING *`,
      [note, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Open delete request not found." });
    const { rows: pr } = await pool.query("SELECT * FROM build_projects WHERE id = $1", [rows[0].project_id]);
    if (pr[0]) {
      const recipients = await recipientsForProject(pr[0], ["riv_manager"]);
      if (rows[0].requested_by && !recipients.some((x) => Number(x.id) === Number(rows[0].requested_by))) {
        const { rows: rq } = await pool.query("SELECT id, email, name FROM users WHERE id = $1", [rows[0].requested_by]);
        recipients.push(...rq);
      }
      await notifyBuild(recipients, {
        projectId: pr[0].id, projectCode: pr[0].code, kind: "client_request",
        message: `${pr[0].code}: delete request rejected by RIV Admin.${note ? " " + note : ""}`,
        subject: `RIOS Build: delete request for ${pr[0].code} rejected`, heading: "Your delete request was rejected",
        body: `${pr[0].title} (${pr[0].code}) will not be deleted.${note ? " Note: " + note : ""}`,
      });
    }
    res.json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/build/projects/:id -- RIV Admin direct delete.
router.delete("/projects/:id", adminOnly, async (req, res, next) => {
  try {
    const projectId = toId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project ID." });
    const { rows } = await pool.query("DELETE FROM build_projects WHERE id = $1 RETURNING code", [projectId]);
    if (!rows.length) return res.status(404).json({ error: "Project not found." });
    res.json({ ok: true, deletedProjectCode: rows[0].code });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   PROJECT CREATION
   ========================================================================= */

// POST /api/admin/build/projects -- manual creation, either workflow
// (section 6/7: "The RIV Admin can also create an internal project by
// hand" -- extended here to startup too, since the PRD leaves that open
// (12.3) and there's no reason to block it for one workflow but not the
// other).
router.post("/projects", adminOnly, async (req, res, next) => {
  try {
    const { type, title, description, targetEnd } = req.body || {};
    const clientId = toId(req.body?.clientId);
    if (!["internal", "startup"].includes(type)) return res.status(400).json({ error: "type must be 'internal' or 'startup'." });
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
    if (!clientId) return res.status(400).json({ error: "clientId must be a valid numeric client ID." });
    await assertClientInScope(req, clientId);

    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const people = await resolvePeople(req.body, clientId, type);

    const code = await nextCode();
    const stage = STAGES[type][0]; // 'requirements'
    const { rows } = await pool.query(
      `INSERT INTO build_projects (code, type, title, description, client_id, product_owner_user_id, riv_manager_id, employee_user_id, startup_poc_user_id, stage, target_end, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [code, type, String(title).trim(), clean(description), clientId, people.productOwnerUserId,
        people.rivManagerId, people.employeeUserId, people.startupPocUserId, stage, clean(targetEnd), req.user.id]
    );
    const project = rows[0];
    await pool.query(
      "INSERT INTO build_project_sources (project_id, source_type, source_id) VALUES ($1,'manual',NULL)",
      [project.id]
    );
    await pool.query(
      `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, by_user_id) VALUES ($1,NULL,$2,'advance',$3)`,
      [project.id, stage, req.user.id]
    );

    const recipients = await recipientsForProject(project, ["poc", "riv_manager"]);
    await notifyBuild(recipients, {
      projectId: project.id, projectCode: project.code, kind: "created",
      message: `${project.code} was created.`, subject: `RIOS Build: ${project.code} created`,
      heading: "A new Build project was created", body: `${project.title} (${project.code}) has been created and is now in ${stage}.`,
    });

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/from-idea/:ideaId  (BLD-AC01)
// The idea must already be marked "Selected for Build" (PUT
// /api/admin/ideas/:id/select-for-build in ideasAdmin.js -- R21).
router.post("/from-idea/:ideaId", adminOnly, async (req, res, next) => {
  try {
    const { rows: ideaRows } = await pool.query("SELECT * FROM ideas WHERE id = $1", [req.params.ideaId]);
    const idea = ideaRows[0];
    if (!idea) return res.status(404).json({ error: "Idea not found." });
    if (!idea.selected_for_build_at) return res.status(400).json({ error: "This idea hasn't been marked \"Selected for Build\" yet." });
    if (!idea.source_client_id) return res.status(400).json({ error: "This idea has no client to attach the project to." });
    await assertClientInScope(req, idea.source_client_id);

    const { rows: existing } = await pool.query(
      "SELECT p.code FROM build_project_sources s JOIN build_projects p ON p.id = s.project_id WHERE s.source_type = 'idea' AND s.source_id = $1",
      [idea.id]
    );
    if (existing.length) return res.status(409).json({ error: `Already in Build as ${existing[0].code}.` });

    const question = QUESTIONS.find((q) => q.id === Number(idea.question_id));
    // The idea's submitter is the default Employee unless the Admin picked someone else.
    const people = await resolvePeople({ employeeUserId: idea.submitted_by, ...(req.body || {}) }, idea.source_client_id, "internal");
    const code = await nextCode();
    const stage = STAGES.internal[0];
    const { rows } = await pool.query(
      `INSERT INTO build_projects (code, type, title, description, client_id, product_owner_user_id, riv_manager_id, employee_user_id, stage, target_end, created_by)
       VALUES ($1,'internal',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, clean(req.body?.title) || idea.title, clean(req.body?.description) || idea.description, idea.source_client_id,
        people.productOwnerUserId, people.rivManagerId, people.employeeUserId, stage, clean(req.body?.targetEnd), req.user.id]
    );
    const project = rows[0];
    await pool.query(
      "INSERT INTO build_project_sources (project_id, source_type, source_id, question_id) VALUES ($1,'idea',$2,$3)",
      [project.id, idea.id, idea.question_id]
    );
    await pool.query(
      `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, by_user_id) VALUES ($1,NULL,$2,'advance',$3)`,
      [project.id, stage, req.user.id]
    );

    // The idea's own submitter isn't a column on build_projects (there's no
    // separate "owner" relationship any more -- see buildPermissions.js);
    // they're found via the source link just inserted, so notify them
    // directly from the idea row already in hand rather than through
    // recipientsForProject.
    if (idea.submitted_by) {
      const { rows: empRows } = await pool.query("SELECT id, email, name FROM users WHERE id = $1", [idea.submitted_by]);
      await notifyBuild(empRows, {
        projectId: project.id, projectCode: project.code, kind: "created",
        message: `${project.code} was created from your Ideathon win${question ? ` ("${question.text?.slice(0, 60) || ""}")` : ""}.`,
        subject: `RIOS Build: ${project.code} created from your Ideathon win`,
        heading: "Your idea is now a Build project",
        body: `"${idea.title}" has been turned into a Build project (${project.code}).`,
      });
    }

    res.status(201).json({ project });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/from-application/:applicationId  (BLD-AC02)
// The application must already be marked decision='selected_for_pilot'
// (PUT /api/admin/rise/applications/:id/decision in riseAdmin.js -- R22).
router.post("/from-application/:applicationId", adminOnly, async (req, res, next) => {
  try {
    const { rows: appRows } = await pool.query(
      `SELECT a.*, o.client_id AS opportunity_client_id
       FROM rise_applications a LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
       WHERE a.id = $1`,
      [req.params.applicationId]
    );
    const app = appRows[0];
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.decision !== "selected_for_pilot") return res.status(400).json({ error: "This application hasn't been marked \"Selected for Pilot\" yet." });
    const clientId = toId(req.body?.clientId) || app.opportunity_client_id;
    if (!clientId) return res.status(400).json({ error: "This call has no client attached -- pass a valid numeric clientId, or set one on the call first." });
    await assertClientInScope(req, clientId);

    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });

    const { rows: existing } = await pool.query(
      "SELECT p.code FROM build_project_sources s JOIN build_projects p ON p.id = s.project_id WHERE s.source_type = 'rise_application' AND s.source_id = $1",
      [app.id]
    );
    if (existing.length) return res.status(409).json({ error: `Already in Build as ${existing[0].code}.` });

    // Average jury score, carried across for reference (section 7 "How a project starts").
    const { rows: scoreRows } = await pool.query("SELECT AVG(total) AS avg_total FROM rise_scores WHERE application_id = $1", [app.id]);
    const avgScore = scoreRows[0]?.avg_total != null ? Number(scoreRows[0].avg_total) : null;

    const people = await resolvePeople(req.body, clientId, "startup");
    const code = await nextCode();
    const stage = STAGES.startup[0];
    const { rows } = await pool.query(
      `INSERT INTO build_projects (code, type, title, description, client_id, product_owner_user_id, riv_manager_id, startup_poc_user_id, stage, target_end, created_by)
       VALUES ($1,'startup',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, clean(req.body?.title) || `${app.startup_name} — Pilot`, clean(req.body?.description) || app.pitch, clientId,
        people.productOwnerUserId, people.rivManagerId, people.startupPocUserId, stage, clean(req.body?.targetEnd), req.user.id]
    );
    const project = rows[0];
    await pool.query(
      "INSERT INTO build_project_sources (project_id, source_type, source_id) VALUES ($1,'rise_application',$2)",
      [project.id, app.id]
    );
    await pool.query(
      `INSERT INTO build_stage_history (project_id, from_stage, to_stage, action, by_user_id) VALUES ($1,NULL,$2,'advance',$3)`,
      [project.id, stage, req.user.id]
    );

    res.status(201).json({ project, startup: { name: app.startup_name, founder: app.founder_name, email: app.email, sector: app.sector, stage: app.stage, avgScore } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/build/projects/:id/assign { productOwnerUserId?, rivManagerId?, startupPocUserId? }
router.put("/projects/:id/assign", adminOnly, async (req, res, next) => {
  try {
    const projectId = toId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project ID." });
    const { rows } = await pool.query("SELECT * FROM build_projects WHERE id = $1", [projectId]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: "Project not found." });
    await assertClientInScope(req, project.client_id);

    const productOwnerUserId = toId(req.body?.productOwnerUserId);
    const rivManagerId = toId(req.body?.rivManagerId);
    const startupPocUserId = toId(req.body?.startupPocUserId);
    const employeeUserId = toId(req.body?.employeeUserId);
    // updated_at drives "days in stage" for the health rules, so a people
    // change must not touch it.
    const { rows: out } = await pool.query(
      `UPDATE build_projects SET
         product_owner_user_id = COALESCE($1, product_owner_user_id),
         riv_manager_id = COALESCE($2, riv_manager_id),
         startup_poc_user_id = COALESCE($3, startup_poc_user_id),
         employee_user_id = COALESCE($4, employee_user_id)
       WHERE id = $5 RETURNING *`,
      [productOwnerUserId, rivManagerId, startupPocUserId, employeeUserId, project.id]
    );
    res.json({ project: out[0] });
  } catch (err) {
    next(err);
  }
});

/* =========================================================================
   PRODUCT OWNER + RIV CLIENT PARTNER (riv_manager) + STARTUP POC LOGINS
   ========================================================================= */

// GET /api/admin/build/poc?clientId=  (role: product_owner -- the renamed
// client_poc; "poc" kept as the URL/param name to avoid a wider churn)
// GET /api/admin/build/employees?clientId= -- Employee logins (junior_employee)
// for the Enterprise project "Employee" picker.
router.get("/employees", adminOnly, async (req, res, next) => {
  try {
    const where = ["u.role = 'junior_employee'"];
    const params = [];
    if (req.query.clientId) { params.push(Number(req.query.clientId)); where.push(`u.client_id = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.client_id FROM users u WHERE ${where.join(" AND ")} ORDER BY u.name`,
      params
    );
    res.json({ employees: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/poc", requireRole("admin"), async (req, res, next) => {
  try {
    const where = ["u.role = 'product_owner'"];
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
      "INSERT INTO users (email, password_hash, name, role, company, client_id, must_change_password) VALUES ($1,$2,$3,'product_owner',$4,$5,true) RETURNING id",
      [normalizedEmail, password_hash, String(name).trim(), clientRows[0].company || null, clientRows[0].id]
    );
    inviteLogin(normalizedEmail, name, "Product Owner", password);
    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role: "product_owner", clientId: clientRows[0].id });
  } catch (err) {
    next(err);
  }
});

router.delete("/poc/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'product_owner'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/build/startup-poc?projectId= -- roster of Startup POC
// logins, each tied to exactly one startup-pilot project (not a whole
// client -- a startup has no visibility beyond its own pilot).
router.get("/startup-poc", requireRole("admin"), async (req, res, next) => {
  try {
    const where = ["u.role = 'startup_poc'"];
    const params = [];
    if (req.query.projectId) { params.push(toId(req.query.projectId)); where.push(`p.id = $${params.length}`); }
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.created_at, p.id AS project_id, p.code AS project_code, p.title AS project_title
       FROM users u LEFT JOIN build_projects p ON p.startup_poc_user_id = u.id
       WHERE ${where.join(" AND ")} ORDER BY u.created_at DESC`,
      params
    );
    res.json({ startupPocs: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/build/startup-poc { email, password, name, projectId } --
// creates the login and assigns it to that startup-pilot project in one
// step (the proposed-screens "Create project" form's "Create the Startup
// POC login and email the invite" checkbox).
router.post("/startup-poc", requireRole("admin"), async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    const projectId = toId(req.body?.projectId);
    if (!email || !password || !name || !projectId) return res.status(400).json({ error: "Name, email, temporary password, and a valid numeric projectId are required." });
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    const { rows: projectRows } = await pool.query("SELECT id, type FROM build_projects WHERE id = $1", [projectId]);
    if (!projectRows.length) return res.status(404).json({ error: "That project doesn't exist." });
    if (projectRows[0].type !== "startup") return res.status(400).json({ error: "Startup POC logins are only for startup-pilot projects." });
    const normalizedEmail = String(email).toLowerCase().trim();
    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, must_change_password) VALUES ($1,$2,$3,'startup_poc',true) RETURNING id",
      [normalizedEmail, password_hash, String(name).trim()]
    );
    await pool.query("UPDATE build_projects SET startup_poc_user_id = $1, updated_at = now() WHERE id = $2", [rows[0].id, projectId]);
    inviteLogin(normalizedEmail, name, "Startup POC", password);
    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role: "startup_poc", projectId });
  } catch (err) {
    next(err);
  }
});

router.delete("/startup-poc/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'startup_poc'", [req.params.id]);
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
    inviteLogin(normalizedEmail, name, "Client Leader", password);
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
    inviteLogin(normalizedEmail, name, "RIV Client Partner", password);
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

// Shared logic for the overdue-update digest, factored out of the route
// handler so it can be called two ways: the authenticated admin-console
// button below, and the new unauthenticated-but-secret-gated route in
// server.js that lets an external scheduler trigger it (see that file for
// why it has to live outside this router's requireAuth/requireRole chain).
export async function runOverdueCheck() {
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

  return { overdueCount: overdue.length, codes: overdue.map((o) => o.code) };
}

// POST /api/admin/build/run-overdue-check -- RIV Admin only, manual trigger
// from the admin console's "Overdue digest" tab. Idempotent to run more
// than once a day (it just re-notifies; harmless, not duplicated into
// separate digest emails per run beyond what's actually overdue right now).
// For automatic daily runs, see the cron-secret-gated route mounted
// directly in server.js, which calls the same runOverdueCheck() above.
router.post("/run-overdue-check", requireRole("admin"), async (req, res, next) => {
  try {
    const result = await runOverdueCheck();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
