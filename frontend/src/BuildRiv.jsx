import React, { useState, useEffect, useMemo } from "react";
import {
  Hammer, LogOut, ArrowRight, ChevronLeft, Loader2, AlertCircle, Briefcase,
  Plus, CheckCircle2, Paperclip, Download, Upload, History, FileText, Users, Building2,
  Search, X, KeyRound, Trash2, Bell, Inbox, Printer,
} from "lucide-react";
import {
  api, divertIfTemporaryPassword, getStoredBuildUser,
  setBuildSession, clearBuildSession, clearAllSessions,
} from "./api.js";
import { BRAND } from "./brand.js";

// Build.RIV's own tabs, each with a real URL. BuildRivApp owns all routing
// beneath "/build" once mounted; App.jsx maps every one of these to its
// single "build-riv" container view.
const BUILD_PATH_TO_VIEW = { "/build": "mywork", "/build/my-work": "mywork", "/build/projects": "projects", "/build/dashboard": "dashboard", "/build/admin": "admin" };
const BUILD_VIEW_TO_PATH = { mywork: "/build/my-work", projects: "/build/projects", dashboard: "/build/dashboard", admin: "/build/admin" };
function pathToBuildView(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/build";
  return BUILD_PATH_TO_VIEW[path] || "mywork";
}

const FONT = "'Poppins',sans-serif";
const MUTED = "#6B655F";

// Workflow v2 role names (Oct 2026). The DB role values stay the same.
const ROLE_LABEL = {
  admin: "RIV Admin", riv_manager: "RIV Client Partner", client: "Client Leader", client_poc: "Product Owner",
  junior_employee: "Employee", startup_poc: "Startup POC", jury: "Ideathon jury", rise_jury: "Startup jury",
};

const STAGE_LIST = {
  internal: ["requirements", "design", "build", "test", "pilot", "production", "closed"],
  startup: ["requirements", "nda", "proposal", "purchase_order", "agreement", "design", "build", "test", "pilot", "production", "closed"],
};
const DEAL_STAGES = ["nda", "proposal", "purchase_order", "agreement"];
const STAGE_LABEL = {
  requirements: "Requirements", nda: "NDA", proposal: "Proposal", purchase_order: "Purchase Order", agreement: "Agreement",
  design: "Design", build: "Build", test: "Test", pilot: "Pilot", production: "Production", scale: "Production", closed: "Closed",
};

const INNOV_TABS = [
  { id: "enterprise", label: "Internal ideas", sub: "Enterprise Innovation Management", type: "internal" },
  { id: "open", label: "Startup pilots", sub: "Open Innovation Management", type: "startup" },
];

/* =========================================================================
   SMALL UI PRIMITIVES -- redefined here so this module depends only on
   api.js and brand.js.
   ========================================================================= */
function PrimaryButton({ children, onClick, disabled, style, icon: Icon, type = "button", dark }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13.5,
      background: disabled ? (dark ? "#9B958F" : "#E7B4B4") : (dark ? BRAND.ink : BRAND.coral),
      color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", minHeight: 44,
      cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}

function GhostButton({ children, onClick, disabled, style, icon: Icon, type = "button", title }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff",
      color: disabled ? "#B7B2AE" : BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "10px 16px", minHeight: 44,
      cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}

function Card({ children, style }) {
  return <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 14, background: "#fff", ...style }}>{children}</div>;
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 16, color: BRAND.ink }}>{children}</div>
      {right}
    </div>
  );
}

function Field({ label, children, required, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>
        {label}{required && <span style={{ color: BRAND.coral }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontFamily: FONT, fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: FONT, fontSize: 13.5, padding: "10px 12px",
  borderRadius: 10, border: `1px solid ${BRAND.line}`, background: "#fff", color: BRAND.ink, minHeight: 42,
};
const selectStyle = { ...inputStyle, cursor: "pointer" };
const grid2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 18px" };

function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "#FBEAEA", border: "1px solid #F3C6C6", marginBottom: 16 }}>
      <AlertCircle size={15} color={BRAND.coralDark} />
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>{text}</div>
    </div>
  );
}

function Notice({ text }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "#E7F5EF", border: "1px solid #BFE6D4", marginBottom: 16 }}>
      <CheckCircle2 size={15} color="#1B7A5A" />
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>{text}</div>
    </div>
  );
}

function Banner({ children }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#3D3936", background: "#F4F1ED", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>{children}</div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "60px 20px", fontFamily: FONT, fontSize: 13, color: MUTED }}>
      <Loader2 size={16} className="build-spin" /> {label || "Loading…"}
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 20px", border: `1px dashed #C9C2BA`, borderRadius: 14, background: "#fff" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: BRAND.cream, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", border: `1px solid ${BRAND.line}` }}>
        <Icon size={20} color={BRAND.coral} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink }}>{title}</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED, marginTop: 6, maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{text}</div>
      {action && <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

const HEALTH = {
  on_track: { label: "On track", bg: "#E8F3EC", fg: "#1F5E3A", dot: "#2E7D4F" },
  at_risk: { label: "At risk", bg: "#FBF1DE", fg: "#7A4F00", dot: "#C98A1B" },
  off_track: { label: "Off track", bg: "#FBE7E7", fg: "#9E2A2A", dot: "#C13B3B" },
  none: { label: "No update yet", bg: "#F1EEEA", fg: "#5F5A55", dot: "#9B958F" },
};
function Dot({ color, size = 8 }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 999, background: color, display: "inline-block", flex: "none" }} />;
}
function HealthBadge({ health, reasons, size }) {
  const c = HEALTH[health] || HEALTH.none;
  const title = (reasons || []).map((r) => r.text).join(" · ");
  return (
    <span title={title || undefined} style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: size === "sm" ? 11.5 : 12, fontWeight: 600,
      color: c.fg, background: c.bg, padding: size === "sm" ? "3px 9px" : "4px 11px", borderRadius: 999, whiteSpace: "nowrap",
    }}><Dot color={c.dot} />{c.label}</span>
  );
}

const STATUS_COLORS = {
  active: { bg: "#F1EEEA", fg: "#3D3936", label: "Active" },
  on_hold: { bg: "#FBF1DE", fg: "#7A4F00", label: "On hold" },
  stopped: { bg: "#F1EEEA", fg: MUTED, label: "Stopped" },
  closed: { bg: "#E3E8F7", fg: "#2F4FA0", label: "Closed" },
};
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#EFEBE7", fg: MUTED, label: status || "—" };
  return <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: c.fg, background: c.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{c.label}</span>;
}

function TypeBadge({ type }) {
  const internal = type === "internal";
  return (
    <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap", background: internal ? "#FCE9E9" : "#E9EFFD", color: internal ? "#9E2A2A" : "#1E4FB8" }}>
      {internal ? "Internal idea" : "Startup pilot"}
    </span>
  );
}

function ProgressBar({ pct, height = 6, color = BRAND.coral }) {
  return (
    <div style={{ height, background: "#F1EEEA", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ height, width: `${Math.max(0, Math.min(100, pct || 0))}%`, background: color, borderRadius: 999 }} />
    </div>
  );
}

function fmtPct(n) { return n == null ? "—" : `${Math.round(n).toLocaleString()}%`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
function fmtShortDate(d) { return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"; }
function fmtUSD(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x) => String(Number(x.toFixed(1)));
  if (abs >= 1e9) return `${sign}US$${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}US$${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}US$${Math.round(abs / 1e3).toLocaleString()}K`;
  return `${sign}US$${Math.round(abs).toLocaleString()}`;
}
function timeAgo(d) {
  if (!d) return "";
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? "Yesterday" : fmtShortDate(d);
}
function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
}

/* =========================================================================
   NAV
   ========================================================================= */
function BuildNavBar({ view, setView, session, onLogout, canSeeDashboard, canSeeAdmin }) {
  const items = session ? [{ id: "mywork", label: "My work" }, { id: "projects", label: "Projects" }] : [];
  if (canSeeDashboard) items.push({ id: "dashboard", label: "Dashboard" });
  if (canSeeAdmin) items.push({ id: "admin", label: "Admin" });
  const scope = session?.role === "admin" ? "All clients · full access"
    : session?.role === "riv_manager" ? "Assigned clients"
    : session?.company || "";

  return (
    <div className="build-nav" style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(255,255,255,0.97)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 16, color: BRAND.ink }}>
            <Hammer size={18} color={BRAND.coral} /> Build
          </div>
          <nav aria-label="Build" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <a href="/" style={{ fontFamily: FONT, fontSize: 13.5, padding: "8px 12px", borderRadius: 999, textDecoration: "none", color: MUTED }}>← RIOS home</a>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} aria-current={view === it.id ? "page" : undefined} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink, minHeight: 40,
              }}>{it.label}</button>
            ))}
          </nav>
        </div>
        {session ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.line}`, borderRadius: 999, padding: "4px 12px 4px 4px", background: "#fff" }}>
              <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 999, background: session.role === "admin" || session.role === "riv_manager" ? BRAND.ink : BRAND.coral, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, fontFamily: FONT }}>{initials(session.name)}</span>
              <span style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 1.25 }}>
                <b style={{ fontWeight: 600, color: BRAND.ink }}>{session.name}</b><br />
                <span style={{ color: MUTED }}>{ROLE_LABEL[session.role] || session.role}{scope ? ` · ${scope}` : ""}</span>
              </span>
            </div>
            <button onClick={onLogout} aria-label="Log out" title="Log out" style={{ width: 40, height: 40, borderRadius: 999, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LogOut size={16} color={BRAND.ink} />
            </button>
          </div>
        ) : (
          <span style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED }}>Not logged in</span>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN -- for Build-only logins (Product Owner, RIV Client Partner,
   Startup POC). Client Leaders and admins usually arrive already logged in
   through the main site.
   ========================================================================= */
function LoginView({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.buildLogin(email, password);
      if (divertIfTemporaryPassword(token, user)) return;
      onAuthed(token, user);
    } catch (e) {
      setError(e.message || "Couldn't log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "56px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 22 }}>Build log in</div>
      <Card style={{ padding: 26 }}>
        <form onSubmit={submit}>
          <Field label="Email" required><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" required><input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <div style={{ textAlign: "right", marginTop: -6, marginBottom: 6 }}><a href="/?action=forgot-password" style={{ fontFamily: FONT, fontSize: 11.5, color: BRAND.coral, fontWeight: 600, textDecoration: "none" }}>Forgot password?</a></div>
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : ArrowRight} style={{ width: "100%" }}>
            {submitting ? "Logging in…" : "Log in"}
          </PrimaryButton>
        </form>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: 16, textAlign: "center" }}>
          Don't have a login yet? Ask your RIV admin to create one for you.
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   PROJECTS LIST -- Internal ideas / Startup pilots, quick filters, table
   or board view.
   ========================================================================= */
const QUICK_FILTERS = [
  { id: "all", label: "All" },
  { id: "mine", label: "Waiting on me" },
  { id: "red_amber", label: "Red or amber" },
  { id: "overdue", label: "Update overdue" },
  { id: "on_hold", label: "On hold" },
  { id: "closed", label: "Closed" },
];
function matchesQuick(p, id) {
  if (id === "all") return p.status !== "closed";
  if (id === "mine") return p.waitingOnMe;
  if (id === "red_amber") return p.status === "active" && ["off_track", "at_risk"].includes(p.effectiveHealth);
  if (id === "overdue") return p.updateOverdue;
  if (id === "on_hold") return p.status === "on_hold";
  if (id === "closed") return p.status === "closed" || p.status === "stopped";
  return true;
}

function useClientOptions(enabled = true) {
  const [clients, setClients] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    api.getBuildDashboardClients().then((d) => setClients(d.clients || [])).catch(() => setClients(null));
  }, [enabled]);
  return clients;
}

function ProjectsEmpty({ session, onNew }) {
  if (session.role === "admin") {
    return <EmptyState icon={Briefcase} title="No projects here yet" text="Selected Ideathon winners and startups wait on Admin → Ready for Build until you turn them into projects." action={<PrimaryButton dark onClick={onNew} icon={Inbox}>Open Ready for Build</PrimaryButton>} />;
  }
  if (session.role === "client") {
    return <EmptyState icon={Briefcase} title="Your portfolio starts here" text="Projects appear when your Ideathon winners or selected startups move into Build. RIV sets them up for you." />;
  }
  if (session.role === "riv_manager") {
    return <EmptyState icon={Briefcase} title="No projects for your clients yet" text="You'll see projects here once RIV Admin creates them for the clients assigned to you." />;
  }
  return <EmptyState icon={Briefcase} title="Nothing assigned to you yet" text="When RIV adds you to a project, it will show here with your first steps." />;
}

function ProjectListView({ session, onOpen, onNew }) {
  const [innovTab, setInnovTab] = useState(session.role === "startup_poc" ? "open" : "enterprise");
  const [mode, setMode] = useState("table");
  const [quick, setQuick] = useState("all");
  const [filters, setFilters] = useState({ q: "", clientId: "", stage: "", ownerId: "" });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const showClientFilter = session.role === "admin" || session.role === "riv_manager";
  const clients = useClientOptions(showClientFilter);

  useEffect(() => {
    setLoading(true);
    api.listBuildProjects({ q: filters.q, clientId: filters.clientId })
      .then((d) => { setProjects(d.projects || []); setError(null); })
      .catch((e) => setError(e.message || "Couldn't load projects."))
      .finally(() => setLoading(false));
  }, [filters.q, filters.clientId]);

  const activeType = INNOV_TABS.find((t) => t.id === innovTab).type;
  const ofType = projects.filter((p) => p.type === activeType);
  const owners = useMemo(() => {
    const m = new Map();
    for (const p of ofType) if (p.poc_user_id) m.set(p.poc_user_id, p.poc_name);
    return [...m.entries()];
  }, [projects, activeType]);
  const visible = ofType
    .filter((p) => matchesQuick(p, quick))
    .filter((p) => !filters.stage || (filters.stage === "deal" ? DEAL_STAGES.includes(p.stage) : p.stage === filters.stage))
    .filter((p) => !filters.ownerId || String(p.poc_user_id) === String(filters.ownerId));
  const count = (type) => projects.filter((p) => p.type === type && p.status !== "closed").length;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 26, color: BRAND.ink }}>Build projects</h1>
          <div style={{ fontFamily: FONT, fontSize: 13.5, color: MUTED, marginTop: 4 }}>Every selected idea and startup, tracked from Requirements to Closed.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div role="group" aria-label="View" style={{ display: "flex", border: `1px solid ${BRAND.line}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            {[["table", "Table"], ["board", "Board"]].map(([id, label]) => (
              <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id} style={{ padding: "10px 16px", border: "none", minHeight: 42, background: mode === id ? BRAND.ink : "#fff", color: mode === id ? "#fff" : BRAND.ink, fontFamily: FONT, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
          {session.role === "admin" && <PrimaryButton onClick={onNew} icon={Plus}>New project</PrimaryButton>}
        </div>
      </div>

      {session.role === "riv_manager" && <Banner>Showing projects for the clients assigned to you. Need another client, or something deleted? Ask RIV Admin.</Banner>}
      {["junior_employee", "startup_poc"].includes(session.role) && <Banner>Showing the projects you're named on.</Banner>}

      <div role="tablist" style={{ display: "flex", gap: 28, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 16, flexWrap: "wrap" }}>
        {INNOV_TABS.map((t) => {
          const on = innovTab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => { setInnovTab(t.id); setFilters((f) => ({ ...f, stage: "", ownerId: "" })); }} style={{ background: "none", border: "none", borderBottom: `3px solid ${on ? BRAND.coral : "transparent"}`, padding: "10px 2px 12px", textAlign: "left", cursor: "pointer", fontFamily: FONT }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: on ? BRAND.ink : MUTED }}>
                {t.label} <span style={{ background: on ? BRAND.ink : BRAND.line, color: on ? "#fff" : BRAND.ink, borderRadius: 999, padding: "1px 8px", fontSize: 12, marginLeft: 4 }}>{count(t.type)}</span>
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>{t.sub}</span>
            </button>
          );
        })}
      </div>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 240px", fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Search
            <div style={{ position: "relative", marginTop: 4 }}>
              <Search size={14} color={MUTED} style={{ position: "absolute", left: 11, top: 14 }} />
              <input placeholder="Code, project or owner" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} style={{ ...inputStyle, paddingLeft: 32 }} />
            </div>
          </label>
          {showClientFilter && (
            <label style={{ flex: "0 1 190px", fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Client
              <select style={{ ...selectStyle, marginTop: 4 }} value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}>
                <option value="">All clients</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
            </label>
          )}
          <label style={{ flex: "0 1 190px", fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Stage
            <select style={{ ...selectStyle, marginTop: 4 }} value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}>
              <option value="">All stages</option>
              {activeType === "startup" && <option value="deal">Deal stages (NDA to Agreement)</option>}
              {STAGE_LIST[activeType].map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          </label>
          <label style={{ flex: "0 1 190px", fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Product Owner
            <select style={{ ...selectStyle, marginTop: 4 }} value={filters.ownerId} onChange={(e) => setFilters((f) => ({ ...f, ownerId: e.target.value }))}>
              <option value="">Anyone</option>
              {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginRight: 4 }}>Quick filters</span>
          {QUICK_FILTERS.map((q) => {
            const n = ofType.filter((p) => matchesQuick(p, q.id)).length;
            const on = quick === q.id;
            return (
              <button key={q.id} onClick={() => setQuick(q.id)} aria-pressed={on} style={{ padding: "7px 12px", minHeight: 36, borderRadius: 999, fontFamily: FONT, fontSize: 12.5, fontWeight: 500, cursor: "pointer", background: on ? BRAND.ink : "#fff", color: on ? "#fff" : BRAND.ink, border: `1px solid ${on ? BRAND.ink : BRAND.line}` }}>
                {q.label} · {n}
              </button>
            );
          })}
        </div>
      </Card>

      <ErrorBanner text={error} />
      {loading ? <Spinner label="Loading projects…" /> : projects.length === 0 ? <ProjectsEmpty session={session} onNew={onNew} /> : visible.length === 0 ? (
        <EmptyState icon={Search} title="No projects match" text="Try another quick filter, stage or search." />
      ) : mode === "table" ? (
        <ProjectTable rows={visible} onOpen={onOpen} showClient={showClientFilter} />
      ) : (
        <ProjectBoard rows={visible} type={activeType} onOpen={onOpen} />
      )}
      {!loading && visible.length > 0 && mode === "table" && (
        <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 10 }}>Red projects sort to the top. Hover a health label to see why. Click a row to open the project.</div>
      )}
    </div>
  );
}

const th = { padding: "12px 16px", fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${BRAND.line}`, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "14px 16px", borderBottom: `1px solid ${BRAND.line}`, verticalAlign: "top", fontFamily: FONT, fontSize: 12.5, color: BRAND.ink };

function kpiLine(p) {
  if (p.baseline == null || p.target == null) return "Not set yet";
  const unit = p.kpi_unit ? ` ${p.kpi_unit}` : "";
  return `${p.kpi_name ? p.kpi_name + ": " : ""}${p.baseline} → ${p.kpi_latest ?? "—"} → ${p.target}${unit}`;
}

function ProjectTable({ rows, onOpen, showClient }) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead>
            <tr style={{ background: BRAND.cream }}>
              <th style={th}>Code</th><th style={th}>Project</th><th style={th}>Stage</th><th style={th}>Next step</th>
              <th style={th}>Health</th><th style={th}>KPI (base → now → target)</th><th style={th}>Product Owner</th><th style={th}>Last update</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="build-row" onClick={() => onOpen(p.id)} style={{ cursor: "pointer" }}>
                <td style={td}><button onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.coralDark }}>{p.code}</button></td>
                <td style={{ ...td, maxWidth: 240 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{showClient ? (p.client_company || p.client_name) : (p.owner_name ? `${p.type === "startup" ? "Startup POC" : "Employee"}: ${p.owner_name}` : "")}</div>
                </td>
                <td style={{ ...td, minWidth: 160 }}>
                  <div style={{ fontWeight: 500 }}>{p.status === "closed" ? "Closed" : p.stageLabel} <span style={{ color: MUTED, fontWeight: 400 }}>· {p.stageStep} of {p.stageCount}</span></div>
                  <div style={{ marginTop: 6 }}><ProgressBar pct={p.status === "closed" ? 100 : p.stagePct} /></div>
                  {p.days_in_stage != null && p.status === "active" && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{p.days_in_stage} days in stage</div>}
                </td>
                <td style={{ ...td, maxWidth: 230 }}>{p.nextStep}</td>
                <td style={td}>
                  {p.status === "active" ? <HealthBadge health={p.effectiveHealth} reasons={p.healthReasons} size="sm" /> : <StatusBadge status={p.status} />}
                  {p.status === "active" && p.healthReasons?.[0] && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, maxWidth: 170 }}>{p.healthReasons[0].text}</div>}
                </td>
                <td style={td}>{kpiLine(p)}</td>
                <td style={td}>{p.poc_name || <span style={{ color: "#9E2A2A" }}>Not assigned</span>}</td>
                <td style={td}><span style={p.updateOverdue ? { color: "#9E2A2A", fontWeight: 600 } : undefined}>{p.last_update_date ? fmtShortDate(p.last_update_date) : "—"}{p.updateOverdue ? " · overdue" : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProjectBoard({ rows, type, onOpen }) {
  const stages = STAGE_LIST[type];
  return (
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, minmax(160px, 1fr))`, gap: 12, minWidth: stages.length * 172 }}>
        {stages.map((s) => {
          const cards = rows.filter((p) => (s === "closed" ? p.status === "closed" || p.stage === "closed" : p.stage === s && p.status !== "closed"));
          return (
            <div key={s} style={{ background: "#F4F1ED", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10, minHeight: 180 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>
                <span>{STAGE_LABEL[s]}{DEAL_STAGES.includes(s) ? <span style={{ color: "#1E4FB8", fontWeight: 500 }}> · deal</span> : null}</span>
                <span style={{ color: MUTED, fontWeight: 500 }}>{cards.length}</span>
              </div>
              {cards.map((p) => {
                const c = HEALTH[p.status === "active" ? (p.effectiveHealth || "none") : "none"];
                return (
                  <button key={p.id} onClick={() => onOpen(p.id)} style={{ background: "#fff", border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: 10, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, fontFamily: FONT }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: BRAND.coralDark }}>{p.code}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.ink, lineHeight: 1.3 }}>{p.title}</span>
                    <span style={{ fontSize: 11.5, color: MUTED, display: "flex", alignItems: "center", gap: 6 }}>
                      <Dot color={c.dot} />{(p.poc_name || "No owner").split(" ")[0]}{p.days_in_stage != null ? ` · ${p.days_in_stage} days` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   MY WORK -- landing page: next actions, my projects, recent changes.
   ========================================================================= */
function MyWorkView({ session, onOpen, goTo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getBuildMyWork().then(setData).catch((e) => setError(e.message || "Couldn't load your work."));
  }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = String(session.name || "").split(" ")[0];

  if (error) return <div style={{ maxWidth: 1240, margin: "0 auto", padding: 24 }}><ErrorBanner text={error} /></div>;
  if (!data) return <Spinner label="Loading your work…" />;
  const { tiles, todos, feed, mine } = data;
  const kindStyle = {
    update: ["#FBE7E7", "#9E2A2A", "!"], red: ["#FBE7E7", "#9E2A2A", "!"], stage: ["#FBF1DE", "#7A4F00", "✓"],
    review: ["#E9EFFD", "#1E4FB8", "◆"], ready: ["#E9EFFD", "#1E4FB8", "+"], delete: ["#F1EEEA", "#3D3936", "×"],
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px 80px" }}>
      <h1 style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 26, color: BRAND.ink }}>{greet}, {first}</h1>
      <div style={{ fontFamily: FONT, fontSize: 13.5, color: MUTED, marginTop: 4, marginBottom: 22 }}>
        {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {todos.length ? `${todos.length} thing${todos.length === 1 ? "" : "s"} need${todos.length === 1 ? "s" : ""} you` : "Nothing waiting on you"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 22 }}>
        {[
          [tiles.todo, "To do", "Stages, updates and requests", BRAND.ink],
          [tiles.overdue, "Updates overdue", "Over 14 days since the last one", tiles.overdue ? "#9E2A2A" : BRAND.ink],
          [tiles.redAmber, "Red or amber", "Projects that need attention", tiles.redAmber ? "#7A4F00" : BRAND.ink],
          [tiles.projects, "Live projects", `${tiles.internal} internal · ${tiles.startup} startup`, BRAND.ink],
        ].map(([n, label, sub, color]) => (
          <Card key={label} style={{ padding: 18 }}>
            <div style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color, lineHeight: 1.1 }}>{n}</div>
            <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: BRAND.ink, marginTop: 4 }}>{label}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED }}>{sub}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          <Card style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BRAND.line}`, fontFamily: FONT, fontWeight: 600, fontSize: 16, color: BRAND.ink }}>Your next actions</div>
            {todos.length === 0 ? (
              <div style={{ padding: 24, fontFamily: FONT, fontSize: 13, color: MUTED }}>You're all caught up.</div>
            ) : todos.map((t, i) => {
              const [bg, fg, mark] = kindStyle[t.kind] || kindStyle.stage;
              return (
                <div key={i} style={{ padding: "16px 20px", borderBottom: `1px solid ${BRAND.line}`, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flex: "none", fontFamily: FONT }}>{mark}</span>
                  <div style={{ flex: "1 1 280px", minWidth: 0, fontFamily: FONT }}>
                    {t.code && <div style={{ fontSize: 12, color: MUTED }}><b style={{ color: BRAND.coralDark }}>{t.code}</b> · {t.title}</div>}
                    <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink, marginTop: 2 }}>{t.action}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{t.detail}</div>
                  </div>
                  {t.due && <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: t.late ? "#FBE7E7" : "#F1EEEA", color: t.late ? "#9E2A2A" : "#3D3936", whiteSpace: "nowrap" }}>{t.due}</span>}
                  {t.projectId ? (
                    <PrimaryButton dark onClick={() => onOpen(t.projectId, { openUpdate: t.kind === "update" })}>{t.kind === "update" ? "Add update" : "Open"}</PrimaryButton>
                  ) : (
                    <PrimaryButton dark onClick={() => goTo("admin")}>Open Admin</PrimaryButton>
                  )}
                </div>
              );
            })}
          </Card>

          <Card style={{ padding: "18px 20px" }}>
            <SectionTitle>Recently changed</SectionTitle>
            {feed.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>No changes yet.</div> : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                {feed.map((f) => (
                  <li key={f.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontFamily: FONT }}>
                    <Dot color={f.read_at ? BRAND.line : BRAND.coral} size={10} />
                    <div>
                      <div style={{ fontSize: 13.5, color: BRAND.ink }}>{f.message}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{timeAgo(f.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside style={{ flex: "1 1 320px", minWidth: 0 }}>
          <Card style={{ padding: "18px 20px" }}>
            <SectionTitle>{["admin", "riv_manager", "client"].includes(session.role) ? "Projects" : "My projects"}</SectionTitle>
            {mine.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>No projects yet.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {mine.map((m) => {
                  const c = HEALTH[m.status === "active" ? (m.effectiveHealth || "none") : "none"];
                  return (
                    <button key={m.id} onClick={() => onOpen(m.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, fontFamily: FONT }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink }}>{m.title}</span><Dot color={c.dot} size={10} /></div>
                      <div style={{ fontSize: 12, color: MUTED }}>{m.code} · {m.type === "startup" ? "Startup" : "Internal"} · {m.status === "closed" ? "Closed" : `${m.stageLabel} · ${m.stageStep} of ${m.stageCount}`}</div>
                      <ProgressBar pct={m.status === "closed" ? 100 : m.stagePct} />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* =========================================================================
   PROJECT PAGE
   ========================================================================= */

// What each stage needs before the Product Owner can complete it. Labels
// match backend/lib/buildWorkflow.js missingFieldsForStage exactly.
const STAGE_FIELDS = {
  requirements: [
    { key: "kpi_name", label: "KPI name", kind: "metric", input: "text", req: true, placeholder: "e.g. Stock-outs per store per week" },
    { key: "kpi_unit", label: "KPI unit", kind: "metric", input: "text", placeholder: "e.g. per store per week" },
    { key: "baseline", label: "KPI baseline", kind: "metric", input: "number", req: true },
    { key: "target", label: "KPI target", kind: "metric", input: "number", req: true },
    { key: "est_cost", label: "Budget estimate", kind: "metric", input: "number", req: true, amount: true, unit: "US$" },
    { key: "est_benefit", label: "Estimated benefit per year", kind: "metric", input: "number", amount: true, unit: "US$" },
    { key: "target_end", label: "Target end date", kind: "detail", input: "date", req: true },
  ],
  nda: [{ key: "nda_signed_at", label: "NDA signed date", kind: "detail", input: "date", req: true }],
  proposal: [
    { key: "proposal_value", label: "Proposal value", kind: "detail", input: "number", req: true, unit: "US$" },
    { key: "proposal_accepted_at", label: "Proposal accepted date", kind: "detail", input: "date", req: true },
  ],
  purchase_order: [
    { key: "po_number", label: "PO number", kind: "detail", input: "text", req: true },
    { key: "po_value", label: "PO value", kind: "detail", input: "number", amount: true, unit: "US$" },
    { key: "po_date", label: "PO date", kind: "detail", input: "date", req: true },
  ],
  agreement: [
    { key: "agreement_type", label: "Agreement type", kind: "detail", input: "text", req: true, placeholder: "e.g. Pilot agreement, MSA" },
    { key: "agreement_signed_at", label: "Signed date", kind: "detail", input: "date", req: true },
    { key: "pilot_fee", label: "Pilot fee", kind: "detail", input: "number", amount: true, unit: "US$" },
  ],
  design: [
    { key: "systems_touched", label: "Systems touched", kind: "detail", input: "text", req: true, placeholder: "e.g. POS, ERP, store Wi-Fi" },
    { key: "data_shared", label: "Data shared", kind: "detail", input: "text" },
    { key: "risks", label: "Risks", kind: "detail", input: "text" },
    { key: "security_check_done", label: "Security check done (yes/no)", kind: "detail", input: "yesno", req: true, startupOnly: true },
  ],
  build: [{ key: "demo_link", label: "Demo link or evidence", kind: "detail", input: "text", req: true }],
  test: [{ key: "test_result", label: "Test result", kind: "detail", input: "select", req: true, options: [["pass", "Pass"], ["pass_with_issues", "Pass with issues"]] }],
  pilot: [
    { key: "pilot_scope", label: "Pilot scope", kind: "detail", input: "text", req: true, placeholder: "e.g. 10 stores, Bengaluru" },
    { key: "pilot_start", label: "Pilot start date", kind: "detail", input: "date", req: true },
    { key: "pilot_end", label: "Pilot end date", kind: "detail", input: "date", req: true },
  ],
  production: [
    { key: "rollout_scope", label: "Rollout scope", kind: "detail", input: "text", req: true },
    { key: "actual_cost", label: "Actual cost", kind: "metric", input: "number", req: true, amount: true, unit: "US$" },
    { key: "contract_value", label: "Contract value", kind: "detail", input: "number", req: true, amount: true, unit: "US$", startupOnly: true },
    { key: "realised_benefit", label: "Realised benefit per year", kind: "metric", input: "number", amount: true, unit: "US$" },
  ],
};
const camel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function fieldValue(project, f) {
  const v = f.kind === "metric" ? project.metrics?.[f.key] : project[f.key];
  if (v == null) return null;
  if (f.input === "date") return String(v).slice(0, 10);
  return v;
}
function displayValue(project, f) {
  const v = fieldValue(project, f);
  if (v == null || v === "") return null;
  if (f.input === "date") return fmtDate(v);
  if (f.input === "yesno") return v ? "Yes" : "No";
  if (f.input === "select") return (f.options.find((o) => o[0] === v) || [, v])[1];
  if (f.unit === "US$") return fmtUSD(Number(v));
  return String(v);
}
function fieldsFor(project, stage, seeAmounts) {
  return (STAGE_FIELDS[stage === "scale" ? "production" : stage] || [])
    .filter((f) => !f.startupOnly || project.type === "startup")
    .filter((f) => seeAmounts || !f.amount);
}

function StageFieldsEditor({ project, stage, seeAmounts, onSaved, onCancel, withStageDue }) {
  const fields = fieldsFor(project, stage, seeAmounts);
  const [form, setForm] = useState(() => {
    const o = {};
    for (const f of fields) {
      const v = fieldValue(project, f);
      o[f.key] = f.input === "yesno" ? (v == null ? "" : v ? "yes" : "no") : v ?? "";
    }
    if (withStageDue) o.stage_due = project.stage_due ? String(project.stage_due).slice(0, 10) : "";
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const details = {}, metrics = {};
      for (const f of fields) {
        let v = form[f.key];
        if (f.input === "yesno") v = v === "" ? null : v === "yes";
        else if (f.input === "number") v = v === "" ? null : Number(v);
        else v = v === "" ? null : v;
        (f.kind === "metric" ? metrics : details)[camel(f.key)] = v;
      }
      if (withStageDue) details.stageDue = form.stage_due || null;
      if (Object.keys(details).length) await api.updateBuildDetails(project.id, details);
      if (Object.keys(metrics).length) await api.updateBuildMetrics(project.id, metrics);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save.");
    } finally { setSaving(false); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={submit} style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 16, marginTop: 4 }}>
      <div style={grid2}>
        {fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} required={f.req}>
            {f.input === "select" ? (
              <select style={selectStyle} value={form[f.key]} onChange={set(f.key)}>
                <option value="">Choose…</option>
                {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : f.input === "yesno" ? (
              <select style={selectStyle} value={form[f.key]} onChange={set(f.key)}>
                <option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            ) : (
              <input type={f.input === "number" ? "number" : f.input === "date" ? "date" : "text"} style={inputStyle} value={form[f.key]} placeholder={f.placeholder} onChange={set(f.key)} />
            )}
          </Field>
        ))}
        {withStageDue && (
          <Field label="Planned end of this stage" hint="Used for the late-stage health rule: up to 14 days late is amber, more is red.">
            <input type="date" style={inputStyle} value={form.stage_due} onChange={set("stage_due")} />
          </Field>
        )}
      </div>
      <ErrorBanner text={error} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PrimaryButton type="submit" dark disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        {onCancel && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
      </div>
    </form>
  );
}

// A small modal used for every "needs a reason" action.
function Modal({ title, children, onClose, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.45)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: width, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 20, fontWeight: 700, color: BRAND.ink }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, borderRadius: 999, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer", flex: "none" }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReasonDialog({ title, intro, confirmLabel, onConfirm, onClose, extra, danger }) {
  const [reason, setReason] = useState("");
  const [extraVal, setExtraVal] = useState(extra?.default || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim(), extraVal); onClose(); } catch (e) { setError(e.message || "That didn't work."); } finally { setBusy(false); }
  }
  return (
    <Modal title={title} onClose={onClose}>
      {intro && <p style={{ fontFamily: FONT, fontSize: 13.5, color: "#3D3936", marginTop: 0, lineHeight: 1.6 }}>{intro}</p>}
      {extra && (
        <Field label={extra.label} required>
          <select style={selectStyle} value={extraVal} onChange={(e) => setExtraVal(e.target.value)}>
            {extra.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      )}
      <Field label="Reason" required>
        <textarea autoFocus style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorBanner text={error} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton dark={!danger} disabled={busy || !reason.trim()} onClick={go}>{busy ? "Saving…" : confirmLabel}</PrimaryButton>
      </div>
    </Modal>
  );
}

function StageTrack({ project, history }) {
  const stages = STAGE_LIST[project.type];
  const current = project.status === "closed" ? stages.length - 1 : stages.indexOf(project.stage === "scale" ? "production" : project.stage);
  const enteredAt = (s) => {
    const h = (history || []).find((x) => x.to_stage === s && x.action !== "send_back");
    return h ? fmtShortDate(h.at) : "";
  };
  const isStartup = project.type === "startup";
  return (
    <Card style={{ padding: "18px 20px", marginBottom: 20, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, minmax(84px, 1fr))`, gap: 6, minWidth: stages.length * 90 }}>
        {isStartup && <div style={{ gridColumn: "span 5", fontFamily: FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: "#1E4FB8", borderBottom: `2px solid #D6E0FA`, paddingBottom: 6 }}>DEAL</div>}
        {isStartup && <div style={{ gridColumn: "span 6", fontFamily: FONT, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: MUTED, borderBottom: `2px solid ${BRAND.line}`, paddingBottom: 6 }}>DELIVERY</div>}
        {stages.map((s, i) => {
          const done = i < current || project.status === "closed";
          const cur = i === current && project.status !== "closed";
          return (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 8, textAlign: "center" }}>
              <span aria-label={done ? "done" : cur ? "current" : "to do"} style={{
                width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 13, fontWeight: 700,
                background: done ? BRAND.ink : cur ? BRAND.coral : "#fff", color: done || cur ? "#fff" : "#8A847E",
                border: done || cur ? "none" : `2px solid ${BRAND.line}`, boxShadow: cur ? "0 0 0 4px #FCDADB" : "none",
              }}>{done ? "✓" : i + 1}</span>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: cur ? 700 : 500, color: cur ? BRAND.coralDark : BRAND.ink, lineHeight: 1.25 }}>{STAGE_LABEL[s]}</span>
              <span style={{ fontFamily: FONT, fontSize: 11, color: MUTED, minHeight: 14 }}>{cur ? "now" : done ? enteredAt(stages[i + 1]) || "" : ""}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CloseProjectBox({ project, lessons, onDone }) {
  const [outcome, setOutcome] = useState(project.stage === "closed" ? "scaled" : "stopped");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const roi = project.roi || {};
  async function go() {
    setBusy(true); setError(null);
    try { await api.closeBuildProject(project.id, outcome); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div style={{ background: BRAND.cream, borderRadius: 12, padding: "14px 16px", marginTop: 8 }}>
      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND.ink, marginBottom: 8 }}>Close project (RIV Admin)</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#3D3936", marginBottom: 10, lineHeight: 1.6 }}>
        Final ROI {fmtPct(roi.roiPct)}{roi.estimated ? " (estimated)" : ""}{roi.paybackMonths != null ? ` · payback ${roi.paybackMonths.toFixed(1)} months` : ""}. {lessons ? "Lessons learned recorded." : "Add lessons learned first (Lessons tab)."}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...selectStyle, width: 220 }} value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome">
          <option value="scaled" disabled={project.stage !== "closed"}>Scaled{project.stage !== "closed" ? " (after Production)" : ""}</option>
          <option value="stopped">Stopped</option>
        </select>
        <PrimaryButton dark disabled={busy || !lessons} onClick={go} icon={CheckCircle2}>{busy ? "Closing…" : "Close project"}</PrimaryButton>
      </div>
      <ErrorBanner text={error} />
    </div>
  );
}

function CurrentStagePanel({ project, perms, missing, lessons, onChanged, setDialog }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const stage = project.stage === "scale" ? "production" : project.stage;
  const fields = fieldsFor(project, stage, perms.seeAmounts);
  const required = fields.filter((f) => f.req);
  const doneCount = required.filter((f) => !missing.includes(f.label)).length;

  async function complete() {
    setBusy(true); setError(null);
    try { await api.advanceBuildStage(project.id); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (project.status === "closed") {
    return <Card style={{ padding: 20, marginBottom: 20 }}><Notice text={`This project is closed (${project.outcome === "scaled" ? "Scaled" : "Stopped"}).`} /></Card>;
  }
  if (project.status === "on_hold" || project.status === "stopped") {
    return (
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>{project.status === "on_hold" ? "On hold" : "Stopped"} in {STAGE_LABEL[stage]}</div>
        {project.hold_reason && <div style={{ fontFamily: FONT, fontSize: 13, color: "#3D3936", marginBottom: 12 }}>Reason: {project.hold_reason}</div>}
        {project.status === "on_hold" && perms.holdStop && <PrimaryButton dark onClick={async () => { await api.resumeBuildProject(project.id); onChanged(); }}>Resume project</PrimaryButton>}
        {project.status === "stopped" && perms.close && <CloseProjectBox project={project} lessons={lessons} onDone={onChanged} />}
        {project.status === "stopped" && !perms.close && <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED }}>RIV Admin closes stopped projects once lessons learned are recorded.</div>}
      </Card>
    );
  }
  if (stage === "closed") {
    return (
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>Production complete</div>
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#3D3936" }}>RIV Admin closes the project with the final ROI and lessons learned.</div>
        {perms.close && <CloseProjectBox project={project} lessons={lessons} onDone={onChanged} />}
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20, marginBottom: 20, border: `2px solid ${BRAND.ink}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 600, color: BRAND.ink }}>Current stage: {STAGE_LABEL[stage]}</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED }}>
          {doneCount} of {required.length} done{project.stage_due ? ` · planned end ${fmtShortDate(project.stage_due)}` : ""}
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {required.map((f) => {
          const ok = !missing.includes(f.label);
          return (
            <li key={f.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: FONT }}>
              <span aria-label={ok ? "done" : "to do"} style={{ width: 22, height: 22, borderRadius: 6, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, background: ok ? "#2E7D4F" : "#fff", color: "#fff", border: ok ? "none" : "2px solid #C9C2BA" }}>{ok ? "✓" : ""}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: BRAND.ink }}>{f.label}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{displayValue(project, f) || "Not filled in yet"}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {perms.editDetails && !editing && (
        <div style={{ marginTop: 14 }}><GhostButton onClick={() => setEditing(true)}>Fill in stage details</GhostButton></div>
      )}
      {editing && <StageFieldsEditor project={project} stage={stage} seeAmounts={perms.seeAmounts} withStageDue onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />}

      <div style={{ background: BRAND.cream, borderRadius: 12, padding: "14px 16px", marginTop: 16 }}>
        {stage === "pilot" ? (
          <>
            <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: BRAND.ink, marginBottom: 10 }}>Pilot decision</div>
            {perms.pilotDecision ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <PrimaryButton dark disabled={missing.length > 0} onClick={() => setDialog({ kind: "scale" })}>Scale → Production</PrimaryButton>
                <GhostButton onClick={() => setDialog({ kind: "iterate" })}>Iterate → back to Build</GhostButton>
                <GhostButton onClick={() => setDialog({ kind: "pilotStop" })}>Stop</GhostButton>
              </div>
            ) : null}
            <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
              {missing.length ? "Scale unlocks when the checklist is complete. " : ""}The Product Owner records the decision with a reason. The Client Leader is notified to review and can comment.
            </div>
          </>
        ) : perms.approveStage ? (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <PrimaryButton dark disabled={busy || missing.length > 0} onClick={complete} icon={CheckCircle2}>{busy ? "Saving…" : `Complete ${STAGE_LABEL[stage]}`}</PrimaryButton>
              {stage !== "requirements" && <GhostButton onClick={() => setDialog({ kind: "sendBack" })}>Send back</GhostButton>}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 8 }}>
              {missing.length ? `Fill in first: ${missing.join(", ")}.` : `Completing moves the project to ${STAGE_LABEL[STAGE_LIST[project.type][STAGE_LIST[project.type].indexOf(stage) + 1]]} and tells everyone on it.`}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#3D3936" }}>The Product Owner{project.poc_name ? ` (${project.poc_name})` : ""} completes and approves this stage.</div>
        )}
        <ErrorBanner text={error} />
      </div>
    </Card>
  );
}

function StatusUpdateModal({ project, data, session, onClose, onSaved }) {
  const perms = data.permissions;
  const last = data.updates?.[0];
  const showKpi = ["pilot", "production"].includes(project.stage) && project.metrics?.kpi_name;
  const showCost = perms.editRoi && perms.seeAmounts;
  const others = (data.people || []).filter((p) => Number(p.id) !== Number(session.id));
  const [form, setForm] = useState({ health: "", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "", kpiActual: "", actualCost: project.metrics?.actual_cost ?? "", agreedWith: others[0]?.id || "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.health) { setError("Pick a health."); return; }
    setBusy(true); setError(null);
    try {
      await api.addBuildUpdate(project.id, {
        health: form.health, progress: form.progress, nextSteps: form.nextSteps, blockers: form.blockers, needsHelp: form.needsHelp,
        pctComplete: form.pctComplete === "" ? null : Number(form.pctComplete), agreedWithUserId: form.agreedWith || null,
        kpiActual: showKpi && form.kpiActual !== "" ? Number(form.kpiActual) : undefined,
        actualCost: showCost && form.actualCost !== "" ? Number(form.actualCost) : undefined,
      });
      if (file) await api.uploadBuildFile(project.id, file, project.stage);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save the update.");
    } finally { setBusy(false); }
  }

  const healthBtn = (key) => {
    const c = HEALTH[key];
    const on = form.health === key;
    return (
      <button type="button" key={key} aria-pressed={on} onClick={() => setForm((f) => ({ ...f, health: key }))} style={{ padding: 14, minHeight: 52, borderRadius: 12, border: on ? `2px solid ${c.dot}` : `1px solid ${BRAND.line}`, background: on ? c.bg : "#fff", fontFamily: FONT, fontSize: 14, fontWeight: 600, color: on ? c.fg : BRAND.ink, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
        <Dot color={c.dot} size={12} />{c.label}
      </button>
    );
  };

  return (
    <Modal title="Add status update" onClose={onClose} width={680}>
      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coralDark, marginTop: -8, marginBottom: 16 }}>{project.code} · {project.title} · {project.stageLabel}</div>
      <form onSubmit={submit}>
        <fieldset style={{ border: "none", margin: "0 0 16px", padding: 0 }}>
          <legend style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 8, padding: 0 }}>Health <span style={{ color: BRAND.coral }}>*</span></legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>{["on_track", "at_risk", "off_track"].map(healthBtn)}</div>
        </fieldset>
        <Field label="What moved since the last update" required>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={form.progress} onChange={set("progress")} />
        </Field>
        <Field label="Next steps" required hint={last ? `Last time: ${last.next_steps}` : undefined}>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.nextSteps} onChange={set("nextSteps")} />
        </Field>
        <Field label="Blockers (optional)"><input style={inputStyle} value={form.blockers} onChange={set("blockers")} placeholder="Anything stopping progress?" /></Field>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: FONT, fontSize: 13, background: BRAND.cream, borderRadius: 10, padding: 12, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={form.needsHelp} onChange={(e) => setForm((f) => ({ ...f, needsHelp: e.target.checked }))} style={{ width: 18, height: 18, marginTop: 2 }} />
          <span><b style={{ fontWeight: 600 }}>Needs leadership help</b><br /><span style={{ color: MUTED, fontSize: 12 }}>Turns the project red and alerts the Client Leader and RIV Admin today.</span></span>
        </label>
        <div style={grid2}>
          {showKpi && (
            <Field label={`KPI now (${project.metrics.kpi_name})`} hint={`Baseline ${project.metrics.baseline ?? "—"} · Target ${project.metrics.target ?? "—"}`}>
              <input type="number" style={inputStyle} value={form.kpiActual} onChange={set("kpiActual")} />
            </Field>
          )}
          {showCost && (
            <Field label="Cost to date (US$)" hint={project.metrics?.est_cost != null ? `Budget ${fmtUSD(project.metrics.est_cost)}` : undefined}>
              <input type="number" style={inputStyle} value={form.actualCost} onChange={set("actualCost")} />
            </Field>
          )}
          <Field label="% complete in this stage"><input type="number" min="0" max="100" style={inputStyle} value={form.pctComplete} onChange={set("pctComplete")} /></Field>
          {others.length > 0 && (
            <Field label="Agreed with">
              <select style={selectStyle} value={form.agreedWith} onChange={set("agreedWith")}>
                <option value="">Nobody else</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
              </select>
            </Field>
          )}
          <Field label="Attach a file (optional)" hint="PDF, Word, Excel, PowerPoint, PNG or JPG, up to 10 MB.">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: 8 }} />
          </Field>
        </div>
        {project.healthReasons?.length > 0 && (
          <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, marginBottom: 16 }}>
            <b style={{ fontWeight: 600 }}>RIOS health check</b>
            <div style={{ color: "#3D3936", marginTop: 4 }}>{project.healthReasons.map((r) => r.text).join(" · ")}</div>
            <div style={{ color: MUTED, marginTop: 4 }}>If an automatic rule is worse than the health you pick, the worse one shows, with its reason.</div>
          </div>
        )}
        <ErrorBanner text={error} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={busy}>{busy ? "Saving…" : "Save update"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

// "Delete" for RIV Admin, "Request delete" for a RIV Client Partner,
// nothing for everyone else. Pending requests show a label instead.
function DeleteControl({ perms, pending, label, onDelete, onRequest }) {
  const [asking, setAsking] = useState(false);
  if (pending) return <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: "#7A4F00", background: "#FBF1DE", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>Delete requested</span>;
  if (perms.delete) {
    return <button onClick={() => { if (window.confirm(`Delete "${label}" permanently?`)) onDelete(); }} aria-label={`Delete ${label}`} title="Delete" style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={14} color="#C13B3B" /></button>;
  }
  if (perms.requestDelete) {
    return (
      <>
        <button onClick={() => setAsking(true)} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink, border: `1px solid ${BRAND.line}`, background: "#fff", borderRadius: 8, padding: "6px 10px", minHeight: 36, cursor: "pointer", whiteSpace: "nowrap" }}>Request delete</button>
        {asking && <ReasonDialog title="Request delete" intro={`RIV Admin will review your request to delete "${label}". It stays until they approve.`} confirmLabel="Send request" onClose={() => setAsking(false)} onConfirm={(reason) => onRequest(reason)} />}
      </>
    );
  }
  return null;
}

function UpdatesTab({ project, updates, perms, pendingDeletes, onChanged, onAdd }) {
  const pend = (id) => pendingDeletes.some((r) => r.target_type === "update" && Number(r.target_id) === Number(id));
  return (
    <div>
      {perms.addUpdate && <div style={{ marginBottom: 14 }}><PrimaryButton onClick={onAdd} icon={Plus}>Add status update</PrimaryButton></div>}
      {updates.length === 0 ? <EmptyState icon={FileText} title="No updates yet" text="Status updates are added every two weeks. The first one sets the project's health." /> : (
        <Card style={{ padding: "4px 20px" }}>
          {updates.map((u, i) => (
            <article key={u.id} style={{ padding: "16px 0", borderBottom: i === updates.length - 1 ? "none" : `1px solid ${BRAND.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div style={{ fontFamily: FONT, fontSize: 13 }}>
                  <b style={{ fontWeight: 600 }}>{u.by_name}</b>
                  <span style={{ color: MUTED }}> · {ROLE_LABEL[u.by_role] || ""}{u.agreed_with_name ? `, agreed with ${u.agreed_with_name}` : ""} · {fmtDate(u.update_date)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {u.needs_help && <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: "#9E2A2A", background: "#FBE7E7", padding: "3px 9px", borderRadius: 999 }}>Needs help</span>}
                  <HealthBadge health={u.health} size="sm" />
                  <DeleteControl perms={perms} pending={pend(u.id)} label={`update of ${fmtShortDate(u.update_date)}`}
                    onDelete={async () => { await api.deleteBuildUpdate(u.id); onChanged(); }}
                    onRequest={async (reason) => { await api.requestBuildDelete(project.id, { targetType: "update", targetId: u.id, reason }); onChanged(); }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, fontFamily: FONT }}>
                <div><div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>WHAT MOVED</div><div style={{ fontSize: 13, marginTop: 2, color: BRAND.ink }}>{u.progress}</div></div>
                <div><div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>NEXT STEPS</div><div style={{ fontSize: 13, marginTop: 2, color: BRAND.ink }}>{u.next_steps}</div></div>
                <div><div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>BLOCKERS</div><div style={{ fontSize: 13, marginTop: 2, color: BRAND.ink }}>{u.blockers || "None"}</div></div>
              </div>
            </article>
          ))}
        </Card>
      )}
    </div>
  );
}

function KpiRoiTab({ project, perms, kpiReadings, onSaved }) {
  const m = project.metrics || {};
  const roi = project.roi || {};
  const [leaderVal, setLeaderVal] = useState(m.realised_benefit ?? "");
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(false);
  const fields = [
    { key: "kpi_name", label: "KPI name", kind: "metric", input: "text" },
    { key: "kpi_unit", label: "KPI unit", kind: "metric", input: "text" },
    { key: "baseline", label: "KPI baseline", kind: "metric", input: "number" },
    { key: "target", label: "KPI target", kind: "metric", input: "number" },
    { key: "est_cost", label: "Budget estimate", kind: "metric", input: "number", amount: true, unit: "US$" },
    { key: "actual_cost", label: "Actual cost", kind: "metric", input: "number", amount: true, unit: "US$" },
    { key: "est_benefit", label: "Estimated benefit per year", kind: "metric", input: "number", amount: true, unit: "US$" },
    { key: "realised_benefit", label: "Realised benefit per year", kind: "metric", input: "number", amount: true, unit: "US$" },
  ];
  const max = Math.max(...[m.baseline, m.target, ...kpiReadings.map((k) => k.value)].filter((x) => x != null), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 20 }}>
        <SectionTitle>{m.kpi_name || "KPI"}{m.kpi_unit ? <span style={{ fontWeight: 400, color: MUTED }}> ({m.kpi_unit})</span> : null}</SectionTitle>
        {m.baseline == null ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>The KPI is set in Requirements.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[["Baseline", m.baseline, "#9B958F"], ...kpiReadings.map((k) => [fmtShortDate(k.reading_date), k.value, BRAND.coral]), ["Target", m.target, "#2E7D4F"]].map(([l, v, c], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 60px", gap: 10, alignItems: "center", fontFamily: FONT, fontSize: 12.5 }}>
                <span style={{ color: MUTED }}>{l}</span>
                <div style={{ height: 12, background: "#F4F1ED", borderRadius: 4 }}><div style={{ height: 12, width: `${(Number(v) / max) * 100}%`, background: c, borderRadius: 4 }} /></div>
                <span style={{ fontWeight: 600, color: BRAND.ink }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {perms.seeAmounts && (
        <Card style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
            {[["ROI", fmtPct(roi.roiPct), roi.estimated ? "Estimated" : "Realised"], ["Payback", roi.paybackMonths != null ? `${roi.paybackMonths.toFixed(1)} months` : "—", ""], ["Budget", fmtUSD(m.est_cost), ""], ["Cost to date", fmtUSD(m.actual_cost), ""], ["Value per year", fmtUSD(m.realised_benefit ?? m.est_benefit), m.realised_benefit != null ? "Realised" : "Estimated"]].map(([l, v, s]) => (
              <div key={l} style={{ background: BRAND.cream, borderRadius: 10, padding: "12px 14px", fontFamily: FONT }}>
                <div style={{ fontSize: 11.5, color: MUTED }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.ink }}>{v}</div>
                {s && <div style={{ fontSize: 11.5, color: MUTED }}>{s}</div>}
              </div>
            ))}
          </div>
          {perms.editRoi && !editing && <div style={{ marginTop: 14 }}><GhostButton onClick={() => setEditing(true)}>Edit KPI and money figures</GhostButton></div>}
          {editing && (
            <StageFieldsEditorGeneric project={project} fields={fields} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onSaved(); }} />
          )}
          {perms.confirmBenefit && !perms.editRoi && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${BRAND.line}`, paddingTop: 16 }}>
              <Field label="Confirm realised benefit per year (US$)" hint="As Client Leader, you confirm the benefit the project actually delivered.">
                <input type="number" style={{ ...inputStyle, maxWidth: 260 }} value={leaderVal} onChange={(e) => setLeaderVal(e.target.value)} />
              </Field>
              {msg && <Notice text={msg} />}
              <PrimaryButton dark onClick={async () => { await api.updateBuildMetrics(project.id, { realisedBenefit: leaderVal === "" ? null : Number(leaderVal) }); setMsg("Saved."); onSaved(); }}>Confirm</PrimaryButton>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// Same editor as the stage one, for an arbitrary field list.
function StageFieldsEditorGeneric({ project, fields, onSaved, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.key, fieldValue(project, f) ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = {};
      for (const f of fields) payload[camel(f.key)] = f.input === "number" ? (form[f.key] === "" ? null : Number(form[f.key])) : (form[f.key] || null);
      await api.updateBuildMetrics(project.id, payload);
      onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 16, marginTop: 16 }}>
      <div style={grid2}>
        {fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}>
            <input type={f.input === "number" ? "number" : "text"} style={inputStyle} value={form[f.key]} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <ErrorBanner text={error} />
      <div style={{ display: "flex", gap: 10 }}><PrimaryButton type="submit" dark disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton><GhostButton onClick={onCancel}>Cancel</GhostButton></div>
    </form>
  );
}

function FilesTab({ project, files, perms, pendingDeletes, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const pend = (id) => pendingDeletes.some((r) => r.target_type === "file" && Number(r.target_id) === Number(id));
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try { await api.uploadBuildFile(project.id, file, project.stage); onChanged(); }
    catch (e) { setError(e.message || "Upload failed."); }
    finally { setUploading(false); e.target.value = ""; }
  }
  return (
    <Card style={{ padding: 20 }}>
      <SectionTitle right={perms.uploadFiles && (
        <label style={{ display: "inline-block" }}>
          <input type="file" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff", color: uploading ? "#B7B2AE" : BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "10px 16px", minHeight: 44, boxSizing: "border-box", cursor: uploading ? "not-allowed" : "pointer" }}>
            {uploading ? <Loader2 size={14} className="build-spin" /> : <Upload size={14} />} {uploading ? "Uploading…" : "Upload file"}
          </span>
        </label>
      )}>Files {project.type === "startup" ? "and deal documents" : ""}</SectionTitle>
      <ErrorBanner text={error} />
      {files.length === 0 ? <EmptyState icon={Paperclip} title="No files yet" text={project.type === "startup" ? "Upload the NDA, proposal, PO and agreement here, plus designs, test reports and pilot results." : "Upload requirements, designs, test reports and pilot results here."} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${BRAND.line}`, borderRadius: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Paperclip size={14} color={MUTED} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, overflowWrap: "anywhere" }}>{f.file_name}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: MUTED }}>{STAGE_LABEL[f.stage] || f.stage} · {(f.size / 1024).toFixed(0)} KB · {f.by_name || ""} · {fmtDate(f.at)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => api.downloadBuildFile(project.id, f.id, f.file_name)} aria-label={`Download ${f.file_name}`} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Download size={14} color={BRAND.coral} /></button>
                <DeleteControl perms={perms} pending={pend(f.id)} label={f.file_name}
                  onDelete={async () => { await api.deleteBuildFile(project.id, f.id); onChanged(); }}
                  onRequest={async (reason) => { await api.requestBuildDelete(project.id, { targetType: "file", targetId: f.id, reason }); onChanged(); }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LessonsTab({ project, lessons, canEdit, onSaved }) {
  const [form, setForm] = useState({
    worked: lessons?.worked || "", notWorked: lessons?.not_worked || "", doDifferently: lessons?.do_differently || "",
    recommendation: lessons?.recommendation || "", tags: (lessons?.tags || []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      await api.updateBuildLessons(project.id, {
        worked: form.worked, notWorked: form.notWorked, doDifferently: form.doDifferently,
        recommendation: form.recommendation || null, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setSaved(true); onSaved();
    } catch (e) { setError(e.message || "Couldn't save lessons learned."); } finally { setSaving(false); }
  }
  if (!canEdit && !lessons) return <EmptyState icon={FileText} title="No lessons learned yet" text="Lessons learned are recorded before the project closes, whether it scaled or stopped." />;
  return (
    <Card style={{ padding: 20 }}>
      <SectionTitle>Lessons learned</SectionTitle>
      {canEdit ? (
        <form onSubmit={submit}>
          <Field label="What worked"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.worked} onChange={(e) => setForm((f) => ({ ...f, worked: e.target.value }))} /></Field>
          <Field label="What didn't work"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notWorked} onChange={(e) => setForm((f) => ({ ...f, notWorked: e.target.value }))} /></Field>
          <Field label="What we would do differently"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.doDifferently} onChange={(e) => setForm((f) => ({ ...f, doDifferently: e.target.value }))} /></Field>
          <div style={grid2}>
            <Field label="Recommendation">
              <select style={selectStyle} value={form.recommendation} onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))}>
                <option value="">Choose…</option>
                <option value="scale_to_others">Scale to other clients</option>
                <option value="reuse_approach">Reuse the approach</option>
                <option value="dont_repeat">Don't repeat</option>
              </select>
            </Field>
            <Field label="Tags" hint="Comma-separated, e.g. data quality, vendor"><input style={inputStyle} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} /></Field>
          </div>
          {saved && <Notice text="Saved. Lessons learned are required before RIV Admin can close the project." />}
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" dark disabled={saving}>{saving ? "Saving…" : "Save lessons learned"}</PrimaryButton>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT, fontSize: 13, color: BRAND.ink, lineHeight: 1.6 }}>
          {lessons.worked && <div><b>What worked:</b> {lessons.worked}</div>}
          {lessons.not_worked && <div><b>What didn't work:</b> {lessons.not_worked}</div>}
          {lessons.do_differently && <div><b>Do differently:</b> {lessons.do_differently}</div>}
          {lessons.recommendation && <div><b>Recommendation:</b> {lessons.recommendation.replace(/_/g, " ")}</div>}
        </div>
      )}
    </Card>
  );
}

const ACTION_LABEL = { advance: "Moved on", send_back: "Sent back", iterate: "Iterate", hold: "Put on hold", resume: "Resumed", stop: "Stopped", close: "Closed" };
function HistoryTab({ history }) {
  if (!history.length) return <EmptyState icon={History} title="No history yet" text="Every stage change is recorded here with who, when and why." />;
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {history.map((h) => (
          <div key={h.id} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: `1px solid ${BRAND.line}`, fontFamily: FONT }}>
            <div style={{ fontSize: 12, color: MUTED, minWidth: 100 }}>{fmtDate(h.at)}</div>
            <div style={{ fontSize: 13, color: BRAND.ink }}>
              <b>{ACTION_LABEL[h.action] || h.action}</b>
              {h.from_stage && h.to_stage && h.from_stage !== h.to_stage ? `: ${STAGE_LABEL[h.from_stage] || h.from_stage} → ${STAGE_LABEL[h.to_stage] || h.to_stage}` : !h.from_stage && h.to_stage ? `: started in ${STAGE_LABEL[h.to_stage]}` : ""}
              {h.reason ? `. ${h.reason}` : ""}
              <span style={{ color: MUTED }}> · {h.by_name}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Re-assess loop: link a project closed as Scaled back to the audit question it fixes. RIV Admin only.
function ReassessLinkPanel({ project, session }) {
  const [questions, setQuestions] = useState(null);
  const [links, setLinks] = useState(null);
  const [query, setQuery] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const show = session.role === "admin" && project.status === "closed" && project.outcome === "scaled";

  useEffect(() => {
    if (!show) return;
    api.getQuestions().then((d) => setQuestions(d.questions || [])).catch(() => setQuestions([]));
    api.getBuildReassessLinks(project.client_id).then((d) => setLinks(d.links || [])).catch(() => setLinks([]));
  }, [project.client_id, show]);
  if (!show) return null;

  const matches = !query.trim() ? [] : (questions || []).filter((q) => `${q.module} ${q.submodule} ${q.q}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  async function link() {
    if (!questionId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.linkBuildReassess(project.id, Number(questionId));
      const d = await api.getBuildReassessLinks(project.client_id);
      setLinks(d.links || []);
      setNotice("Linked. The client's next scorecard shows this project against that question.");
      setQuestionId(""); setQuery("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Card style={{ padding: 20, marginTop: 16 }}>
      <SectionTitle>Re-assess: link to the audit question</SectionTitle>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginBottom: 12 }}>The client's next scorecard shows "Addressed by {project.code}" on that question.</div>
      {(links || []).filter((l) => (l.note || "").includes(project.code)).map((l) => (
        <div key={l.questionId} style={{ fontFamily: FONT, fontSize: 12.5, color: "#1B7A5A", background: "#E7F5EF", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>Linked to question #{l.questionId}: {l.note}</div>
      ))}
      <input placeholder="Search audit questions by module or text…" value={query} onChange={(e) => { setQuery(e.target.value); setQuestionId(""); }} style={inputStyle} />
      {matches.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: `1px solid ${BRAND.line}`, borderRadius: 10 }}>
          {matches.map((q) => (
            <button key={q.id} onClick={() => { setQuestionId(String(q.id)); setQuery(`${q.module} · ${q.submodule}`); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontFamily: FONT, fontSize: 12.5, cursor: "pointer", background: String(q.id) === questionId ? BRAND.cream : "#fff", border: "none", borderBottom: `1px solid ${BRAND.line}` }}>
              <div style={{ color: MUTED, fontSize: 11 }}>{q.module} · {q.submodule}</div>
              <div style={{ color: BRAND.ink }}>{q.q}</div>
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ fontFamily: FONT, fontSize: 12, color: BRAND.coralDark, marginTop: 8 }}>{error}</div>}
      <Notice text={notice} />
      <PrimaryButton dark style={{ marginTop: 12 }} disabled={!questionId || busy} onClick={link}>{busy ? "Linking…" : "Link this question"}</PrimaryButton>
    </Card>
  );
}

function OverviewTab({ project, perms, session, onSaved }) {
  const [editStage, setEditStage] = useState(null);
  const stages = STAGE_LIST[project.type].filter((s) => s !== "closed");
  return (
    <div>
      {project.description && (
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <SectionTitle>About this project</SectionTitle>
          <div style={{ fontFamily: FONT, fontSize: 13.5, color: "#3D3936", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{project.description}</div>
        </Card>
      )}
      <Card style={{ padding: 20 }}>
        <SectionTitle>Stage details</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {stages.map((s) => {
            const fields = fieldsFor(project, s, perms.seeAmounts);
            if (!fields.length) return null;
            return (
              <div key={s} style={{ borderBottom: `1px solid ${BRAND.line}`, paddingBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: DEAL_STAGES.includes(s) ? "#1E4FB8" : BRAND.coralDark, letterSpacing: "0.04em", textTransform: "uppercase" }}>{STAGE_LABEL[s]}</div>
                  {perms.editDetails && editStage !== s && <button onClick={() => setEditStage(s)} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", minHeight: 32 }}>Edit</button>}
                </div>
                {editStage === s ? (
                  <StageFieldsEditor project={project} stage={s} seeAmounts={perms.seeAmounts} onCancel={() => setEditStage(null)} onSaved={() => { setEditStage(null); onSaved(); }} />
                ) : (
                  <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "8px 18px", fontFamily: FONT }}>
                    {fields.map((f) => (
                      <div key={f.key}><dt style={{ fontSize: 11.5, color: MUTED }}>{f.label}</dt><dd style={{ margin: 0, fontSize: 13, color: BRAND.ink }}>{displayValue(project, f) || "—"}</dd></div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <ReassessLinkPanel project={project} session={session} />
    </div>
  );
}

function SideCard({ title, children }) {
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: BRAND.ink, marginBottom: 12 }}>{title}</div>
      {children}
    </Card>
  );
}

function Person({ name, role, color }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, background: name ? color : "#E7E2DC", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 12, fontWeight: 600, flex: "none" }}>{name ? initials(name) : "?"}</span>
      <div style={{ minWidth: 0, fontFamily: FONT }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: name ? BRAND.ink : "#9E2A2A" }}>{name || "Not assigned"}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{role}</div>
      </div>
    </div>
  );
}

function MoreMenu({ project, perms, onAction }) {
  const [open, setOpen] = useState(false);
  const items = [];
  if (perms.holdStop && project.status === "active") items.push(["hold", "Put on hold"]);
  if (perms.holdStop && project.status === "on_hold") items.push(["resume", "Resume"]);
  if (perms.holdStop && ["active", "on_hold"].includes(project.status)) items.push(["stop", "Stop project"]);
  if (perms.delete) items.push(["delete", "Delete project"]);
  if (!items.length) return null;
  return (
    <div style={{ position: "relative" }}>
      <GhostButton onClick={() => setOpen((o) => !o)} title="More actions">More ▾</GhostButton>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: 50, background: "#fff", border: `1px solid ${BRAND.line}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 200, zIndex: 20, overflow: "hidden" }}>
          {items.map(([id, label]) => (
            <button key={id} role="menuitem" onClick={() => { setOpen(false); onAction(id); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", fontFamily: FONT, fontSize: 13.5, border: "none", background: "#fff", cursor: "pointer", color: id === "delete" ? "#C13B3B" : BRAND.ink }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectDetailView({ projectId, session, onBack, openUpdateOnLoad }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("updates");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpdate, setShowUpdate] = useState(!!openUpdateOnLoad);
  const [dialog, setDialog] = useState(null);

  function load() {
    api.getBuildProject(projectId).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message || "Couldn't load this project.")).finally(() => setLoading(false));
  }
  useEffect(() => { setLoading(true); load(); }, [projectId]);

  if (loading) return <Spinner label="Loading project…" />;
  if (!data) return <div style={{ maxWidth: 1240, margin: "0 auto", padding: 24 }}><ErrorBanner text={error || "Project not found."} /></div>;

  const { project, sources, history, updates, lessons, files, kpiReadings, permissions: perms, pendingDeleteRequests } = data;
  const m = project.metrics || {};
  const isStartup = project.type === "startup";
  const pilotDay = project.stage === "pilot" && project.pilot_start && project.pilot_end
    ? `Pilot day ${Math.max(0, Math.floor((Date.now() - new Date(project.pilot_start)) / 86400000) + 1)} of ${Math.floor((new Date(project.pilot_end) - new Date(project.pilot_start)) / 86400000) + 1}` : null;

  async function onMoreAction(id) {
    if (id === "resume") { await api.resumeBuildProject(project.id); load(); return; }
    if (id === "delete") {
      if (window.confirm(`Delete ${project.code} "${project.title}" and everything on it? This can't be undone.`)) {
        try { await api.deleteBuildProject(project.id); onBack(); } catch (e) { setError(e.message); }
      }
      return;
    }
    setDialog({ kind: id });
  }

  const dialogs = {
    hold: { title: "Put project on hold", confirm: "Put on hold", run: (r) => api.holdBuildProject(project.id, r) },
    stop: { title: "Stop project", confirm: "Stop project", danger: true, intro: "Stopping ends the work. RIV Admin then closes the project once lessons learned are recorded.", run: (r) => api.stopBuildProject(project.id, r) },
    sendBack: {
      title: "Send back a stage", confirm: "Send back",
      extra: { label: "Send back to", default: STAGE_LIST[project.type][Math.max(0, STAGE_LIST[project.type].indexOf(project.stage) - 1)], options: STAGE_LIST[project.type].slice(0, STAGE_LIST[project.type].indexOf(project.stage)).map((s) => [s, STAGE_LABEL[s]]) },
      run: (r, to) => api.sendBackBuildStage(project.id, { reason: r, toStage: to }),
    },
    scale: { title: "Pilot decision: Scale", confirm: "Record: Scale → Production", intro: "The project moves to Production. The Client Leader is notified to review.", run: (r) => api.decideBuildPilot(project.id, { decision: "scale", reason: r }) },
    iterate: { title: "Pilot decision: Iterate", confirm: "Record: Iterate", extra: { label: "Go back to", default: "build", options: [["build", "Build"], ["design", "Design"]] }, run: (r, to) => api.decideBuildPilot(project.id, { decision: "iterate", iterateTo: to, reason: r }) },
    pilotStop: { title: "Pilot decision: Stop", confirm: "Record: Stop", danger: true, intro: "The project stops. RIV Admin closes it once lessons learned are recorded.", run: (r) => api.decideBuildPilot(project.id, { decision: "stop", reason: r }) },
  };
  const dlg = dialog && dialogs[dialog.kind];

  const tabs = [
    { id: "updates", label: `Updates · ${updates.length}` },
    { id: "overview", label: "Overview" },
    { id: "kpi", label: "KPI & ROI" },
    { id: "files", label: `Files · ${files.length}` },
    { id: "lessons", label: "Lessons" },
    { id: "history", label: "History" },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 80px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 13, color: MUTED, background: "none", border: "none", cursor: "pointer", marginBottom: 16, minHeight: 36, padding: 0 }}>
        <ChevronLeft size={14} /> Projects / {isStartup ? "Startup pilots" : "Internal ideas"}
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: BRAND.coralDark }}>{project.code}</div>
          <h1 style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 26, color: BRAND.ink }}>{project.title}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <TypeBadge type={project.type} />
            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "#F1EEEA", color: "#3D3936" }}>{project.client_company || project.client_name}</span>
            {project.status === "active" && <HealthBadge health={project.effectiveHealth} reasons={project.healthReasons} />}
            <StatusBadge status={project.status} />
            <span style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED }}>{[pilotDay, project.target_end ? `Target end ${fmtDate(project.target_end)}` : null].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {perms.addUpdate && project.status !== "closed" && <PrimaryButton onClick={() => setShowUpdate(true)}>Add status update</PrimaryButton>}
          <MoreMenu project={project} perms={perms} onAction={onMoreAction} />
        </div>
      </div>
      {project.status === "active" && project.healthReasons?.length > 0 && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#3D3936", marginBottom: 14 }}><b style={{ fontWeight: 600 }}>Why {HEALTH[project.effectiveHealth]?.label.toLowerCase()}:</b> {project.healthReasons.map((r) => r.text).join(" · ")}</div>
      )}
      {session.role === "riv_manager" && <Banner>As RIV Client Partner you can add updates, upload files and edit details. To delete something, use "Request delete"; RIV Admin approves it.</Banner>}
      <ErrorBanner text={error} />

      <StageTrack project={project} history={history} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 600px", minWidth: 0 }}>
          <CurrentStagePanel project={project} perms={perms} missing={data.missingForNextStage || []} lessons={lessons} onChanged={load} setDialog={setDialog} />

          <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 16, overflowX: "auto" }}>
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: tab === t.id ? 600 : 500, padding: "12px 12px", minHeight: 44, background: "none", border: "none",
                borderBottom: `3px solid ${tab === t.id ? BRAND.coral : "transparent"}`, color: tab === t.id ? BRAND.ink : MUTED, cursor: "pointer", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>
          {tab === "updates" && <UpdatesTab project={project} updates={updates} perms={perms} pendingDeletes={pendingDeleteRequests || []} onChanged={load} onAdd={() => setShowUpdate(true)} />}
          {tab === "overview" && <OverviewTab project={project} perms={perms} session={session} onSaved={load} />}
          {tab === "kpi" && <KpiRoiTab project={project} perms={perms} kpiReadings={kpiReadings} onSaved={load} />}
          {tab === "files" && <FilesTab project={project} files={files} perms={perms} pendingDeletes={pendingDeleteRequests || []} onChanged={load} />}
          {tab === "lessons" && <LessonsTab project={project} lessons={lessons} canEdit={perms.editDetails} onSaved={load} />}
          {tab === "history" && <HistoryTab history={history} />}
        </div>

        <aside style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <SideCard title="People">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Person name={project.client_name} role={`Client Leader · reviews${project.client_company ? ` · ${project.client_company}` : ""}`} color={BRAND.ink} />
              <Person name={project.poc_name} role="Product Owner · owns delivery" color={BRAND.coral} />
              <Person name={project.owner_name} role={isStartup ? "Startup POC" : "Employee"} color="#2F6FEB" />
              <Person name={project.riv_manager_name} role="RIV Client Partner" color={MUTED} />
            </div>
          </SideCard>

          <SideCard title="KPI & value">
            {m.baseline == null ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>The KPI is set in Requirements.</div> : (() => {
              const progress = project.kpi_latest != null && m.baseline !== m.target ? (m.baseline - project.kpi_latest) / (m.baseline - m.target) : null;
              const beat = progress != null && progress >= 1;
              return (
                <div style={{ fontFamily: FONT }}>
                  <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 6 }}>{m.kpi_name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, marginBottom: 6 }}><span>Baseline {m.baseline}</span><span>Target {m.target}</span></div>
                  <ProgressBar pct={progress == null ? 0 : progress * 100} height={10} color={beat ? "#2E7D4F" : BRAND.coral} />
                  <div style={{ fontSize: 13.5, marginTop: 8 }}><b>Now {project.kpi_latest ?? "—"}</b>{beat ? <span style={{ color: "#1F5E3A" }}> · target beaten</span> : progress != null ? <span style={{ color: MUTED }}> · {Math.round(progress * 100)}% of the way</span> : null}</div>
                </div>
              );
            })()}
            {perms.seeAmounts && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
                <div style={{ background: BRAND.cream, borderRadius: 10, padding: "10px 12px", fontFamily: FONT }}><div style={{ fontSize: 11.5, color: MUTED }}>Cost to date</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmtUSD(m.actual_cost)}</div><div style={{ fontSize: 11.5, color: MUTED }}>{m.est_cost != null ? `of ${fmtUSD(m.est_cost)} budget` : "No budget yet"}</div></div>
                <div style={{ background: BRAND.cream, borderRadius: 10, padding: "10px 12px", fontFamily: FONT }}><div style={{ fontSize: 11.5, color: MUTED }}>Value per year</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmtUSD(m.realised_benefit ?? m.est_benefit)}</div><div style={{ fontSize: 11.5, color: MUTED }}>{m.realised_benefit != null ? "Realised" : "Estimated"}</div></div>
              </div>
            )}
          </SideCard>

          {isStartup && (
            <SideCard title="Deal summary">
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontFamily: FONT, fontSize: 13 }}>
                <dt style={{ color: MUTED }}>NDA</dt><dd style={{ margin: 0 }}>{project.nda_signed_at ? `Signed ${fmtShortDate(project.nda_signed_at)}` : "Not yet"}</dd>
                <dt style={{ color: MUTED }}>Proposal</dt><dd style={{ margin: 0 }}>{project.proposal_accepted_at ? `${project.proposal_value != null ? fmtUSD(Number(project.proposal_value)) + ", " : ""}accepted ${fmtShortDate(project.proposal_accepted_at)}` : "Not yet"}</dd>
                <dt style={{ color: MUTED }}>Purchase Order</dt><dd style={{ margin: 0 }}>{project.po_number ? `${project.po_number}${project.po_date ? `, ${fmtShortDate(project.po_date)}` : ""}${perms.seeAmounts && project.po_value != null ? ` · ${fmtUSD(Number(project.po_value))}` : ""}` : "Not yet"}</dd>
                <dt style={{ color: MUTED }}>Agreement</dt><dd style={{ margin: 0 }}>{project.agreement_signed_at ? `${project.agreement_type || "Signed"}, ${fmtShortDate(project.agreement_signed_at)}` : "Not yet"}</dd>
              </dl>
            </SideCard>
          )}

          {sources?.length > 0 && (
            <div style={{ background: "#F4F1ED", borderRadius: 14, padding: "18px 20px", fontFamily: FONT, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: BRAND.ink }}>Where it came from</div>
              {sources.map((s) => (
                <div key={s.id} style={{ color: "#3D3936" }}>
                  <div>{s.label}{s.score != null ? ` · jury score ${s.score} / ${s.scoreOutOf}` : ""}</div>
                  {s.question && <div style={{ marginTop: 4 }}>Addresses audit opportunity: <b style={{ fontWeight: 600 }}>{s.question.submodule}</b> ({s.question.module})</div>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showUpdate && <StatusUpdateModal project={project} data={data} session={session} onClose={() => setShowUpdate(false)} onSaved={() => { setShowUpdate(false); setTab("updates"); load(); }} />}
      {dlg && (
        <ReasonDialog title={dlg.title} intro={dlg.intro} confirmLabel={dlg.confirm} extra={dlg.extra} danger={dlg.danger}
          onClose={() => setDialog(null)} onConfirm={async (reason, extra) => { await dlg.run(reason, extra); load(); }} />
      )}
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD -- the Client Leader's innovation portfolio, plus the
   RIV Admin's all-retailers view. Calendar-year periods.
   ========================================================================= */
function Tile({ label, children, dark }) {
  return (
    <div style={{ background: dark ? BRAND.ink : "#fff", border: dark ? "none" : `1px solid ${BRAND.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 6, color: dark ? "#fff" : BRAND.ink, fontFamily: FONT }}>
      <span style={{ fontSize: 12, color: dark ? "#D8D3CD" : MUTED, fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}
function Big({ children }) {
  return <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{children}</span>;
}
function Chip({ children, dark }) {
  return <span style={{ alignSelf: "flex-start", padding: "2px 8px", borderRadius: 999, background: dark ? "#4A4643" : "#F1EEEA", fontSize: 11.5, fontWeight: 600, color: dark ? "#fff" : "#3D3936" }}>{children}</span>;
}

function HealthDonut({ health }) {
  const total = health.on_track + health.at_risk + health.off_track + health.none;
  const segs = [["on_track", health.on_track], ["at_risk", health.at_risk], ["off_track", health.off_track], ["none", health.none]];
  let acc = 0;
  const stops = total ? segs.map(([k, n]) => { const a = acc; acc += (n / total) * 100; return `${HEALTH[k].dot} ${a}% ${acc}%`; }).join(", ") : "#E7E2DC 0 100%";
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <div role="img" aria-label={`Health: ${health.on_track} on track, ${health.at_risk} at risk, ${health.off_track} off track, ${health.none} no update yet`} style={{ width: 84, height: 84, borderRadius: 999, background: `conic-gradient(${stops})`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <span style={{ width: 54, height: 54, borderRadius: 999, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, fontFamily: FONT, color: BRAND.ink }}>{total}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, fontFamily: FONT, color: BRAND.ink }}>
        {segs.map(([k, n]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}><Dot color={HEALTH[k].dot} size={9} />{n} {HEALTH[k].label.toLowerCase()}</span>)}
      </div>
    </div>
  );
}

function ClientDashboard({ clientId, period, type, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!clientId) return;
    setData(null); setError(null);
    api.getBuildClientDashboard(clientId, { period: period === "all" ? "all" : "year", year: period === "all" ? undefined : period, type: type || undefined })
      .then(setData).catch((e) => setError(e.message || "Couldn't load the dashboard."));
  }, [clientId, period, type]);

  if (error) return <ErrorBanner text={error} />;
  if (!data) return <Spinner label="Loading dashboard…" />;
  const { summary: s, pipeline, attention, value, audit, projects, wins, lessons } = data;

  if (!projects.length && !s.readyCount) {
    return <EmptyState icon={Briefcase} title="Your portfolio starts here" text="Projects appear when your Ideathon winners or selected startups move into Build. RIV sets them up for you." />;
  }

  const maxStage = Math.max(1, ...pipeline.map((p) => p.internal + p.startup));
  const maxVal = Math.max(1, ...value.map((v) => Math.max(v.cost || 0, v.benefit || 0)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section aria-label="Headlines" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
        <Tile label="Live projects">
          <Big>{s.live}</Big>
          <span style={{ fontSize: 12.5, color: "#3D3936" }}>{s.internal} internal ideas · {s.startup} startup pilots</span>
          {s.readyCount > 0 && <span style={{ fontSize: 12, color: MUTED }}>+{s.readyCount} selected, being set up by RIV</span>}
        </Tile>
        <Tile label="Health"><HealthDonut health={s.health} /></Tile>
        <Tile label="Invested to date">
          <Big>{s.investedFmt}</Big>
          <span style={{ fontSize: 12, color: MUTED }}>Actual cost recorded on projects</span>
        </Tile>
        <Tile label="Value per year">
          <Big>{s.estValueFmt}</Big>
          <Chip>{s.valueEstimated ? "Estimated" : "Realised"}</Chip>
          <span style={{ fontSize: 12, color: MUTED }}>Realised so far {s.realisedFmt}</span>
        </Tile>
        <Tile label="Portfolio ROI" dark>
          <Big>{fmtPct(s.roiPct)}</Big>
          <Chip dark>{s.roiEstimated ? "Estimated" : "Realised"}</Chip>
          <span style={{ fontSize: 12, color: "#D8D3CD" }}>{s.paybackMonths != null ? `Payback about ${Math.max(1, Math.round(s.paybackMonths))} months` : "Needs cost and value figures"}</span>
        </Tile>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>
        <Card style={{ flex: "1 1 520px", minWidth: 0, padding: 20 }}>
          <SectionTitle right={<span style={{ display: "flex", gap: 14, fontFamily: FONT, fontSize: 12, color: "#3D3936" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: BRAND.coral }} />Internal</span><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: BRAND.blue }} />Startup</span></span>}>Where every project is</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pipeline.map((p) => (
              <div key={p.key} style={{ display: "grid", gridTemplateColumns: "130px 1fr 24px", gap: 12, alignItems: "center", fontFamily: FONT }}>
                <span style={{ fontSize: 13, color: BRAND.ink }}>{p.label}</span>
                <div style={{ height: 18, background: "#F4F1ED", borderRadius: 6, display: "flex", overflow: "hidden" }}>
                  <div style={{ width: `${(p.internal / maxStage) * 100}%`, background: BRAND.coral }} />
                  <div style={{ width: `${(p.startup / maxStage) * 100}%`, background: BRAND.blue }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", color: BRAND.ink }}>{p.internal + p.startup}</span>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED, marginTop: 12 }}>Deal stages = NDA, Proposal, Purchase Order, Agreement (startups only).</div>
        </Card>

        <Card style={{ flex: "1 1 420px", minWidth: 0, padding: 20 }}>
          <SectionTitle>Needs your attention</SectionTitle>
          {attention.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>Nothing needs attention right now.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {attention.map((a) => (
                <button key={a.projectId + a.why} onClick={() => onOpen(a.projectId)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", fontFamily: FONT }}>
                  <span style={{ marginTop: 5 }}><Dot color={a.level === "info" ? BRAND.blue : HEALTH[a.level].dot} size={10} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: MUTED }}><b style={{ color: BRAND.coralDark }}>{a.code}</b> · {a.title}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink, marginTop: 2 }}>{a.why}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{a.meta}</div>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.ink, whiteSpace: "nowrap" }}>Review →</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>
        <Card style={{ flex: "1 1 520px", minWidth: 0, padding: 20 }}>
          <SectionTitle right={<span style={{ display: "flex", gap: 14, fontFamily: FONT, fontSize: 12, color: "#3D3936" }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: MUTED }} />Cost</span><span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#F4A3A5" }} />Value / year</span></span>}>Cost vs value, by project</SectionTitle>
          {value.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>Money figures appear once projects record a budget and benefit in Requirements.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {value.map((v) => (
                <div key={v.projectId} style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 12, alignItems: "center", fontFamily: FONT }}>
                  <div><div style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{v.title}</div><div style={{ fontSize: 11.5, color: MUTED }}>{v.code}{v.estimated ? " · estimated" : ""}</div></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ height: 10, borderRadius: 4, background: MUTED, width: `${Math.max(1, ((v.cost || 0) / maxVal) * 78)}%` }} /><span style={{ fontSize: 11.5, color: "#3D3936" }}>{fmtUSD(v.cost)}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ height: 10, borderRadius: 4, background: "#F4A3A5", opacity: v.estimated ? 0.7 : 1, width: `${Math.max(1, ((v.benefit || 0) / maxVal) * 78)}%` }} /><span style={{ fontSize: 11.5, color: "#3D3936" }}>{fmtUSD(v.benefit)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ flex: "1 1 420px", minWidth: 0, padding: 20 }}>
          <SectionTitle>From audit to impact</SectionTitle>
          {!audit ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED }}>Shows the Discover top 5 opportunities once the audit is answered.</div> : (
            <>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: -6, marginBottom: 10 }}>Your Discover top 5 opportunities and what is being done about each.</div>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {audit.items.map((o) => {
                  const chip = { "Live": ["#E8F3EC", "#1F5E3A"], "In Build": ["#E9EFFD", "#1E4FB8"], "Being set up": ["#FBF1DE", "#7A4F00"], "Not started": ["#F1EEEA", "#3D3936"] }[o.status];
                  return (
                    <li key={o.questionId} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F1EEEA", fontFamily: FONT }}>
                      <span style={{ width: 26, height: 26, borderRadius: 999, background: "#F4F1ED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{o.rank}</span>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{o.name}</div><div style={{ fontSize: 11.5, color: MUTED }}>{o.valueFmt} identified{o.links.length ? ` · ${o.links.join(", ")}` : ""}</div></div>
                      <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", background: chip[0], color: chip[1] }}>{o.status}</span>
                    </li>
                  );
                })}
              </ol>
              <div style={{ background: BRAND.cream, borderRadius: 10, padding: "10px 12px", fontFamily: FONT, fontSize: 12.5, marginTop: 10 }}>
                {audit.identifiedFmt} identified · {audit.withAction} of {audit.items.length} have action · {audit.inBuild} in Build · {audit.live} live
              </div>
            </>
          )}
        </Card>
      </div>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BRAND.line}` }}><SectionTitle>All projects</SectionTitle></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead><tr style={{ background: BRAND.cream }}>
              <th style={th}>Project</th><th style={th}>Type</th><th style={th}>Stage</th><th style={th}>Health</th><th style={th}>KPI progress</th><th style={th}>ROI</th><th style={th}>Product Owner</th>
            </tr></thead>
            <tbody>
              {projects.map((r) => (
                <tr key={r.id} className="build-row" onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}>
                  <td style={td}><div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div><div style={{ fontSize: 11.5, color: BRAND.coralDark, fontWeight: 700 }}>{r.code}</div></td>
                  <td style={td}>{r.type === "internal" ? "Internal" : "Startup"}</td>
                  <td style={{ ...td, minWidth: 140 }}><div>{r.stageLabel}</div><div style={{ marginTop: 5 }}><ProgressBar pct={r.stagePct} height={5} /></div></td>
                  <td style={td}>{r.status === "active" ? <HealthBadge health={r.effectiveHealth} size="sm" /> : <StatusBadge status={r.status} />}</td>
                  <td style={td}>{r.kpiText || "Not set yet"}{r.kpiBeat ? " ✓" : ""}</td>
                  <td style={td}>{r.roiPct != null ? `${fmtPct(r.roiPct)}${r.roiEstimated ? " est." : ""}` : "—"}</td>
                  <td style={td}>{r.poName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(wins.length > 0 || lessons.length > 0) && (
        <section aria-label="Wins and lessons" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 }}>
          {wins.map((w, i) => (
            <div key={`w${i}`} style={{ background: "#E8F3EC", borderRadius: 16, padding: "18px 20px", fontFamily: FONT }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1F5E3A", letterSpacing: "0.04em" }}>RECENT WIN</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: BRAND.ink }}>{w.text}</div>
              <div style={{ fontSize: 12, color: "#3D3936", marginTop: 4 }}>{w.code}{w.when ? ` · ${fmtShortDate(w.when)}` : ""}</div>
            </div>
          ))}
          {lessons.map((l) => (
            <div key={`l${l.projectId}`} style={{ background: "#FBF1DE", borderRadius: 16, padding: "18px 20px", fontFamily: FONT }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7A4F00", letterSpacing: "0.04em" }}>LESSON LEARNED</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: BRAND.ink }}>{l.text}</div>
              <div style={{ fontSize: 12, color: "#3D3936", marginTop: 4 }}>From {l.code} · {l.title}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function PortfolioDashboard({ onPickClient }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.getBuildPortfolioDashboard().then(setData).catch((e) => setError(e.message || "Couldn't load the portfolio."));
  }, []);
  if (error) return <ErrorBanner text={error} />;
  if (!data) return <Spinner label="Loading portfolio…" />;
  if (!data.clients.length) return <EmptyState icon={Building2} title="No retailers with Build projects yet" text="A retailer's row appears here once its first project is created." />;
  const t = data.totals;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        <Tile label="Retailers"><Big>{t.clients}</Big></Tile>
        <Tile label="Live projects"><Big>{t.live}</Big></Tile>
        <Tile label="Red · amber"><Big>{t.red} · {t.amber}</Big></Tile>
        <Tile label="Invested to date"><Big>{t.investedFmt}</Big></Tile>
        <Tile label="Value per year" dark><Big>{t.valueFmt}</Big></Tile>
      </section>
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead><tr style={{ background: BRAND.cream }}>
              <th style={th}>Retailer</th><th style={th}>Live</th><th style={th}>Red</th><th style={th}>Amber</th><th style={th}>Invested</th><th style={th}>Value / year</th><th style={th}>ROI</th><th style={th}>Audit score</th>
            </tr></thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.clientId} className="build-row" onClick={() => onPickClient(c.clientId)} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, fontWeight: 600, fontSize: 13.5 }}>{c.company || c.name}</td>
                  <td style={td}>{c.live}</td>
                  <td style={{ ...td, color: c.red ? "#9E2A2A" : BRAND.ink, fontWeight: c.red ? 700 : 400 }}>{c.red}</td>
                  <td style={{ ...td, color: c.amber ? "#7A4F00" : BRAND.ink, fontWeight: c.amber ? 700 : 400 }}>{c.amber}</td>
                  <td style={td}>{c.investedFmt}</td>
                  <td style={td}>{c.valueFmt}</td>
                  <td style={td}>{fmtPct(c.roiPct)}</td>
                  <td style={td}>{c.latestAuditScore ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ fontFamily: FONT, fontSize: 12, color: MUTED }}>Click a retailer to open its dashboard.</div>
    </div>
  );
}

function DashboardView({ session, onOpen }) {
  const isAdmin = session.role === "admin";
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState("");
  const [allRetailers, setAllRetailers] = useState(isAdmin);
  const thisYear = new Date().getFullYear();
  const [period, setPeriod] = useState(String(thisYear));
  const [type, setType] = useState("");

  useEffect(() => {
    api.getBuildDashboardClients().then((d) => {
      const list = d.clients || [];
      setClients(list);
      if (list.length) setClientId((c) => c || String(list[0].id));
    }).catch(() => setClients([]));
  }, []);

  const client = (clients || []).find((c) => String(c.id) === String(clientId));
  const showPicker = ["admin", "riv_manager"].includes(session.role);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.coralDark, letterSpacing: "0.04em", textTransform: "uppercase" }}>{allRetailers ? "RIV portfolio" : (client?.company || client?.name || "")}</div>
          <h1 style={{ margin: "2px 0 0", fontFamily: FONT, fontWeight: 700, fontSize: 28, color: BRAND.ink }}>{allRetailers ? "All retailers" : "Innovation portfolio"}</h1>
          <div style={{ fontFamily: FONT, fontSize: 13.5, color: MUTED, marginTop: 4 }}>What's in flight, what needs attention, and what it is returning. As of {fmtDate(new Date())}.</div>
        </div>
        <div className="build-noprint" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          {isAdmin && (
            <div role="group" aria-label="View" style={{ display: "flex", border: `1px solid ${BRAND.line}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
              {[[true, "All retailers"], [false, "One retailer"]].map(([v, l]) => (
                <button key={l} onClick={() => setAllRetailers(v)} aria-pressed={allRetailers === v} style={{ padding: "10px 14px", minHeight: 42, border: "none", background: allRetailers === v ? BRAND.ink : "#fff", color: allRetailers === v ? "#fff" : BRAND.ink, fontFamily: FONT, fontSize: 13, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          )}
          {!allRetailers && showPicker && (
            <label style={{ fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Retailer
              <select style={{ ...selectStyle, marginTop: 4, minWidth: 180 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
            </label>
          )}
          {!allRetailers && (
            <>
              <label style={{ fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Period
                <select style={{ ...selectStyle, marginTop: 4 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value={String(thisYear)}>{thisYear} (Jan–Dec)</option>
                  <option value={String(thisYear - 1)}>{thisYear - 1} (Jan–Dec)</option>
                  <option value="all">All time</option>
                </select>
              </label>
              <label style={{ fontFamily: FONT, fontSize: 11.5, color: MUTED, fontWeight: 500 }}>Show
                <select style={{ ...selectStyle, marginTop: 4 }} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">Internal ideas + Startup pilots</option>
                  <option value="internal">Internal ideas only</option>
                  <option value="startup">Startup pilots only</option>
                </select>
              </label>
            </>
          )}
          <GhostButton onClick={() => window.print()} icon={Printer}>Export PDF</GhostButton>
        </div>
      </div>
      {session.role === "riv_manager" && <Banner>Showing the retailers assigned to you.</Banner>}

      {allRetailers ? (
        <PortfolioDashboard onPickClient={(id) => { setClientId(String(id)); setAllRetailers(false); }} />
      ) : clients === null ? <Spinner label="Loading…" /> : !clients.length ? (
        <EmptyState icon={Briefcase} title="No dashboard yet" text="The dashboard fills in once a project exists for this retailer." />
      ) : (
        <ClientDashboard clientId={clientId} period={period} type={type} onOpen={onOpen} />
      )}
    </div>
  );
}

/* =========================================================================
   ADMIN (RIV Admin only) -- Ready for Build, create projects with their
   people, people on projects, logins, delete requests, overdue digest.
   ========================================================================= */

// Every client account (main site list), for the manual create form and logins.
function useAllClients() {
  const [clients, setClients] = useState(null);
  useEffect(() => { api.listClients().then((d) => setClients(d.clients || [])).catch(() => setClients([])); }, []);
  return clients;
}

function ClientPicker({ value, onChange, required, label, hint }) {
  const clients = useAllClients();
  return (
    <Field label={label} required={required} hint={hint}>
      <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{clients === null ? "Loading…" : "Choose a client"}</option>
        {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
      </select>
    </Field>
  );
}

function useQuestions() {
  const [questions, setQuestions] = useState([]);
  useEffect(() => { api.getQuestions().then((d) => setQuestions(d.questions || [])).catch(() => setQuestions([])); }, []);
  return questions;
}

function AuditOpportunityPicker({ value, onChange }) {
  const questions = useQuestions();
  const modules = useMemo(() => {
    const m = new Map();
    for (const q of questions) {
      if (q.hasDollar === false) continue;
      if (!m.has(q.module)) m.set(q.module, []);
      m.get(q.module).push(q);
    }
    return [...m.entries()];
  }, [questions]);
  return (
    <Field label="Linked audit opportunity" hint="Which Discover audit question this project addresses. Used on the dashboard's 'From audit to impact'.">
      <select style={selectStyle} value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {modules.map(([mod, qs]) => (
          <optgroup key={mod} label={mod}>
            {qs.map((q) => <option key={q.id} value={q.id}>{q.submodule}: {q.q.length > 70 ? q.q.slice(0, 70) + "…" : q.q}</option>)}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

// People section of the create form: Client Leader (read-only), Product
// Owner, Employee (internal) or Startup POC (startup), RIV Client Partner.
function PeopleFields({ type, people, form, setForm, startupDefaults }) {
  if (!people) return <Spinner label="Loading people…" />;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <fieldset style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, margin: "0 0 16px", padding: "16px 16px 0" }}>
      <legend style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, padding: "0 6px", color: BRAND.ink }}>People</legend>
      <div style={grid2}>
        <Field label="Client Leader (reviews)" hint="The retailer's leader account. One per retailer.">
          <input style={{ ...inputStyle, background: "#F4F1ED", color: "#3D3936" }} disabled value={people.clientLeader ? `${people.clientLeader.name}${people.clientLeader.company ? `, ${people.clientLeader.company}` : ""}` : "—"} />
        </Field>
        <Field label="Product Owner (owns delivery)" required hint={!people.productOwners.length ? "This client has no Product Owner login yet. Create one under Logins first." : undefined}>
          <select style={selectStyle} value={form.pocUserId} onChange={set("pocUserId")}>
            <option value="">Choose…</option>
            {people.productOwners.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
          </select>
        </Field>
        {type === "internal" ? (
          <Field label="Employee (contributes)" hint="Pre-filled with the idea's author.">
            <select style={selectStyle} value={form.ownerUserId} onChange={set("ownerUserId")}>
              <option value="">None</option>
              {people.employees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Startup POC" required>
            <select style={selectStyle} value={form.ownerUserId} onChange={set("ownerUserId")}>
              <option value="">{startupDefaults ? "Create a new Startup POC login" : "Choose or create below"}</option>
              {people.startupPocs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          </Field>
        )}
        <Field label="RIV Client Partner">
          <select style={selectStyle} value={form.rivManagerId} onChange={set("rivManagerId")}>
            <option value="">None</option>
            {people.partners.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
          </select>
        </Field>
      </div>
      {type === "startup" && !form.ownerUserId && (
        <div style={{ background: BRAND.cream, borderRadius: 10, padding: "14px 14px 0", marginBottom: 16 }}>
          <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 10 }}>New Startup POC login</div>
          <div style={grid2}>
            <Field label="Name" required><input style={inputStyle} value={form.spName} onChange={set("spName")} /></Field>
            <Field label="Email" required><input type="email" style={inputStyle} value={form.spEmail} onChange={set("spEmail")} /></Field>
            <Field label="Temporary password" required hint="At least 8 characters. They choose their own at first login. Share it with them yourself."><input style={inputStyle} value={form.spPassword} onChange={set("spPassword")} /></Field>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function CreateProjectForm({ item, onDone, onCancel }) {
  // item = a Ready for Build row, or null for a manual project.
  const manual = !item;
  const [type, setType] = useState(item?.workflow || "internal");
  const [clientId, setClientId] = useState(item?.clientId ? String(item.clientId) : "");
  const [people, setPeople] = useState(null);
  const [form, setForm] = useState({
    title: item ? (item.workflow === "startup" ? `${item.title}: pilot` : item.title) : "",
    description: "",
    questionId: item?.questionId ? String(item.questionId) : "",
    pocUserId: "", ownerUserId: item?.authorId ? String(item.authorId) : "", rivManagerId: "",
    spName: item?.founderName || "", spEmail: item?.founderEmail || "", spPassword: "",
    targetEnd: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) { setPeople(null); return; }
    setPeople(null);
    api.getBuildPeople(clientId).then((d) => {
      if (item?.authorId && !d.employees.some((e) => Number(e.id) === Number(item.authorId))) {
        d = { ...d, employees: [{ id: item.authorId, name: item.authorName || "Idea author", email: "idea author" }, ...d.employees] };
      }
      setPeople(d);
      if (d.productOwners.length === 1) setForm((f) => ({ ...f, pocUserId: f.pocUserId || String(d.productOwners[0].id) }));
      if (d.partners.length === 1) setForm((f) => ({ ...f, rivManagerId: f.rivManagerId || String(d.partners[0].id) }));
    }).catch((e) => setError(e.message));
  }, [clientId]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = {
        title: form.title, pocUserId: form.pocUserId || null, ownerUserId: form.ownerUserId || null,
        rivManagerId: form.rivManagerId || null, targetEnd: form.targetEnd || null, questionId: form.questionId || null,
      };
      if (type === "startup" && !form.ownerUserId) payload.startupPoc = { name: form.spName, email: form.spEmail, password: form.spPassword };
      let d;
      if (manual) d = await api.createBuildProject({ ...payload, type, clientId, description: form.description });
      else if (item.sourceType === "idea") d = await api.createBuildProjectFromIdea(item.sourceId, payload);
      else d = await api.createBuildProjectFromApplication(item.sourceId, { ...payload, clientId: item.clientId ? undefined : clientId });
      onDone(d.project);
    } catch (e) {
      setError(e.message || "Couldn't create the project.");
    } finally { setBusy(false); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Card style={{ padding: 24, border: `2px solid ${BRAND.ink}` }}>
      <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: BRAND.ink }}>{manual ? "New project" : `Create project: ${item.title} (${item.workflow === "startup" ? "startup pilot" : "internal idea"})`}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, margin: "4px 0 18px" }}>{manual ? "For an idea or startup that didn't come through RIOS." : `Filled in from ${item.subtitle}. Check the details, pick the people, create.`}</div>
      <form onSubmit={submit}>
        <div style={grid2}>
          {manual ? (
            <Field label="Workflow" required>
              <select style={selectStyle} value={type} onChange={(e) => { setType(e.target.value); setForm((f) => ({ ...f, ownerUserId: "" })); }}>
                <option value="internal">Internal idea (Enterprise Innovation)</option>
                <option value="startup">Startup pilot (Open Innovation)</option>
              </select>
            </Field>
          ) : (
            <Field label="Workflow"><input disabled style={{ ...inputStyle, background: "#F4F1ED", color: "#3D3936" }} value={item.workflow === "startup" ? "Startup pilot (Open Innovation)" : "Internal idea (Enterprise Innovation)"} /></Field>
          )}
          {manual || !item.clientId ? (
            <ClientPicker label="Client" required value={clientId} onChange={setClientId} hint={!manual ? "This startup call has no client yet. Pick the retailer." : undefined} />
          ) : (
            <Field label="Client"><input disabled style={{ ...inputStyle, background: "#F4F1ED", color: "#3D3936" }} value={item.clientName || ""} /></Field>
          )}
        </div>
        <Field label="Project title" required><input style={inputStyle} value={form.title} onChange={set("title")} /></Field>
        {manual && <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.description} onChange={set("description")} /></Field>}
        <AuditOpportunityPicker value={form.questionId} onChange={(v) => setForm((f) => ({ ...f, questionId: v }))} />
        {clientId ? <PeopleFields type={type} people={people} form={form} setForm={setForm} startupDefaults={!!item?.founderEmail} /> : <Banner>Choose the client to pick the people.</Banner>}
        <Field label="Target end date" required><input type="date" style={{ ...inputStyle, maxWidth: 260 }} value={form.targetEnd} onChange={set("targetEnd")} /></Field>
        <ErrorBanner text={error} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {onCancel && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
          <PrimaryButton type="submit" disabled={busy || !clientId}>{busy ? "Creating…" : "Create project"}</PrimaryButton>
        </div>
      </form>
    </Card>
  );
}

function ReadyForBuildPanel({ onCreated, onCount }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);
  const [notNow, setNotNow] = useState(null);
  const [notice, setNotice] = useState(null);

  function load() {
    api.getBuildReady().then((d) => { setItems(d.items || []); onCount?.(d.items?.length || 0); }).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, []);

  if (creating) {
    return <CreateProjectForm item={creating} onCancel={() => setCreating(null)} onDone={(p) => { setCreating(null); setNotice(`Created ${p.code}. Everyone on it has been told.`); load(); onCreated(); }} />;
  }

  return (
    <div>
      <Notice text={notice} />
      <ErrorBanner text={error} />
      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BRAND.line}` }}>
          <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: BRAND.ink }}>Selected, not yet a project</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: 2 }}>Items arrive here automatically when an Ideathon winner is selected for Build or a startup is selected for pilot. No IDs to type.</div>
        </div>
        {items === null ? <Spinner /> : items.length === 0 ? (
          <div style={{ padding: 24, fontFamily: FONT, fontSize: 13, color: MUTED }}>Nothing waiting. Select an Ideathon winner for Build, or a startup for pilot, and it appears here.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead><tr style={{ background: BRAND.cream }}>
                <th style={th}>Source</th><th style={th}>Item</th><th style={th}>Client</th><th style={th}>Selected</th><th style={th}>Waiting</th><th style={th}>Jury score</th><th style={th}>Action</th>
              </tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={`${it.sourceType}-${it.sourceId}`}>
                    <td style={td}><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: it.workflow === "startup" ? "#E9EFFD" : "#FCE9E9", color: it.workflow === "startup" ? "#1E4FB8" : "#9E2A2A" }}>{it.workflow === "startup" ? "Startup call" : "Ideathon"}</span></td>
                    <td style={td}><div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.title}</div><div style={{ fontSize: 12, color: MUTED }}>{it.subtitle}</div>{it.deferredUntil && <div style={{ fontSize: 12, color: "#7A4F00", marginTop: 2 }}>Deferred until {fmtShortDate(it.deferredUntil)}: {it.deferReason}</div>}</td>
                    <td style={td}>{it.clientName || <span style={{ color: "#9E2A2A" }}>No client set</span>}</td>
                    <td style={td}>{fmtShortDate(it.selectedAt)}</td>
                    <td style={td}>{it.waitingDays != null ? `${it.waitingDays} day${it.waitingDays === 1 ? "" : "s"}` : "—"}</td>
                    <td style={td}>{it.score != null ? `${it.score} / 5` : "—"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <PrimaryButton dark onClick={() => setCreating(it)} style={{ padding: "8px 12px", minHeight: 38, fontSize: 12.5 }}>Review &amp; create</PrimaryButton>
                        {it.deferredUntil
                          ? <GhostButton onClick={async () => { await api.undoNotNowBuildReady(it.sourceType, it.sourceId); load(); }} style={{ padding: "8px 12px", minHeight: 38, fontSize: 12.5 }}>Undo defer</GhostButton>
                          : <GhostButton onClick={() => setNotNow(it)} style={{ padding: "8px 12px", minHeight: 38, fontSize: 12.5 }}>Not now</GhostButton>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BRAND.line}`, fontFamily: FONT, fontSize: 12, color: MUTED }}>"Not now" offers Defer (with a date) or Decline (with a reason). There's no deadline; Waiting shows how long an item has been here.</div>
      </Card>
      {notNow && <NotNowDialog item={notNow} onClose={() => setNotNow(null)} onDone={() => { setNotNow(null); load(); }} />}
    </div>
  );
}

function NotNowDialog({ item, onClose, onDone }) {
  const [action, setAction] = useState("defer");
  const [untilDate, setUntilDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go() {
    setBusy(true); setError(null);
    try { await api.notNowBuildReady(item.sourceType, item.sourceId, { action, untilDate, reason }); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Not now: ${item.title}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {[["defer", "Defer"], ["decline", "Decline"]].map(([v, l]) => (
          <button key={v} onClick={() => setAction(v)} aria-pressed={action === v} style={{ flex: 1, padding: 12, minHeight: 44, borderRadius: 10, border: action === v ? `2px solid ${BRAND.ink}` : `1px solid ${BRAND.line}`, background: "#fff", fontFamily: FONT, fontWeight: 600, cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      <p style={{ fontFamily: FONT, fontSize: 13, color: "#3D3936", marginTop: 0 }}>{action === "defer" ? "It stays on the list with the date you pick." : "It leaves the list. The idea or startup is marked as not taken forward."}</p>
      {action === "defer" && <Field label="Come back to it on" required><input type="date" style={inputStyle} value={untilDate} onChange={(e) => setUntilDate(e.target.value)} /></Field>}
      <Field label="Reason" required><textarea style={{ ...inputStyle, minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBanner text={error} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton dark disabled={busy || !reason.trim() || (action === "defer" && !untilDate)} onClick={go}>{action === "defer" ? "Defer" : "Decline"}</PrimaryButton>
      </div>
    </Modal>
  );
}

function PeopleOnProjectsPanel() {
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [people, setPeople] = useState(null);
  const [form, setForm] = useState({ pocUserId: "", ownerUserId: "", rivManagerId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => { api.listBuildProjects().then((d) => setProjects(d.projects || [])).catch(() => setProjects([])); }, []);
  const project = (projects || []).find((p) => String(p.id) === String(projectId));
  useEffect(() => {
    if (!project) { setPeople(null); return; }
    setForm({ pocUserId: project.poc_user_id ? String(project.poc_user_id) : "", ownerUserId: project.owner_user_id ? String(project.owner_user_id) : "", rivManagerId: project.riv_manager_id ? String(project.riv_manager_id) : "" });
    api.getBuildPeople(project.client_id).then(setPeople).catch((e) => setError(e.message));
  }, [project?.id]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.assignBuildProject(projectId, { pocUserId: form.pocUserId || undefined, ownerUserId: form.ownerUserId || undefined, rivManagerId: form.rivManagerId || undefined });
      setNotice("Saved. New people on the project have been told.");
      api.listBuildProjects().then((d) => setProjects(d.projects || []));
    } catch (e) { setError(e.message || "Couldn't save."); } finally { setBusy(false); }
  }

  return (
    <Card style={{ padding: 24, maxWidth: 820 }}>
      <SectionTitle>People on a project</SectionTitle>
      <form onSubmit={submit}>
        <Field label="Project" required>
          <select style={selectStyle} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Choose a project</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.code}: {p.title} ({p.client_company || p.client_name})</option>)}
          </select>
        </Field>
        {project && <PeopleFields type={project.type} people={people} form={{ ...form, spName: "", spEmail: "", spPassword: "" }} setForm={setForm} startupDefaults={false} />}
        {project && project.type === "startup" && !form.ownerUserId && <Banner>Create the Startup POC login under Logins first, then pick it here.</Banner>}
        <Notice text={notice} />
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" dark disabled={busy || !projectId}>{busy ? "Saving…" : "Save"}</PrimaryButton>
      </form>
    </Card>
  );
}

function LoginsPanel() {
  const [pocs, setPocs] = useState([]);
  const [managers, setManagers] = useState([]);
  const [pocForm, setPocForm] = useState({ email: "", password: "", name: "", clientId: "" });
  const [mgrForm, setMgrForm] = useState({ email: "", password: "", name: "", clientIds: [] });
  const allClients = useAllClients();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function load() {
    api.listBuildPocs().then((d) => setPocs(d.pocs || [])).catch(() => {});
    api.listBuildManagers().then((d) => setManagers(d.managers || [])).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function createPoc(e) {
    e.preventDefault(); setError(null); setNotice(null);
    try { await api.createBuildPoc(pocForm); setPocForm({ email: "", password: "", name: "", clientId: "" }); setNotice("Product Owner login created. Share the email and temporary password with them."); load(); }
    catch (e) { setError(e.message || "Couldn't create that login."); }
  }
  async function createManager(e) {
    e.preventDefault(); setError(null); setNotice(null);
    try { await api.createBuildManager(mgrForm); setMgrForm({ email: "", password: "", name: "", clientIds: [] }); setNotice("RIV Client Partner login created."); load(); }
    catch (e) { setError(e.message || "Couldn't create that login."); }
  }
  const toggle = (id) => setMgrForm((f) => ({ ...f, clientIds: f.clientIds.includes(id) ? f.clientIds.filter((x) => x !== id) : [...f.clientIds, id] }));

  return (
    <div>
      {(error || notice) && <div>{notice && <Notice text={notice} />}{error && <ErrorBanner text={error} />}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16 }}>
        <Card style={{ padding: 20 }}>
          <SectionTitle><Users size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Product Owner logins</SectionTitle>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: -6, marginBottom: 14 }}>The retailer's person who owns delivery and approves each stage.</div>
          <form onSubmit={createPoc}>
            <Field label="Name" required><input style={inputStyle} value={pocForm.name} onChange={(e) => setPocForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Email" required><input type="email" style={inputStyle} value={pocForm.email} onChange={(e) => setPocForm((f) => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Temporary password" required hint="At least 8 characters."><input style={inputStyle} value={pocForm.password} onChange={(e) => setPocForm((f) => ({ ...f, password: e.target.value }))} /></Field>
            <ClientPicker label="Client" required value={pocForm.clientId} onChange={(v) => setPocForm((f) => ({ ...f, clientId: v }))} />
            <PrimaryButton type="submit" dark icon={Plus}>Create login</PrimaryButton>
          </form>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {pocs.map((p) => (
              <div key={p.id} style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{p.name} · {p.email} · {p.client_company || "—"}</span>
                <button onClick={async () => { if (window.confirm(`Remove ${p.name}'s login?`)) { await api.deleteBuildPoc(p.id); load(); } }} aria-label={`Remove ${p.name}`} style={{ width: 32, height: 32, background: "none", border: "none", color: "#C13B3B", cursor: "pointer" }}><X size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{ padding: 20 }}>
          <SectionTitle><Briefcase size={15} style={{ marginRight: 6, verticalAlign: -2 }} />RIV Client Partner logins</SectionTitle>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: -6, marginBottom: 14 }}>RIV people who support the retailers assigned to them. They can't delete anything; they ask you.</div>
          <form onSubmit={createManager}>
            <Field label="Name" required><input style={inputStyle} value={mgrForm.name} onChange={(e) => setMgrForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Email" required><input type="email" style={inputStyle} value={mgrForm.email} onChange={(e) => setMgrForm((f) => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Temporary password" required hint="At least 8 characters."><input style={inputStyle} value={mgrForm.password} onChange={(e) => setMgrForm((f) => ({ ...f, password: e.target.value }))} /></Field>
            <Field label="Assigned clients" hint="Which retailers this Client Partner works with.">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto", border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "8px 10px" }}>
                {(allClients || []).map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, minHeight: 28 }}>
                    <input type="checkbox" checked={mgrForm.clientIds.includes(String(c.id))} onChange={() => toggle(String(c.id))} />{c.company || c.name}
                  </label>
                ))}
              </div>
            </Field>
            <PrimaryButton type="submit" dark icon={Plus}>Create login</PrimaryButton>
          </form>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {managers.map((m) => (
              <div key={m.id} style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{m.name} · {m.email} ({(m.client_names || []).filter(Boolean).join(", ") || "no clients"})</span>
                <button onClick={async () => { if (window.confirm(`Remove ${m.name}'s login?`)) { await api.deleteBuildManager(m.id); load(); } }} aria-label={`Remove ${m.name}`} style={{ width: 32, height: 32, background: "none", border: "none", color: "#C13B3B", cursor: "pointer" }}><X size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: 14 }}>Startup POC logins are created from the Create project form. Employees are the Ideathon employee logins.</div>
    </div>
  );
}

// Build-only Client Leader logins (no access to the main audit).
function ManageBuildClientsPanel() {
  const [clients, setClients] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "" });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  function load() { api.listBuildClients().then((d) => setClients(d.clients || [])).catch(() => setClients([])); }
  useEffect(() => { load(); }, []);
  async function createClient(e) {
    e.preventDefault(); setError(null); setNotice(null); setSubmitting(true);
    try { await api.createBuildClient(form); setForm({ name: "", email: "", password: "", company: "" }); setNotice(`Login created for ${form.name}${form.company ? ` (${form.company})` : ""}. Share the email and temporary password with them.`); load(); }
    catch (e) { setError(e.message || "Couldn't create that login."); } finally { setSubmitting(false); }
  }
  async function removeClient(c) {
    if (!window.confirm(`Remove ${c.company || c.name}'s Build-only login? They'll lose access to their projects.`)) return;
    await api.deleteBuildClient(c.id); load();
  }
  async function resetPassword(c) {
    const pw = window.prompt(`New temporary password for ${c.name || c.email} (at least 8 characters). They choose their own at next login.`);
    if (pw === null) return;
    if (pw.length < 8) { setError("The temporary password must be at least 8 characters."); return; }
    try { await api.adminResetPassword(c.id, pw); setError(null); setNotice(`Password reset for ${c.name || c.email}.`); } catch (e) { setError(e.message); }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      <div style={{ flex: "999 1 480px", minWidth: 0 }}>
        <SectionTitle>Build-only Client Leader logins</SectionTitle>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginTop: -6, marginBottom: 16 }}>Client Leaders who see Build only, without the Discover audit. Clients created on the main site's Manage Clients also see Build.</div>
        {clients === null ? <Spinner /> : clients.length === 0 ? <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 24, fontFamily: FONT, fontSize: 13, color: MUTED }}>None yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clients.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: FONT }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: BRAND.ink }}>{c.company || c.name}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{c.name} · {c.email}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => resetPassword(c)} aria-label="Reset password" title="Reset password" style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff" }}><KeyRound size={14} /></button>
                  <button onClick={() => removeClient(c)} aria-label="Remove" title="Remove" style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: "#C13B3B" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Card style={{ flex: "1 1 320px", padding: 20, height: "fit-content" }}>
        <SectionTitle><Building2 size={15} style={{ marginRight: 6, verticalAlign: -2 }} />New Build-only Client Leader</SectionTitle>
        <form onSubmit={createClient}>
          <Field label="Contact name" required><input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Company"><input style={inputStyle} value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required hint="At least 8 characters."><input style={inputStyle} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          {notice && <Notice text={notice} />}
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" dark icon={Plus} disabled={submitting} style={{ width: "100%" }}>{submitting ? "Creating…" : "Create login"}</PrimaryButton>
        </form>
      </Card>
    </div>
  );
}

function DeleteRequestsPanel({ onCount }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  function load() {
    api.listBuildDeleteRequests(status).then((d) => { setRows(d.requests || []); if (status === "pending") onCount?.(d.requests?.length || 0); }).catch((e) => setError(e.message));
  }
  useEffect(() => { setRows(null); load(); }, [status]);
  async function decide(id, decision) {
    try { await api.decideBuildDeleteRequest(id, decision); load(); } catch (e) { setError(e.message); }
  }
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BRAND.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: BRAND.ink }}>Delete requests from RIV Client Partners</div>
        <select style={{ ...selectStyle, width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Show">
          <option value="pending">Waiting</option><option value="approved">Approved</option><option value="declined">Declined</option>
        </select>
      </div>
      <div style={{ padding: 16 }}>
        <ErrorBanner text={error} />
        {rows === null ? <Spinner /> : rows.length === 0 ? <div style={{ fontFamily: FONT, fontSize: 13, color: MUTED, padding: 8 }}>No requests.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontFamily: FONT }}>
                <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: MUTED }}><b style={{ color: BRAND.coralDark }}>{r.project_code}</b> · {r.project_title}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink, marginTop: 2 }}>{r.target_type === "file" ? "File" : "Update"}: {r.target_label}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{r.requested_by_name} · {fmtDate(r.requested_at)} · Reason: {r.reason}{r.decided_by_name ? ` · ${r.status} by ${r.decided_by_name}` : ""}</div>
                </div>
                {r.status === "pending" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <PrimaryButton dark onClick={() => { if (window.confirm(`Delete "${r.target_label}" permanently?`)) decide(r.id, "approve"); }}>Approve delete</PrimaryButton>
                    <GhostButton onClick={() => decide(r.id, "decline")}>Decline</GhostButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function OverdueDigestPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  async function run() {
    setRunning(true); setError(null); setResult(null);
    try { setResult(await api.runBuildOverdueCheck()); } catch (e) { setError(e.message || "Couldn't run the check."); } finally { setRunning(false); }
  }
  return (
    <Card style={{ padding: 20, maxWidth: 720 }}>
      <SectionTitle>Overdue-update digest</SectionTitle>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: MUTED, marginBottom: 12, lineHeight: 1.6 }}>
        Reminds the Product Owner and Client Partner of every project with no update in over 14 days, and sends RIV Admin one summary. Red alerts already fire on their own the first time anyone opens Build that day.
      </div>
      {result && <Notice text={`${result.overdueCount} project(s) overdue${result.codes?.length ? `: ${result.codes.join(", ")}` : "."}`} />}
      <ErrorBanner text={error} />
      <PrimaryButton dark onClick={run} disabled={running} icon={running ? Loader2 : Bell}>{running ? "Running…" : "Run overdue check now"}</PrimaryButton>
    </Card>
  );
}

function AdminConsoleView({ reload, onOpenProject }) {
  const [tab, setTab] = useState("ready");
  const [readyCount, setReadyCount] = useState(null);
  const [delCount, setDelCount] = useState(null);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    api.getBuildReady().then((d) => setReadyCount(d.items?.length || 0)).catch(() => {});
    api.listBuildDeleteRequests("pending").then((d) => setDelCount(d.requests?.length || 0)).catch(() => {});
  }, []);

  const tabs = [
    { id: "ready", label: `Ready for Build${readyCount ? ` · ${readyCount}` : ""}` },
    { id: "new", label: "New project" },
    { id: "assign", label: "People on projects" },
    { id: "logins", label: "Logins" },
    { id: "clients", label: "Build-only clients" },
    { id: "deletes", label: `Delete requests${delCount ? ` · ${delCount}` : ""}` },
    { id: "overdue", label: "Overdue digest" },
  ];
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 24px 80px" }}>
      <h1 style={{ margin: 0, fontFamily: FONT, fontWeight: 700, fontSize: 26, color: BRAND.ink }}>Build admin</h1>
      <div style={{ fontFamily: FONT, fontSize: 13.5, color: MUTED, margin: "4px 0 18px" }}>Turn selected ideas and startups into projects, and manage who works on them.</div>
      <div role="tablist" style={{ display: "flex", gap: 22, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 20, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setCreated(null); }} style={{
            fontFamily: FONT, fontSize: 14, fontWeight: tab === t.id ? 600 : 500, padding: "10px 2px", minHeight: 44, background: "none", border: "none",
            borderBottom: `3px solid ${tab === t.id ? BRAND.coral : "transparent"}`, color: tab === t.id ? BRAND.ink : MUTED, cursor: "pointer", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "ready" && <ReadyForBuildPanel onCreated={reload} onCount={setReadyCount} />}
      {tab === "new" && (created ? (
        <div>
          <Notice text={`Created ${created.code}. Everyone on it has been told.`} />
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton dark onClick={() => onOpenProject(created.id)}>Open {created.code}</PrimaryButton>
            <GhostButton onClick={() => setCreated(null)}>Create another</GhostButton>
          </div>
        </div>
      ) : <CreateProjectForm item={null} onDone={(p) => { setCreated(p); reload(); }} />)}
      {tab === "assign" && <PeopleOnProjectsPanel />}
      {tab === "logins" && <LoginsPanel />}
      {tab === "clients" && <ManageBuildClientsPanel />}
      {tab === "deletes" && <DeleteRequestsPanel onCount={setDelCount} />}
      {tab === "overdue" && <OverdueDigestPanel />}
    </div>
  );
}

/* =========================== ROOT =========================== */
export default function BuildRivApp() {
  const [view, setView] = useState(() => pathToBuildView(window.location.pathname));
  const [session, setSessionState] = useState(getStoredBuildUser());
  const [active, setActive] = useState(null); // { id, openUpdate }
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    function onPopState() { setView(pathToBuildView(window.location.pathname)); setActive(null); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function handleAuthed(token, user) {
    setBuildSession(token, user);
    setSessionState(user);
    window.history.pushState(null, "", "/build/my-work");
    setView("mywork");
  }
  function handleLogout() {
    clearBuildSession(); clearAllSessions();
    setSessionState(null);
    window.history.pushState(null, "", "/build");
    setView("mywork");
  }
  function goToView(v) {
    const path = BUILD_VIEW_TO_PATH[v];
    if (path) window.history.pushState(null, "", path);
    setView(v);
    setActive(null);
  }
  function openProject(id, opts = {}) {
    if (view !== "projects") { window.history.pushState(null, "", "/build/projects"); setView("projects"); }
    setActive({ id, openUpdate: !!opts.openUpdate });
    window.scrollTo(0, 0);
  }

  const canSeeDashboard = session && ["admin", "client", "client_poc", "riv_manager"].includes(session.role);
  const canSeeAdmin = session && session.role === "admin";
  const effectiveView = (view === "dashboard" && !canSeeDashboard) || (view === "admin" && !canSeeAdmin) ? "mywork" : view;

  if (!session) {
    return (
      <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh" }}>
        <BuildNavBar view={view} setView={() => {}} session={null} onLogout={() => {}} canSeeDashboard={false} canSeeAdmin={false} />
        <LoginView onAuthed={handleAuthed} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh" }}>
      <style>{`
        .build-spin { animation: build-spin 0.8s linear infinite; }
        @keyframes build-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .build-row:hover { background: ${BRAND.cream}; }
        @media print { .build-nav, .build-noprint { display: none !important; } body { background: #fff; } }
      `}</style>
      <BuildNavBar view={effectiveView} setView={goToView} session={session} onLogout={handleLogout} canSeeDashboard={canSeeDashboard} canSeeAdmin={canSeeAdmin} />

      {effectiveView === "mywork" && <MyWorkView session={session} onOpen={openProject} goTo={goToView} />}
      {effectiveView === "projects" && !active && (
        <ProjectListView key={listKey} session={session} onOpen={(id) => openProject(id)} onNew={() => goToView("admin")} />
      )}
      {effectiveView === "projects" && active && (
        <ProjectDetailView key={active.id} projectId={active.id} openUpdateOnLoad={active.openUpdate} session={session} onBack={() => { setActive(null); setListKey((k) => k + 1); }} />
      )}
      {effectiveView === "dashboard" && <DashboardView session={session} onOpen={openProject} />}
      {effectiveView === "admin" && <AdminConsoleView reload={() => setListKey((k) => k + 1)} onOpenProject={openProject} />}
    </div>
  );
}
