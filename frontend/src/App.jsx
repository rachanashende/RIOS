import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis, RadarChart, Radar, PolarGrid, PolarRadiusAxis,
} from "recharts";
import {
  ChevronRight, ChevronLeft, Shuffle, RotateCcw, ArrowRight, LogOut, UserPlus,
  CheckCircle2, Circle, Sparkles, TrendingUp, Users, Target, Trash2, Download,
  LayoutDashboard, Menu, X, Award, Eye, EyeOff, FileSpreadsheet, FileText, Loader2,
  Compass, AlertTriangle, Gavel,
} from "lucide-react";
import { api, getToken, getStoredUser, setSession, clearSession } from "./api.js";
import { computeScores, tierFor, fmtMoney, computeCategoryScores } from "./scoring.js";
import { BRAND } from "./brand.js";
import IdeasRivApp, { LeaderboardView, CRITERIA } from "./IdeasRiv.jsx";

const MATURITY_LABELS = [
  { v: 0, label: "No capability", desc: "Not in place, not planned" },
  { v: 1, label: "Ad hoc", desc: "Exists informally, inconsistent" },
  { v: 2, label: "Developing", desc: "In place, manual or partial" },
  { v: 3, label: "Advanced", desc: "Systematic, mostly automated" },
  { v: 4, label: "AI-Native", desc: "AI-driven, continuously improving" },
];

/* ---------------- Download helper (auth'd blob download) ---------------- */
async function downloadExport(path, fallbackName) {
  const token = getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { alert("Export failed — please try again."); return; }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* =========================== SMALL UI PIECES =========================== */
function Logo() {
  return (
    <img src="/riv-logo-full.png" alt="Retail Innovation Ventures" style={{ height: 36, width: "auto", objectFit: "contain" }} />
  );
}

function NavBar({ view, setView, user, onLogout }) {
  const [open, setOpen] = useState(false);
  const publicItems = [{ id: "home", label: "Home" }];
  const clientItems = [{ id: "assess", label: "Audit" }, { id: "dashboard", label: "My Scorecard" }];
  const adminItems = [{ id: "admin", label: "Manage Clients" }];
  const items = [...publicItems, ...(user?.role === "client" ? clientItems : []), ...(user?.role === "admin" ? adminItems : [])];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.92)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Logo />
          <div className="rios-nav-desktop" style={{ display: "flex", gap: 4 }}>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: "'Poppins',sans-serif", fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink, transition: "all .15s",
              }}>{it.label}</button>
            ))}
          </div>
        </div>
        <div className="rios-nav-desktop" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{user.name}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10.5, color: "#9B958F", textTransform: "capitalize" }}>{user.role} · {user.company || "RIV"}</div>
              </div>
              <button onClick={onLogout} title="Log out" style={{
                display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600,
                padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}`,
              }}><LogOut size={13} /> Log out</button>
            </>
          ) : (
            <>
              <button onClick={() => setView("login")} style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: "#fff", color: BRAND.ink,
                border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "9px 16px", cursor: "pointer",
              }}>Log in</button>
              <button onClick={() => setView("signup")} style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: BRAND.coral, color: "#fff",
                border: "none", borderRadius: 9, padding: "9px 16px", cursor: "pointer",
              }}>Sign up</button>
            </>
          )}
        </div>
        <button className="rios-nav-mobile-btn" onClick={() => setOpen(!open)} style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: BRAND.ink }}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      {open && (
        <div className="rios-nav-mobile" style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <button key={it.id} onClick={() => { setView(it.id); setOpen(false); }} style={{
              textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 14.5, fontWeight: 500, padding: "10px 14px",
              borderRadius: 10, border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "#fff", color: view === it.id ? "#fff" : BRAND.ink,
            }}>{it.label}</button>
          ))}
          {user ? (
            <button onClick={onLogout} style={{ textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 14.5, fontWeight: 600, padding: "10px 14px", borderRadius: 10, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.ink }}>Log out ({user.name})</button>
          ) : (
            <>
              <button onClick={() => { setView("login"); setOpen(false); }} style={{ textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 14.5, fontWeight: 600, padding: "10px 14px", borderRadius: 10, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.ink }}>Log in</button>
              <button onClick={() => { setView("signup"); setOpen(false); }} style={{ textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 14.5, fontWeight: 600, padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: BRAND.coral, color: "#fff" }}>Sign up</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Hero({ setView, stats }) {
  return (
    <div style={{ background: BRAND.ink, color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -180, right: -160, width: 480, height: 480, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.coral}55 0%, transparent 70%)` }} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "88px 24px 80px", position: "relative" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F3B4B5", border: "1px solid #4a4442", borderRadius: 999, padding: "6px 14px", marginBottom: 28 }}><Sparkles size={13} /> Retail Innovation Operating System</div>
        <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: "clamp(34px,5.2vw,58px)", lineHeight: 1.08, letterSpacing: "-0.02em", maxWidth: 780, margin: 0 }}>Never miss the next wave of retail innovation.</h1>
        <p style={{ fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic", fontSize: "clamp(17px,1.9vw,21px)", color: "#D8D3CF", maxWidth: 620, marginTop: 22, lineHeight: 1.55 }}>An evidence-based diagnostic across 19 operating modules and 165 questions — scored, ranked, and turned into the five opportunities worth acting on first.</p>
        <div style={{ display: "flex", gap: 14, marginTop: 38, flexWrap: "wrap" }}>
          <button onClick={() => setView("login")} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14.5, background: BRAND.coral, color: "#fff", border: "none", borderRadius: 10, padding: "14px 22px", cursor: "pointer" }}>Log in to your scorecard <ArrowRight size={16} /></button>
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 64, flexWrap: "wrap" }}>
          {stats.map((s) => (
            <div key={s.label}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 30, color: "#fff" }}>{s.value}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#B7B2AE", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JourneyStrip() {
  const steps = ["Observe", "Evaluate", "Prioritise", "Connect", "Pilot", "Measure", "Build Capability", "Strategic Review"];
  return (
    <div style={{ background: BRAND.cream, borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 24px" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 22, color: BRAND.ink, marginBottom: 6 }}>How RIoS works</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#7A746F", marginBottom: 30 }}>Innovation becomes a continuous operating rhythm — not an annual initiative.</div>
        <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 18px", minWidth: 92 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#fff", border: `2px solid ${BRAND.coral}`, color: BRAND.coral, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 500, color: BRAND.ink, textAlign: "center" }}>{s}</div>
              </div>
              {i < steps.length - 1 && <div style={{ width: 26, height: 1, background: BRAND.line }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleGrid({ modules, questions, setView }) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 24px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 30, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 22, color: BRAND.ink }}>19 modules, one diagnostic</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#7A746F", marginTop: 6, maxWidth: 560 }}>Every question is scored 0–4 on maturity and weighted 1–3 on AI opportunity — from leadership behaviour to agentic AI on the shop floor.</div>
        </div>
        <button onClick={() => setView("login")} style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, background: BRAND.ink, color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>Log in to start scoring →</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
        {modules.map((m, i) => {
          const count = questions.filter((q) => q.module === m).length;
          return (
            <div key={m} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: "16px 18px", background: "#fff" }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 700, color: BRAND.coral }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14.5, color: BRAND.ink, marginTop: 6, lineHeight: 1.3 }}>{m}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#9B958F", marginTop: 6 }}>{count} question{count !== 1 ? "s" : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Login ---------------- */
function LoginView({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      onLogin(token, user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally { setLoading(false); }
  }

  function fillDemo(role) {
    if (role === "admin") { setEmail("admin@rios.demo"); setPassword("admin123"); }
    else { setEmail("client@demo.retailer"); setPassword("client123"); }
  }

  return (
    <div style={{ maxWidth: 420, margin: "70px auto", padding: "0 24px" }}>
      <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: 32, background: "#fff" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Log in</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 24 }}>Client accounts are issued by an RIV admin — there's no self-signup.</div>
        <form onSubmit={submit}>
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus style={inputStyle} />
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink, marginTop: 14, display: "block" }}>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={inputStyle} />
          {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: BRAND.coralDark, marginTop: 12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: "100%", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 0", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
          }}>{loading && <Loader2 size={14} className="rios-spin" />} Log in</button>
        </form>
        {import.meta.env.DEV && (
          <div style={{ marginTop: 22, borderTop: `1px solid ${BRAND.line}`, paddingTop: 18 }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, color: "#9B958F", marginBottom: 8 }}>Seeded demo accounts (dev only — never shown in production):</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => fillDemo("admin")} style={demoBtnStyle}>Fill admin</button>
              <button type="button" onClick={() => fillDemo("client")} style={demoBtnStyle}>Fill client</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", marginTop: 6, fontFamily: "'Poppins',sans-serif", fontSize: 13.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box", background: BRAND.cream, color: BRAND.ink };
const demoBtnStyle = { flex: 1, fontFamily: "'Poppins',sans-serif", fontSize: 11.5, fontWeight: 600, padding: "7px 0", borderRadius: 7, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}` };

/* ---------------- Sign up (self-service, always creates a client account) ---------------- */
function SignupView({ onSignup, setView }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, user } = await api.signup({ name, company, email, password });
      onSignup(token, user);
    } catch (err) {
      setError(err.message || "Sign up failed.");
    } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 420, margin: "70px auto", padding: "0 24px" }}>
      <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: 32, background: "#fff" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Create your account</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 24 }}>Sign up to start your Audit. (Junior employee and jury accounts for Ideas.RIV are set up by your RIV admin, not here.)</div>
        <form onSubmit={submit}>
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} type="text" required autoFocus style={inputStyle} />
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink, marginTop: 14, display: "block" }}>Company</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} type="text" style={inputStyle} />
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink, marginTop: 14, display: "block" }}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={inputStyle} />
          <label style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: BRAND.ink, marginTop: 14, display: "block" }}>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} style={inputStyle} />
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#9B958F", marginTop: 6 }}>At least 8 characters.</div>
          {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: BRAND.coralDark, marginTop: 12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{
            width: "100%", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 0", cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
          }}>{loading && <Loader2 size={14} className="rios-spin" />} Create account</button>
        </form>
        <button onClick={() => setView("login")} style={{ display: "block", margin: "18px auto 0", fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer" }}>
          Already have an account? Log in
        </button>
      </div>
    </div>
  );
}

/* ---------------- Admin: Manage Clients ---------------- */
function AdminView({ setView, setSelectedClient, setSelectedEmployee }) {
  const [clients, setClients] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => { api.listClients().then((d) => setClients(d.clients)).catch(() => setClients([])); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function createClient(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.createClient(form);
      setForm({ name: "", email: "", company: "", password: "" });
      refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function removeClient(id) {
    if (!confirm("Remove this client account and its saved responses?")) return;
    await api.deleteClient(id);
    refresh();
  }
  function viewClient(c) { setSelectedClient(c); setView("dashboard"); }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px 90px" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink, marginBottom: 4 }}>Manage Clients</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 30 }}>Create a client login, then open their scorecard to review progress and export it.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }} className="rios-admin-grid">
        <div>
          {clients === null ? (
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>Loading…</div>
          ) : clients.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 24, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>No client accounts yet — create one on the right.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {clients.map((c) => (
                <div key={c.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{c.company || c.name}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#9B958F", marginTop: 2 }}>{c.name} · {c.email}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, color: BRAND.coralDark, marginTop: 4, fontWeight: 600 }}>{c.answered} / 165 scored</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => viewClient(c)} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: BRAND.ink, color: "#fff" }}>View scorecard</button>
                    <button onClick={() => removeClient(c.id)} title="Remove" style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.coralDark }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 20, background: "#fff", height: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 14 }}><UserPlus size={15} /> New client login</div>
          <form onSubmit={createClient}>
            <input placeholder="Contact name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ ...inputStyle, marginTop: 0 }} />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={{ ...inputStyle, marginTop: 10 }} />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ ...inputStyle, marginTop: 10 }} />
            <input placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required style={{ ...inputStyle, marginTop: 10 }} />
            {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: BRAND.coralDark, marginTop: 10 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 14, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: BRAND.coral, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer", opacity: busy ? 0.7 : 1 }}>Create login</button>
          </form>
        </div>
      </div>

      <IdeasTeamPanel clients={clients} setView={setView} setSelectedEmployee={setSelectedEmployee} />
    </div>
  );
}

/* ---------------- Admin: Ideas.RIV team + source-client control ---------------- */
function IdeasTeamPanel({ clients, setView, setSelectedEmployee }) {
  const [sourceClient, setSourceClient] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [juniorEmployees, setJuniorEmployees] = useState(null);
  const [jury, setJury] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "junior_employee", company: "", expertise: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingSource, setSavingSource] = useState(false);

  const refresh = useCallback(() => {
    api.getIdeasSettings().then((d) => { setSourceClient(d.sourceClient); setSelectedClientId(d.sourceClient?.id ? String(d.sourceClient.id) : ""); }).catch(() => {});
    api.listIdeasUsers("junior_employee").then((d) => setJuniorEmployees(d.users)).catch(() => setJuniorEmployees([]));
    api.listIdeasUsers("jury").then((d) => setJury(d.users)).catch(() => setJury([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function saveSourceClient() {
    setSavingSource(true);
    try {
      await api.setIdeasSourceClient(selectedClientId ? Number(selectedClientId) : null);
      refresh();
    } catch (err) { setError(err.message); } finally { setSavingSource(false); }
  }

  async function createUser(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.createIdeasUser(form);
      setForm({ name: "", email: "", password: "", role: form.role, company: form.company, expertise: "" });
      refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function removeUser(id) {
    if (!confirm("Remove this login?")) return;
    await api.deleteIdeasUser(id);
    refresh();
  }
  function viewEmployeeIdeas(u) { setSelectedEmployee(u); setView("employee-ideas"); }

  return (
    <div style={{ marginTop: 44 }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink, marginBottom: 4 }}>Ideas.RIV team</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 24 }}>Choose which client's scored audit feeds the 5 opportunities, then create junior employee and jury logins.</div>

      <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 20, background: "#fff", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}><Compass size={15} /> Opportunity source</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", marginBottom: 12 }}>
          {sourceClient ? <>Currently sourcing from <strong style={{ color: BRAND.ink }}>{sourceClient.company || sourceClient.name}</strong>.</> : "No source client set yet — Ideas.RIV will show no opportunities until you pick one."}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 200 }}>
            <option value="">— No source client —</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name} ({c.answered}/165 scored)</option>)}
          </select>
          <button onClick={saveSourceClient} disabled={savingSource} style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: BRAND.ink, color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", cursor: "pointer", opacity: savingSource ? 0.7 : 1 }}>Save</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }} className="rios-admin-grid">
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.ink, marginBottom: 10 }}>Junior Employees</div>
          {juniorEmployees === null ? (
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>Loading…</div>
          ) : juniorEmployees.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 20, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 20 }}>No junior employee logins yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {juniorEmployees.map((u) => (
                <div key={u.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: 12, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.ink }}>{u.name}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, color: "#9B958F" }}>{u.email} {u.company ? `· ${u.company}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => viewEmployeeIdeas(u)} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: BRAND.ink, color: "#fff" }}>View ideas</button>
                    <button onClick={() => removeUser(u.id)} title="Remove" style={{ display: "flex", alignItems: "center", padding: "7px 9px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.coralDark }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.ink, marginBottom: 10 }}>Jury members</div>
          {jury === null ? (
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>Loading…</div>
          ) : jury.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 20, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>No jury logins yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {jury.map((u) => (
                <div key={u.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: 12, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.ink }}>{u.name}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, color: "#9B958F" }}>{u.email} {u.company ? `· ${u.company}` : ""}{u.expertise ? ` · ${u.expertise}` : ""}</div>
                  </div>
                  <button onClick={() => removeUser(u.id)} title="Remove" style={{ display: "flex", alignItems: "center", padding: "7px 9px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.coralDark }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 20, background: "#fff", height: "fit-content" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 14 }}><Gavel size={15} /> New junior employee / jury login</div>
          <form onSubmit={createUser}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={() => setForm({ ...form, role: "junior_employee" })} style={{ flex: 1, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "9px 0", borderRadius: 8, cursor: "pointer", border: `1px solid ${BRAND.line}`, background: form.role === "junior_employee" ? BRAND.ink : "#fff", color: form.role === "junior_employee" ? "#fff" : BRAND.ink }}>Junior Employee</button>
              <button type="button" onClick={() => setForm({ ...form, role: "jury" })} style={{ flex: 1, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "9px 0", borderRadius: 8, cursor: "pointer", border: `1px solid ${BRAND.line}`, background: form.role === "jury" ? BRAND.ink : "#fff", color: form.role === "jury" ? "#fff" : BRAND.ink }}>Jury</button>
            </div>
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ ...inputStyle, marginTop: 0 }} />
            <input placeholder="Company (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} style={{ ...inputStyle, marginTop: 10 }} />
            {form.role === "jury" && (
              <input placeholder="Area of expertise (optional)" value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} style={{ ...inputStyle, marginTop: 10 }} />
            )}
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ ...inputStyle, marginTop: 10 }} />
            <input placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required style={{ ...inputStyle, marginTop: 10 }} />
            {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: BRAND.coralDark, marginTop: 10 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 14, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: BRAND.coral, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer", opacity: busy ? 0.7 : 1 }}>Create login</button>
          </form>
        </div>
      </div>

      <AdminLeaderboardPanel />
    </div>
  );
}

/* ---------------- Admin: all submitted ideas + per-idea jury score breakdown ---------------- */
function AdminEmployeeIdeasView({ employee, setView }) {
  const [ideas, setIdeas] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({}); // ideaId -> bool
  const [ratingsByIdea, setRatingsByIdea] = useState({}); // ideaId -> ratings[] | "loading"

  useEffect(() => {
    api.getEmployeeIdeas(employee.id)
      .then((d) => setIdeas(d.ideas || []))
      .catch((e) => setError(e.message));
  }, [employee.id]);

  function toggle(idea) {
    const nowOpen = !expanded[idea.id];
    setExpanded((e) => ({ ...e, [idea.id]: nowOpen }));
    if (nowOpen && !ratingsByIdea[idea.id]) {
      setRatingsByIdea((m) => ({ ...m, [idea.id]: "loading" }));
      api.getIdeaRatings(idea.id)
        .then((d) => setRatingsByIdea((m) => ({ ...m, [idea.id]: d.ratings })))
        .catch(() => setRatingsByIdea((m) => ({ ...m, [idea.id]: [] })));
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 90px" }}>
      <button onClick={() => setView("admin")} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        ← Back to Manage Clients
      </button>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink, marginBottom: 4 }}>{employee.name} — Ideas</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 30 }}>
        {employee.email} {employee.company ? `· ${employee.company}` : ""} — every idea they've submitted, with the individual jury scores behind each one.
      </div>

      {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: BRAND.coralDark, marginBottom: 16 }}>{error}</div>}
      {ideas === null && !error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>Loading…</div>}
      {ideas && ideas.length === 0 && (
        <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 24, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F" }}>{employee.name} hasn't submitted any ideas yet.</div>
      )}

      {ideas && ideas.map((idea) => {
        const isOpen = !!expanded[idea.id];
        const ratings = ratingsByIdea[idea.id];
        return (
          <div key={idea.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, marginBottom: 10, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 240 }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{idea.question?.module} · {idea.question?.submodule}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14.5, color: BRAND.ink, marginTop: 2 }}>{idea.title}</div>
                {idea.description && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#7A746F", marginTop: 4, lineHeight: 1.5 }}>{idea.description}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {idea.avg_score != null ? (
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 700, color: "#1B7A5A", background: "#E7F5EF", padding: "4px 10px", borderRadius: 999 }}>
                    {Number(idea.avg_score).toFixed(1)}/5 · {idea.rating_count} rating{idea.rating_count !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 700, color: BRAND.ink, background: "#EFEAE4", padding: "4px 10px", borderRadius: 999 }}>Not yet rated</span>
                )}
                {idea.rating_count > 0 && (
                  <button onClick={() => toggle(idea)} style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, color: BRAND.coralDark, background: "none", border: "none", cursor: "pointer" }}>
                    {isOpen ? "Hide jury scores" : "View jury scores"}
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              ratings === "loading" || ratings === undefined ? (
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", marginTop: 14 }}>Loading…</div>
              ) : (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BRAND.line}`, display: "flex", flexDirection: "column", gap: 14 }}>
                  {ratings.map((r) => {
                    const cs = r.criteria_scores || {};
                    return (
                      <div key={r.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12.5, color: BRAND.ink }}>{r.jury_name}</div>
                          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: BRAND.ink }}>{Number(r.score).toFixed(1)}/5</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                          {CRITERIA.map((c) => (
                            <div key={c.key} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#9B958F" }}>
                              {c.label}: <span style={{ color: BRAND.ink, fontWeight: 600 }}>{cs[c.key] ?? "–"}/5</span>
                            </div>
                          ))}
                        </div>
                        {r.comment && (
                          <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic", fontSize: 12, color: "#7A746F", marginTop: 8, lineHeight: 1.5 }}>&ldquo;{r.comment}&rdquo;</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Admin: Ideas.RIV leaderboard (aggregate scores, admin-only per PRD §8) ---------------- */
function AdminLeaderboardPanel() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getLeaderboard()
      .then((d) => setLeaderboard(d.leaderboard || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ marginTop: 44 }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink, marginBottom: 4 }}>Ideas.RIV leaderboard</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 24 }}>Aggregate scores across all jurors. Visible to admin only — individual jury members never see this, so their scoring stays independent (PRD §8).</div>
      <LeaderboardView leaderboard={leaderboard} loading={loading} error={error} />
    </div>
  );
}

/* ---------------- Assessment (client, self-serve) ---------------- */
function AssessmentView({ questions, modules, responses, setResponses, moduleIdx, setModuleIdx }) {
  const module = modules[moduleIdx];
  const qs = useMemo(() => questions.filter((q) => q.module === module), [questions, module]);
  const totalAnswered = Object.values(responses).filter((r) => r && r.maturity != null).length;

  function setMaturity(id, val) { setResponses((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), maturity: val } })); }
  function setEvidence(id, val) { setResponses((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), evidence: val } })); }
  function randomFillModule() {
    setResponses((prev) => { const next = { ...prev }; qs.forEach((q) => { next[q.id] = { ...(next[q.id] || {}), maturity: Math.floor(Math.random() * 5) }; }); return next; });
  }
  function randomFillAll() {
    setResponses((prev) => { const next = { ...prev }; questions.forEach((q) => { next[q.id] = { ...(next[q.id] || {}), maturity: Math.floor(Math.random() * 5) }; }); return next; });
  }
  function resetAll() { if (confirm("Clear every scored answer?")) setResponses({}); }

  const moduleAnswered = qs.filter((q) => responses[q.id] && responses[q.id].maturity != null).length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 90px", display: "flex", gap: 28 }}>
      <div className="rios-assess-sidebar" style={{ width: 250, flexShrink: 0 }}>
        <div style={{ position: "sticky", top: 84 }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.ink, marginBottom: 2 }}>Discover intake</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#9B958F", marginBottom: 14 }}>{totalAnswered} / {questions.length} scored · saved automatically</div>
          <div style={{ height: 6, background: BRAND.line, borderRadius: 999, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ height: "100%", width: `${(totalAnswered / questions.length) * 100}%`, background: BRAND.coral, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
            {modules.map((m, i) => {
              const modQs = questions.filter((q) => q.module === m);
              const ans = modQs.filter((q) => responses[q.id] && responses[q.id].maturity != null).length;
              const done = ans === modQs.length;
              return (
                <button key={m} onClick={() => setModuleIdx(i)} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", border: "none", cursor: "pointer", background: i === moduleIdx ? "#fff" : "transparent", borderRadius: 8, padding: "8px 10px", boxShadow: i === moduleIdx ? `0 0 0 1px ${BRAND.line}` : "none" }}>
                  {done ? <CheckCircle2 size={14} color="#2E9E6B" style={{ flexShrink: 0 }} /> : <Circle size={14} color="#C8C3BF" style={{ flexShrink: 0 }} />}
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: i === moduleIdx ? 600 : 500, color: i === moduleIdx ? BRAND.ink : "#7A746F", lineHeight: 1.3 }}>{m}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "'Poppins',sans-serif", fontSize: 10.5, color: "#B7B2AE", flexShrink: 0 }}>{ans}/{modQs.length}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {import.meta.env.DEV && (
              <button onClick={randomFillAll} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, padding: "9px 0", borderRadius: 9, cursor: "pointer", background: BRAND.ink, color: "#fff", border: "none" }}><Shuffle size={13} /> Quick-fill all 165 (dev only)</button>
            )}
            <button onClick={resetAll} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, padding: "9px 0", borderRadius: 9, cursor: "pointer", background: "#fff", color: "#8a8480", border: `1px solid ${BRAND.line}` }}><RotateCcw size={13} /> Reset scorecard</button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, fontWeight: 700, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.04em" }}>Module {moduleIdx + 1} of {modules.length}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink, marginTop: 2 }}>{module}</div>
          </div>
          <button onClick={randomFillModule} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, padding: "8px 13px", borderRadius: 9, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}` }}><Shuffle size={12} /> Random-fill this module</button>
        </div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginBottom: 24 }}>{moduleAnswered} of {qs.length} scored in this module</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {qs.map((q) => {
            const r = responses[q.id];
            return (
              <div key={q.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: 20, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{q.submodule}</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10.5, fontWeight: 700, color: BRAND.coral, background: "#FCEEE1", padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>AI weight ×{q.weight}</div>
                </div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, fontWeight: 500, color: BRAND.ink, lineHeight: 1.45 }}>{q.q}</div>
                <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic", fontSize: 13, color: "#8a8480", marginTop: 8, lineHeight: 1.5 }}>{q.aiAngle}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginTop: 16 }}>
                  {MATURITY_LABELS.map((ml) => {
                    const active = r && r.maturity === ml.v;
                    return (
                      <button key={ml.v} onClick={() => setMaturity(q.id, ml.v)} title={ml.desc} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "9px 4px", borderRadius: 9, cursor: "pointer", border: `1.5px solid ${active ? BRAND.coral : BRAND.line}`, background: active ? BRAND.coral : "#fff", transition: "all .12s" }}>
                        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: active ? "#fff" : BRAND.ink }}>{ml.v}</span>
                        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9.5, fontWeight: 600, color: active ? "#fff" : "#9B958F", textAlign: "center", lineHeight: 1.2 }}>{ml.label}</span>
                      </button>
                    );
                  })}
                </div>
                <input value={(r && r.evidence) || ""} onChange={(e) => setEvidence(q.id, e.target.value)} placeholder="Evidence / source note (kept with your scorecard)" style={{ width: "100%", marginTop: 12, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "9px 11px", boxSizing: "border-box", background: BRAND.cream, color: BRAND.ink }} />
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
          <button disabled={moduleIdx === 0} onClick={() => setModuleIdx((i) => Math.max(0, i - 1))} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, padding: "11px 18px", borderRadius: 9, cursor: moduleIdx === 0 ? "default" : "pointer", background: "#fff", color: moduleIdx === 0 ? "#C8C3BF" : BRAND.ink, border: `1px solid ${BRAND.line}` }}><ChevronLeft size={15} /> Previous module</button>
          {moduleIdx < modules.length - 1 ? (
            <button onClick={() => setModuleIdx((i) => Math.min(modules.length - 1, i + 1))} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, padding: "11px 18px", borderRadius: 9, cursor: "pointer", background: BRAND.ink, color: "#fff", border: "none" }}>Next module <ChevronRight size={15} /></button>
          ) : (
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", alignSelf: "center" }}>Last module — head to My Scorecard when ready</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Gauge({ score, tier }) {
  const data = [{ name: "score", value: score, fill: tier.color }];
  return (
    <div style={{ position: "relative", width: 200, height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={180} endAngle={0} barSize={16}>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#EFEAE4" }} dataKey="value" cornerRadius={10} angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", top: "58%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 34, color: BRAND.ink }}>{score.toFixed(0)}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#9B958F" }}>/ 100</div>
      </div>
    </div>
  );
}

function EmptyCard({ text }) {
  return <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 20, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F" }}>{text}</div>;
}

function OpportunityCard({ rank, q, tag, muted }) {
  return (
    <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: muted ? "#EFEAE4" : BRAND.coral, color: muted ? BRAND.ink : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{rank}</div>
          <div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{q.module} · {q.submodule}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, fontWeight: 500, color: BRAND.ink, marginTop: 3, lineHeight: 1.4 }}>{q.q}</div>
          </div>
        </div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 700, color: muted ? "#8a8480" : BRAND.coralDark, background: muted ? "#EFEAE4" : "#FCEEE1", padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", height: "fit-content" }}>{tag}</div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, fontFamily: "'Poppins',sans-serif", fontSize: 11.5, color: "#9B958F" }}><span>Maturity {q.maturity}/4</span><span>AI weight ×{q.weight}</span></div>
      {q.evidence && <div style={{ fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic", fontSize: 12.5, color: "#7A746F", marginTop: 8, borderTop: `1px solid ${BRAND.line}`, paddingTop: 8 }}>"{q.evidence}"</div>}
    </div>
  );
}

function DashboardView({ questions, modules, responses, setView, user, viewingClient }) {
  const scores = useMemo(() => computeScores(questions, modules, responses), [questions, modules, responses]);
  const categoryScores = useMemo(() => computeCategoryScores(scores.moduleScores), [scores.moduleScores]);
  const tier = tierFor(scores.overallScore);
  const isAdminViewing = user.role === "admin" && viewingClient;
  const exportUserId = isAdminViewing ? viewingClient.id : undefined;
  const [exporting, setExporting] = useState(null);

  async function doExport(type) {
    setExporting(type);
    try {
      await downloadExport(api.exportUrl(type, exportUserId), `rios-scorecard.${type === "excel" ? "xlsx" : "pdf"}`);
    } finally { setExporting(null); }
  }

  if (scores.answeredAll === 0) {
    return (
      <div style={{ maxWidth: 640, margin: "100px auto", padding: "0 24px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: BRAND.cream, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", border: `1px solid ${BRAND.line}` }}><LayoutDashboard size={24} color={BRAND.coral} /></div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 22, color: BRAND.ink }}>No scorecard yet</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#9B958F", marginTop: 8, lineHeight: 1.6 }}>
          {isAdminViewing ? `${viewingClient.name} hasn't scored any questions yet.` : `Score at least one question in the Audit to see this populate.`}
        </div>
        {!isAdminViewing && <button onClick={() => setView("assess")} style={{ marginTop: 24, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, background: BRAND.coral, color: "#fff", border: "none", borderRadius: 9, padding: "12px 20px", cursor: "pointer" }}>Go to Audit</button>}
      </div>
    );
  }

  const chartData = [...scores.moduleScores].sort((a, b) => a.score - b.score);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 24, color: BRAND.ink }}>{isAdminViewing ? `${viewingClient.company || viewingClient.name} — Scorecard` : "My Discover Scorecard"}</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#9B958F", marginTop: 4 }}>
            {scores.answeredAll} of {scores.totalAll} questions scored
            {scores.answeredAll < scores.totalAll && " — unscored questions currently count as 0 toward the running total"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => doExport("excel")} disabled={exporting} style={exportBtnStyle}>{exporting === "excel" ? <Loader2 size={13} className="rios-spin" /> : <FileSpreadsheet size={13} />} Export Excel</button>
          <button onClick={() => doExport("pdf")} disabled={exporting} style={exportBtnStyle}>{exporting === "pdf" ? <Loader2 size={13} className="rios-spin" /> : <FileText size={13} />} Export PDF</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, marginTop: 30, alignItems: "center", border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: "28px 32px", background: "#fff" }} className="rios-score-hero">
        <Gauge score={scores.overallScore} tier={tier} />
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, padding: "5px 12px", borderRadius: 999, background: tier.bg, color: tier.color, marginBottom: 10 }}><Award size={13} /> {tier.name}</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#7A746F", lineHeight: 1.6, maxWidth: 520 }}>Overall score is a bounded 0–100 weighted average across all 19 modules — the only figure in this instrument that's safely aggregate. Module- and row-level dollar estimates are never summed across rows.</div>
        </div>
      </div>

      <div style={{ marginTop: 34 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Compass size={17} color={BRAND.coral} />
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: BRAND.ink }}>Where you stand, at a glance</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }} className="rios-glance-grid">
          <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: "16px 8px 8px", background: "#fff" }}>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={categoryScores.map((c) => ({ subject: c.name, score: Math.round(c.score) }))} outerRadius="70%">
                <PolarGrid stroke={BRAND.line} />
                <PolarAngleAxis dataKey="subject" tick={{ fontFamily: "Poppins", fontSize: 10, fill: BRAND.ink }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontFamily: "Poppins", fontSize: 9, fill: "#B7B2AE" }} tickCount={5} />
                <Radar dataKey="score" stroke={BRAND.coral} fill={BRAND.coral} fillOpacity={0.28} />
                <Tooltip formatter={(v) => v + " / 100"} contentStyle={{ fontFamily: "Poppins", fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.line}` }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categoryScores.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: "12px 16px", background: "#fff" }}>
                <div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, color: BRAND.ink }}>{c.name}</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#9B958F", marginTop: 2 }}>{c.moduleCount} module{c.moduleCount !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: BRAND.ink }}>{c.score.toFixed(0)}</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 10.5, padding: "3px 9px", borderRadius: 999, background: c.tier.bg, color: c.tier.color, whiteSpace: "nowrap" }}>{c.tier.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {categoryScores.length > 0 && (() => {
          const weakest = [...categoryScores].sort((a, b) => a.score - b.score)[0];
          return (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: "12px 16px", borderRadius: 12, background: "#FBEAEA", border: "1px solid #F3C6C6" }}>
              <AlertTriangle size={16} color={BRAND.coralDark} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: BRAND.ink, lineHeight: 1.6 }}>
                <strong>{weakest.name}</strong> is the biggest exposure right now ({weakest.score.toFixed(0)}/100) — the Top 5 Opportunities and Priority Gaps below are the fastest way in.
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ marginTop: 34 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: BRAND.ink, marginBottom: 14 }}>Full module breakdown</div>
        <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: "20px 20px 8px", background: "#fff" }}>
          <ResponsiveContainer width="100%" height={480}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={BRAND.line} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontFamily: "Poppins", fontSize: 11, fill: "#9B958F" }} />
              <YAxis type="category" dataKey="module" width={190} tick={{ fontFamily: "Poppins", fontSize: 11.5, fill: BRAND.ink }} />
              <Tooltip formatter={(v) => v.toFixed(1)} contentStyle={{ fontFamily: "Poppins", fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.line}` }} />
              <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>{chartData.map((d, i) => <Cell key={i} fill={d.tier.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 34 }} className="rios-opp-grid">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><TrendingUp size={17} color={BRAND.coral} /><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: BRAND.ink }}>Top 5 Innovation Opportunities</div></div>
          {scores.opportunities.length === 0 ? <EmptyCard text="No ranked opportunities yet — score more questions with revenue/cost data attached." /> : scores.opportunities.map((o, i) => (
            <OpportunityCard key={o.id} rank={i + 1} q={o} tag={fmtMoney(o.revLow + o.costLow) + " – " + fmtMoney(o.revHigh + o.costHigh)} />
          ))}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><Target size={17} color={BRAND.coral} /><div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 17, color: BRAND.ink }}>Priority AI-Maturity Gaps</div></div>
          {scores.priorityGaps.length === 0 ? <EmptyCard text="No priority gaps yet — these surface from the newer AI-maturity questions once scored below 4." /> : scores.priorityGaps.map((o, i) => (
            <OpportunityCard key={o.id} rank={i + 1} q={o} tag={"Severity " + o.severity} muted />
          ))}
        </div>
      </div>
    </div>
  );
}
const exportBtnStyle = { display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, padding: "9px 14px", borderRadius: 9, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}` };

/* =========================== ROOT =========================== */
export default function RiosApp() {
  const [view, setView] = useState("home");
  const [user, setUser] = useState(getStoredUser());
  const [questions, setQuestions] = useState([]);
  const [modules, setModules] = useState([]);
  const [responses, setResponses] = useState({});
  const [moduleIdx, setModuleIdx] = useState(0);
  const [viewingClient, setViewingClient] = useState(null); // admin viewing a specific client
  const [viewingEmployee, setViewingEmployee] = useState(null); // admin viewing a specific junior employee's ideas
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(null);
  const skipNextSave = useRef(true);

  // Load the instrument once (public)
  useEffect(() => {
    api.getQuestions().then(({ questions, modules }) => { setQuestions(questions); setModules(modules); setReady(true); });
  }, []);

  // Load the right responses set whenever identity/target changes
  useEffect(() => {
    if (!user) { setResponses({}); return; }
    skipNextSave.current = true;
    if (user.role === "admin" && viewingClient) {
      api.getClientResponses(viewingClient.id).then((d) => setResponses(d.responses || {})).catch(() => setResponses({}));
    } else if (user.role === "client") {
      api.getResponses().then((d) => setResponses(d.responses || {})).catch(() => setResponses({}));
    }
  }, [user, viewingClient]);

  // Autosave (client's own responses only — admin viewing a client is read-only)
  useEffect(() => {
    if (!user || user.role !== "client") return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { api.saveResponses(responses).catch(() => {}); }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [responses, user]);

  function handleLogin(token, loggedInUser) {
    setSession(token, loggedInUser);
    setUser(loggedInUser);
    // Client/admin land on Home first, then click through to their
    // assessment/dashboard or admin panel. Junior employee/jury don't use
    // this branch of the app at all — see the early return below, which
    // renders Ideas.RIV exclusively for those two roles.
    setView("home");
  }
  function handleSignup(token, newUser) {
    setSession(token, newUser);
    setUser(newUser);
    setView("home");
  }
  function handleLogout() {
    clearSession(); setUser(null); setViewingClient(null); setResponses({}); setView("home");
  }
  function goToView(v) {
    if ((v === "assess" || v === "dashboard") && !user) { setView("login"); return; }
    if (v !== "dashboard") setViewingClient(null);
    setView(v);
  }

  const stats = [{ value: "165", label: "diagnostic questions" }, { value: "19", label: "operating modules" }, { value: "5", label: "maturity bands" }];

  // Junior employee / jury logins never see the questionnaire or scores —
  // per the founder's call, they get Ideas.RIV exclusively, nothing else
  // in this app. This is a full early return, not a nav item: there's no
  // path back to the assessment/dashboard/admin areas from here except
  // logging out and logging back in as a different role.
  if (user && (user.role === "junior_employee" || user.role === "jury")) {
    return <IdeasRivApp session={user} onLogout={handleLogout} />;
  }

  return (
    <div style={{ fontFamily: "'Poppins',sans-serif", background: BRAND.cream, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Newsreader:ital@1&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible { outline: 2px solid ${BRAND.coral}; outline-offset: 2px; }
        input:focus { outline: 2px solid ${BRAND.coral}; outline-offset: 0; }
        .rios-spin { animation: rios-spin 0.8s linear infinite; }
        @keyframes rios-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 860px) {
          .rios-nav-desktop { display: none !important; }
          .rios-nav-mobile-btn { display: block !important; }
          .rios-assess-sidebar { display: none !important; }
          .rios-score-hero { grid-template-columns: 1fr !important; text-align: center; justify-items: center; }
          .rios-opp-grid { grid-template-columns: 1fr !important; }
          .rios-admin-grid { grid-template-columns: 1fr !important; }
          .rios-glance-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <NavBar view={view} setView={goToView} user={user} onLogout={handleLogout} />
      <div style={{ flex: 1 }}>
        {view === "home" && (<><Hero setView={goToView} stats={stats} /><JourneyStrip />{user?.role === "client" && <ModuleGrid modules={modules} questions={questions} setView={goToView} />}</>)}
        {view === "login" && <LoginView onLogin={handleLogin} />}
        {view === "signup" && <SignupView onSignup={handleSignup} setView={goToView} />}
        {view === "assess" && user?.role === "client" && ready && (
          <AssessmentView questions={questions} modules={modules} responses={responses} setResponses={setResponses} moduleIdx={moduleIdx} setModuleIdx={setModuleIdx} />
        )}
        {view === "admin" && user?.role === "admin" && <AdminView setView={goToView} setSelectedClient={setViewingClient} setSelectedEmployee={setViewingEmployee} />}
        {view === "employee-ideas" && user?.role === "admin" && viewingEmployee && (
          <AdminEmployeeIdeasView employee={viewingEmployee} setView={goToView} />
        )}
        {view === "dashboard" && user && ready && (
          <DashboardView questions={questions} modules={modules} responses={responses} setView={goToView} user={user} viewingClient={viewingClient} />
        )}
      </div>
      <div style={{ borderTop: `1px solid ${BRAND.line}`, padding: "28px 24px", textAlign: "center", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#B7B2AE" }}>
        Questions? Write to <a href="mailto:contact@retailinnovation.ventures" style={{ color: BRAND.coralDark }}>contact@retailinnovation.ventures</a>.
      </div>
    </div>
  );
}