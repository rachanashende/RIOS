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

async function requestWithToken(path, { method = "GET", body, raw } = {}, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  signup: (payload) => request("/auth/signup", { method: "POST", body: payload }),
  me: () => request("/auth/me"),

  getQuestions: () => request("/questions"),
  getResponses: () => request("/responses"),
  saveResponses: (responses) => request("/responses", { method: "PUT", body: { responses } }),
  clearResponses: () => request("/responses", { method: "DELETE" }),

  listClients: () => request("/admin/clients"),
  createClient: (payload) => request("/admin/clients", { method: "POST", body: payload }),
  deleteClient: (id) => request(`/admin/clients/${id}`, { method: "DELETE" }),
  getClientResponses: (id) => request(`/admin/clients/${id}/responses`),

  exportUrl: (type, userId) => `${API_BASE}/api/export/${type}${userId ? `?userId=${userId}` : ""}`,

  // ---- Ideas.RIV (employee/jury) — uses its own isolated token ------
  ideasLogin: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }), // same endpoint, token just isn't attached to anything yet here
  getOpportunities: () => ideasRequest("/ideas/opportunities"),
  getIdeas: (questionId) => ideasRequest(`/ideas${questionId ? `?questionId=${questionId}` : ""}`),
  getIdeaRatings: (ideaId) => ideasRequest(`/ideas/${ideaId}/ratings`),
  getMyIdeas: () => ideasRequest("/ideas/mine"),
  submitIdeas: (ideas) => ideasRequest("/ideas", { method: "POST", body: { ideas } }),
  getMyRatingForIdea: (ideaId) => ideasRequest(`/ideas/${ideaId}/ratings/mine`),
  submitRating: (ideaId, payload) => ideasRequest(`/ideas/${ideaId}/ratings`, { method: "POST", body: payload }),
  getLeaderboard: () => ideasRequest("/ideas/leaderboard"),
  critTurn: (ideaId, messages) => ideasRequest("/ideas/crit-turn", { method: "POST", body: { ideaId, messages } }),

  // ---- Ideas.RIV admin (source client + employee/jury accounts) -----
  // Called only from the main site's admin panel, so these correctly use
  // the main site's (admin) token, not the Ideas.RIV one.
  getIdeasSettings: () => request("/admin/ideas/settings"),
  setIdeasSourceClient: (sourceClientId) => request("/admin/ideas/settings", { method: "PUT", body: { sourceClientId } }),
  listIdeasUsers: (role) => request(`/admin/ideas/users?role=${role}`),
  createIdeasUser: (payload) => request("/admin/ideas/users", { method: "POST", body: payload }),
  deleteIdeasUser: (id) => request(`/admin/ideas/users/${id}`, { method: "DELETE" }),
  getEmployeeIdeas: (id) => request(`/admin/ideas/users/${id}/ideas`),

  // ---- Rise.RIV (public + jury) — uses its own isolated token ------
  getRiseOpportunity: () => request("/rise/opportunity"), // public, no token needed either way
  getRiseCriteria: () => request("/rise/criteria"),
  submitRiseApplication: (payload) => request("/rise/apply", { method: "POST", body: payload }),
  riseJuryLogin: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }), // same endpoint, token just isn't attached to anything yet here
  getRiseApplications: () => riseRequest("/rise/applications"),
  getRiseApplication: (id) => riseRequest(`/rise/applications/${id}`),
  submitRiseScore: (id, payload) => riseRequest(`/rise/applications/${id}/score`, { method: "POST", body: payload }),
  getRiseDashboard: () => riseRequest("/rise/dashboard"),

  // ---- Rise.RIV admin (opportunities, applications, jury roster) ----
  // Called only from the main site's admin panel, so these correctly use
  // the main site's (admin) token, not Rise.RIV's own.
  listRiseOpportunities: () => request("/admin/rise/opportunities"),
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
  indexLogin: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }), // same shared endpoint, token just isn't attached to anything yet here
  getMyIndexEntries: () => indexRequest("/index/my-entries"),
  submitIndexEntry: (payload) => indexRequest("/index/entries", { method: "POST", body: payload }),
  getIndexEntry: (id) => indexRequest(`/index/entries/${id}`),
  getIndexEntryDashboard: (id) => indexRequest(`/index/entries/${id}/dashboard`),
  getIndexCampaignReport: (campaignId) => indexRequest(`/index/campaigns/${campaignId}/report`),
  indexExportUrl: (type, campaignId) => `${API_BASE}/api/index/export/${type}?campaignId=${campaignId}`,

  // ---- R-Index admin (campaigns + entries) -------------------------
  // Called only from the main site's admin panel (or this module's own
  // admin-only tabs, reusing an admin's main-site token), same convention
  // as Rise.RIV admin calls above.
  listIndexCampaignsAdmin: () => request("/admin/index/campaigns"),
  createIndexCampaign: (payload) => request("/admin/index/campaigns", { method: "POST", body: payload }),
  updateIndexCampaign: (id, payload) => request(`/admin/index/campaigns/${id}`, { method: "PUT", body: payload }),
  openIndexCampaign: (id) => request(`/admin/index/campaigns/${id}/open`, { method: "PUT" }),
  closeIndexCampaign: (id) => request(`/admin/index/campaigns/${id}/close`, { method: "PUT" }),
  listIndexEntriesAdmin: (campaignId) => request(`/admin/index/campaigns/${campaignId}/entries`),
  createIndexEntryAdmin: (payload) => request("/admin/index/entries", { method: "POST", body: payload }),
  updateIndexEntryAdmin: (id, payload) => request(`/admin/index/entries/${id}`, { method: "PUT", body: payload }),
  deleteIndexEntryAdmin: (id) => request(`/admin/index/entries/${id}`, { method: "DELETE" }),
  getIndexCampaignReportAdmin: (campaignId) => request(`/admin/index/campaigns/${campaignId}/report`),
};