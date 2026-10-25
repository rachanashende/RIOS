import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { QUESTIONS } from "../lib/scoring.js";

const router = Router();
router.use(requireAuth, requireAdmin);

function questionById(id) {
  return QUESTIONS.find((q) => q.id === Number(id)) || null;
}

// GET current Ideas.RIV settings (which client's audit feeds the Top 5)
router.get("/settings", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.source_client_id, u.name, u.company
       FROM ideas_settings s
       LEFT JOIN users u ON u.id = s.source_client_id
       WHERE s.id = 1`
    );
    const row = rows[0];
    res.json({
      sourceClient: row?.source_client_id ? { id: row.source_client_id, name: row.name, company: row.company } : null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT { sourceClientId } — choose which client's scored audit populates
// the 5 opportunities. Pass null to clear it.
router.put("/settings", async (req, res, next) => {
  try {
    const { sourceClientId } = req.body || {};
    if (sourceClientId) {
      const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [sourceClientId]);
      if (!rows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    }
    await pool.query(
      "UPDATE ideas_settings SET source_client_id = $1, updated_at = now() WHERE id = 1",
      [sourceClientId || null]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ideas/clients -- id/name/company of every client, for the
// Ideathon admin's "which client's Ideathon am I looking at?" switcher.
// Lightweight on purpose (no per-client response counts, unlike the main
// site's GET /api/admin/clients) so it's cheap to load on every Ideathon
// visit, and lives under /api/admin/ideas so the Ideathon session's own
// token can reach it.
router.get("/clients", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, company FROM users
       WHERE role = 'client' AND audit_owner_id IS NULL
       ORDER BY COALESCE(NULLIF(company, ''), name)`
    );
    res.json({ clients: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/ideas/users?role=junior_employee — list junior_employee or jury accounts
router.get("/users", async (req, res, next) => {
  try {
    const role = req.query.role === "jury" ? "jury" : "junior_employee";
    // I1: optional ?clientId= narrows the list to one client's people
    const clientId = Number(req.query.clientId) || null;
    const params = [role];
    let where = "u.role = $1";
    if (clientId) { params.push(clientId); where += ` AND u.client_id = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.company, u.expertise, u.created_at, u.client_id,
              COALESCE(NULLIF(c.company, ''), c.name) AS client_name
       FROM users u LEFT JOIN users c ON c.id = u.client_id
       WHERE ${where} ORDER BY u.created_at DESC`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/ideas/users — create a junior_employee or jury login.
// expertise is optional and only meaningful for role=jury (PRD §6), but
// accepted either way rather than silently dropped if sent.
router.post("/users", async (req, res, next) => {
  try {
    const { email, password, name, role, company, expertise, clientId } = req.body || {};
    if (!email || !password || !name || !["junior_employee", "jury"].includes(role)) {
      return res.status(400).json({ error: "Name, email, temporary password, and role ('junior_employee' or 'jury') are required." });
    }
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    // I1: every employee/jury login belongs to one client
    if (!clientId) return res.status(400).json({ error: "Choose which client this person belongs to." });
    const { rows: clientRows } = await pool.query("SELECT id, name, company FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const normalizedEmail = String(email).toLowerCase().trim();

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company, expertise, client_id, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id",
      [normalizedEmail, password_hash, name, role, (company || "").trim() || clientRows[0].company || null, (expertise || "").trim() || null, clientRows[0].id]
    );

    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role, company, expertise: expertise || null, clientId: clientRows[0].id });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ideas/users/:id/client { clientId } — assign (or move) an employee/jury login to a client.
router.put("/users/:id/client", async (req, res, next) => {
  try {
    const { clientId } = req.body || {};
    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const { rowCount } = await pool.query(
      "UPDATE users SET client_id = $1 WHERE id = $2 AND role IN ('junior_employee','jury')",
      [clientId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: "Employee or jury login not found." });
    // O19: ideas stay with the client they were submitted for (and keep their ratings); tell the admin how many.
    const { rows: left } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM ideas WHERE submitted_by = $1 AND source_client_id IS DISTINCT FROM $2",
      [req.params.id, clientId]
    );
    res.json({ ok: true, ideasLeftBehind: left[0].n });
  } catch (err) {
    next(err);
  }
});

// DR1-17: PUT /api/admin/ideas/users/:id/role { role } -- switch a login
// between Employee and Jury without deleting and recreating it (e.g. a jury
// member created as an Employee by mistake). Refused once the login has
// activity in its current role, so nobody's ideas or ratings end up owned by
// someone in the wrong role.
router.put("/users/:id/role", async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!["junior_employee", "jury"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'junior_employee' (Employee) or 'jury'." });
    }
    const { rows: userRows } = await pool.query(
      "SELECT id, name, role FROM users WHERE id = $1 AND role IN ('junior_employee','jury')",
      [req.params.id]
    );
    const user = userRows[0];
    if (!user) return res.status(404).json({ error: "Employee or jury login not found." });
    if (user.role === role) return res.json({ ok: true, role });

    if (user.role === "junior_employee") {
      const { rows } = await pool.query(
        `SELECT (SELECT COUNT(*)::int FROM ideas WHERE submitted_by = $1) AS ideas,
                (SELECT COUNT(*)::int FROM build_projects WHERE employee_user_id = $1) AS projects`,
        [user.id]
      );
      if (rows[0].ideas || rows[0].projects) {
        const what = [rows[0].ideas ? `${rows[0].ideas} idea${rows[0].ideas === 1 ? "" : "s"}` : null, rows[0].projects ? `${rows[0].projects} Build project${rows[0].projects === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ");
        return res.status(409).json({ error: `${user.name} already has ${what} as an Employee, so the role can't be changed. Create a separate jury login instead.` });
      }
    } else {
      const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM idea_ratings WHERE jury_user_id = $1", [user.id]);
      if (rows[0].n) {
        return res.status(409).json({ error: `${user.name} has already rated ${rows[0].n} idea${rows[0].n === 1 ? "" : "s"} as a jury member, so the role can't be changed. Create a separate employee login instead.` });
      }
    }
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, user.id]);
    res.json({ ok: true, role });
  } catch (err) {
    next(err);
  }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role IN ('junior_employee','jury')", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/ideas/users/:id/ideas
 * One specific junior employee's submitted ideas, with the rating
 * aggregate per idea — the dedicated per-employee view, mirroring
 * GET /api/admin/clients/:id/responses for the client scorecard pattern.
 */
router.get("/users/:id/ideas", async (req, res, next) => {
  try {
    const { rows: userRows } = await pool.query(
      "SELECT id, email, name, company, expertise FROM users WHERE id = $1 AND role = 'junior_employee'",
      [req.params.id]
    );
    const employee = userRows[0];
    if (!employee) return res.status(404).json({ error: "Employee not found." });

    const { rows } = await pool.query(
      `SELECT i.id, i.question_id, i.title, i.description, i.created_at,
              COUNT(r.id)::int AS rating_count, AVG(r.score) AS avg_score
       FROM ideas i
       LEFT JOIN idea_ratings r ON r.idea_id = i.id
       WHERE i.submitted_by = $1
       GROUP BY i.id
       ORDER BY i.created_at DESC`,
      [req.params.id]
    );
    const ideas = rows.map((row) => ({
      ...row,
      avg_score: row.avg_score != null ? Number(row.avg_score) : null,
      rating_count: Number(row.rating_count),
      question: questionById(row.question_id),
    }));
    res.json({ employee, ideas });
  } catch (err) {
    next(err);
  }
});

// DR1-20: PUT /api/admin/ideas/:id/text { title, description } -- the RIV
// Admin corrects typos in an idea, including one already locked because the
// jury has started rating it. Only the title and description can change; the
// idea is marked "Edited by RIV" and the old/new text goes into idea_edits.
router.put("/:id/text", async (req, res, next) => {
  const title = String((req.body && req.body.title) || "").trim();
  const description = String((req.body && req.body.description) || "").trim() || null;
  if (!title) return res.status(400).json({ error: "An idea needs a title." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: cur } = await client.query("SELECT id, title, description FROM ideas WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!cur.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Idea not found." }); }
    const before = cur[0];
    if (before.title === title && (before.description || null) === description) {
      await client.query("ROLLBACK");
      return res.json({ ok: true, unchanged: true });
    }
    await client.query(
      "INSERT INTO idea_edits (idea_id, edited_by, old_title, old_description, new_title, new_description) VALUES ($1,$2,$3,$4,$5,$6)",
      [before.id, req.user.id, before.title, before.description, title, description]
    );
    const { rows } = await client.query(
      "UPDATE ideas SET title = $1, description = $2, riv_edited_at = now(), riv_edited_by = $3 WHERE id = $4 RETURNING id, title, description, riv_edited_at",
      [title, description, req.user.id, before.id]
    );
    await client.query("COMMIT");
    res.json({ idea: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin/ideas/:id/edits -- the edit history for one idea (DR1-20)
router.get("/:id/edits", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.old_title, e.old_description, e.new_title, e.new_description, e.created_at, u.name AS edited_by_name
       FROM idea_edits e LEFT JOIN users u ON u.id = e.edited_by
       WHERE e.idea_id = $1 ORDER BY e.created_at DESC`,
      [req.params.id]
    );
    res.json({ edits: rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/ideas/:id/select-for-build -- R21 "Publish winners": marks
// an idea as selected for the Transform/Build module (backend/routes/
// buildAdmin.js POST /from-idea/:ideaId reads this flag before it will
// create the project, per the Build PRD's "How a project starts").
router.put("/:id/select-for-build", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "UPDATE ideas SET selected_for_build_at = now(), selected_for_build_by = $1 WHERE id = $2 RETURNING *",
      [req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Idea not found." });
    res.json({ idea: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;