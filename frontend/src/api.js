// Two completely separate login sessions live in this browser: the main
// site's (client/admin) and Ideas.RIV's (employee/jury). They're stored
// under different localStorage keys and attached to requests independently,
// so logging into one can never silently overwrite or break the other —
// you can be logged in as admin on the main site AND as an employee on
// Ideas.RIV in the same browser tab at the same time.
const TOKEN_KEY = "rios-token";
const USER_KEY = "rios-user";
const IDEAS_TOKEN_KEY = "rios-ideas-token";
const IDEAS_USER_KEY = "rios-ideas-user";
const RISE_TOKEN_KEY = "rios-rise-token";
const RISE_USER_KEY = "rios-rise-user";
const INDEX_TOKEN_KEY = "rios-index-token";
const INDEX_USER_KEY = "rios-index-user";
const BUILD_TOKEN_KEY = "rios-build-token";
const BUILD_USER_KEY = "rios-build-user";

// In local dev, the Vite dev server proxies /api/* to the backend (see
// vite.config.js) — no env var needed. In a real deployment, frontend and
// backend are separate URLs, so set VITE_API_URL (at build time) to the
// backend's public URL, e.g. https://rios-backend.onrender.com
const API_BASE = import.meta.env.VITE_API_URL || "";

// ---- main site session (client/admin) ------------------------------
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// O5: logging out anywhere ends every session this browser holds (main site and all three modules),
// and a fresh login starts from a clean slate, so a leftover session can never show someone else's data.
export function clearAllSessions() {
  [TOKEN_KEY, USER_KEY, IDEAS_TOKEN_KEY, IDEAS_USER_KEY, RISE_TOKEN_KEY, RISE_USER_KEY, INDEX_TOKEN_KEY, INDEX_USER_KEY, BUILD_TOKEN_KEY, BUILD_USER_KEY]
    .forEach((k) => localStorage.removeItem(k));
}

// ---- Ideas.RIV session (employee/jury) — fully separate from the above
export function getIdeasToken() { return localStorage.getItem(IDEAS_TOKEN_KEY); }
export function getStoredIdeasUser() {
  try { return JSON.parse(localStorage.getItem(IDEAS_USER_KEY)); } catch { return null; }
}
export function setIdeasSession(token, user) {
  localStorage.setItem(IDEAS_TOKEN_KEY, token);
  localStorage.setItem(IDEAS_USER_KEY, JSON.stringify(user));
}
export function clearIdeasSession() {
  localStorage.removeItem(IDEAS_TOKEN_KEY);
  localStorage.removeItem(IDEAS_USER_KEY);
}

// ---- Rise.RIV session (rise_jury) — fully separate from both of the above.
// Startup applicants never get a session at all (no login, per spec).
export function getRiseToken() { return localStorage.getItem(RISE_TOKEN_KEY); }
export function getStoredRiseUser() {
  try { return JSON.parse(localStorage.getItem(RISE_USER_KEY)); } catch { return null; }
}
export function setRiseSession(token, user) {
  localStorage.setItem(RISE_TOKEN_KEY, token);
  localStorage.setItem(RISE_USER_KEY, JSON.stringify(user));
}
export function clearRiseSession() {
  localStorage.removeItem(RISE_TOKEN_KEY);
  localStorage.removeItem(RISE_USER_KEY);
}

// ---- R-Index session (index_respondent) — fully separate from the above.
export function getIndexToken() { return localStorage.getItem(INDEX_TOKEN_KEY); }
export function getStoredIndexUser() {
  try { return JSON.parse(localStorage.getItem(INDEX_USER_KEY)); } catch { return null; }
}
export function setIndexSession(token, user) {
  localStorage.setItem(INDEX_TOKEN_KEY, token);
  localStorage.setItem(INDEX_USER_KEY, JSON.stringify(user));
}
export function clearIndexSession() {
  localStorage.removeItem(INDEX_TOKEN_KEY);
  localStorage.removeItem(INDEX_USER_KEY);
}

// ---- Build.RIV session (product_owner / riv_manager / startup_poc) —
// fully separate from the above. Build.RIV is the one module that's shared
// ground between the main site's existing logins (client leader, admin —
// they keep using their main-site session, see buildRequest() below) and
// login types that have no other home in RIOS: product_owner (the Oct 2026
// "Proposed Screens" rename of client_poc), riv_manager, and startup_poc.
// Those get their own isolated token/user pair, same as Ideas/Rise/Index,
// so e.g. an admin testing the module and a product_owner can both be
// logged in in the same browser tab without clobbering each other.
export function getBuildToken() { return localStorage.getItem(BUILD_TOKEN_KEY); }
export function getStoredBuildUser() {
  try { return JSON.parse(localStorage.getItem(BUILD_USER_KEY)); } catch { return null; }
}
export function setBuildSession(token, user) {
  localStorage.setItem(BUILD_TOKEN_KEY, token);
  localStorage.setItem(BUILD_USER_KEY, JSON.stringify(user));
}
export function clearBuildSession() {
  localStorage.removeItem(BUILD_TOKEN_KEY);
  localStorage.removeItem(BUILD_USER_KEY);
}

// Build.RIV's project list/dashboard routes take several optional filters
// (type, stage, health, status, q, clientId, period...) -- this turns a
// {key: value} object into a "?key=value&..." suffix, skipping anything
// null/undefined/empty so an unused filter is simply left off the URL.
function toQuery(params) {
  if (!params) return "";
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!usable.length) return "";
  return "?" + usable.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

async function requestWithToken(path, { method = "GET", body, raw, keepalive } = {}, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...(keepalive ? { keepalive: true } : {}),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try { message = (await res.json()).error || message; } catch {}
    throw new Error(message);
  }
  if (raw) return res;
  return res.json();
}

// Main site calls attach the main site's token.
function request(path, opts) { return requestWithToken(path, opts, getToken()); }
// Ideas.RIV calls (employee/jury) attach Ideas.RIV's own token instead.
function ideasRequest(path, opts) { return requestWithToken(path, opts, getIdeasToken()); }
// Rise.RIV calls (rise_jury) attach Rise.RIV's own token instead.
function riseRequest(path, opts) { return requestWithToken(path, opts, getRiseToken()); }
// R-Index calls (index_respondent) attach R-Index's own token instead.
function indexRequest(path, opts) { return requestWithToken(path, opts, getIndexToken()); }
// Build.RIV calls: a project's Product Owner can be any existing user
// (admin, a client leader, or an internal RIOS teammate) as well as the
// product_owner/riv_manager/startup_poc logins, so — unlike the other
// modules — this falls back to the main site's token when no Build-
// specific session is active, rather than requiring everyone to log in
// twice.
function buildRequest(path, opts) { return requestWithToken(path, opts, getBuildToken() || getToken()); }

// O17: the login reply says whether the password is a temporary one; keep that on the user object.
async function loginRequest(email, password) {
  const d = await request("/auth/login", { method: "POST", body: { email, password } });
  return { ...d, user: { ...d.user, mustChangePassword: !!d.mustChangePassword } };
}
// O17: a module login that finds a temporary password sends the person to the set-your-password screen.
export function divertIfTemporaryPassword(token, user) {
  if (!user || !user.mustChangePassword) return false;
  clearAllSessions();
  setSession(token, user);
  window.location.assign("/?action=change-password");
  return true;
}

export const api = {
  login: (email, password) => loginRequest(email, password),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  forgotPassword: (email) => request("/auth/forgot", { method: "POST", body: { email } }),
  resetPassword: (token, password) => request("/auth/reset", { method: "POST", body: { token, password } }),
  signup: (payload) => request("/auth/signup", { method: "POST", body: payload }),
  me: () => request("/auth/me"),

  getQuestions: () => request("/questions"),
  getResponses: () => request("/responses"),
  saveResponses: (responses, opts = {}) => request("/responses", { method: "PUT", body: { responses }, keepalive: !!opts.keepalive }),
  submitAudit: () => request("/responses/submit", { method: "POST" }),
  reopenAudit: (id) => request(`/admin/clients/${id}/reopen`, { method: "POST" }),
  clearResponses: () => request("/responses", { method: "DELETE" }),

  listClients: () => request("/admin/clients"),
  createClient: (payload) => request("/admin/clients", { method: "POST", body: payload }),
  adminResetPassword: (id, password) => request(`/admin/users/${id}/password`, { method: "PUT", body: { password } }),
  deleteClient: (id) => request(`/admin/clients/${id}`, { method: "DELETE" }),
  getClientResponses: (id) => request(`/admin/clients/${id}/responses`),

  exportUrl: (type, userId) => `${API_BASE}/api/export/${type}${userId ? `?userId=${userId}` : ""}`,

  // ---- Ideas.RIV (employee/jury) — uses its own isolated token ------
  ideasLogin: (email, password) => loginRequest(email, password), // same endpoint, token just isn't attached to anything yet here
  getOpportunities: () => ideasRequest("/ideas/opportunities"),
  getIdeas: (questionId) => ideasRequest(`/ideas${questionId ? `?questionId=${questionId}` : ""}`),
  getIdeaRatings: (ideaId) => ideasRequest(`/ideas/${ideaId}/ratings`),
  getMyIdeas: () => ideasRequest("/ideas/mine"),
  updateIdea: (id, payload) => ideasRequest(`/ideas/${id}`, { method: "PUT", body: payload }),
  deleteIdea: (id) => ideasRequest(`/ideas/${id}`, { method: "DELETE" }),
  submitIdeas: (ideas) => ideasRequest("/ideas", { method: "POST", body: { ideas } }),
  getMyRatingForIdea: (ideaId) => ideasRequest(`/ideas/${ideaId}/ratings/mine`),
  submitRating: (ideaId, criteria, comment) => ideasRequest(`/ideas/${ideaId}/ratings`, { method: "POST", body: { criteria, comment } }),
  getLeaderboard: () => ideasRequest("/ideas/leaderboard"),
  critTurn: (ideaId, messages) => ideasRequest("/ideas/crit-turn", { method: "POST", body: { ideaId, messages } }),

  // ---- Ideas.RIV admin (source client + employee/jury accounts) -----
  // Called only from the main site's admin panel, so these correctly use
  // the main site's (admin) token, not the Ideas.RIV one.
  getIdeasSettings: () => request("/admin/ideas/settings"),
  setIdeasSourceClient: (sourceClientId) => request("/admin/ideas/settings", { method: "PUT", body: { sourceClientId } }),
  listIdeasUsers: (role, clientId) => request(`/admin/ideas/users?role=${role}${clientId ? `&clientId=${clientId}` : ""}`),
  assignIdeasUserClient: (id, clientId) => request(`/admin/ideas/users/${id}/client`, { method: "PUT", body: { clientId } }),
  createIdeasUser: (payload) => request("/admin/ideas/users", { method: "POST", body: payload }),
  deleteIdeasUser: (id) => request(`/admin/ideas/users/${id}`, { method: "DELETE" }),
  getEmployeeIdeas: (id) => request(`/admin/ideas/users/${id}/ideas`),

  // ---- Rise.RIV (public + jury) — uses its own isolated token ------
  getRiseOpportunity: () => request("/rise/opportunity"), // public, no token needed either way
  getRiseCriteria: () => request("/rise/criteria"),
  submitRiseApplication: (payload) => request("/rise/apply", { method: "POST", body: payload }),
  riseJuryLogin: (email, password) => loginRequest(email, password), // same endpoint, token just isn't attached to anything yet here
  getRiseApplications: () => riseRequest("/rise/applications"),
  getRiseApplication: (id) => riseRequest(`/rise/applications/${id}`),
  submitRiseScore: (id, payload) => riseRequest(`/rise/applications/${id}/score`, { method: "POST", body: payload }),
  getRiseDashboard: () => riseRequest("/rise/dashboard"),

  // ---- Rise.RIV admin (opportunities, applications, jury roster) ----
  // Called only from the main site's admin panel, so these correctly use
  // the main site's (admin) token, not Rise.RIV's own.
  listRiseOpportunities: () => request("/admin/rise/opportunities"),
  updateRiseOpportunity: (id, payload) => request(`/admin/rise/opportunities/${id}`, { method: "PUT", body: payload }),
  createRiseOpportunity: (payload) => request("/admin/rise/opportunities", { method: "POST", body: payload }),
  openRiseOpportunity: (id) => request(`/admin/rise/opportunities/${id}/open`, { method: "PUT" }),
  closeRiseOpportunity: (id) => request(`/admin/rise/opportunities/${id}/close`, { method: "PUT" }),
  listRiseApplicationsAdmin: () => request("/admin/rise/applications"),
  getRiseApplicationAdmin: (id) => request(`/admin/rise/applications/${id}`),
  listRiseJury: () => request("/admin/rise/jury"),
  createRiseJury: (payload) => request("/admin/rise/jury", { method: "POST", body: payload }),
  deleteRiseJury: (id) => request(`/admin/rise/jury/${id}`, { method: "DELETE" }),

  // ---- R-Index (public + index_respondent) — uses its own isolated token
  getIndexCampaigns: () => request("/index/campaigns"), // public, no token needed either way
  getIndexQuestions: () => request("/index/questions"), // public
  indexSignup: (payload) => request("/index/signup", { method: "POST", body: payload }),
  indexLogin: (email, password) => loginRequest(email, password), // same shared endpoint, token just isn't attached to anything yet here
  getMyIndexEntries: () => indexRequest("/index/my-entries"),
  submitIndexEntry: (payload) => indexRequest("/index/entries", { method: "POST", body: payload }),
  getIndexEntry: (id) => indexRequest(`/index/entries/${id}`),
  getIndexEntryDashboard: (id) => indexRequest(`/index/entries/${id}/dashboard`),
  getIndexCampaignReport: (campaignId) => indexRequest(`/index/campaigns/${campaignId}/report`),
  indexExportUrl: (type, campaignId) => `${API_BASE}/api/index/export/${type}?campaignId=${campaignId}`,
  // O22: the export routes require a login token, which a plain <a href> link can't send
  // (it opened "Not logged in"). Fetch with R-Index's own token, then save the file.
  downloadIndexExport: async (type, campaignId) => {
    const token = getIndexToken();
    const res = await fetch(`${API_BASE}/api/index/export/${type}?campaignId=${campaignId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try { message = (await res.json()).error || message; } catch {}
      throw new Error(message);
    }
    const blob = await res.blob();
    const match = (res.headers.get("Content-Disposition") || "").match(/filename="(.+)"/);
    const filename = match ? match[1] : `rindex-campaign-${campaignId}.${type === "excel" ? "xlsx" : "pdf"}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },

  // ---- R-Index admin (campaigns + entries) -------------------------
  // These use indexRequest() (the R-Index-isolated token), NOT request()
  // (the main site's token) — an admin reaches these actions by logging
  // in through R-Index's OWN login form (getIndexToken()), which is a
  // completely separate session from the main site's, by design (see
  // setIndexSession()/getIndexToken() above). Using request() here would
  // attach whatever token the main site happens to have (often none, if
  // this admin never separately logged into the main site in this
  // browser), producing a "Not logged in" error despite a valid R-Index
  // session actually being active — exactly the bug this fixes.
  listIndexCampaignsAdmin: () => indexRequest("/admin/index/campaigns"),
  createIndexCampaign: (payload) => indexRequest("/admin/index/campaigns", { method: "POST", body: payload }),
  updateIndexCampaign: (id, payload) => indexRequest(`/admin/index/campaigns/${id}`, { method: "PUT", body: payload }),
  openIndexCampaign: (id) => indexRequest(`/admin/index/campaigns/${id}/open`, { method: "PUT" }),
  closeIndexCampaign: (id) => indexRequest(`/admin/index/campaigns/${id}/close`, { method: "PUT" }),
  featureIndexCampaign: (id) => indexRequest(`/admin/index/campaigns/${id}/feature`, { method: "PUT" }),
  unfeatureIndexCampaign: (id) => indexRequest(`/admin/index/campaigns/${id}/unfeature`, { method: "PUT" }),
  listIndexEntriesAdmin: (campaignId) => indexRequest(`/admin/index/campaigns/${campaignId}/entries`),
  createIndexEntryAdmin: (payload) => indexRequest("/admin/index/entries", { method: "POST", body: payload }),
  updateIndexEntryAdmin: (id, payload) => indexRequest(`/admin/index/entries/${id}`, { method: "PUT", body: payload }),
  deleteIndexEntryAdmin: (id) => indexRequest(`/admin/index/entries/${id}`, { method: "DELETE" }),
  getIndexCampaignReportAdmin: (campaignId) => indexRequest(`/admin/index/campaigns/${campaignId}/report`),

  // ---- Build.RIV: shared routes (backend/routes/build.js). Reachable by
  // admin, riv_manager, client, product_owner, startup_poc, or a linked
  // junior_employee -- see
  // buildRequest() above for why this attaches the Build session token
  // when there is one, falling back to the main site's otherwise.
  listBuildProjects: (params) => buildRequest(`/build/projects${toQuery(params)}`),
  getBuildProject: (id) => buildRequest(`/build/projects/${id}`),
  addBuildUpdate: (id, payload) => buildRequest(`/build/projects/${id}/updates`, { method: "POST", body: payload }),
  editBuildUpdate: (updateId, payload) => buildRequest(`/build/updates/${updateId}`, { method: "PUT", body: payload }),
  advanceBuildStage: (id, reason) => buildRequest(`/build/projects/${id}/advance`, { method: "POST", body: { reason } }),
  sendBackBuildStage: (id, payload) => buildRequest(`/build/projects/${id}/send-back`, { method: "POST", body: payload }),
  decideBuildPilot: (id, payload) => buildRequest(`/build/projects/${id}/pilot-decision`, { method: "POST", body: payload }),
  holdBuildProject: (id, reason) => buildRequest(`/build/projects/${id}/hold`, { method: "POST", body: { reason } }),
  resumeBuildProject: (id) => buildRequest(`/build/projects/${id}/resume`, { method: "POST" }),
  stopBuildProject: (id, reason) => buildRequest(`/build/projects/${id}/stop`, { method: "POST", body: { reason } }),
  closeBuildProject: (id, outcome) => buildRequest(`/build/projects/${id}/close`, { method: "POST", body: { outcome } }),
  updateBuildDetails: (id, payload) => buildRequest(`/build/projects/${id}/details`, { method: "PUT", body: payload }),
  updateBuildMetrics: (id, payload) => buildRequest(`/build/projects/${id}/metrics`, { method: "PUT", body: payload }),
  updateBuildLessons: (id, payload) => buildRequest(`/build/projects/${id}/lessons`, { method: "PUT", body: payload }),
  // File upload/download need raw fetch (multipart body / binary response),
  // not the JSON requestWithToken() wrapper -- same reason downloadIndexExport
  // above doesn't use indexRequest() either.
  uploadBuildFile: async (id, file, stage) => {
    const token = getBuildToken() || getToken();
    const form = new FormData();
    form.append("file", file);
    if (stage) form.append("stage", stage);
    const res = await fetch(`${API_BASE}/api/build/projects/${id}/files`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try { message = (await res.json()).error || message; } catch {}
      throw new Error(message);
    }
    return res.json();
  },
  buildFileUrl: (projectId, fileId) => `${API_BASE}/api/build/projects/${projectId}/files/${fileId}`,
  downloadBuildFile: async (projectId, fileId, fileName) => {
    const token = getBuildToken() || getToken();
    const res = await fetch(`${API_BASE}/api/build/projects/${projectId}/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  listBuildNotifications: () => buildRequest("/build/notifications"),
  markBuildNotificationRead: (id) => buildRequest(`/build/notifications/${id}/read`, { method: "PUT" }),

  // ---- Build.RIV: Leader dashboard (backend/routes/buildDashboard.js)
  getBuildClientDashboard: (clientId, params) => buildRequest(`/build/dashboard/client/${clientId}${toQuery(params)}`),
  getBuildPortfolioDashboard: () => buildRequest("/build/dashboard/portfolio"),

  // ---- Build.RIV: admin + RIV Manager console (backend/routes/buildAdmin.js)
  createBuildProject: (payload) => buildRequest("/admin/build/projects", { method: "POST", body: payload }),
  createBuildProjectFromIdea: (ideaId) => buildRequest(`/admin/build/from-idea/${ideaId}`, { method: "POST" }),
  createBuildProjectFromApplication: (applicationId, clientId) =>
    buildRequest(`/admin/build/from-application/${applicationId}`, { method: "POST", body: clientId ? { clientId } : {} }),
  assignBuildProject: (id, payload) => buildRequest(`/admin/build/projects/${id}/assign`, { method: "PUT", body: payload }),
  listBuildPocs: (clientId) => buildRequest(`/admin/build/poc${toQuery({ clientId })}`),
  createBuildPoc: (payload) => buildRequest("/admin/build/poc", { method: "POST", body: payload }),
  deleteBuildPoc: (id) => buildRequest(`/admin/build/poc/${id}`, { method: "DELETE" }),
  listBuildStartupPocs: (projectId) => buildRequest(`/admin/build/startup-poc${toQuery({ projectId })}`),
  createBuildStartupPoc: (payload) => buildRequest("/admin/build/startup-poc", { method: "POST", body: payload }),
  deleteBuildStartupPoc: (id) => buildRequest(`/admin/build/startup-poc/${id}`, { method: "DELETE" }),
  getReadyForBuild: () => buildRequest("/admin/build/ready-for-build"),
  // Build-scoped Client Leader logins -- separate from the main site's own
  // Manage Clients (api.listClients/createClient), which still creates
  // ordinary full-access clients. These are "client" role too, just flagged
  // so they only ever see Build.RIV (see db.build.js's build_scoped column).
  listBuildClients: () => buildRequest("/admin/build/clients"),
  createBuildClient: (payload) => buildRequest("/admin/build/clients", { method: "POST", body: payload }),
  deleteBuildClient: (id) => buildRequest(`/admin/build/clients/${id}`, { method: "DELETE" }),
  listBuildManagers: () => buildRequest("/admin/build/managers"),
  createBuildManager: (payload) => buildRequest("/admin/build/managers", { method: "POST", body: payload }),
  setBuildManagerClients: (id, clientIds) => buildRequest(`/admin/build/managers/${id}/clients`, { method: "PUT", body: { clientIds } }),
  deleteBuildManager: (id) => buildRequest(`/admin/build/managers/${id}`, { method: "DELETE" }),
  linkBuildReassess: (projectId, questionId) => buildRequest("/admin/build/reassess-link", { method: "POST", body: { projectId, questionId } }),
  getBuildReassessLinks: (clientId) => buildRequest(`/admin/build/reassess/${clientId}`),
  runBuildOverdueCheck: () => buildRequest("/admin/build/run-overdue-check", { method: "POST" }),

  // ---- Build.RIV: unblocking endpoints added to the owning modules (R21/R22)
  selectIdeaForBuild: (ideaId) => request(`/admin/ideas/${ideaId}/select-for-build`, { method: "PUT" }),
  decideRiseApplication: (applicationId, decision) => request(`/admin/rise/applications/${applicationId}/decision`, { method: "PUT", body: { decision } }),
  reviewRiseApplication: (applicationId, status) => request(`/admin/rise/applications/${applicationId}/riv-review`, { method: "PUT", body: { status } }),
  setRiseOpportunityClient: (opportunityId, clientId) => request(`/admin/rise/opportunities/${opportunityId}/client`, { method: "PUT", body: { clientId } }),
  assignRiseJuryClient: (id, clientId) => request(`/admin/rise/jury/${id}/client`, { method: "PUT", body: { clientId } }),
  getMyBuildPicksIdeas: () => ideasRequest("/build/my-picks"),
  getMyBuildPicksRise: () => riseRequest("/build/my-picks"),
  getMyReassessLinks: () => buildRequest("/build/my-reassess-links"),
  getMyWork: () => buildRequest("/build/my-work"),

  // ---- Build.RIV's own isolated login (product_owner / riv_manager /
  // startup_poc), same shared /auth/login endpoint as every other module.
  buildLogin: (email, password) => loginRequest(email, password),
};