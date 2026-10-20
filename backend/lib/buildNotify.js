// Fires the PRD 10.3 notification table: an in-app row (build_notifications)
// plus an email (lib/email.js), for every recipient, best-effort. A failed
// email never fails the request that triggered it -- the stage change,
// update, etc. has already happened by the time this runs.
import pool from "../db.js";
import { sendBuildNotificationEmail } from "./email.js";

// recipients: array of { id, email, name } -- callers already have these
// rows in hand from the project/user query, so this never re-queries.
// Duplicate/null ids are filtered so one person isn't notified twice for
// the same event (e.g. the owner and the POC happen to be the same login).
export async function notifyBuild(recipients, { projectId, projectCode, kind, message, subject, heading, body }) {
  const seen = new Set();
  const list = (recipients || []).filter((r) => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  if (!list.length) return;

  await Promise.all(
    list.map(async (r) => {
      try {
        await pool.query(
          `INSERT INTO build_notifications (user_id, project_id, kind, message) VALUES ($1,$2,$3,$4)`,
          [r.id, projectId || null, kind, message]
        );
      } catch (err) {
        console.error("[build] in-app notification insert failed:", err);
      }
      if (!r.email) return;
      try {
        await sendBuildNotificationEmail(r.email, r.name, {
          subject: subject || message,
          heading: heading || message,
          body: body || message,
          projectCode,
        });
      } catch (err) {
        console.error("[build] notification email failed:", err);
      }
    })
  );
}

// Recipients helper: dedupes/loads the people who matter for a project row
// (Product Owner, RIV Client Partner, Client Leader, Startup POC, RIV
// admins) so routes don't each re-derive this. `roles` narrows which of
// those relationships to include. "poc" is kept as the token name callers
// pass (matches the historical routes/build.js call sites) even though the
// role itself is now 'product_owner' -- renaming every call site's string
// literal wasn't worth the churn for an internal-only token.
export async function recipientsForProject(project, roles) {
  const ids = [];
  if (roles.includes("poc") && project.product_owner_user_id) ids.push(project.product_owner_user_id);
  if (roles.includes("riv_manager") && project.riv_manager_id) ids.push(project.riv_manager_id);
  if (roles.includes("client") && project.client_id) ids.push(project.client_id);
  if (roles.includes("startup_poc") && project.startup_poc_user_id) ids.push(project.startup_poc_user_id);

  const people = [];
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT id, email, name FROM users WHERE id = ANY($1::int[])`,
      [ids]
    );
    people.push(...rows);
  }
  if (roles.includes("admins")) {
    const { rows } = await pool.query(`SELECT id, email, name FROM users WHERE role = 'admin'`);
    people.push(...rows);
  }
  return people;
}
