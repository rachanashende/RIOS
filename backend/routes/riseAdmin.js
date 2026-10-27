import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { CRITERIA } from "../lib/riseScoring.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// Blank strings become NULL so empty optional fields don't render as empty sections.
const clean = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

// DR1-25: calls stay anonymous on the public page. Flags which public fields
// mention the linked retailer -- its full company name, or the first word of
// it ("FreshKart" in "FreshKart Supermarkets") -- so the Admin is warned
// before (and after) opening the call. A warning only; it never blocks.
const PUBLIC_FIELDS = [["title", "Title"], ["description", "Description"], ["benefits", "What the programme offers"], ["eligibility", "Who can apply"], ["public_retailer_label", "Public description of the retailer"]];
function retailerNameMentions(opp) {
  const company = String(opp.client_company || opp.client_name || "").trim();
  if (!company) return [];
  const first = company.split(/\s+/)[0];
  const names = [...new Set([company, first.length >= 4 ? first : null].filter(Boolean))];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(esc).join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
  return PUBLIC_FIELDS.filter(([k]) => opp[k] && re.test(String(opp[k]))).map(([, label]) => label);
}
async function withAnonymityCheck(opp) {
  if (!opp) return opp;
  let row = opp;
  if (opp.client_id && opp.client_company === undefined) {
    const { rows } = await pool.query("SELECT company, name FROM users WHERE id = $1", [opp.client_id]);
    row = { ...opp, client_company: rows[0]?.company || null, client_name: rows[0]?.name || null };
  }
  const mentions = retailerNameMentions(row);
  return { ...opp, retailer_name_mentions: mentions };
}

// GET /api/admin/rise/opportunities
router.get("/opportunities", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, to_char(o.deadline, 'YYYY-MM-DD') AS deadline,
              (SELECT COUNT(*)::int FROM rise_applications a WHERE a.opportunity_id = o.id) AS application_count,
              c.company AS client_company, c.name AS client_name
       FROM rise_opportunities o LEFT JOIN users c ON c.id = o.client_id
       ORDER BY o.created_at DESC`
    );
    res.json({ opportunities: await Promise.all(rows.map(withAnonymityCheck)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/rise/opportunities — create a new posting. Does not
// auto-open it (see PUT .../open below) so an admin can prep the copy
// before it goes live.
router.post("/opportunities", async (req, res, next) => {
  try {
    const { title, description, benefits, eligibility, deadline, publicRetailerLabel } = req.body || {};
    if (!title) return res.status(400).json({ error: "Title is required." });
    const { rows } = await pool.query(
      `INSERT INTO rise_opportunities (title, description, benefits, eligibility, deadline, public_retailer_label, is_open)
       VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *, to_char(deadline, 'YYYY-MM-DD') AS deadline`,
      [String(title).trim(), clean(description), clean(benefits), clean(eligibility), clean(deadline), clean(publicRetailerLabel)]
    );
    res.status(201).json({ opportunity: await withAnonymityCheck(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id -- edit the public-page content of a call
// (ST6). Title is required; the other fields are optional and can be cleared.
router.put("/opportunities/:id", async (req, res, next) => {
  try {
    const { title, description, benefits, eligibility, deadline, publicRetailerLabel } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required." });
    const { rows } = await pool.query(
      `UPDATE rise_opportunities
       SET title = $1, description = $2, benefits = $3, eligibility = $4, deadline = $5, public_retailer_label = $6
       WHERE id = $7
       RETURNING *, to_char(deadline, 'YYYY-MM-DD') AS deadline`,
      [String(title).trim(), clean(description), clean(benefits), clean(eligibility), clean(deadline), clean(publicRetailerLabel), Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ error: "Opportunity not found." });
    res.json({ opportunity: await withAnonymityCheck(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id/client { clientId } -- which retailer
// this call belongs to. Build.RIV needs this to attach a startup project to
// a client (RIOS Build PRD section 10.1: "rise_opportunities: add
// client_id -- today a startup call isn't linked to a retailer").
router.put("/opportunities/:id/client", async (req, res, next) => {
  try {
    const { clientId } = req.body || {};
    if (clientId) {
      const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
      if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    }
    const { rows } = await pool.query(
      "UPDATE rise_opportunities SET client_id = $1 WHERE id = $2 RETURNING *",
      [clientId || null, Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ error: "Opportunity not found." });
    res.json({ opportunity: await withAnonymityCheck(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id/open -- open this call for
// applications. DR1-24: several calls can be open at once; opening one no
// longer closes the others (each closes on its own, below). The response
// repeats the anonymity check (DR1-25) so the Admin is warned at the moment
// the call goes public.
router.put("/opportunities/:id/open", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("UPDATE rise_opportunities SET is_open = true WHERE id = $1 RETURNING *", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Opportunity not found." });
    const checked = await withAnonymityCheck(rows[0]);
    res.json({ ok: true, retailerNameMentions: checked.retailer_name_mentions });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/opportunities/:id/close
router.put("/opportunities/:id/close", async (req, res, next) => {
  try {
    await pool.query("UPDATE rise_opportunities SET is_open = false WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/applications — every startup application, with
// aggregate jury stats. Admin is the only role that ever sees the average
// across all jurors here.
router.get("/applications", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, o.title AS opportunity_title,
             COUNT(s.id)::int AS score_count,
             AVG(s.total) AS avg_total
      FROM rise_applications a
      LEFT JOIN rise_opportunities o ON o.id = a.opportunity_id
      LEFT JOIN rise_scores s ON s.application_id = a.id
      GROUP BY a.id, o.title
      ORDER BY a.created_at DESC
    `);
    res.json({
      applications: rows.map((r) => ({ ...r, avg_total: r.avg_total != null ? Number(r.avg_total) : null })),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/applications/:id/riv-review { status } -- the RIV
// quality check gate (PRD "Startup review process: add an RIV quality
// check before submissions reach the retailer's jury"). Only an
// 'approved' application is ever returned to a juror (routes/rise.js
// filters on this); a juror can never see a 'pending' or 'rejected' one.
router.put("/applications/:id/riv-review", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be \"approved\" or \"rejected\"." });
    }
    // DR1-29: optional note when approving (the jury sees it); a reason is
    // required when rejecting (RIV only -- a juror never sees a rejected
    // application). Every review is also kept in rise_application_reviews.
    const note = clean(req.body && req.body.note);
    if (status === "rejected" && !note) {
      return res.status(400).json({ error: "Give a reason for rejecting this application." });
    }
    const { rows } = await pool.query(
      "UPDATE rise_applications SET riv_status = $1, riv_reviewed_by = $2, riv_reviewed_at = now(), riv_note = $3 WHERE id = $4 RETURNING *",
      [status, req.user.id, note, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Application not found." });
    await pool.query(
      "INSERT INTO rise_application_reviews (application_id, status, note, reviewed_by) VALUES ($1,$2,$3,$4)",
      [rows[0].id, status, note, req.user.id]
    );
    res.json({ application: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/applications/:id/decision { decision } -- R22 shortlist
// decision (shortlist / on_hold / not_selected / selected_for_pilot). Only
// 'selected_for_pilot' unlocks Build.RIV's "Create Build project" action
// (backend/routes/buildAdmin.js POST /from-application/:applicationId).
router.put("/applications/:id/decision", async (req, res, next) => {
  try {
    const { decision } = req.body || {};
    if (!["shortlist", "on_hold", "not_selected", "selected_for_pilot"].includes(decision)) {
      return res.status(400).json({ error: "Invalid decision." });
    }
    const { rows } = await pool.query(
      "UPDATE rise_applications SET decision = $1, decided_by = $2, decided_at = now() WHERE id = $3 RETURNING *",
      [decision, req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Application not found." });
    res.json({ application: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/applications/:id — one application with every
// individual jury score broken out (admin-only view of who scored what).
router.get("/applications/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows: appRows } = await pool.query("SELECT * FROM rise_applications WHERE id = $1", [id]);
    const application = appRows[0];
    if (!application) return res.status(404).json({ error: "Application not found." });

    const { rows: scoreRows } = await pool.query(
      `SELECT s.*, u.name AS jury_name, u.email AS jury_email
       FROM rise_scores s JOIN users u ON u.id = s.jury_user_id
       WHERE s.application_id = $1 ORDER BY s.updated_at DESC`,
      [id]
    );
    const { rows: reviewRows } = await pool.query(
      `SELECT r.id, r.status, r.note, r.created_at, u.name AS reviewed_by_name
       FROM rise_application_reviews r LEFT JOIN users u ON u.id = r.reviewed_by
       WHERE r.application_id = $1 ORDER BY r.created_at DESC`,
      [id]
    );
    // Pitch deck / solution document (metadata only; the file itself via the route below)
    const { rows: fileRows } = await pool.query(
      "SELECT id, file_name, content_type, size_bytes, created_at FROM rise_application_files WHERE application_id = $1 ORDER BY id",
      [id]
    );
    res.json({
      application,
      scores: scoreRows.map((r) => ({ ...r, total: Number(r.total) })),
      criteria: CRITERIA,
      reviews: reviewRows, // DR1-29
      files: fileRows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/applications/:id/files/:fileId -- download the
// startup's pitch deck / solution document. RIV Admin only (this router is
// admin-only); the jury never gets the file.
router.get("/applications/:id/files/:fileId", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT file_name, content_type, content FROM rise_application_files WHERE id = $1 AND application_id = $2",
      [Number(req.params.fileId), Number(req.params.id)]
    );
    const file = rows[0];
    if (!file) return res.status(404).json({ error: "File not found." });
    res.setHeader("Content-Type", file.content_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${String(file.file_name).replace(/[\r\n"]/g, "")}"`);
    res.send(file.content);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/rise/jury — jury roster with scoring progress. Includes
// which retailer each juror belongs to (PRD "Startup jury: the retailer's
// internal leadership acts as the jury" -- same per-client scoping as
// Ideathon's jury role, see db.js's I1 migration).
router.get("/jury", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.company, u.created_at, u.client_id,
             c.company AS client_company, c.name AS client_name,
             COUNT(s.id)::int AS scored_count
      FROM users u
      LEFT JOIN users c ON c.id = u.client_id AND c.role = 'client'
      LEFT JOIN rise_scores s ON s.jury_user_id = u.id
      WHERE u.role = 'rise_jury'
      GROUP BY u.id, c.company, c.name
      ORDER BY u.created_at DESC
    `);
    res.json({ jury: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/rise/jury — create a jury login, scoped to one retailer.
// Mirrors Ideas.RIV's admin-only POST /api/admin/ideas/users (and its I1
// "every jury login belongs to one client" rule): every account in RIOS is
// issued top-down, no role self-registers. The admin hands the juror their
// email + temporary password out of band (Slack, email, etc.).
router.post("/jury", async (req, res, next) => {
  try {
    const { email, password, name, company, clientId } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Name, email, and a temporary password are required." });
    }
    if (String(password).length < 8) return res.status(400).json({ error: "The temporary password must be at least 8 characters." });
    if (!clientId) return res.status(400).json({ error: "Choose which retailer this jury member belongs to." });
    const { rows: clientRows } = await pool.query("SELECT id, name, company FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const normalizedEmail = String(email).toLowerCase().trim();

    const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.length) return res.status(409).json({ error: "A user with that email already exists." });

    const password_hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company, client_id, must_change_password) VALUES ($1,$2,$3,'rise_jury',$4,$5,true) RETURNING id",
      [normalizedEmail, password_hash, String(name).trim(), (company || "").trim() || clientRows[0].company || null, clientRows[0].id]
    );
    res.status(201).json({ id: rows[0].id, email: normalizedEmail, name, role: "rise_jury", company: company || null, clientId: clientRows[0].id });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/rise/jury/:id/client { clientId } — move a jury login to a
// different retailer (same shape as Ideathon's analogous route).
router.put("/jury/:id/client", async (req, res, next) => {
  try {
    const { clientId } = req.body || {};
    const { rows: clientRows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'client'", [clientId]);
    if (!clientRows.length) return res.status(404).json({ error: "That client account doesn't exist." });
    const { rowCount } = await pool.query("UPDATE users SET client_id = $1 WHERE id = $2 AND role = 'rise_jury'", [clientId, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Jury login not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/rise/jury/:id — remove a jury account (their scores
// cascade-delete with them, per the FK ON DELETE CASCADE in db.rise.js)
router.delete("/jury/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'rise_jury'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
