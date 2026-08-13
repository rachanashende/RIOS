const TOKEN_KEY = "rios-token";
const USER_KEY = "rios-user";

// In local dev, the Vite dev server proxies /api/* to the backend (see
// vite.config.js) — no env var needed. In a real deployment, frontend and
// backend are separate URLs, so set VITE_API_URL (at build time) to the
// backend's public URL, e.g. https://rios-backend.onrender.com
const API_BASE = import.meta.env.VITE_API_URL || "";

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

async function request(path, { method = "GET", body, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
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

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),
  verifyEmail: (token) => request("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: () => request("/auth/resend-verification", { method: "POST" }),
  forgotPassword: (email) => request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, password) => request("/auth/reset-password", { method: "POST", body: { token, password } }),

  getQuestions: () => request("/questions"),
  getResponses: () => request("/responses"),
  saveResponses: (responses) => request("/responses", { method: "PUT", body: { responses } }),
  clearResponses: () => request("/responses", { method: "DELETE" }),

  listClients: () => request("/admin/clients"),
  createClient: (payload) => request("/admin/clients", { method: "POST", body: payload }),
  deleteClient: (id) => request(`/admin/clients/${id}`, { method: "DELETE" }),
  getClientResponses: (id) => request(`/admin/clients/${id}/responses`),

  exportUrl: (type, userId) => `${API_BASE}/api/export/${type}${userId ? `?userId=${userId}` : ""}`,
};

