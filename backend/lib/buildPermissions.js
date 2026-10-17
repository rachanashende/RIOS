// Build.RIV permission checks, matching PRD section 10.2's table exactly.
// Pure functions over a project row ({ client_id, owner_user_id, poc_user_id,
// riv_manager_id, status, ... }) and req.user ({ id, role, client_id }),
// plus a caller-supplied list of client_ids the current riv_manager is
// assigned to (build_manager_clients) for the "assigned clients" scoping.
// All server-side (Express middleware/route code), never just hiding a
// button -- same principle the PRD states explicitly.

export function isAdmin(user) {
  return user?.role === "admin";
}

// Client Leader = the existing 'client' role (PRD section 4 role table).
export function isClientLeaderOf(user, project) {
  return user?.role === "client" && Number(user.id) === Number(project.client_id);
}

export function isPocOf(user, project) {
  return user?.role === "client_poc" && Number(user.id) === Number(project.poc_user_id);
}

export function isOwnerOf(user, project) {
  return Number(user?.id) === Number(project.owner_user_id);
}

export function isRivManagerOf(user, project, assignedClientIds) {
  if (user?.role !== "riv_manager") return false;
  if (Number(user.id) === Number(project.riv_manager_id)) return true;
  return (assignedClientIds || []).map(Number).includes(Number(project.client_id));
}

export function canSeeProject(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isClientLeaderOf(user, project)) return true;
  if (isPocOf(user, project)) return true;
  if (isOwnerOf(user, project)) return true;
  return false;
}

// "Create a project" -- RIV Admin, RIV Manager only (permission table).
export function canCreateProject(user) {
  return isAdmin(user) || user?.role === "riv_manager";
}

// "Add a status update" -- Admin, RIV Manager, Client POC, or the project's
// own owner (their own project only).
export function canAddUpdate(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isPocOf(user, project)) return true;
  if (isOwnerOf(user, project)) return true;
  return false;
}

// "Edit ROI figures" -- Admin, RIV Manager, Client POC edit; Client Leader
// may only confirm realised benefit (enforced by the route limiting which
// fields a Client Leader's PUT may touch, not here); owner can edit their
// own project's figures.
export function canEditRoi(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isPocOf(user, project)) return true;
  if (isOwnerOf(user, project)) return true;
  if (isClientLeaderOf(user, project)) return true; // route restricts to realised_benefit only
  return false;
}

// "Hold or stop a project" -- Admin, RIV Manager, Client Leader. Not POC,
// not the project owner.
export function canHoldOrStop(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isClientLeaderOf(user, project)) return true;
  return false;
}

// "Close a project" -- RIV Admin only.
export function canClose(user) {
  return isAdmin(user);
}

// "Leader dashboard" -- Admin (all clients), RIV Manager (assigned
// clients), Client Leader / Client POC (own client only).
export function canSeeClientDashboard(user, clientId, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (user?.role === "riv_manager") return (assignedClientIds || []).map(Number).includes(Number(clientId));
  if (user?.role === "client" || user?.role === "client_poc") return Number(user.id) === Number(clientId) || Number(user.client_id) === Number(clientId);
  return false;
}

export function canSeePortfolioDashboard(user) {
  return isAdmin(user);
}

// Resolves a gate-approver token from backend/lib/buildWorkflow.js
// (gateApprovers()) against this project + user, honouring "RIV Admin can
// always also approve" (table 10.2, "Advance stage (gate): RIV Admin Yes").
export function canApproveGate(user, project, tokens, assignedClientIds) {
  if (isAdmin(user)) return true;
  for (const token of tokens) {
    if (token === "owner" && isOwnerOf(user, project)) return true;
    if (token === "client_poc" && isPocOf(user, project)) return true;
    if (token === "riv_manager" && isRivManagerOf(user, project, assignedClientIds)) return true;
    if (token === "client" && isClientLeaderOf(user, project)) return true;
  }
  return false;
}

// "Send back" (BLD-AC06) -- any gate approver for the stage being left, or
// admin. Same resolution as canApproveGate; kept as a separate export for
// readability at call sites.
export const canSendBack = canApproveGate;
