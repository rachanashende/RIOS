// Build.RIV permission checks -- workflow v2 (Oct 2026), as approved:
//
//   Role (DB role)                   Sees                     Can
//   RIV Admin (admin)                every client             everything, incl. close and delete
//   RIV Client Partner (riv_manager) assigned clients only    status updates, files, edit details/ROI;
//                                                             no hold/stop, no close, no delete (asks admin)
//   Client Leader (client)           own company              reviews: view, comment via updates feed,
//                                                             confirm realised benefit
//   Product Owner (client_poc)       own company's projects   owns delivery: completes/approves every
//                                                             stage, Pilot decision, hold/stop, details, ROI
//   Employee (junior_employee)       projects they're on      status updates and files
//   Startup POC (startup_poc)        projects they're on      status updates and files; never sees
//                                                             PO / contract / budget amounts
//
// The project row's relationships: client_id = Client Leader account,
// poc_user_id = Product Owner, owner_user_id = Employee (internal) or
// Startup POC (startup), riv_manager_id = RIV Client Partner.
// All checks run server-side -- the frontend only hides what these refuse.

export function isAdmin(user) {
  return user?.role === "admin";
}

export function isClientLeaderOf(user, project) {
  return user?.role === "client" && Number(user.id) === Number(project.client_id);
}

// Product Owner of this project.
export function isPocOf(user, project) {
  return user?.role === "client_poc" && Number(user.id) === Number(project.poc_user_id);
}

// Employee / Startup POC named on this project.
export function isOwnerOf(user, project) {
  return project?.owner_user_id != null && Number(user?.id) === Number(project.owner_user_id);
}

export function isStartupPoc(user) {
  return user?.role === "startup_poc";
}

export function isRivManagerOf(user, project, assignedClientIds) {
  if (user?.role !== "riv_manager") return false;
  if (Number(user.id) === Number(project.riv_manager_id)) return true;
  return (assignedClientIds || []).map(Number).includes(Number(project.client_id));
}

// pocClientId is the client_poc user's own client_id (looked up from the
// users table -- it isn't carried in the JWT). A Product Owner can view
// every project of their own company; acting is limited to the projects
// they own (isPocOf).
export function canSeeProject(user, project, assignedClientIds, pocClientId) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isClientLeaderOf(user, project)) return true;
  if (isPocOf(user, project)) return true;
  if (user?.role === "client_poc" && pocClientId != null && Number(pocClientId) === Number(project.client_id)) return true;
  if (isOwnerOf(user, project)) return true;
  return false;
}

// Create a project / assign people / manage logins -- RIV Admin only.
export function canCreateProject(user) {
  return isAdmin(user);
}

// Status updates and files -- everyone working on the project.
export function canAddUpdate(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isPocOf(user, project)) return true;
  if (isOwnerOf(user, project)) return true;
  return false;
}

// Project details (stage fields, dates) and lessons learned.
export function canEditDetails(user, project, assignedClientIds) {
  if (isAdmin(user)) return true;
  if (isRivManagerOf(user, project, assignedClientIds)) return true;
  if (isPocOf(user, project)) return true;
  return false;
}

// ROI figures. The Client Leader may only confirm realised benefit (the
// route limits which fields their PUT may touch).
export function canEditRoi(user, project, assignedClientIds) {
  if (canEditDetails(user, project, assignedClientIds)) return true;
  if (isClientLeaderOf(user, project)) return true;
  return false;
}

// Hold / resume / stop -- the Product Owner (owns delivery) and RIV Admin.
// Not the Client Partner, not the Client Leader (reviews only).
export function canHoldOrStop(user, project) {
  if (isAdmin(user)) return true;
  if (isPocOf(user, project)) return true;
  return false;
}

// Close a project -- RIV Admin only.
export function canClose(user) {
  return isAdmin(user);
}

// Delete anything (files, updates, projects) -- RIV Admin only.
export function canDelete(user) {
  return isAdmin(user);
}

// A RIV Client Partner asks RIV Admin to delete instead.
export function canRequestDelete(user, project, assignedClientIds) {
  return isRivManagerOf(user, project, assignedClientIds);
}

// Money the Startup POC must not see (PO and contract amounts, the
// retailer's budget and benefit figures).
export function canSeeAmounts(user) {
  return !isStartupPoc(user);
}

// Dashboard: Admin (all clients), Client Partner (assigned clients),
// Client Leader / Product Owner (own company only). pocClientId as above.
export function canSeeClientDashboard(user, clientId, assignedClientIds, pocClientId) {
  if (isAdmin(user)) return true;
  if (user?.role === "riv_manager") return (assignedClientIds || []).map(Number).includes(Number(clientId));
  if (user?.role === "client") return Number(user.id) === Number(clientId);
  if (user?.role === "client_poc") return pocClientId != null && Number(pocClientId) === Number(clientId);
  return false;
}

export function canSeePortfolioDashboard(user) {
  return isAdmin(user);
}

// Resolves a stage-approver token from buildWorkflow.gateApprovers()
// against this project + user. RIV Admin can always also approve.
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

export const canSendBack = canApproveGate;

// Everything the project page needs to decide which buttons to show, in
// one place, so the frontend never re-derives the rules.
export function permissionsFor(user, project, assignedClientIds) {
  const approve = project.stage !== "closed" && canApproveGate(user, project, ["client_poc"], assignedClientIds);
  return {
    addUpdate: canAddUpdate(user, project, assignedClientIds),
    uploadFiles: canAddUpdate(user, project, assignedClientIds),
    editDetails: canEditDetails(user, project, assignedClientIds),
    editRoi: canEditDetails(user, project, assignedClientIds),
    confirmBenefit: isClientLeaderOf(user, project),
    approveStage: approve,
    pilotDecision: approve,
    holdStop: canHoldOrStop(user, project),
    close: canClose(user),
    delete: canDelete(user),
    requestDelete: canRequestDelete(user, project, assignedClientIds),
    seeAmounts: canSeeAmounts(user),
  };
}
