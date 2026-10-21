// Build.RIV permission checks, matching the Oct 2026 "Proposed Screens"
// permission table exactly (RIV Admin / RIV Client Partner / Client Leader /
// Product Owner / Employee / Startup POC).
// Pure functions over a project row ({ client_id, product_owner_user_id,
// riv_manager_id, startup_poc_user_id, status, ... }) and req.user ({ id,
// role, client_id }), plus a caller-supplied list of client_ids the current
// riv_manager is assigned to (build_manager_clients) for the "assigned
// clients" scoping, and (for Employee) whether this user is the original
// idea's submitter for this project (resolved by the route, which already
// has the project's sources loaded -- see routes/build.js's
// employeeProjectIds()).
// All server-side (Express middleware/route code), never just hiding a
// button -- same principle the table states explicitly.

export function isAdmin(user) {
  return user?.role === "admin";
}

// Client Leader = the existing 'client' role.
export function isClientLeaderOf(user, project) {
  return user?.role === "client" && Number(user.id) === Number(project.client_id);
}

// Product Owner = the renamed client_poc role (role value is now
// 'product_owner' in the DB; see db.build.js's migration). Client-side,
// co-owns delivery, and is now the sole non-admin gate approver.
export function isProductOwnerOf(user, project) {
  return user?.role === "product_owner" && Number(user.id) === Number(project.product_owner_user_id);
}

// Startup POC: the external startup's own rep on a startup-pilot project.
// Scoped to exactly one project (build_projects.startup_poc_user_id), never
// to a whole client -- a startup has no visibility into the retailer's
// other projects.
export function isStartupPocOf(user, project) {
  return user?.role === "startup_poc" && Number(user.id) === Number(project.startup_poc_user_id);
}

export function isRivManagerOf(user, project, assignedClientIds) {
  if (user?.role !== "riv_manager") return false;
  if (Number(user.id) === Number(project.riv_manager_id)) return true;
  return (assignedClientIds || []).map(Number).includes(Number(project.client_id));
}

// pocClientId is the Product Owner's OWN client_id (looked up from the
// users table -- it isn't carried in the JWT). Viewing is scoped to "any
// project under my own client", matching GET /projects' list query for
// this role exactly -- isProductOwnerOf alone (specifically assigned as
// THIS project's product_owner_user_id) used to be the only path in, which
// meant a Product Owner could see a project in their list but get "You
// don't have access to this project" clicking into it the moment it wasn't
// assigned to them personally. Posting updates (canAddUpdate) stays
// restricted to the assigned Product Owner -- only viewing was ever meant
// to match the list.
//
// isLinkedEmployee: resolved by the caller (routes/build.js) -- true when
// this junior_employee is the original submitter of the idea this project
// was built from (permission table: Employee sees "Own project" only).
export function canSeeProject(user, project, assignedClientIds, pocClientId, isLinkedEmployee) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isClientLeaderOf(user, project)) return true;
  if (isProductOwnerOf(user, project)) return true;
  if (user?.role === "product_owner" && pocClientId != null && Number(pocClientId) === Number(project.client_id)) return true;
  if (isStartupPocOf(user, project)) return true;
  if (user?.role === "junior_employee" && isLinkedEmployee) return true;
  return false;
}

// "Create a project, assign people" -- RIV Admin, RIV Client Partner only.
// Approved workflow v2: only the RIV Admin creates projects (Admin console);
// a Client Partner works inside projects already assigned to them.
export function canCreateProject(user) {
  return isAdmin(user);
}

// "Add a status update" / "Upload files" -- the permission table gives
// these the same yes/no pattern: RIV Admin, RIV Client Partner, Product
// Owner, Employee (own project), Startup POC (own project). Client Leader
// cannot (reviews/comments only, via canComment below).
export function canAddUpdate(user, project, assignedClientIds, isLinkedEmployee) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isProductOwnerOf(user, project)) return true;
  if (isStartupPocOf(user, project)) return true;
  if (user?.role === "junior_employee" && isLinkedEmployee) return true;
  return false;
}

// "Edit project details" -- narrower than canAddUpdate: RIV Admin, RIV
// Client Partner, Product Owner only. Employee and Startup POC can post
// updates/files but not edit the project's own stage-gate fields.
export function canEditDetails(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isProductOwnerOf(user, project)) return true;
  return false;
}

// "Comment" -- everyone with any access to the project, including Client
// Leader (review-only elsewhere, but can always comment).
export function canComment(user, project, assignedClientIds, pocClientId, isLinkedEmployee) {
  return canSeeProject(user, project, assignedClientIds, pocClientId, isLinkedEmployee);
}

// "Edit ROI figures" -- Admin, RIV Client Partner, Product Owner edit in
// full; Client Leader may only confirm realised benefit (enforced by the
// route limiting which fields a Client Leader's PUT may touch, not here).
export function canEditRoi(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isProductOwnerOf(user, project)) return true;
  if (isClientLeaderOf(user, project)) return true; // route restricts to realised_benefit only
  return false;
}

// "Hold or stop a project" -- Admin, RIV Client Partner, Client Leader.
// Not in the proposed-screens table explicitly; kept as before.
// Approved workflow v2: hold / resume / stop is the RIV Admin or the
// project's Product Owner. The Client Leader reviews only, and the RIV
// Client Partner explicitly cannot hold or stop (they raise it with Admin).
export function canHoldOrStop(user, project) {
  if (isAdmin(user)) return true;
  if (isProductOwnerOf(user, project)) return true;
  return false;
}

// A Client Partner can't delete anything themselves -- they raise a delete
// request that only the RIV Admin can approve.
export function canRequestDelete(user, project, assignedClientIds) {
  return isRivManagerOf(user, project, assignedClientIds);
}
export function canDeleteProject(user) {
  return isAdmin(user);
}

// Money the Startup POC must never see (approved: "Startup POC can't see PO
// or contract amounts"). Stripped from every Build API response for that role.
export const HIDDEN_FROM_STARTUP_POC = new Set([
  "proposal_amount", "contract_value", "pilot_fee",
  "est_cost", "actual_cost", "est_benefit", "realised_benefit", "roi",
]);
export function stripMoneyForStartupPoc(value) {
  if (Array.isArray(value)) return value.map(stripMoneyForStartupPoc);
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (HIDDEN_FROM_STARTUP_POC.has(k)) continue;
      out[k] = stripMoneyForStartupPoc(v);
    }
    return out;
  }
  return value;
}

// "Close a project" / "Delete anything" -- RIV Admin only (RIV Client
// Partner can only *request* a delete -- handled as its own admin-review
// flow, not a permission grant, when that's built).
export function canClose(user) {
  return isAdmin(user);
}

// "Dashboard" -- Admin (all clients), RIV Client Partner (assigned
// clients), Client Leader / Product Owner (own company/projects only).
export function canSeeClientDashboard(user, clientId, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (user?.role === "riv_manager") return (assignedClientIds || []).map(Number).includes(Number(clientId));
  if (user?.role === "client" || user?.role === "product_owner") return Number(user.id) === Number(clientId) || Number(user.client_id) === Number(clientId);
  return false;
}

export function canSeePortfolioDashboard(user) {
  return isAdmin(user);
}

// Resolves a gate-approver token from backend/lib/buildWorkflow.js
// (gateApprovers()) against this project + user, honouring "RIV Admin can
// always also approve". Only 'product_owner' is emitted today, but this
// stays a loop so a future token is a one-line addition here, not a
// reshaped caller.
export function canApproveGate(user, project, tokens, assignedClientIds) {
  if (isAdmin(user)) return true;
  for (const token of tokens) {
    if (token === "product_owner" && isProductOwnerOf(user, project)) return true;
    if (token === "riv_manager" && isRivManagerOf(user, project, assignedClientIds)) return true;
  }
  return false;
}

// "Send back" (BLD-AC06) -- any gate approver for the stage being left, or
// admin. Same resolution as canApproveGate; kept as a separate export for
// readability at call sites.
export const canSendBack = canApproveGate;
