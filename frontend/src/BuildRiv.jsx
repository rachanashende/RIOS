import React, { useState, useEffect, useMemo } from "react";
import {
  Hammer, LogOut, ArrowRight, ChevronLeft, Loader2, AlertCircle, Briefcase,
  LayoutDashboard, Settings, Plus, CheckCircle2, Paperclip, Download, Upload,
  History, FileText, Users, Building2, Gauge, Search, X, KeyRound, Trash2,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  api, divertIfTemporaryPassword, getStoredBuildUser, getToken,
  setBuildSession, clearBuildSession, clearAllSessions,
} from "./api.js";
import { BRAND } from "./brand.js";

// Build.RIV's own tabs, each with a real URL -- same pattern as RiseRiv.jsx.
// BuildRivApp owns all routing beneath "/build" once mounted; the outer
// App.jsx only knows every one of these maps to its single "build-riv"
// container view (see OUTER_PATH_TO_VIEW in App.jsx).
const BUILD_PATH_TO_VIEW = { "/build": "my-work", "/build/my-work": "my-work", "/build/projects": "projects", "/build/dashboard": "dashboard", "/build/admin": "admin" };
const BUILD_VIEW_TO_PATH = { "my-work": "/build/my-work", projects: "/build/projects", dashboard: "/build/dashboard", admin: "/build/admin" };
function pathToBuildView(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/build";
  return BUILD_PATH_TO_VIEW[path] || "my-work";
}

const FONT = "'Poppins',sans-serif";

/* =========================================================================
   SMALL UI PRIMITIVES -- deliberately redefined here rather than imported
   from App.jsx/IdeasRiv.jsx/RiseRiv.jsx, so this module has zero dependency
   on the other three beyond api.js/brand.js (same isolation as those).
   ========================================================================= */
function PrimaryButton({ children, onClick, disabled, style, icon: Icon, type = "button" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13.5, background: disabled ? "#E7B4B4" : BRAND.coral,
      color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px",
      cursor: disabled ? "not-allowed" : "pointer", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}

function GhostButton({ children, onClick, disabled, style, icon: Icon }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff",
      color: disabled ? "#B7B2AE" : BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "10px 16px",
      cursor: disabled ? "not-allowed" : "pointer", ...style,
    }}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}

function Card({ children, style }) {
  return <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 14, background: "#fff", ...style }}>{children}</div>;
}

function Field({ label, children, required, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>
        {label}{required && <span style={{ color: BRAND.coral }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%", fontFamily: FONT, fontSize: 13.5, padding: "10px 12px",
  borderRadius: 9, border: `1px solid ${BRAND.line}`, background: "#fff", color: BRAND.ink,
};
const selectStyle = { ...inputStyle, cursor: "pointer" };

function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "#FBEAEA", border: "1px solid #F3C6C6", marginBottom: 16 }}>
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

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "60px 20px", fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>
      <Loader2 size={16} className="build-spin" /> {label || "Loading…"}
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", border: `1px dashed ${BRAND.line}`, borderRadius: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: BRAND.cream, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", border: `1px solid ${BRAND.line}` }}>
        <Icon size={20} color={BRAND.coral} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink }}>{title}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 6, maxWidth: 380, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

const HEALTH_COLORS = {
  on_track: { bg: "#E7F5EF", fg: "#1B7A5A", label: "On track" },
  at_risk: { bg: "#FCEEE1", fg: BRAND.coralDark, label: "At risk" },
  off_track: { bg: "#FBEAEA", fg: "#C13B3B", label: "Off track" },
  // Not a real value of build_projects.health (which defaults to on_track
  // before anyone has posted a status update) -- the project list computes
  // this client-side from hasUpdate so a never-touched project doesn't
  // misleadingly show green.
  no_update: { bg: "#EFEBE7", fg: "#9B958F", label: "No update yet" },
};
function HealthBadge({ health, size }) {
  const c = HEALTH_COLORS[health] || { bg: "#EFEBE7", fg: "#7A746F", label: health || "—" };
  return (
    <span style={{
      fontFamily: FONT, fontSize: size === "sm" ? 11 : 12, fontWeight: 700, color: c.fg, background: c.bg,
      padding: size === "sm" ? "3px 8px" : "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
    }}>{c.label}</span>
  );
}

const STATUS_COLORS = {
  active: { bg: "#E7F5EF", fg: "#1B7A5A", label: "Active" },
  on_hold: { bg: "#FCEEE1", fg: BRAND.coralDark, label: "On hold" },
  stopped: { bg: "#EFEBE7", fg: "#7A746F", label: "Stopped" },
  closed: { bg: "#E3E8F7", fg: "#2F4FA0", label: "Closed" },
};
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#EFEBE7", fg: "#7A746F", label: status || "—" };
  return (
    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
}

function fmtPct(n) { return n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"; }
function fmtUSD(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/* =========================================================================
   NAV
   ========================================================================= */
const ROLE_LABELS = {
  admin: "RIV Admin", riv_manager: "RIV Client Partner", client: "Client Leader",
  product_owner: "Product Owner", startup_poc: "Startup POC", junior_employee: "Employee",
};
function roleScopeLabel(session) {
  const role = ROLE_LABELS[session?.role] || session?.role || "";
  const scope = {
    admin: "All clients · all projects",
    riv_manager: "Your assigned clients only",
    client: session?.company || "Your company's projects",
    product_owner: "Projects you own",
    startup_poc: "Your startup's pilot only",
    junior_employee: "Projects you're on",
  }[session?.role];
  return scope ? `${role} · ${scope}` : role;
}
function BuildNavBar({ view, setView, session, onLogout, canSeeDashboard, canSeeAdmin }) {
  const items = [];
  if (session) items.push({ id: "my-work", label: "My work" });
  items.push({ id: "projects", label: "Projects" });
  if (canSeeDashboard) items.push({ id: "dashboard", label: "Dashboard" });
  if (canSeeAdmin) items.push({ id: "admin", label: "Admin" });

  return (
    <div className="build-nav" style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>
            <Hammer size={18} color={BRAND.coral} /> Build
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {/* Mockup screen 1: a plain way back to the main RIOS site --
                this module doesn't render inside the main site's own header. */}
            <a href="/" style={{
              fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
              textDecoration: "none", color: "#7A746F", display: "inline-block",
            }}>← RIOS home</a>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink,
              }}>{it.label}</button>
            ))}
          </div>
        </div>
        <div>
          {session ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Mockup: the user chip says who you are AND what you can see. */}
              <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{session.name}</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>{roleScopeLabel(session)}</div>
              </div>
              <GhostButton onClick={onLogout} icon={LogOut} style={{ padding: "8px 12px" }}>Log out</GhostButton>
            </div>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>Not logged in</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN -- for product_owner / riv_manager / startup_poc (Build.RIV's own
   login types, same top-down-issued-login convention as every other role
   in RIOS). A client leader or admin arriving here is normally already
   authenticated through the main site (App.jsx seeds Build's session on
   the way in), so this screen is mostly what those three roles see.
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
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 16, textAlign: "center" }}>
          Don't have a login yet? Ask your RIV admin to create one for you.
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   PROJECT LIST -- Screen 1 of the Oct 2026 "Proposed Screens" redesign
   (first of the five screens being rebuilt, per the user's own phasing
   choice: one screen at a time, starting here since it's smallest).
   Internal ideas / Startup pilots tabs (type='internal'/'startup', same
   two values as before -- this just gives them the names + subtitles the
   mockup uses), a Table/Board toggle, a filter bar (search, client, stage,
   Product Owner), and a row of quick-filter pills that replace the old
   plain Health/Status selects with the named buckets the mockup shows.
   ========================================================================= */
// Mirrors backend/lib/buildWorkflow.js's STAGES/STAGE_LABELS. Duplicated
// here rather than imported -- frontend and backend are separate bundles --
// so keep these two in sync by hand if the stage model changes again.
const BUILD_STAGES = {
  internal: ["requirements", "design", "build", "test", "pilot", "production", "closed"],
  startup: ["requirements", "nda", "proposal", "purchase_order", "agreement", "design", "build", "test", "pilot", "production", "closed"],
};
const BUILD_STAGE_LABELS = {
  requirements: "Requirements", nda: "NDA", proposal: "Proposal", purchase_order: "Purchase Order",
  agreement: "Agreement", design: "Design", build: "Build", test: "Test", pilot: "Pilot",
  production: "Production", closed: "Closed",
};

const INNOV_TABS = [
  { id: "enterprise", label: "Internal ideas", subtitle: "Enterprise Innovation Management", type: "internal" },
  { id: "open", label: "Startup pilots", subtitle: "Open Innovation Management", type: "startup" },
];

// "Waiting on me" quick filter: a project assigned to the viewer (whichever
// relationship their role carries) that isn't quietly on-track. Admin has
// no personal assignment to check, so for admin this is just "anything
// that needs a look" -- same red/amber/overdue test, without the
// assigned-to-me narrowing the other roles get.
function isWaitingOnMe(p, session) {
  const h = p.effectiveHealth || p.health;
  const needsAttention = !p.hasUpdate || h !== "on_track" || p.updateOverdue;
  if (!needsAttention) return false;
  if (session.role === "admin") return true;
  if (session.role === "riv_manager") return Number(p.riv_manager_id) === Number(session.id);
  if (session.role === "product_owner") return Number(p.product_owner_user_id) === Number(session.id);
  if (session.role === "startup_poc") return Number(p.startup_poc_user_id) === Number(session.id);
  return false;
}

function kpiCell(p) {
  if (!p.kpi_name) return "Not set yet";
  const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString());
  return `${p.kpi_name}: ${fmt(p.baseline)} → ${fmt(p.kpi_now)} → ${fmt(p.target)}`;
}

// The health badge shown is "No update yet" (not whatever build_projects.
// health defaults to) until the project's first status update -- a brand
// new project otherwise shows a misleadingly green "On track".
function displayHealth(p) { return p.hasUpdate ? (p.effectiveHealth || p.health) : "no_update"; }

function healthSubtext(p) {
  if (!p.hasUpdate) return p.created_at ? `Created ${Math.max(0, Math.round((Date.now() - new Date(p.created_at)) / 86400000))} days ago` : null;
  // An auto health rule (page 7's "when a project turns amber or red") can
  // override the posted health -- when it did, its reason is the most
  // useful subtext to show, ahead of the generic overdue/KPI hints below.
  if (p.healthReason) return p.healthReason;
  if (p.updateOverdue) return `Update ${p.days_since_update} days overdue`;
  if (p.baseline != null && p.target != null && p.kpi_now != null && p.target !== p.baseline) {
    const pct = Math.max(0, Math.min(100, Math.round(((p.kpi_now - p.baseline) / (p.target - p.baseline)) * 100)));
    return `KPI ${pct}% of the way`;
  }
  return null;
}

// Red/amber is judged on the *effective* health (posted health raised by
// the automatic rules: no update in 21 days, 14 days late, 20% over budget)
// -- the same value the Health column shows.
function isRedOrAmber(p) {
  const h = p.effectiveHealth || p.health;
  return p.hasUpdate !== false && (h === "off_track" || h === "at_risk");
}

// Mockup screen 1: an empty list says *why* it's empty for this role.
function emptyListText(session, hasFilters) {
  if (hasFilters) return { title: "No projects match", text: "Try All in quick filters, or clear the search / stage / Product Owner filters above." };
  return ({
    admin: { title: "No projects yet", text: "Create one from Admin → Ready for Build, or start one by hand with New project." },
    riv_manager: { title: "No projects for your clients yet", text: "You only see projects for the clients assigned to you. Ask the RIV Admin if a client is missing." },
    client: { title: "No projects yet", text: "Your RIV team will set up a project here once an idea or startup is selected for Build." },
    product_owner: { title: "No projects assigned to you", text: "When the RIV Admin makes you Product Owner of a project, it shows up here." },
    startup_poc: { title: "Your pilot isn't set up yet", text: "The RIV Admin will link you to your startup's project. You'll get an email when it's ready." },
    junior_employee: { title: "You're not on a project yet", text: "When you're added to a Build project as the Employee, it shows up here." },
  }[session.role]) || { title: "No projects", text: "Nothing to show yet." };
}

const QUICK_FILTERS = [
  ["all", "All"], ["waiting", "Waiting on me"], ["red_amber", "Red or amber"],
  ["overdue", "Update overdue"], ["on_hold", "On hold"], ["closed", "Closed"],
];

function ProjectListView({ session, onOpen, onNewProject }) {
  const [innovTab, setInnovTab] = useState("enterprise");
  const [mode, setMode] = useState("table"); // 'table' | 'board'
  const [projects, setProjects] = useState([]);
  const [tabCounts, setTabCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ stage: "", q: "", clientId: "", productOwnerId: "" });
  const [quickFilter, setQuickFilter] = useState("all");
  // Backend only honours ?clientId= for admin and riv_manager (everyone else
  // is already scoped to one client, so a filter would be a no-op) -- only
  // show the picker where it actually does something.
  const showClientFilter = session.role === "admin" || session.role === "riv_manager";
  const clients = useClientOptions();
  const activeType = INNOV_TABS.find((t) => t.id === innovTab).type;
  const stageOptions = BUILD_STAGES[activeType];

  useEffect(() => {
    setLoading(true);
    api.listBuildProjects({ q: filters.q, clientId: filters.clientId, stage: filters.stage, type: activeType })
      .then((d) => setProjects(d.projects || []))
      .catch((e) => setError(e.message || "Couldn't load projects."))
      .finally(() => setLoading(false));
  }, [activeType, filters.stage, filters.q, filters.clientId]);

  // Tab badge counts (the mockup's "Internal ideas · 4" / "Startup pilots ·
  // 2") -- independent of the Stage/Product-Owner filters and quick-filter
  // pills, but scoped by whatever client filter and search are active so
  // the count a tab shows matches what's there once it's opened.
  useEffect(() => {
    Promise.all(
      INNOV_TABS.map((t) => api.listBuildProjects({ q: filters.q, clientId: filters.clientId, type: t.type }).then((d) => [t.id, (d.projects || []).length]))
    ).then((pairs) => setTabCounts(Object.fromEntries(pairs))).catch(() => {});
  }, [filters.q, filters.clientId]);

  // Stage and Product Owner are per-tab (the Stage filter only offers the
  // stages of the open tab, per the mockup's footnote) -- reset both, and
  // the quick filter, on tab switch so they don't silently carry over.
  useEffect(() => { setFilters((f) => ({ ...f, stage: "", productOwnerId: "" })); setQuickFilter("all"); }, [innovTab]);

  const productOwners = useMemo(() => {
    const seen = new Map();
    for (const p of projects) if (p.product_owner_user_id && !seen.has(p.product_owner_user_id)) seen.set(p.product_owner_user_id, p.product_owner_name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [projects]);

  // Product Owner and the quick-filter pills are computed client-side over
  // the already-fetched (type/stage/client/search-filtered) project list,
  // rather than new backend query params -- there's no large-N concern here
  // (a client's Build portfolio is small), and it keeps the pill counts and
  // the visible rows trivially in sync with each other.
  const withProductOwner = filters.productOwnerId
    ? projects.filter((p) => String(p.product_owner_user_id) === String(filters.productOwnerId))
    : projects;
  const quickCounts = {
    all: withProductOwner.length,
    waiting: withProductOwner.filter((p) => isWaitingOnMe(p, session)).length,
    red_amber: withProductOwner.filter(isRedOrAmber).length,
    overdue: withProductOwner.filter((p) => p.updateOverdue).length,
    on_hold: withProductOwner.filter((p) => p.status === "on_hold").length,
    closed: withProductOwner.filter((p) => p.status === "closed").length,
  };
  const visible = withProductOwner.filter((p) => {
    if (quickFilter === "waiting") return isWaitingOnMe(p, session);
    if (quickFilter === "red_amber") return isRedOrAmber(p);
    if (quickFilter === "overdue") return p.updateOverdue;
    if (quickFilter === "on_hold") return p.status === "on_hold";
    if (quickFilter === "closed") return p.status === "closed";
    return true;
  });

  const byStage = useMemo(() => {
    const map = Object.fromEntries(stageOptions.map((s) => [s, []]));
    for (const p of visible) if (map[p.stage]) map[p.stage].push(p);
    return map;
  }, [visible, stageOptions]);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>Build projects</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 4 }}>Every selected idea and startup, tracked from Requirements to Closed.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${BRAND.ink}` }}>
            {["table", "board"].map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                fontFamily: FONT, fontSize: 12.5, fontWeight: 700, padding: "8px 16px", border: "none", cursor: "pointer",
                background: mode === m ? BRAND.ink : "#fff", color: mode === m ? "#fff" : BRAND.ink,
              }}>{m === "table" ? "Table" : "Board"}</button>
            ))}
          </div>
          {onNewProject && <PrimaryButton icon={Plus} onClick={onNewProject}>New project</PrimaryButton>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 28, marginBottom: 16, borderBottom: `1px solid ${BRAND.line}` }}>
        {INNOV_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setInnovTab(t.id)}
            style={{ fontFamily: FONT, padding: "8px 2px 10px", background: "none", border: "none", textAlign: "left", borderBottom: innovTab === t.id ? `2px solid ${BRAND.coral}` : "2px solid transparent", cursor: "pointer" }}
          >
            <div style={{ fontWeight: 700, fontSize: 14.5, color: innovTab === t.id ? BRAND.ink : "#9B958F" }}>
              {t.label} <span style={{ color: "#9B958F" }}>{tabCounts[t.id] ?? ""}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>{t.subtitle}</div>
          </button>
        ))}
      </div>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: showClientFilter ? "2fr 1fr 1fr 1fr" : "2fr 1fr 1fr", gap: 10 }}>
          <Field label="Search">
            <div style={{ position: "relative" }}>
              <Search size={14} color="#9B958F" style={{ position: "absolute", left: 11, top: 11 }} />
              <input
                placeholder="Code, project or owner" value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
          </Field>
          {showClientFilter && (
            <Field label="Client (RIV only)">
              <select style={selectStyle} value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}>
                <option value="">All clients</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Stage">
            <select style={selectStyle} value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}>
              <option value="">{`All ${activeType} stages`}</option>
              {stageOptions.map((s) => <option key={s} value={s}>{BUILD_STAGE_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Product Owner">
            <select style={selectStyle} value={filters.productOwnerId} onChange={(e) => setFilters((f) => ({ ...f, productOwnerId: e.target.value }))}>
              <option value="">Anyone</option>
              {productOwners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginRight: 2 }}>Quick filters</span>
          {QUICK_FILTERS.map(([id, label]) => (
            <button key={id} onClick={() => setQuickFilter(id)} style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999,
              border: `1px solid ${BRAND.line}`, cursor: "pointer",
              background: quickFilter === id ? BRAND.ink : "#fff", color: quickFilter === id ? "#fff" : BRAND.ink,
            }}>{label} · {quickCounts[id] ?? 0}</button>
          ))}
        </div>
      </Card>

      {session.role === "riv_manager" && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", background: BRAND.cream, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
          You're seeing projects for <b>your assigned clients only</b>. To delete a project or change who's on it, ask the RIV Admin.
        </div>
      )}
      <ErrorBanner text={error} />
      {loading ? <Spinner label="Loading projects…" /> : visible.length === 0 ? (
        <EmptyState icon={Briefcase} {...emptyListText(session, quickFilter !== "all" || !!filters.q || !!filters.stage || !!filters.productOwnerId || !!filters.clientId)} />
      ) : mode === "table" ? (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ textAlign: "left", background: BRAND.cream }}>
                  {["Code", "Project", "Stage", "Next step", "Health", "KPI (base → now → target)", "Product Owner", "Last update"].map((h) => (
                    <th key={h} style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7A746F", textTransform: "uppercase", letterSpacing: "0.03em", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer" }} className="build-row">
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coralDark, borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap" }}>{p.code}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, borderBottom: `1px solid ${BRAND.line}`, maxWidth: 220 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>{p.client_company || p.client_name || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, borderBottom: `1px solid ${BRAND.line}`, minWidth: 130 }}>
                      <div style={{ fontSize: 12.5, color: BRAND.ink, fontWeight: 600 }}>{(p.stageLabel || p.stage)}{p.stagePosition ? ` · ${p.stagePosition} of ${p.stageCount}` : ""}</div>
                      {p.stagePosition && p.stageCount && (
                        <div style={{ height: 4, borderRadius: 2, background: BRAND.line, marginTop: 5, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(p.stagePosition / p.stageCount) * 100}%`, background: (p.effectiveHealth || p.health) === "off_track" ? "#C13B3B" : BRAND.coral }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, maxWidth: 220 }}>{p.nextStep || "—"}</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${BRAND.line}` }}>
                      <HealthBadge health={displayHealth(p)} size="sm" />
                      {healthSubtext(p) && <div style={{ fontSize: 11, color: "#9B958F", marginTop: 4 }}>{healthSubtext(p)}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, maxWidth: 200 }}>{kpiCell(p)}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.product_owner_name || "—"}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}`, color: p.updateOverdue ? "#C13B3B" : "#7A746F", fontWeight: p.updateOverdue ? 700 : 400, whiteSpace: "nowrap" }}>
                      {p.updateOverdue ? "Overdue" : fmtDate(p.last_update_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {stageOptions.map((s) => (
            <div key={s} style={{ flex: "0 0 220px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: BRAND.ink, padding: "0 4px 8px" }}>
                <span>{BUILD_STAGE_LABELS[s]}</span><span style={{ color: "#9B958F" }}>{byStage[s].length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                {byStage[s].map((p) => (
                  <div key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer" }}>
                    <Card style={{ padding: 12 }}>
                      <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: BRAND.coralDark }}>{p.code}</div>
                      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, marginTop: 2 }}>{p.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_COLORS[displayHealth(p)]?.fg || "#9B958F", flexShrink: 0 }} />
                        <span style={{ fontFamily: FONT, fontSize: 11.5, color: "#7A746F" }}>{p.product_owner_name || "Unassigned"} · {p.days_in_stage != null ? `${p.days_in_stage}d` : "new"}</span>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   PROJECT DETAIL -- header + tabs (Overview, Status updates, ROI, Lessons
   learned, Files, History) and the stage-action buttons (PRD 8, 6, 7).
   ========================================================================= */
// Mockup screen 3: "Current stage" card -- what this stage needs (a
// checklist, ticked as the fields get filled in), who approves it, and the
// approve / send back (or, at Pilot, the pilot decision) buttons, shown only
// to people the backend says may approve (permissions.approveStage).
// Hold / stop / close / delete live in the header's "More" menu instead.
function CurrentStagePanel({ project, checklist, gateApprovers, permissions, onAction, busy, onEditDetails }) {
  const [reasonKind, setReasonKind] = useState(null); // 'send-back' | 'pilot-iterate' | 'pilot-stop'
  const [reason, setReason] = useState("");
  if (!project || project.stage === "closed") return null;
  const items = checklist || [];
  const doneCount = items.filter((i) => i.done).length;
  const ready = items.every((i) => i.done);
  const canApprove = !!permissions?.approveStage && project.status === "active";
  const approverText = (gateApprovers || []).map((t) => ({ product_owner: "Product Owner", riv_manager: "RIV Client Partner", admin: "RIV Admin" }[t] || t)).join(" or ") || "Product Owner";
  const next = (BUILD_STAGES[project.type] || [])[(BUILD_STAGES[project.type] || []).indexOf(project.stage) + 1];

  function confirm() {
    if (reasonKind === "send-back") onAction("sendBack", { reason });
    else if (reasonKind === "pilot-iterate") onAction("pilotDecision", { decision: "iterate", reason });
    else if (reasonKind === "pilot-stop") onAction("pilotDecision", { decision: "stop", reason });
    setReasonKind(null); setReason("");
  }

  return (
    <Card style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>
          Current stage: {BUILD_STAGE_LABELS[project.stage] || project.stage}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>
          {items.length ? `${doneCount} of ${items.length} done` : "Nothing to fill in"} · Approved by {approverText} · Client Leader reviews
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {items.map((i) => (
            <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: i.done ? "#7A746F" : BRAND.ink }}>
              <span style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: i.done ? "#1B7A5A" : "#fff", border: `1.5px solid ${i.done ? "#1B7A5A" : BRAND.line}`, color: "#fff", fontSize: 12, fontWeight: 700,
              }}>{i.done ? "✓" : ""}</span>
              <span style={{ textDecoration: i.done ? "line-through" : "none" }}>{i.label}</span>
            </div>
          ))}
          {!ready && permissions?.editDetails && onEditDetails && (
            <button onClick={onEditDetails} style={{ alignSelf: "flex-start", marginTop: 4, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.coral, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              Fill these in →
            </button>
          )}
        </div>
      )}

      {project.status !== "active" && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginBottom: 6 }}>
          {project.status === "on_hold" ? `On hold${project.hold_reason ? `: ${project.hold_reason}` : ""}. Resume it from More to continue.` : "This project is stopped."}
        </div>
      )}

      {canApprove && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {project.stage === "pilot" ? (
            <>
              <PrimaryButton disabled={busy || !ready} onClick={() => onAction("pilotDecision", { decision: "scale" })}>Pilot decision: Scale → Production</PrimaryButton>
              <GhostButton disabled={busy} onClick={() => setReasonKind("pilot-iterate")}>Iterate → back to Build</GhostButton>
              <GhostButton disabled={busy} onClick={() => setReasonKind("pilot-stop")}>Stop after pilot</GhostButton>
            </>
          ) : (
            <>
              <PrimaryButton disabled={busy || !ready} onClick={() => onAction("advance", {})}>
                Approve & move to {BUILD_STAGE_LABELS[next] || "next stage"}
              </PrimaryButton>
              {project.stage !== "requirements" && <GhostButton disabled={busy} onClick={() => setReasonKind("send-back")}>Send back</GhostButton>}
            </>
          )}
        </div>
      )}
      {!canApprove && project.status === "active" && (
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>
          {ready ? `Ready for the ${approverText} to approve.` : `The ${approverText} approves this stage once the checklist is complete.`}
        </div>
      )}

      {reasonKind && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${BRAND.line}`, paddingTop: 16 }}>
          <Field label="Reason" required>
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton disabled={busy || !reason.trim()} onClick={confirm}>Confirm</PrimaryButton>
            <GhostButton onClick={() => { setReasonKind(null); setReason(""); }}>Cancel</GhostButton>
          </div>
        </div>
      )}
    </Card>
  );
}

// Header "More ▾" menu (mockup screen 3) -- only the actions this viewer's
// permissions allow: hold / resume / stop (RIV Admin, Product Owner), close
// (RIV Admin), request deletion (RIV Client Partner), delete (RIV Admin).
function MoreMenu({ project, permissions, onPick }) {
  const [open, setOpen] = useState(false);
  const items = [];
  if (permissions?.holdOrStop && project.status === "active") items.push(["hold", "Put on hold"]);
  if (permissions?.holdOrStop && project.status === "on_hold") items.push(["resume", "Resume"]);
  if (permissions?.holdOrStop && ["active", "on_hold"].includes(project.status)) items.push(["stop", "Stop project"]);
  if (permissions?.close && ["active", "stopped"].includes(project.status)) items.push(["close", "Close project"]);
  if (permissions?.requestDelete) items.push(["request-delete", "Ask RIV Admin to delete"]);
  if (permissions?.deleteProject) items.push(["delete", "Delete project"]);
  if (!items.length) return null;
  return (
    <div style={{ position: "relative" }}>
      <GhostButton onClick={() => setOpen((o) => !o)} style={{ padding: "9px 14px" }}>More ▾</GhostButton>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, background: "#fff", border: `1px solid ${BRAND.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 210, padding: 6 }}>
          {items.map(([id, label]) => (
            <button key={id} onClick={() => { setOpen(false); onPick(id); }} style={{
              display: "block", width: "100%", textAlign: "left", fontFamily: FONT, fontSize: 13, padding: "9px 12px", borderRadius: 7,
              border: "none", background: "none", cursor: "pointer", color: id === "delete" || id === "stop" ? "#C13B3B" : BRAND.ink,
            }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// The reason / outcome form a "More" pick opens (hold, stop, close, delete
// request, delete). Resume needs no form and runs straight away.
function MoreActionForm({ kind, project, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState(project.stage === "closed" ? "scaled" : "stopped");
  const titles = {
    hold: "Put this project on hold", stop: "Stop this project", close: "Close this project",
    "request-delete": "Ask the RIV Admin to delete this project", delete: `Delete ${project.code} permanently`,
  };
  const needsReason = kind !== "close" && kind !== "delete";
  return (
    <Card style={{ padding: 18, marginBottom: 20, borderColor: kind === "delete" || kind === "stop" ? "#F3C6C6" : BRAND.line }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>{titles[kind]}</div>
      {kind === "close" && (
        <Field label="Outcome" required hint={project.stage !== "closed" ? "\"Scaled\" needs the project to reach the Closed stage (after Production). Choose \"Stopped\" to close it now." : undefined}>
          <select style={selectStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="scaled" disabled={project.stage !== "closed"}>Scaled{project.stage !== "closed" ? " (reach Closed stage first)" : ""}</option>
            <option value="stopped">Stopped</option>
          </select>
        </Field>
      )}
      {kind === "delete" && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#C13B3B", marginBottom: 12 }}>
          This removes the project with all its updates, files and history. It can't be undone.
        </div>
      )}
      {needsReason && (
        <Field label="Reason" required hint={kind === "request-delete" ? "The RIV Admin approves or rejects this. Nothing is deleted until they do." : undefined}>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <PrimaryButton disabled={busy || (needsReason && !reason.trim())} onClick={() => onConfirm({ reason, outcome })}>
          {kind === "delete" ? "Delete permanently" : kind === "request-delete" ? "Send request" : "Confirm"}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </Card>
  );
}

// Audit <-> Build reassess link (PRD "Audit/Scorecard: Preserve the link
// between the original audit opportunity and the Build project, then show
// when that opportunity has been addressed"). The backend (reassess-link /
// reassess/:clientId) already existed; this is the UI that was missing --
// without it an admin had no way to ever create the link. Admin-only, and
// only once the project is Closed + Scaled (the backend enforces the same
// rule, this just keeps the form from appearing before it would work).
function ReassessLinkPanel({ project, session }) {
  const [questions, setQuestions] = useState(null);
  const [links, setLinks] = useState(null);
  const [query, setQuery] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getQuestions().then((d) => setQuestions(d.questions || [])).catch(() => setQuestions([]));
    api.getBuildReassessLinks(project.client_id).then((d) => setLinks(d.links || [])).catch(() => setLinks([]));
  }, [project.client_id]);

  if (session.role !== "admin" || project.status !== "closed" || project.outcome !== "scaled") return null;

  const matches = !query.trim() ? [] : (questions || [])
    .filter((q) => `${q.module} ${q.submodule} ${q.q}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 12);
  const alreadyLinkedHere = (links || []).filter((l) => l.code === project.code);

  async function link() {
    if (!questionId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api.linkBuildReassess(project.id, Number(questionId));
      const d = await api.getBuildReassessLinks(project.client_id);
      setLinks(d.links || []);
      setNotice("Linked. The audit's next scorecard view will show this project as the fix.");
      setQuestionId(""); setQuery("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Card style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 6 }}>Link to audit question</div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 12 }}>
        Tie this Scaled project back to the audit question it addresses. The client's next scorecard shows "Addressed by {project.code}" on that question.
      </div>

      {alreadyLinkedHere.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {alreadyLinkedHere.map((l) => (
            <div key={l.questionId} style={{ fontFamily: FONT, fontSize: 12.5, color: "#1B7A5A", background: "#E7F5EF", borderRadius: 8, padding: "6px 10px" }}>
              Already linked to question #{l.questionId} — {l.note}
            </div>
          ))}
        </div>
      )}

      <input
        placeholder="Search audit questions by module or text…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setQuestionId(""); }}
        style={{ ...inputStyle, marginTop: 0 }}
      />
      {matches.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: `1px solid ${BRAND.line}`, borderRadius: 9 }}>
          {matches.map((q) => (
            <div
              key={q.id}
              onClick={() => { setQuestionId(String(q.id)); setQuery(`${q.module} · ${q.submodule}`); }}
              style={{
                padding: "9px 12px", fontFamily: FONT, fontSize: 12.5, cursor: "pointer",
                background: String(q.id) === questionId ? BRAND.cream : "#fff",
                borderBottom: `1px solid ${BRAND.line}`,
              }}
            >
              <div style={{ color: "#9B958F", fontSize: 11 }}>{q.module} · {q.submodule}</div>
              <div style={{ color: BRAND.ink }}>{q.q}</div>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontFamily: FONT, fontSize: 12, color: BRAND.coralDark, marginTop: 8 }}>{error}</div>}
      <Notice text={notice} />
      <PrimaryButton style={{ marginTop: 12 }} disabled={!questionId || busy} onClick={link}>
        {busy ? "Linking…" : "Link this question"}
      </PrimaryButton>
    </Card>
  );
}

function OverviewTab({ project, sources, canEdit, onSaved, session }) {
  const rows = [
    ["Client", project.client_company || project.client_name],
    ["Product Owner", project.product_owner_name], ["Startup POC", project.startup_poc_name], ["RIV Client Partner", project.riv_manager_name],
    ["Started", fmtDate(project.started_at)], ["Target end", fmtDate(project.target_end)],
    ["Source", sources?.[0] ? sources[0].source_type.replace("_", " ") : "manual"],
  ].filter(([, v]) => v);
  return (
    <div>
      <Card style={{ padding: 22, marginBottom: 20 }}>
        {project.description && <div style={{ fontFamily: FONT, fontSize: 13.5, color: "#4A4642", lineHeight: 1.6, marginBottom: 18, whiteSpace: "pre-wrap" }}>{project.description}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{k}</div>
              <div style={{ fontFamily: FONT, fontSize: 13.5, color: BRAND.ink, marginTop: 3, textTransform: k === "Source" ? "capitalize" : "none" }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>
      {canEdit && <StageDetailsForm project={project} onSaved={onSaved} />}
      <ReassessLinkPanel project={project} session={session} />
    </div>
  );
}

// StageDetailsForm -- fills in the per-stage fields that
// missingFieldsForStage() (backend/lib/buildWorkflow.js) checks before
// letting a project advance a gate. Previously these fields had validation
// logic but no way to ever be set from the UI, so "Advance stage" could get
// permanently stuck (e.g. on "Target end date") with no way out. Grouped by
// the stage each field gates, so people can see at a glance what the next
// gate(s) need, regardless of which stage the project is currently on --
// gates are usually filled in ahead of time, not exactly when blocked.
function StageDetailsForm({ project, onSaved }) {
  const [form, setForm] = useState({
    targetEnd: project.target_end ? project.target_end.slice(0, 10) : "",
    ndaSignedAt: project.nda_signed_at ? project.nda_signed_at.slice(0, 10) : "",
    proposalAmount: project.proposal_amount ?? "",
    proposalAcceptedAt: project.proposal_accepted_at ? project.proposal_accepted_at.slice(0, 10) : "",
    poNumber: project.po_number || "",
    poRaisedAt: project.po_raised_at ? project.po_raised_at.slice(0, 10) : "",
    agreementType: project.agreement_type || "",
    agreementSignedAt: project.agreement_signed_at ? project.agreement_signed_at.slice(0, 10) : "",
    pilotFee: project.pilot_fee ?? "",
    systemsTouched: project.systems_touched || "",
    dataShared: project.data_shared || "",
    risks: project.risks || "",
    securityCheckDone: project.security_check_done == null ? "" : (project.security_check_done ? "yes" : "no"),
    demoLink: project.demo_link || "",
    testResult: project.test_result || "",
    pilotScope: project.pilot_scope || "",
    pilotStart: project.pilot_start ? project.pilot_start.slice(0, 10) : "",
    pilotEnd: project.pilot_end ? project.pilot_end.slice(0, 10) : "",
    rolloutScope: project.rollout_scope || "",
    contractValue: project.contract_value ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const isStartup = project.type === "startup";

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const payload = {
        targetEnd: form.targetEnd || null,
        ndaSignedAt: form.ndaSignedAt || null,
        proposalAmount: form.proposalAmount === "" ? null : Number(form.proposalAmount),
        proposalAcceptedAt: form.proposalAcceptedAt || null,
        poNumber: form.poNumber || null,
        poRaisedAt: form.poRaisedAt || null,
        agreementType: form.agreementType || null,
        agreementSignedAt: form.agreementSignedAt || null,
        pilotFee: form.pilotFee === "" ? null : Number(form.pilotFee),
        systemsTouched: form.systemsTouched || null,
        dataShared: form.dataShared || null,
        risks: form.risks || null,
        securityCheckDone: form.securityCheckDone === "" ? null : form.securityCheckDone === "yes",
        demoLink: form.demoLink || null,
        testResult: form.testResult || null,
        pilotScope: form.pilotScope || null,
        pilotStart: form.pilotStart || null,
        pilotEnd: form.pilotEnd || null,
        rolloutScope: form.rolloutScope || null,
        contractValue: form.contractValue === "" ? null : Number(form.contractValue),
      };
      await api.updateBuildDetails(project.id, payload);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save project details.");
    } finally { setSaving(false); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 4 }}>Project details</div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 16 }}>
        These fields gate "Advance stage" at each step -- fill them in any time, not only when blocked.
      </div>
      <form onSubmit={submit}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Requirements</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Target end date"><input type="date" style={inputStyle} value={form.targetEnd} onChange={set("targetEnd")} /></Field>
        </div>

        {isStartup && (
          <>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>NDA</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
              <Field label="NDA signed date"><input type="date" style={inputStyle} value={form.ndaSignedAt} onChange={set("ndaSignedAt")} /></Field>
            </div>

            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Proposal</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
              <Field label="Proposal amount (USD)"><input type="number" style={inputStyle} value={form.proposalAmount} onChange={set("proposalAmount")} /></Field>
              <Field label="Proposal accepted date"><input type="date" style={inputStyle} value={form.proposalAcceptedAt} onChange={set("proposalAcceptedAt")} /></Field>
            </div>

            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Purchase Order</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
              <Field label="PO number"><input style={inputStyle} value={form.poNumber} onChange={set("poNumber")} /></Field>
              <Field label="PO raised date"><input type="date" style={inputStyle} value={form.poRaisedAt} onChange={set("poRaisedAt")} /></Field>
            </div>
          </>
        )}

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Agreement</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Agreement type"><input style={inputStyle} placeholder="e.g. MSA, Pilot agreement" value={form.agreementType} onChange={set("agreementType")} /></Field>
          <Field label="Signed date"><input type="date" style={inputStyle} value={form.agreementSignedAt} onChange={set("agreementSignedAt")} /></Field>
          <Field label="Pilot fee (USD)"><input type="number" style={inputStyle} value={form.pilotFee} onChange={set("pilotFee")} /></Field>
        </div>

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Design</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Systems touched"><input style={inputStyle} value={form.systemsTouched} onChange={set("systemsTouched")} /></Field>
          <Field label="Data shared"><input style={inputStyle} value={form.dataShared} onChange={set("dataShared")} /></Field>
          <Field label="Risks"><input style={inputStyle} value={form.risks} onChange={set("risks")} /></Field>
          {isStartup && (
            <Field label="Security check done">
              <select style={selectStyle} value={form.securityCheckDone} onChange={set("securityCheckDone")}>
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          )}
        </div>

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Build</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Demo link or evidence"><input style={inputStyle} value={form.demoLink} onChange={set("demoLink")} /></Field>
        </div>

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Test</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Test result">
            <select style={selectStyle} value={form.testResult} onChange={set("testResult")}>
              <option value="">—</option>
              <option value="pass">Pass</option>
              <option value="pass_with_issues">Pass with issues</option>
            </select>
          </Field>
        </div>

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Pilot</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Pilot scope"><input style={inputStyle} value={form.pilotScope} onChange={set("pilotScope")} /></Field>
          <Field label="Pilot start date"><input type="date" style={inputStyle} value={form.pilotStart} onChange={set("pilotStart")} /></Field>
          <Field label="Pilot end date"><input type="date" style={inputStyle} value={form.pilotEnd} onChange={set("pilotEnd")} /></Field>
        </div>

        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.03em", margin: "4px 0 10px" }}>Production</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 20px" }}>
          <Field label="Rollout scope"><input style={inputStyle} value={form.rolloutScope} onChange={set("rolloutScope")} /></Field>
          {isStartup && (
            <Field label="Contract value (USD)"><input type="number" style={inputStyle} value={form.contractValue} onChange={set("contractValue")} /></Field>
          )}
        </div>

        {saved && <Notice text="Saved." />}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save project details"}</PrimaryButton>
      </form>
    </Card>
  );
}

// "Agreed with" picker (page 4 of the mockup) -- the backend already
// accepts agreedWithUserId, but nothing in the UI ever offered a person to
// pick; this builds the options from the people already on the project
// (no new lookup needed).
function agreedWithOptions(project) {
  const opts = [];
  if (project.product_owner_user_id) opts.push({ id: project.product_owner_user_id, label: `${project.product_owner_name || "Product Owner"} (Product Owner)` });
  if (project.riv_manager_id) opts.push({ id: project.riv_manager_id, label: `${project.riv_manager_name || "RIV Client Partner"} (RIV Client Partner)` });
  if (project.startup_poc_user_id) opts.push({ id: project.startup_poc_user_id, label: `${project.startup_poc_name || "Startup POC"} (Startup POC)` });
  if (project.client_id) opts.push({ id: project.client_id, label: `${project.client_name || "Client Leader"} (Client Leader)` });
  return opts;
}

const HEALTH_OPTIONS = [
  ["on_track", "On track", "#1B7A5A"], ["at_risk", "At risk", BRAND.coralDark], ["off_track", "Off track", "#C13B3B"],
];

// Mockup screen 4: "Add status update" opens as a pop-up from the project
// header (or the Updates tab). Startup POC never sees the cost field
// (permissions.seeMoney). A file can be attached with the update; it's
// filed against the project's current stage.
function StatusUpdateModal({ project, permissions, onClose, onSaved }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(30,24,20,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640 }}>
        <StatusUpdateForm project={project} permissions={permissions} onCancel={onClose} onSaved={() => { onSaved(); onClose(); }} />
      </div>
    </div>
  );
}

function StatusUpdateForm({ project, permissions, onCancel, onSaved }) {
  const seeMoney = permissions?.seeMoney !== false;
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    health: "on_track", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "",
    kpiActual: "", actualCost: "", agreedWithUserId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.progress.trim() || !form.nextSteps.trim()) { setError("What moved and next steps are required."); return; }
    setSubmitting(true); setError(null);
    try {
      await api.addBuildUpdate(project.id, {
        health: form.health, progress: form.progress, nextSteps: form.nextSteps, blockers: form.blockers,
        needsHelp: form.needsHelp, pctComplete: form.pctComplete === "" ? null : Number(form.pctComplete),
        kpiActual: form.kpiActual === "" ? null : Number(form.kpiActual),
        actualCost: !seeMoney || form.actualCost === "" ? null : Number(form.actualCost),
        agreedWithUserId: form.agreedWithUserId || null,
      });
      if (file) {
        try { await api.uploadBuildFile(project.id, file, project.stage); }
        catch (fe) {
          setForm({ health: "on_track", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "", kpiActual: "", actualCost: "", agreedWithUserId: "" });
          setFile(null);
          setError(`Your update was posted, but the file didn't upload (${fe.message || "unknown error"}). Close this and attach it from the Files tab.`);
          return;
        }
      }
      setForm({ health: "on_track", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "", kpiActual: "", actualCost: "", agreedWithUserId: "" });
      setFile(null);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save update.");
    } finally { setSubmitting(false); }
  }

  const m = project.metrics || {};
  const agreedOptions = agreedWithOptions(project);

  return (
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>Add status update</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>{project.code} · {BUILD_STAGE_LABELS[project.stage] || project.stage}</div>
            </div>
            {onCancel && <button type="button" onClick={onCancel} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#9B958F" }}><X size={18} /></button>}
          </div>
          <form onSubmit={submit}>
            <Field label="Health" required>
              <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                {HEALTH_OPTIONS.map(([val, label, color]) => (
                  <button key={val} type="button" onClick={() => setForm((f) => ({ ...f, health: val }))} style={{
                    flex: 1, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, padding: "9px 10px", borderRadius: 9, cursor: "pointer",
                    border: `1.5px solid ${form.health === val ? color : BRAND.line}`,
                    background: form.health === val ? color : "#fff", color: form.health === val ? "#fff" : color,
                  }}>{label}</button>
                ))}
              </div>
            </Field>
            <Field label="What moved since the last update" required>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
            </Field>
            <Field label="Next steps" required>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.nextSteps} onChange={(e) => setForm((f) => ({ ...f, nextSteps: e.target.value }))} />
            </Field>
            <Field label="Blockers (optional)">
              <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: BRAND.ink, marginBottom: 16 }}>
              <input type="checkbox" checked={form.needsHelp} onChange={(e) => setForm((f) => ({ ...f, needsHelp: e.target.checked }))} />
              Needs leadership help
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0 20px" }}>
              <Field label="KPI now" hint={m.kpi_name ? `Baseline ${m.baseline ?? "—"} · target ${m.target ?? "—"}` : "No KPI set yet -- see Overview."}>
                <input type="number" style={inputStyle} value={form.kpiActual} onChange={(e) => setForm((f) => ({ ...f, kpiActual: e.target.value }))} />
              </Field>
              {seeMoney && (
                <Field label="Cost to date (USD)" hint={m.est_cost != null ? `Budget ${fmtUSD(m.est_cost)}` : "No budget estimate set yet."}>
                  <input type="number" style={inputStyle} value={form.actualCost} onChange={(e) => setForm((f) => ({ ...f, actualCost: e.target.value }))} />
                </Field>
              )}
              <Field label="% complete">
                <input type="number" min="0" max="100" style={inputStyle} value={form.pctComplete} onChange={(e) => setForm((f) => ({ ...f, pctComplete: e.target.value }))} />
              </Field>
            </div>

            {agreedOptions.length > 0 && (
              <Field label="Agreed with" hint="Who on the project signed off on this update, if anyone.">
                <select style={selectStyle} value={form.agreedWithUserId} onChange={(e) => setForm((f) => ({ ...f, agreedWithUserId: e.target.value }))}>
                  <option value="">— None —</option>
                  {agreedOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </Field>
            )}

            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", background: BRAND.cream, border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "10px 12px", marginBottom: 16 }}>
              <b style={{ color: BRAND.ink }}>RIOS health check.</b> Budget, target date, KPI-during-Pilot progress, and the leadership-help flag are checked automatically.
              {project.healthReason
                ? ` Right now the worse of those checks reads: "${project.healthReason}" -- if that's still worse than the health you pick above after this update, it's what shows.`
                : " None of them currently read worse than the health you pick."}
            </div>

            <Field label="Attach a file (optional)" hint="PDF, Word, Excel, PowerPoint, PNG or JPG, up to 10 MB. Filed under the current stage.">
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontFamily: FONT, fontSize: 12.5 }} />
            </Field>

            <ErrorBanner text={error} />
            <div style={{ display: "flex", gap: 10 }}>
              <PrimaryButton type="submit" disabled={submitting}>{submitting ? "Saving…" : "Post update"}</PrimaryButton>
              {onCancel && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
            </div>
          </form>
        </Card>
  );
}

function UpdatesTab({ updates, canAdd, onAddClick }) {
  return (
    <div>
      {canAdd && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <PrimaryButton icon={Plus} onClick={onAddClick}>Add status update</PrimaryButton>
        </div>
      )}
      {updates.length === 0 ? <EmptyState icon={FileText} title="No updates yet" text="Status updates will appear here once posted." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {updates.map((u) => (
            <Card key={u.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <HealthBadge health={u.health} size="sm" />
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>{fmtDate(u.update_date)} · {u.by_name}</div>
                {u.needs_help && <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#C13B3B", background: "#FBEAEA", padding: "2px 8px", borderRadius: 999 }}>Needs help</span>}
                {u.pct_complete != null && <span style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>{u.pct_complete}% complete</span>}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, lineHeight: 1.55 }}><b>Progress:</b> {u.progress}</div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, lineHeight: 1.55, marginTop: 4 }}><b>Next:</b> {u.next_steps}</div>
              {u.blockers && <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, lineHeight: 1.55, marginTop: 4 }}><b>Blockers:</b> {u.blockers}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RoiTab({ project, canEdit, isClientLeader, onSaved }) {
  const m = project.metrics || {};
  const [form, setForm] = useState({
    kpiName: m.kpi_name || "", kpiUnit: m.kpi_unit || "", baseline: m.baseline ?? "", target: m.target ?? "",
    currency: m.currency || "USD", estCost: m.est_cost ?? "", actualCost: m.actual_cost ?? "",
    estBenefit: m.est_benefit ?? "", realisedBenefit: m.realised_benefit ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSaved(false);
    try {
      const payload = isClientLeader
        ? { realisedBenefit: form.realisedBenefit === "" ? null : Number(form.realisedBenefit) }
        : {
            kpiName: form.kpiName, kpiUnit: form.kpiUnit, baseline: form.baseline === "" ? null : Number(form.baseline),
            target: form.target === "" ? null : Number(form.target), currency: form.currency,
            estCost: form.estCost === "" ? null : Number(form.estCost), actualCost: form.actualCost === "" ? null : Number(form.actualCost),
            estBenefit: form.estBenefit === "" ? null : Number(form.estBenefit),
            realisedBenefit: form.realisedBenefit === "" ? null : Number(form.realisedBenefit),
          };
      await api.updateBuildMetrics(project.id, payload);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save ROI figures.");
    } finally { setSaving(false); }
  }

  const roi = project.roi || {};
  return (
    <div>
      <Card style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>ROI {roi.estimated ? "(estimated)" : ""}</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: roi.roiPct >= 0 ? "#1B7A5A" : "#C13B3B", marginTop: 2 }}>{fmtPct(roi.roiPct)}</div>
          </div>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Payback</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink, marginTop: 2 }}>{roi.paybackMonths != null ? `${roi.paybackMonths.toFixed(1)} mo` : "—"}</div>
          </div>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Actual cost</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink, marginTop: 2 }}>{fmtUSD(m.actual_cost)}</div>
          </div>
          <div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Realised benefit</div>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink, marginTop: 2 }}>{fmtUSD(m.realised_benefit)}</div>
          </div>
        </div>
      </Card>

      {canEdit && (
        <Card style={{ padding: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>
            {isClientLeader ? "Confirm realised benefit" : "Edit ROI figures"}
          </div>
          <form onSubmit={submit}>
            {!isClientLeader && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 0 }}>
                <Field label="KPI name"><input style={inputStyle} value={form.kpiName} onChange={(e) => setForm((f) => ({ ...f, kpiName: e.target.value }))} /></Field>
                <Field label="KPI unit"><input style={inputStyle} value={form.kpiUnit} onChange={(e) => setForm((f) => ({ ...f, kpiUnit: e.target.value }))} /></Field>
                <Field label="Baseline"><input type="number" style={inputStyle} value={form.baseline} onChange={(e) => setForm((f) => ({ ...f, baseline: e.target.value }))} /></Field>
                <Field label="Target"><input type="number" style={inputStyle} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} /></Field>
                <Field label="Estimated cost (USD)"><input type="number" style={inputStyle} value={form.estCost} onChange={(e) => setForm((f) => ({ ...f, estCost: e.target.value }))} /></Field>
                <Field label="Actual cost (USD)"><input type="number" style={inputStyle} value={form.actualCost} onChange={(e) => setForm((f) => ({ ...f, actualCost: e.target.value }))} /></Field>
                <Field label="Estimated benefit (USD)"><input type="number" style={inputStyle} value={form.estBenefit} onChange={(e) => setForm((f) => ({ ...f, estBenefit: e.target.value }))} /></Field>
              </div>
            )}
            <Field label="Realised benefit (USD)" hint={isClientLeader ? "As the Client Leader, confirming realised benefit is the one ROI figure you can set." : undefined}>
              <input type="number" style={inputStyle} value={form.realisedBenefit} onChange={(e) => setForm((f) => ({ ...f, realisedBenefit: e.target.value }))} />
            </Field>
            {saved && <Notice text="Saved." />}
            <ErrorBanner text={error} />
            <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
          </form>
        </Card>
      )}
    </div>
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
        recommendation: form.recommendation || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e.message || "Couldn't save lessons learned.");
    } finally { setSaving(false); }
  }

  if (!canEdit && !lessons) return <EmptyState icon={FileText} title="No lessons learned yet" text="Lessons learned will be recorded here before this project closes." />;

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Lessons learned</div>
      {canEdit ? (
        <form onSubmit={submit}>
          <Field label="What worked"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.worked} onChange={(e) => setForm((f) => ({ ...f, worked: e.target.value }))} /></Field>
          <Field label="What didn't work"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notWorked} onChange={(e) => setForm((f) => ({ ...f, notWorked: e.target.value }))} /></Field>
          <Field label="What to do differently"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.doDifferently} onChange={(e) => setForm((f) => ({ ...f, doDifferently: e.target.value }))} /></Field>
          <Field label="Recommendation">
            <select style={selectStyle} value={form.recommendation} onChange={(e) => setForm((f) => ({ ...f, recommendation: e.target.value }))}>
              <option value="">— Choose —</option>
              <option value="scale_to_others">Scale to others</option>
              <option value="reuse_approach">Reuse approach</option>
              <option value="dont_repeat">Don't repeat</option>
            </select>
          </Field>
          <Field label="Tags" hint="Comma-separated"><input style={inputStyle} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} /></Field>
          {saved && <Notice text="Saved. This is required before the project can be closed." />}
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save lessons learned"}</PrimaryButton>
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

function FilesTab({ project, files, canUpload, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      await api.uploadBuildFile(project.id, file, project.stage);
      onUploaded();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally { setUploading(false); e.target.value = ""; }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink }}>Files</div>
        {canUpload && (
          // Wrapping the hidden <input type="file"> and the visible button in
          // one <label> is enough on its own -- the browser forwards a click
          // anywhere in the label (including on the button) to the file
          // input, no manual ref/click plumbing needed.
          <label style={{ display: "inline-block" }}>
            <input type="file" onChange={handleFile} style={{ display: "none" }} disabled={uploading} />
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff",
              color: uploading ? "#B7B2AE" : BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 9,
              padding: "10px 16px", cursor: uploading ? "not-allowed" : "pointer",
            }}>
              {uploading ? <Loader2 size={14} /> : <Upload size={14} />} {uploading ? "Uploading…" : "Upload file"}
            </span>
          </label>
        )}
      </div>
      <ErrorBanner text={error} />
      {files.length === 0 ? <EmptyState icon={Paperclip} title="No files yet" text="PDF, DOCX, XLSX, PPTX, PNG or JPG — up to 10MB each." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", border: `1px solid ${BRAND.line}`, borderRadius: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Paperclip size={14} color="#9B958F" />
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink }}>{f.file_name}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>{(f.size / 1024).toFixed(0)} KB · {fmtDate(f.at)}</div>
                </div>
              </div>
              <button onClick={() => api.downloadBuildFile(project.id, f.id, f.file_name)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <Download size={16} color={BRAND.coral} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HistoryTab({ history }) {
  if (!history.length) return <EmptyState icon={History} title="No history yet" text="Stage changes will be recorded here." />;
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {history.map((h) => (
          <div key={h.id} style={{ display: "flex", gap: 12, paddingBottom: 12, borderBottom: `1px solid ${BRAND.line}` }}>
            <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", minWidth: 90 }}>{fmtDate(h.at)}</div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink }}>
              <b style={{ textTransform: "capitalize" }}>{h.action.replace("_", " ")}</b>
              {h.from_stage && h.to_stage && h.from_stage !== h.to_stage ? ` — ${h.from_stage} → ${h.to_stage}` : ""}
              {h.reason ? ` — ${h.reason}` : ""}
              <span style={{ color: "#9B958F" }}> · {h.by_name}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Two-row stage stepper (Oct 2026 "Proposed Screens" page_3) -- a DEAL row
// (startup-only: NDA/Proposal/Purchase Order/Agreement, the "selling" part
// before any delivery work starts) and a DELIVERY row shared by both
// workflows (Design through Closed). Internal projects never show a DEAL
// row since BUILD_STAGES.internal has no deal stages at all.
const DEAL_STAGES = ["requirements", "nda", "proposal", "purchase_order", "agreement"];
function StageStepperRow({ label, stages, currentStage }) {
  const stageList = BUILD_STAGES.startup; // full ordered list, for index comparison
  const curIdx = stageList.indexOf(currentStage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
      {label && <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.04em", width: 62, flexShrink: 0 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        {stages.map((s, i) => {
          const idx = stageList.indexOf(s);
          const done = idx < curIdx;
          const active = s === currentStage;
          const bg = active ? BRAND.coral : done ? "#1B7A5A" : "#EFEBE7";
          const fg = active || done ? "#fff" : "#9B958F";
          return (
            <React.Fragment key={s}>
              {i > 0 && <div style={{ width: 14, height: 1, background: BRAND.line }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", background: bg, color: fg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: FONT, fontSize: 10.5, fontWeight: 700, flexShrink: 0,
                }}>
                  {done ? <CheckCircle2 size={11} /> : i + 1}
                </div>
                <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? BRAND.ink : "#7A746F", whiteSpace: "nowrap" }}>
                  {BUILD_STAGE_LABELS[s]}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
const STARTUP_DELIVERY_STAGES = ["design", "build", "test", "pilot", "production", "closed"];
function StageStepper({ project }) {
  if (project.stage === "closed" && project.status === "closed") return null;
  const isStartup = project.type === "startup";
  return (
    <Card style={{ padding: "14px 18px", marginBottom: 16 }}>
      {isStartup ? (
        <>
          <StageStepperRow label="Deal" stages={DEAL_STAGES} currentStage={project.stage} />
          <StageStepperRow label="Delivery" stages={STARTUP_DELIVERY_STAGES} currentStage={project.stage} />
        </>
      ) : (
        <StageStepperRow stages={BUILD_STAGES.internal} currentStage={project.stage} />
      )}
    </Card>
  );
}

// Right-rail side panels (page 3 of the Oct 2026 mockup) -- People, "KPI &
// value", "Deal summary" (startup only), and "Where it came from". All
// built from fields the detail payload already carries (project join
// fields, sources array) -- no new endpoints needed for these.
function SidePanel({ title, children }) {
  return (
    <Card style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.ink, marginBottom: 12 }}>{title}</div>
      {children}
    </Card>
  );
}
function SideRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
// Mockup screen 3: everyone on the project, by role -- one Client Leader,
// one Product Owner, one Employee (Enterprise) or Startup POC (Open
// Innovation), and the RIV Client Partner. A missing person shows as
// "Not assigned" so the gap is visible instead of the row vanishing.
function PeoplePanel2({ project }) {
  const row = (label, name, sub) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: name ? BRAND.ink : "#B7B2AE", marginTop: 2 }}>{name || "Not assigned"}</div>
      {sub && name && <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>{sub}</div>}
    </div>
  );
  return (
    <SidePanel title="People">
      {row("Client Leader (reviews)", project.client_name, project.client_company)}
      {row("Product Owner (owns delivery)", project.product_owner_name)}
      {project.type === "startup"
        ? row("Startup POC", project.startup_poc_name)
        : row("Employee", project.employee_name)}
      {row("RIV Client Partner", project.riv_manager_name)}
    </SidePanel>
  );
}
function KpiValuePanel({ project, seeMoney = true }) {
  const m = project.metrics || {};
  if (!m.kpi_name && m.est_cost == null && m.actual_cost == null) return null;
  const pct = m.baseline != null && m.target != null && project.kpi_now != null && m.target !== m.baseline
    ? Math.max(0, Math.min(100, Math.round(((project.kpi_now - m.baseline) / (m.target - m.baseline)) * 100)))
    : null;
  return (
    <SidePanel title="KPI & value">
      {m.kpi_name && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>{m.kpi_name}</div>
          <div style={{ height: 6, borderRadius: 999, background: BRAND.cream, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct ?? 0}%`, background: BRAND.coral, borderRadius: 999 }} />
          </div>
          <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#7A746F", marginTop: 4 }}>
            {m.baseline ?? "—"} → {project.kpi_now ?? "—"} → {m.target ?? "—"}{pct != null ? ` (${pct}%)` : ""}
          </div>
        </div>
      )}
      {seeMoney && <div style={{ display: "flex", gap: 14 }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "uppercase" }}>Cost to date</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{fmtUSD(m.actual_cost) || "—"}</div>
        </div>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "uppercase" }}>Benefit/yr</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{fmtUSD(m.realised_benefit ?? m.est_benefit) || "—"}</div>
        </div>
      </div>}
    </SidePanel>
  );
}
function DealSummaryPanel({ project }) {
  if (project.type !== "startup") return null;
  return (
    <SidePanel title="Deal summary">
      <SideRow label="NDA signed" value={fmtDate(project.nda_signed_at)} />
      <SideRow label="Proposal" value={project.proposal_amount != null ? `${fmtUSD(project.proposal_amount)}${project.proposal_accepted_at ? ` · accepted ${fmtDate(project.proposal_accepted_at)}` : ""}` : null} />
      <SideRow label="Purchase order" value={project.po_number ? `${project.po_number}${project.po_raised_at ? ` · raised ${fmtDate(project.po_raised_at)}` : ""}` : null} />
      <SideRow label="Agreement" value={project.agreement_type ? `${project.agreement_type}${project.agreement_signed_at ? ` · signed ${fmtDate(project.agreement_signed_at)}` : ""}` : null} />
      {!project.nda_signed_at && !project.proposal_amount && !project.po_number && !project.agreement_type && (
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>Nothing recorded yet -- fill these in from the Overview tab's "Project details" form.</div>
      )}
    </SidePanel>
  );
}
// "Requests from Client Partners" (mockup page 5's admin tab) -- raising
// one lives here, on the project itself, since that's where a Client
// Leader would naturally think to ask for something. Client Leader gets a
// form; anyone else who can see the project gets a read-only thread so
// they know what's been asked and whether it's resolved.
function RequestsSidePanel({ project, isClientLeader }) {
  const [requests, setRequests] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    api.getBuildRequestsForProject(project.id).then((d) => setRequests(d.requests || [])).catch(() => setRequests([]));
  }
  useEffect(() => { load(); }, [project.id]);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true); setError(null);
    try {
      await api.createBuildRequest(project.id, message.trim());
      setMessage("");
      load();
    } catch (e) { setError(e.message || "Couldn't send that request."); } finally { setSubmitting(false); }
  }

  if (!isClientLeader && requests != null && requests.length === 0) return null;

  return (
    <SidePanel title="Requests">
      {requests === null ? (
        <Spinner label="Loading…" />
      ) : (
        <>
          {requests.length === 0 && <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: isClientLeader ? 10 : 0 }}>No requests yet.</div>}
          {requests.map((r) => (
            <div key={r.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${BRAND.line}` }}>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>{r.message}</div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: r.status === "resolved" ? "#1B7A5A" : "#9B958F", marginTop: 3 }}>
                {fmtDate(r.created_at)} · {r.status === "resolved" ? "Resolved" : "Open"}
              </div>
            </div>
          ))}
          {isClientLeader && (
            <form onSubmit={submit} style={{ marginTop: 6 }}>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask RIV Admin something about this project…" rows={2}
                style={{ width: "100%", fontFamily: FONT, fontSize: 12.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: 8, boxSizing: "border-box", resize: "vertical" }} />
              <ErrorBanner text={error} />
              <GhostButton disabled={submitting || !message.trim()} style={{ marginTop: 6, width: "100%" }}>{submitting ? "Sending…" : "Send request"}</GhostButton>
            </form>
          )}
        </>
      )}
    </SidePanel>
  );
}

const SOURCE_LABEL = { idea: "Ideathon idea", rise_application: "Startup pilot application", manual: "Created manually" };
function WhereFromPanel({ sources }) {
  const s = sources?.[0];
  if (!s) return null;
  const name = s.source_type === "idea" ? s.idea_title : s.source_type === "rise_application" ? s.startup_name : null;
  const by = s.source_type === "idea" ? (s.idea_submitted_by_name && `Submitted by ${s.idea_submitted_by_name}`)
    : s.source_type === "rise_application" ? (s.opportunity_title && `Applied to "${s.opportunity_title}"`) : null;
  return (
    <SidePanel title="Where it came from">
      <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{SOURCE_LABEL[s.source_type] || s.source_type}</div>
      {name && <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, marginTop: 3 }}>{name}</div>}
      {by && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#7A746F", marginTop: 2 }}>{by}</div>}
      {s.auditQuestion && (
        <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#7A746F", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BRAND.line}` }}>
          <b style={{ color: BRAND.ink }}>Audit opportunity:</b> {s.auditQuestion}
        </div>
      )}
    </SidePanel>
  );
}

function ProjectDetailView({ projectId, session, onBack }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [moreAction, setMoreAction] = useState(null); // 'hold' | 'stop' | 'close' | 'request-delete' | 'delete'
  const [notice, setNotice] = useState(null);

  function load() {
    setLoading(true);
    api.getBuildProject(projectId).then(setData).catch((e) => setError(e.message || "Couldn't load this project.")).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [projectId]);

  async function doAction(kind, payload) {
    setBusy(true); setError(null);
    try {
      if (kind === "advance") await api.advanceBuildStage(projectId, payload.reason);
      else if (kind === "sendBack") await api.sendBackBuildStage(projectId, payload);
      else if (kind === "pilotDecision") await api.decideBuildPilot(projectId, payload);
      else if (kind === "hold") await api.holdBuildProject(projectId, payload.reason);
      else if (kind === "resume") await api.resumeBuildProject(projectId);
      else if (kind === "stop") await api.stopBuildProject(projectId, payload.reason);
      else if (kind === "close") await api.closeBuildProject(projectId, payload.outcome);
      else if (kind === "request-delete") { await api.requestBuildDelete(projectId, payload.reason); setNotice("Delete request sent to the RIV Admin. Nothing is deleted until they approve it."); }
      else if (kind === "delete") { await api.deleteBuildProject(projectId); onBack(); return; }
      setMoreAction(null);
      load();
    } catch (e) {
      setError(e.message || "That action failed.");
    } finally { setBusy(false); }
  }

  if (loading) return <Spinner label="Loading project…" />;
  if (!data) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}><ErrorBanner text={error || "Project not found."} /></div>;

  const { project, sources, history, updates, lessons, files } = data;
  // Every button below is driven by data.permissions -- the backend's own
  // answer (lib/buildPermissions.js) for *this* viewer on *this* project --
  // so the screen can't drift from the server rules again.
  const perms = data.permissions || {};
  const isClientLeader = session.role === "client" && Number(session.id) === Number(project.client_id);
  const canEditDetails = !!perms.editDetails;
  const canAddUpdate = !!perms.addUpdate;
  const canEditRoi = !!perms.editRoi;
  const canUpload = !!perms.uploadFile;
  const headerHealth = displayHealth(project);

  function pickMore(kind) {
    setNotice(null);
    if (kind === "resume") doAction("resume", {});
    else setMoreAction(kind);
  }

  const isStartupProject = project.type === "startup";
  const dealFiles = isStartupProject ? files.filter((f) => DEAL_STAGES.includes(f.stage)) : [];
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "updates", label: "Updates" },
    { id: "roi", label: "KPI & ROI" },
    { id: "lessons", label: "Lessons" },
    { id: "files", label: "Files" },
    ...(isStartupProject ? [{ id: "dealdocs", label: "Deal documents" }] : []),
    { id: "history", label: "History" },
  ];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All projects
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: BRAND.coralDark }}>{project.code}</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>{project.title}</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 4, textTransform: "capitalize" }}>
            {project.type} · {project.stageLabel || project.stage}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <HealthBadge health={headerHealth} />
            <StatusBadge status={project.status} />
            {canAddUpdate && project.status !== "closed" && (
              <PrimaryButton icon={Plus} onClick={() => setShowUpdate(true)} style={{ padding: "9px 14px" }}>Add status update</PrimaryButton>
            )}
            <MoreMenu project={project} permissions={perms} onPick={pickMore} />
          </div>
          {project.hasUpdate !== false && project.healthReason && (
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", maxWidth: 260, textAlign: "right" }}>{project.healthReason}</div>
          )}
        </div>
      </div>

      <StageStepper project={project} />

      <ErrorBanner text={error} />
      <Notice text={notice} />

      {moreAction && (
        <MoreActionForm
          kind={moreAction} project={project} busy={busy}
          onCancel={() => setMoreAction(null)}
          onConfirm={({ reason, outcome }) => doAction(moreAction, moreAction === "close" ? { outcome } : { reason })}
        />
      )}

      {project.status !== "closed" && (
        <CurrentStagePanel
          project={project} checklist={data.stageChecklist} gateApprovers={data.gateApprovers}
          permissions={perms} onAction={doAction} busy={busy} onEditDetails={() => setTab("overview")}
        />
      )}

      {showUpdate && (
        <StatusUpdateModal project={project} permissions={perms} onClose={() => { setShowUpdate(false); load(); }} onSaved={() => {}} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 1fr)", gap: 24, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 20, overflowX: "auto" }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "none", border: "none",
                borderBottom: tab === t.id ? `2px solid ${BRAND.coral}` : "2px solid transparent",
                color: tab === t.id ? BRAND.ink : "#9B958F", cursor: "pointer", whiteSpace: "nowrap",
              }}>{t.label}</button>
            ))}
          </div>

          {tab === "overview" && <OverviewTab project={project} sources={sources} canEdit={canEditDetails} onSaved={load} session={session} />}
          {tab === "updates" && <UpdatesTab updates={updates} canAdd={canAddUpdate && project.status !== "closed"} onAddClick={() => setShowUpdate(true)} />}
          {tab === "roi" && <RoiTab project={project} canEdit={canEditRoi} isClientLeader={isClientLeader && !canEditDetails} onSaved={load} />}
          {tab === "lessons" && <LessonsTab project={project} lessons={lessons} canEdit={canEditDetails} onSaved={load} />}
          {tab === "files" && <FilesTab project={project} files={files} canUpload={canUpload} onUploaded={load} />}
          {tab === "dealdocs" && (
            dealFiles.length === 0
              ? <EmptyState icon={Paperclip} title="No deal documents yet" text="Files uploaded during Requirements, NDA, Proposal, Purchase Order or Agreement show up here automatically, filtered from the Files tab by stage." />
              : <FilesTab project={project} files={dealFiles} canUpload={canUpload} onUploaded={load} />
          )}
          {tab === "history" && <HistoryTab history={history} />}
        </div>

        <div>
          <PeoplePanel2 project={project} />
          <KpiValuePanel project={project} seeMoney={perms.seeMoney !== false} />
          <DealSummaryPanel project={project} />
          <WhereFromPanel sources={sources} />
          <RequestsSidePanel project={project} isClientLeader={isClientLeader} />
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD (PRD 9) -- Client Leader view (own client) + RIV
   portfolio view (admin, every client). A product_owner sees their client's
   dashboard too; a riv_manager sees the clients assigned to them via the
   same client-dashboard endpoint, one client at a time, from a picker.
   ========================================================================= */
// Generic click-to-sort helper for the dashboard tables (PRD section C,
// "a sortable project table") -- toggles asc/desc on the same column,
// resets to asc on a new one. Rows are pre-flattened by the caller so
// sortKey is always a plain top-level field (no nested p.roi.roiPct).
function useSortedRows(rows, defaultKey, defaultDir = "asc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const sorted = useMemo(() => {
    const arr = [...(rows || [])];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);
  const toggleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  return { sorted, sortKey, sortDir, toggleSort };
}

function SortTh({ label, sortKey: key, active, dir, onSort }) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th onClick={() => onSort(key)} style={{
      fontFamily: FONT, fontSize: 11, fontWeight: 700, color: active ? BRAND.ink : "#7A746F",
      textTransform: "uppercase", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}`,
      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label} <Icon size={11} /></span>
    </th>
  );
}

const BUILD_STAGE_ORDER = ["requirements", "agreement", "design", "build", "test", "pilot", "scale", "closed"];

// Stage-count breakdown (PRD section C, "counts of projects at each
// stage") -- data.pipelineByStage is a plain { stageKey: count } object
// from GET /api/build/dashboard/client/:clientId, already computed
// server-side; this just renders it as a row of mini stat tiles in a
// fixed, sensible stage order.
function StageBreakdown({ pipelineByStage }) {
  if (!pipelineByStage) return null;
  const keys = Object.keys(pipelineByStage);
  if (!keys.length) return null;
  const ordered = [...BUILD_STAGE_ORDER.filter((k) => keys.includes(k)), ...keys.filter((k) => !BUILD_STAGE_ORDER.includes(k))];
  return (
    <Card style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Projects by stage</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {ordered.map((k) => (
          <div key={k} style={{ flex: "1 1 100px", background: BRAND.cream, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{pipelineByStage[k]}</div>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#7A746F", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Investment-vs-benefit chart (PRD section C). Takes either the per-project
// shape from GET /dashboard/client/:clientId (investmentVsBenefit: [{code,
// actualCost, realisedBenefit}]) or the per-client shape built from the
// portfolio endpoint's own invested/benefit fields -- same chart, different
// caller-supplied field names so neither dashboard needs a second component.
function InvestmentVsBenefitChart({ title, rows, nameKey, investedKey, benefitKey, benefitLabel = "Realised benefit" }) {
  if (!rows || !rows.length) return null;
  return (
    <Card style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>{title}</div>
      <ResponsiveContainer width="100%" height={Math.max(220, Math.min(420, 56 * rows.length))}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} horizontal={false} />
          <XAxis type="number" tick={{ fontFamily: FONT, fontSize: 11, fill: "#7A746F" }} />
          <YAxis type="category" dataKey={nameKey} width={90} tick={{ fontFamily: FONT, fontSize: 11, fill: "#7A746F" }} />
          <Tooltip contentStyle={{ fontFamily: FONT, fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.line}` }} />
          <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 11 }} />
          <Bar dataKey={investedKey} name="Invested" fill="#D9A79C" radius={[0, 4, 4, 0]} />
          <Bar dataKey={benefitKey} name={benefitLabel} fill="#1B7A5A" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// Leadership-level "which workflow" breakdown (PRD section 9 / this
// change's request): the same Enterprise/Open Innovation Management split
// as the Projects tab's sub-tabs, with each workflow's invested/benefit/ROI
// as already computed server-side -- no new calculation invented here.
function WorkflowBreakdown({ byType }) {
  if (!byType) return null;
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
      {INNOV_TABS.map((t) => {
        const b = byType[t.type] || { count: 0, invested: 0, benefit: 0, roi: null };
        return (
          <Card key={t.id} style={{ padding: 18, flex: "1 1 260px" }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.ink, marginBottom: 10 }}>{t.label}</div>
            <div style={{ display: "flex", gap: 18 }}>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Active</div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{b.count}</div>
              </div>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Invested</div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{fmtUSD(b.invested) || "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>Benefit</div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{fmtUSD(b.benefit) || "—"}</div>
              </div>
              <div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase" }}>ROI</div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: b.roi >= 0 ? "#1B7A5A" : (b.roi == null ? BRAND.ink : "#C13B3B") }}>{fmtPct(b.roi)}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Stage-by-workflow stacked bars (page_6 of the Oct 2026 mockup, "Internal
// vs Startup" split) -- data.stageCountsByType is { internal: {stage:
// count}, startup: {stage: count} } from GET /dashboard/client/:clientId,
// already split server-side; this just lays it out as one stacked bar per
// stage across both workflows' stage lists (internal has no deal stages).
function StageByWorkflowChart({ stageCountsByType }) {
  if (!stageCountsByType) return null;
  const allStages = [...new Set([...Object.keys(stageCountsByType.internal || {}), ...Object.keys(stageCountsByType.startup || {})])];
  if (!allStages.length) return null;
  const ordered = [...BUILD_STAGE_ORDER.filter((k) => allStages.includes(k)), ...allStages.filter((k) => !BUILD_STAGE_ORDER.includes(k))];
  const rows = ordered.map((stage) => ({
    stage: BUILD_STAGE_LABELS[stage] || stage.replace(/_/g, " "),
    Internal: stageCountsByType.internal?.[stage] || 0,
    Startup: stageCountsByType.startup?.[stage] || 0,
  }));
  return (
    <Card style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Active projects by stage, by workflow</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} vertical={false} />
          <XAxis dataKey="stage" tick={{ fontFamily: FONT, fontSize: 11, fill: "#7A746F" }} />
          <YAxis allowDecimals={false} tick={{ fontFamily: FONT, fontSize: 11, fill: "#7A746F" }} />
          <Tooltip contentStyle={{ fontFamily: FONT, fontSize: 12, borderRadius: 8, border: `1px solid ${BRAND.line}` }} />
          <Legend wrapperStyle={{ fontFamily: FONT, fontSize: 11 }} />
          <Bar dataKey="Internal" stackId="s" fill={BRAND.coral} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Startup" stackId="s" fill="#6B8CA3" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// "From audit to impact" (page_6) -- this client's top $-value audit
// opportunities against whether a Build project has addressed them yet.
// Three real statuses, each backed by an actual link in the schema:
// "addressed" (build_reassess_links, written when a project closes
// Scaled), "in_build" (build_project_sources' question_id on a still-open
// project), and "not_addressed" (no link, or only a Stopped attempt).
const AUDIT_STATUS_STYLE = {
  addressed: { color: "#1B7A5A", background: "#E7F5EF" },
  in_build: { color: BRAND.coralDark, background: "#FCEEE1" },
  not_addressed: { color: "#9B958F", background: BRAND.cream },
};
function AuditToImpactPanel({ auditToImpact }) {
  if (!auditToImpact || !auditToImpact.length) return null;
  return (
    <Card style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 4 }}>From audit to impact</div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 12 }}>This client's top audit opportunities by potential value, and whether Build has addressed them.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {auditToImpact.map((o) => {
          const style = AUDIT_STATUS_STYLE[o.status] || AUDIT_STATUS_STYLE.not_addressed;
          return (
            <div key={o.questionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontFamily: FONT, fontSize: 13 }}>
              <span style={{ color: BRAND.ink }}>{o.text}</span>
              <span style={{ flexShrink: 0, fontFamily: FONT, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", color: style.color, background: style.background }}>{o.note}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// "Recent win" / "Lesson learned" callout bars (page_6) -- the single most
// recent scaled project and the single most recent stopped-with-a-lesson
// project, pulled out of the same recentLessons array LessonsLearnedPanel
// already renders in full below, so there's no new backend data here.
function RecentCallouts({ recentLessons }) {
  if (!recentLessons || !recentLessons.length) return null;
  const win = recentLessons.find((l) => l.outcome === "scaled");
  const lesson = recentLessons.find((l) => l.outcome !== "scaled");
  if (!win && !lesson) return null;
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
      {win && (
        <div style={{ flex: "1 1 280px", background: "#E7F5EF", border: "1px solid #BFE3D3", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 11.5, color: "#1B7A5A", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Recent win</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink }}><b>{win.code}</b> {win.title} scaled{win.closedAt ? ` · ${fmtDate(win.closedAt)}` : ""}</div>
          {win.worked && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#3C6652", marginTop: 4 }}>{win.worked}</div>}
        </div>
      )}
      {lesson && (
        <div style={{ flex: "1 1 280px", background: "#FBEFE9", border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 11.5, color: BRAND.coralDark, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Lesson learned</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink }}><b>{lesson.code}</b> {lesson.title}{lesson.closedAt ? ` · ${fmtDate(lesson.closedAt)}` : ""}</div>
          {(lesson.doDifferently || lesson.notWorked) && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A4A3A", marginTop: 4 }}>{lesson.doDifferently || lesson.notWorked}</div>}
        </div>
      )}
    </div>
  );
}

const RECOMMENDATION_LABEL = { scale_to_others: "Scale to others", reuse_approach: "Reuse approach", dont_repeat: "Don't repeat" };

// "Lessons learned from completed implementations" at leadership level (PRD
// section 9 / this change's request) -- reads build_lessons rows for this
// client's closed projects; the lessons themselves are still edited on the
// project's own Lessons learned tab, this is just visibility.
function LessonsLearnedPanel({ recentLessons }) {
  if (!recentLessons || !recentLessons.length) return null;
  return (
    <Card style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 10 }}>Lessons learned from completed implementations</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recentLessons.map((l) => (
          <div key={l.projectId} style={{ borderBottom: `1px solid ${BRAND.line}`, paddingBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontFamily: FONT, fontSize: 13 }}>
              <span>
                <b style={{ color: BRAND.coralDark }}>{l.code}</b> {l.title}
                <span style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", marginLeft: 8 }}>
                  {INNOV_TABS.find((t) => t.type === l.type)?.label} · {l.outcome === "scaled" ? "Scaled" : "Stopped"} · {fmtDate(l.closedAt)}
                </span>
              </span>
              {l.recommendation && (
                <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: "#1B7A5A", background: "#E7F5EF", borderRadius: 999, padding: "3px 10px" }}>
                  {RECOMMENDATION_LABEL[l.recommendation] || l.recommendation}
                </span>
              )}
            </div>
            {l.worked && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginTop: 4 }}><b>What worked:</b> {l.worked}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// Health donut (page_6 of the Oct 2026 mockup) -- a quick "how much of the
// portfolio is fine vs. not" read, computed client-side from the same
// per-project health values already in the table below (no new backend
// field needed).
const HEALTH_DONUT_ORDER = ["on_track", "at_risk", "off_track", "no_update"];
// Mockup screen 6: four slices -- on track, at risk, off track, and "no
// update yet" (a project nobody has reported on isn't green).
function HealthDonut({ projects, breakdown }) {
  const counts = breakdown ? { ...breakdown } : { on_track: 0, at_risk: 0, off_track: 0, no_update: 0 };
  if (!breakdown) for (const p of projects || []) if (counts[p.health] != null) counts[p.health] += 1;
  const total = HEALTH_DONUT_ORDER.reduce((n, k) => n + (counts[k] || 0), 0);
  const data = HEALTH_DONUT_ORDER.map((k) => ({ name: HEALTH_COLORS[k].label, value: counts[k], key: k }));
  return (
    <Card style={{ padding: 18, flex: "1 1 200px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 80, height: 80, flexShrink: 0, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={26} outerRadius={38} paddingAngle={total ? 2 : 0}>
              {data.map((d) => <Cell key={d.key} fill={HEALTH_COLORS[d.key].fg} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{total}</div>
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Health</div>
        {HEALTH_DONUT_ORDER.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 11.5, color: "#7A746F", marginBottom: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_COLORS[k].fg }} /> {HEALTH_COLORS[k].label}: {counts[k]}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SummaryStat({ label, value, sub, color }) {
  return (
    <Card style={{ padding: 18, flex: "1 1 160px" }}>
      <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: color || BRAND.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

// Approved: the dashboard runs on the calendar year (this year + the two before).
const THIS_YEAR = new Date().getFullYear();
const DASHBOARD_PERIODS = [0, 1, 2].map((n) => ({ value: String(THIS_YEAR - n), label: `Calendar year ${THIS_YEAR - n}` }));
const DASHBOARD_TYPES = [
  { value: "", label: "All workflows" },
  { value: "internal", label: "Internal ideas" },
  { value: "startup", label: "Startup pilots" },
];
function DashboardSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, background: "#fff",
      border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "8px 10px", cursor: "pointer",
    }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ClientDashboard({ clientId, onOpenProject }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState(String(THIS_YEAR));
  const [type, setType] = useState("");

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.getBuildClientDashboard(clientId, { year: period, type }).then(setData).catch((e) => setError(e.message || "Couldn't load dashboard.")).finally(() => setLoading(false));
  }, [clientId, period, type]);

  // useSortedRows itself calls hooks (useState/useMemo) -- it must run on
  // every render of this component in the same order, so it's called here
  // unconditionally (with a safe empty-array default before data loads)
  // rather than after the early returns below. Calling a hook after a
  // conditional return means the "loading" render and the "loaded" render
  // call a different number of hooks, which is exactly React error #310
  // ("Rendered more hooks than during the previous render").
  const healthRank = { off_track: 0, at_risk: 1, on_track: 2 };
  const rows = (data?.projects || []).map((p) => ({ ...p, roiPct: p.roi?.roiPct ?? null, healthRank: healthRank[p.health] ?? 3 }));
  const { sorted, sortKey, sortDir, toggleSort } = useSortedRows(rows, "code");

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!data) return null;

  const { summary, needsAttention, pipelineByStage, stageCountsByType, auditToImpact, investmentVsBenefit, byType, recentLessons } = data;
  // Value bar = realised benefit once confirmed, otherwise the estimate (mockup screen 6).
  const chartRows = (investmentVsBenefit || []).map((r) => ({
    name: `${r.code}${r.estimated && r.value != null ? " (est.)" : ""}`, invested: r.actualCost || 0, benefit: r.value ?? r.realisedBenefit ?? 0,
  }));
  const yearLabel = data.period?.kind === "year" ? `Calendar year ${data.period.year}` : DASHBOARD_PERIODS.find((p) => p.value === period)?.label;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: BRAND.ink }}>{data.client?.name || "Client"} · Build dashboard</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 2 }}>{yearLabel} · as of {fmtDate(data.asOf || new Date())}</div>
        </div>
        <div className="build-dashboard-no-print" style={{ display: "flex", gap: 10 }}>
          <DashboardSelect value={period} onChange={setPeriod} options={DASHBOARD_PERIODS} />
          <DashboardSelect value={type} onChange={setType} options={DASHBOARD_TYPES} />
          <GhostButton icon={Download} onClick={() => window.print()}>Export PDF</GhostButton>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <SummaryStat label="Active projects" value={summary.activeCount} />
        <SummaryStat label="Red / Amber" value={summary.redAmberCount} color={summary.redAmberCount ? "#C13B3B" : undefined} />
        <SummaryStat label="Overdue updates" value={summary.overdueCount} color={summary.overdueCount ? BRAND.coralDark : undefined} />
        <SummaryStat label="Invested to date" value={summary.investedToDateFmt} />
        <SummaryStat label="Est. value / year" value={summary.estBenefitPerYearFmt ?? "—"} sub="from project estimates" />
        <SummaryStat label="Realised benefit" value={summary.realisedBenefitFmt} sub={summary.estimated ? "some still estimated" : "confirmed by Client Leader"} />
        <SummaryStat label="Portfolio ROI" value={fmtPct(summary.portfolioRoi)} color={summary.portfolioRoi >= 0 ? "#1B7A5A" : "#C13B3B"} />
        <HealthDonut projects={data.projects} breakdown={data.healthBreakdown} />
      </div>

      <WorkflowBreakdown byType={byType} />
      <RecentCallouts recentLessons={recentLessons} />
      <StageByWorkflowChart stageCountsByType={stageCountsByType} />
      <StageBreakdown pipelineByStage={pipelineByStage} />
      <InvestmentVsBenefitChart title="Cost vs. value per project" rows={chartRows} nameKey="name" investedKey="invested" benefitKey="benefit" benefitLabel="Value / year (realised, or est.)" />
      <AuditToImpactPanel auditToImpact={auditToImpact} />
      <LessonsLearnedPanel recentLessons={recentLessons} />

      {needsAttention.length > 0 && (
        <Card style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 10 }}>Needs attention</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {needsAttention.map((n) => (
              <div key={n.projectId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: FONT, fontSize: 13 }}>
                <span><b style={{ color: BRAND.coralDark }}>{n.code}</b> {n.title}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#9B958F" }}>{n.reason}</span>
                  {onOpenProject && (
                    <button onClick={() => onOpenProject(n.projectId)} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coral, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Review →
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr style={{ background: BRAND.cream, textAlign: "left" }}>
              {[["Code", "code"], ["Title", "title"], ["Workflow", "type"], ["Stage", "stage"], ["Health", "healthRank"], ["Product Owner", "productOwnerName"], ["ROI", "roiPct"]].map(([label, key]) => (
                <SortTh key={key} label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
              ))}
            </tr></thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} onClick={onOpenProject ? () => onOpenProject(p.id) : undefined} style={onOpenProject ? { cursor: "pointer" } : undefined} className={onOpenProject ? "build-row" : undefined}>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coralDark, borderBottom: `1px solid ${BRAND.line}` }}>{p.code}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 13, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}` }}>{p.title}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 11.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.type === "internal" ? "Enterprise" : "Open"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, textTransform: "capitalize" }}>{p.stage}</td>
                  <td style={{ padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}><HealthBadge health={p.health} size="sm" /></td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.productOwnerName || "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{fmtPct(p.roi?.roiPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PortfolioDashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getBuildPortfolioDashboard().then((d) => setClients(d.clients || [])).catch((e) => setError(e.message || "Couldn't load portfolio.")).finally(() => setLoading(false));
  }, []);

  // Same reasoning as ClientDashboard above: useSortedRows must be called
  // unconditionally, before the early returns, to avoid React error #310.
  // clients defaults to [] via useState, so rows is always a safe array.
  const rows = clients.map((c) => ({ ...c, displayName: c.company || c.name }));
  const { sorted, sortKey, sortDir, toggleSort } = useSortedRows(rows, "displayName");

  if (loading) return <Spinner label="Loading portfolio…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!clients.length) return <EmptyState icon={Building2} title="No clients with Build projects yet" text="Once a project exists for a client, their row will appear here." />;

  const chartRows = rows.map((c) => ({ name: c.displayName, invested: c.invested || 0, benefit: c.benefit || 0 }));

  return (
    <div>
      <InvestmentVsBenefitChart title="Investment vs. realised benefit by client" rows={chartRows} nameKey="name" investedKey="invested" benefitKey="benefit" />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr style={{ background: BRAND.cream, textAlign: "left" }}>
              {[["Client", "displayName"], ["Active", "active"], ["Red/Amber", "redAmber"], ["Invested", "invested"], ["Benefit", "benefit"], ["ROI", "roi"], ["Latest audit score", "latestAuditScore"]].map(([label, key]) => (
                <SortTh key={key} label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
              ))}
            </tr></thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.clientId}>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}` }}>{c.displayName}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{c.active}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}`, color: c.redAmber ? "#C13B3B" : "#7A746F", fontWeight: c.redAmber ? 700 : 400 }}>{c.redAmber}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{c.investedFmt}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{c.benefitFmt}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{fmtPct(c.roi)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}` }}>{c.latestAuditScore != null ? c.latestAuditScore : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// RIV Client Partner's own assigned-clients picker (Leader dashboard) --
// GET /build/my-clients was added specifically for this; before it existed
// there was no way to fetch a riv_manager's assigned clients with names
// attached, so this view showed a placeholder instead.
function useMyClients(role) {
  const [clients, setClients] = useState(null);
  useEffect(() => {
    if (role !== "riv_manager") return;
    api.getMyClients().then((d) => setClients(d.clients || [])).catch(() => setClients([]));
  }, [role]);
  return clients;
}

function DashboardView({ session, onOpenProject }) {
  const [sub, setSub] = useState(session.role === "admin" ? "portfolio" : "client");
  const isAdmin = session.role === "admin";
  const isClientLike = ["client", "product_owner"].includes(session.role);
  const isRivManager = session.role === "riv_manager";
  const myClients = useMyClients(session.role);
  const [pickedClientId, setPickedClientId] = useState(null);
  const allClientsState = useClientOptionsState();
  const allClients = allClientsState.clients;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Dashboard</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 20 }}>What's in flight, what's in trouble, and what it has returned.</div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <GhostButton style={sub === "portfolio" ? { background: BRAND.ink, color: "#fff" } : {}} onClick={() => setSub("portfolio")}>RIV portfolio</GhostButton>
          <GhostButton style={sub === "client" ? { background: BRAND.ink, color: "#fff" } : {}} onClick={() => setSub("client")}>One client</GhostButton>
        </div>
      )}

      {isAdmin && sub === "client" && allClients && allClients.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <DashboardSelect
            value={pickedClientId ?? ""}
            onChange={(v) => setPickedClientId(v ? Number(v) : null)}
            options={[{ value: "", label: "Choose a client…" }, ...allClients.map((c) => ({ value: String(c.id), label: c.company || c.name }))]}
          />
        </div>
      )}
      {/* Issue 6: the picker used to just not render when the client list
          failed to load, leaving "Choose a client above" pointing at nothing. */}
      {isAdmin && sub === "client" && allClientsState.status === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, fontFamily: FONT, fontSize: 13, color: "#C13B3B" }}>
          Couldn't load the client list.
          <button type="button" onClick={allClientsState.retry} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", color: BRAND.ink, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {isRivManager && myClients && myClients.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <DashboardSelect
            value={pickedClientId ?? ""}
            onChange={(v) => setPickedClientId(v ? Number(v) : null)}
            options={[{ value: "", label: "Choose a client…" }, ...myClients.map((c) => ({ value: String(c.id), label: c.company || c.name }))]}
          />
        </div>
      )}

      {sub === "portfolio" ? <PortfolioDashboard /> : (
        isClientLike
          ? <ClientDashboard clientId={session.role === "client" ? session.id : session.client_id} onOpenProject={onOpenProject} />
          : isRivManager
            ? (myClients == null
                ? <Spinner label="Loading your clients…" />
                : myClients.length === 0
                  ? <EmptyState icon={Gauge} title="No clients assigned yet" text="Ask an admin to assign you to a client from the admin console's Logins tab." />
                  : pickedClientId
                    ? <ClientDashboard clientId={pickedClientId} onOpenProject={onOpenProject} />
                    : <EmptyState icon={Gauge} title="Pick a client" text="Choose one of your assigned clients above to see their dashboard." />)
            : isAdmin && pickedClientId
              ? <ClientDashboard clientId={pickedClientId} onOpenProject={onOpenProject} />
              : <EmptyState icon={Gauge} title="Pick a client" text={isAdmin ? "Choose a client above to see their dashboard." : "Open a project directly, or ask an admin for dashboard access."} />
      )}
    </div>
  );
}

/* =========================================================================
   ADMIN CONSOLE (PRD 6/7 "How a project starts", 10.1) -- create projects
   (manual / from an Ideathon winner / from a selected startup), assign
   people, and manage product_owner + riv_manager + startup_poc logins.
   ========================================================================= */
// The client list behind every Build client dropdown. It comes from
// GET /api/admin/build/client-options and is sent with the *Build* session
// (admin: every client; RIV Client Partner: just their assigned ones).
//
// This used to call the main site's GET /api/admin/clients with the main-
// site token. Anyone who entered through Build.RIV's own login screen has no
// main-site token, so that call 401'd, the error was swallowed, and the
// pickers silently turned into a free-text box (Create project) or vanished
// altogether (Dashboard -> One client) -- E2E report Issues 3 and 6. Now a
// failure is surfaced with a Retry instead of degrading quietly.
function useClientOptionsState() {
  const [state, setState] = useState({ clients: null, status: "loading" }); // status: loading | ready | error
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: "loading" }));
    api.listBuildClientOptions()
      .then((d) => { if (alive) setState({ clients: d.clients || [], status: "ready" }); })
      .catch(() => { if (alive) setState({ clients: null, status: "error" }); });
    return () => { alive = false; };
  }, [tick]);
  return { ...state, retry: () => setTick((n) => n + 1) };
}

// Array-or-null view of the same list, for callers that only need the
// options (null = not loaded yet, or failed).
function useClientOptions() {
  return useClientOptionsState().clients;
}

function ClientPicker({ value, onChange, required, label, hint }) {
  const { clients, status, retry } = useClientOptionsState();
  if (status === "ready" && clients.length) {
    return (
      <Field label={label} required={required} hint={hint}>
        <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Choose a client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name} (ID {c.id})</option>)}
        </select>
      </Field>
    );
  }
  // Deliberately no free-text fallback: a typed client name never matched a
  // real client record, so the Product Owner / Employee pickers below came
  // up empty with no error (Issue 3). Say what's wrong instead.
  const message = status === "loading" ? "Loading clients…"
    : status === "ready" ? "No clients are available to you yet. A RIV Admin can assign clients to a RIV Client Partner under Logins."
    : "Couldn't load the client list.";
  return (
    <Field label={label} required={required}>
      <div style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, color: status === "error" ? "#C13B3B" : "#9B958F", background: BRAND.cream }}>
        <span>{message}</span>
        {status === "error" && (
          <button type="button" onClick={retry} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", color: BRAND.ink, cursor: "pointer" }}>Retry</button>
        )}
      </div>
    </Field>
  );
}

// Mockup screen 5: "Review & create". Same form for all three starts --
// by hand, from a selected Ideathon idea, or from a selected startup -- and
// every project names its people here: Product Owner (required), the
// Employee (Enterprise; defaults to whoever submitted the idea) or the
// Startup POC (Open Innovation; pick an existing login or create one), and
// the RIV Client Partner. Ideas / startups are picked from the Ready for
// Build list by name, never by typing an ID.
function CreateProjectPanel({ onCreated, prefill }) {
  const [mode, setMode] = useState(prefill?.mode || "manual");
  const [ready, setReady] = useState([]);
  const [sourceKey, setSourceKey] = useState("");
  const [form, setForm] = useState({
    type: "internal", title: "", description: "", clientId: "", targetEnd: "",
    productOwnerUserId: "", employeeUserId: "", rivManagerId: "",
  });
  const [pocMode, setPocMode] = useState("later"); // 'later' | 'create'
  const [pocForm, setPocForm] = useState({ name: "", email: "", password: "" });
  const [pocCreds, setPocCreds] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => { api.getReadyForBuild(false).then((d) => setReady(d.items || [])).catch(() => setReady([])); }, []);

  // A "Review & create" click from the queue hands over the whole row.
  useEffect(() => {
    if (!prefill) return;
    setMode(prefill.mode || "manual");
    if (prefill.item) setSourceKey(`${prefill.item.source}-${prefill.item.sourceId}`);
  }, [prefill]);

  const sourceItems = ready.filter((r) => (mode === "idea" ? r.source === "idea" : r.source === "rise_application"));
  const item = mode === "manual" ? null
    : (prefill?.item && `${prefill.item.source}-${prefill.item.sourceId}` === sourceKey ? prefill.item : sourceItems.find((r) => `${r.source}-${r.sourceId}` === sourceKey)) || null;
  const type = mode === "manual" ? form.type : mode === "idea" ? "internal" : "startup";
  const clientId = mode === "manual" ? form.clientId : item?.clientId || "";

  // Pre-fill the editable fields from the picked idea / startup.
  useEffect(() => {
    if (!item) return;
    setForm((f) => ({
      ...f,
      title: item.source === "idea" ? item.title : `${item.title} — Pilot`,
      description: item.description || "",
      employeeUserId: item.source === "idea" && item.submittedById ? String(item.submittedById) : "",
    }));
    if (item.source === "rise_application") setPocForm((p) => ({ ...p, name: item.founderName || "", email: item.founderEmail || "" }));
  }, [sourceKey, item?.sourceId]);

  const [pocs, setPocs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [managers, setManagers] = useState([]);
  useEffect(() => {
    if (!clientId) { setPocs([]); setEmployees([]); return; }
    api.listBuildPocs(clientId).then((d) => setPocs(d.pocs || [])).catch(() => setPocs([]));
    api.listBuildEmployees(clientId).then((d) => setEmployees(d.employees || [])).catch(() => setEmployees([]));
  }, [clientId]);
  useEffect(() => { api.listBuildManagers().then((d) => setManagers(d.managers || [])).catch(() => setManagers([])); }, []);
  const clientManagers = managers.filter((m) => !clientId || (m.client_ids || []).map(Number).includes(Number(clientId)));

  // If the idea's submitter isn't an Employee login of this client, don't pre-select a ghost.
  useEffect(() => {
    if (form.employeeUserId && employees.length && !employees.some((e) => String(e.id) === String(form.employeeUserId))) {
      setForm((f) => ({ ...f, employeeUserId: "" }));
    }
  }, [employees]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null); setNotice(null); setPocCreds(null);
    try {
      if (mode !== "manual" && !item) throw new Error("Pick the idea or startup to build.");
      if (!form.title.trim()) throw new Error("A title is required.");
      if (!clientId) throw new Error("Pick the client.");
      if (!form.productOwnerUserId) throw new Error("Pick the Product Owner -- every project needs one.");
      if (type === "startup" && pocMode === "create" && (!pocForm.name.trim() || !pocForm.email.trim() || pocForm.password.length < 8)) {
        throw new Error("The Startup POC login needs a name, email, and an 8+ character temporary password.");
      }
      const people = {
        title: form.title.trim(), description: form.description, targetEnd: form.targetEnd || null,
        productOwnerUserId: form.productOwnerUserId, rivManagerId: form.rivManagerId || null,
        employeeUserId: type === "internal" ? form.employeeUserId || null : null,
      };
      let d;
      if (mode === "manual") d = await api.createBuildProject({ ...people, type, clientId });
      else if (mode === "idea") d = await api.createBuildProjectFromIdea(item.sourceId, people);
      else d = await api.createBuildProjectFromApplication(item.sourceId, { ...people, clientId });
      let text = `Created ${d.project.code}.`;
      if (type === "startup" && pocMode === "create") {
        await api.createBuildStartupPoc({ ...pocForm, projectId: d.project.id });
        setPocCreds({ email: pocForm.email, password: pocForm.password });
        text += ` Startup POC login created for ${pocForm.email} -- an invite email was attempted; the credentials are below as a backup.`;
      }
      setNotice(text);
      setSourceKey("");
      setForm({ type: "internal", title: "", description: "", clientId: "", targetEnd: "", productOwnerUserId: "", employeeUserId: "", rivManagerId: "" });
      setPocMode("later"); setPocForm({ name: "", email: "", password: "" });
      api.getReadyForBuild(false).then((r) => setReady(r.items || [])).catch(() => {});
      onCreated();
    } catch (e) {
      setError(e.message || "Couldn't create the project.");
    } finally { setSubmitting(false); }
  }

  const pickerHint = (list, what) => (!clientId ? "Choose the client first." : list.length ? undefined : `This client has no ${what} logins yet -- create one under Logins.`);

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Review & create a Build project</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["idea", "From Ideathon winner"], ["application", "From startup pilot"], ["manual", "By hand"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setMode(id); setSourceKey(""); }} style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "8px 12px", borderRadius: 999,
            border: `1px solid ${BRAND.line}`, cursor: "pointer", background: mode === id ? BRAND.ink : "#fff", color: mode === id ? "#fff" : BRAND.ink,
          }}>{label}</button>
        ))}
      </div>
      <form onSubmit={submit}>
        {mode !== "manual" && (
          <>
            <Field label={mode === "idea" ? "Selected idea" : "Selected startup"} required hint={sourceItems.length || item ? undefined : "Nothing is waiting in Ready for Build for this type."}>
              <select style={selectStyle} value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}>
                <option value="">— Choose —</option>
                {item && !sourceItems.some((r) => `${r.source}-${r.sourceId}` === sourceKey) && <option value={sourceKey}>{item.title} · {item.clientName}</option>}
                {sourceItems.map((r) => <option key={`${r.source}-${r.sourceId}`} value={`${r.source}-${r.sourceId}`}>{r.title} · {r.clientName}</option>)}
              </select>
            </Field>
            {item && (
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", background: BRAND.cream, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, lineHeight: 1.6 }}>
                <div><b style={{ color: BRAND.ink }}>Client:</b> {item.clientName}</div>
                {item.source === "idea" && <div><b style={{ color: BRAND.ink }}>Submitted by:</b> {item.submittedByName || "—"}</div>}
                {item.source === "idea" && <div><b style={{ color: BRAND.ink }}>Audit opportunity:</b> {item.auditQuestion || "Not linked to an audit question"}</div>}
                {item.source === "rise_application" && <div><b style={{ color: BRAND.ink }}>Founder:</b> {item.founderName || "—"}{item.founderEmail ? ` · ${item.founderEmail}` : ""}</div>}
                {item.source === "rise_application" && item.opportunityTitle && <div><b style={{ color: BRAND.ink }}>Call:</b> {item.opportunityTitle}</div>}
                {item.juryScore && <div><b style={{ color: BRAND.ink }}>Jury score:</b> {item.juryScore}</div>}
                <div><b style={{ color: BRAND.ink }}>Waiting:</b> {item.waitingDays != null ? `${item.waitingDays} days` : "—"}</div>
              </div>
            )}
          </>
        )}

        {mode === "manual" && (
          <>
            <Field label="Type" required>
              <select style={selectStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="internal">Internal idea (Enterprise Innovation)</option>
                <option value="startup">Startup pilot (Open Innovation)</option>
              </select>
            </Field>
            <ClientPicker label="Client" required hint="The client company this project belongs to." value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: v, productOwnerUserId: "", employeeUserId: "", rivManagerId: "" }))} />
          </>
        )}

        {(mode === "manual" || item) && (
          <>
            <Field label="Title" required><input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>

            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.ink, margin: "4px 0 10px" }}>People</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 16px" }}>
              <Field label="Product Owner" required hint={pickerHint(pocs, "Product Owner")}>
                <select style={selectStyle} value={form.productOwnerUserId} onChange={(e) => setForm((f) => ({ ...f, productOwnerUserId: e.target.value }))} disabled={!pocs.length}>
                  <option value="">— Choose —</option>
                  {pocs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                </select>
              </Field>
              {type === "internal" && (
                <Field label="Employee" hint={pickerHint(employees, "Employee") || (mode === "idea" ? "Defaults to the person who submitted the idea." : "Optional.")}>
                  <select style={selectStyle} value={form.employeeUserId} onChange={(e) => setForm((f) => ({ ...f, employeeUserId: e.target.value }))} disabled={!employees.length}>
                    <option value="">— None yet —</option>
                    {employees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                  </select>
                </Field>
              )}
              <Field label="RIV Client Partner" hint={clientId && !clientManagers.length ? "No Client Partner is assigned to this client yet." : "Optional."}>
                <select style={selectStyle} value={form.rivManagerId} onChange={(e) => setForm((f) => ({ ...f, rivManagerId: e.target.value }))}>
                  <option value="">— None —</option>
                  {clientManagers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </select>
              </Field>
              <Field label="Target end date"><input type="date" style={inputStyle} value={form.targetEnd} onChange={(e) => setForm((f) => ({ ...f, targetEnd: e.target.value }))} /></Field>
            </div>

            {type === "startup" && (
              <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, marginBottom: 8 }}>Startup POC login</div>
                <div style={{ display: "flex", gap: 16, marginBottom: pocMode === "create" ? 12 : 0 }}>
                  {[["create", "Create it now"], ["later", "Add later (Logins tab)"]].map(([id, label]) => (
                    <label key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, cursor: "pointer" }}>
                      <input type="radio" checked={pocMode === id} onChange={() => setPocMode(id)} /> {label}
                    </label>
                  ))}
                </div>
                {pocMode === "create" && (
                  <>
                    <Field label="Name" required><input style={inputStyle} value={pocForm.name} onChange={(e) => setPocForm((f) => ({ ...f, name: e.target.value }))} /></Field>
                    <Field label="Email" required><input type="email" style={inputStyle} value={pocForm.email} onChange={(e) => setPocForm((f) => ({ ...f, email: e.target.value }))} /></Field>
                    <Field label="Temporary password" required hint="8+ characters. They change it on first login. They'll never see PO or contract amounts."><input style={inputStyle} value={pocForm.password} onChange={(e) => setPocForm((f) => ({ ...f, password: e.target.value }))} /></Field>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {notice && <Notice text={notice} />}
        {pocCreds && (
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, background: BRAND.cream, border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "10px 12px", marginBottom: 16 }}>
            Startup POC credentials — email: <b>{pocCreds.email}</b>, temporary password: <b>{pocCreds.password}</b>. An invite email was attempted; keep these as a backup.
          </div>
        )}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : Plus}>{submitting ? "Creating…" : "Create project"}</PrimaryButton>
      </form>
    </Card>
  );
}

// "Ready for Build" queue (mockup screen 5): ideas / startups that cleared
// selection but have no Build project yet. Review & create, Not now (hide
// 14 days), or Decline (with a reason; doesn't come back).
function ReadyForBuildPanel({ onReview }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [showDeferred, setShowDeferred] = useState(false);
  const [declining, setDeclining] = useState(null);
  const [declineReason, setDeclineReason] = useState("");

  function load(includeDeferred = showDeferred) {
    api.getReadyForBuild(includeDeferred).then((d) => setItems(d.items || [])).catch((e) => setError(e.message || "Couldn't load the queue."));
  }
  useEffect(() => { load(showDeferred); }, [showDeferred]);

  async function defer(it, days) {
    await api.deferReadyForBuild(it.source, it.sourceId, days);
    load(showDeferred);
  }
  async function decline() {
    try {
      await api.declineReadyForBuild(declining.source, declining.sourceId, declineReason.trim());
      setDeclining(null); setDeclineReason("");
      load(showDeferred);
    } catch (e) { setError(e.message || "Couldn't decline."); }
  }

  if (error) return <ErrorBanner text={error} />;
  if (!items) return <Spinner label="Loading queue…" />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, color: "#7A746F", cursor: "pointer" }}>
          <input type="checkbox" checked={showDeferred} onChange={(e) => setShowDeferred(e.target.checked)} /> Show "Not now" items too
        </label>
      </div>
      {declining && (
        <Card style={{ padding: 16, marginBottom: 12, borderColor: "#F3C6C6" }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: BRAND.ink, marginBottom: 8 }}>Decline “{declining.title}”</div>
          <Field label="Reason" required hint="It leaves the queue for good. Use Not now if it might come back.">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton disabled={!declineReason.trim()} onClick={decline}>Decline</PrimaryButton>
            <GhostButton onClick={() => setDeclining(null)}>Cancel</GhostButton>
          </div>
        </Card>
      )}
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing waiting" text="Every selected idea and startup pilot already has a Build project." />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead><tr style={{ background: BRAND.cream, textAlign: "left" }}>
                {["Source", "Item", "Client", "Selected", "Waiting", "Jury score", ""].map((h) => (
                  <th key={h} style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7A746F", textTransform: "uppercase", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {items.map((it) => {
                  const isDeferred = it.deferredUntil && new Date(it.deferredUntil) > new Date();
                  return (
                    <tr key={`${it.source}-${it.sourceId}`} style={isDeferred ? { opacity: 0.6 } : undefined}>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 11.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap" }}>
                        {it.source === "idea" ? "Ideathon" : "Startup pilot"}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 13, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}` }}>
                        {it.title}
                        {isDeferred && <span style={{ marginLeft: 8, fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>· Not now until {fmtDate(it.deferredUntil)}</span>}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{it.clientName}</td>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap" }}>{fmtDate(it.selectedAt)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}`, color: it.waitingDays > 14 ? "#C13B3B" : "#7A746F", fontWeight: it.waitingDays > 14 ? 700 : 400, whiteSpace: "nowrap" }}>
                        {it.waitingDays != null ? `${it.waitingDays}d` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{it.juryScore ?? "—"}</td>
                      <td style={{ padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                        <GhostButton onClick={() => onReview(it)}>Review & create</GhostButton>
                        {isDeferred
                          ? <GhostButton onClick={() => defer(it, 0)}>Un-defer</GhostButton>
                          : <GhostButton onClick={() => defer(it, 14)}>Not now</GhostButton>}
                        <GhostButton onClick={() => { setDeclining(it); setDeclineReason(""); }} style={{ color: "#C13B3B" }}>Decline</GhostButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// Previously every field here was a raw numeric-ID text box -- Project ID,
// Owner user ID, Client POC user ID, RIV Client Partner user ID -- none of which
// were ever shown anywhere in the app. In practice that meant projects got
// created with no POC assigned at all (CreateProjectPanel doesn't collect
// one either), so a product_owner login would see a project in its list
// but have no way to post updates on it, with no way for an admin to
// notice or fix it short of a database query. Now: pick the project from
// a dropdown (code + title), and Product Owner/RIV Client Partner from dropdowns
// of the real logins that exist for that project's client -- the numeric
// IDs still travel underneath, they're just never something a person has
// to find or type. The old "project owner" relationship (owner_user_id)
// was retired in the Oct 2026 "Proposed Screens" redesign -- merged into
// Product Owner -- so that field is gone. Startup POC stays a numeric
// field for now (no listing/picker built for it yet; it's also only ever
// used for startup-type projects).
function AssignPanel() {
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState({ productOwnerUserId: "", rivManagerId: "", startupPocUserId: "", employeeUserId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api.listBuildProjects().then((d) => setProjects(d.projects || [])).catch(() => setProjects(null));
  }, []);

  const selectedProject = (projects || []).find((p) => String(p.id) === String(projectId));
  const [pocs, setPocs] = useState(null);
  const [managers, setManagers] = useState(null);
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    if (!selectedProject) { setPocs(null); setManagers(null); setEmployees([]); return; }
    api.listBuildPocs(selectedProject.client_id).then((d) => setPocs(d.pocs || [])).catch(() => setPocs(null));
    api.listBuildEmployees(selectedProject.client_id).then((d) => setEmployees(d.employees || [])).catch(() => setEmployees([]));
    api.listBuildManagers().then((d) => setManagers(d.managers || [])).catch(() => setManagers(null));
  }, [selectedProject?.id]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null); setNotice(null);
    try {
      await api.assignBuildProject(projectId, {
        productOwnerUserId: form.productOwnerUserId || undefined, rivManagerId: form.rivManagerId || undefined,
        startupPocUserId: form.startupPocUserId || undefined,
        employeeUserId: form.employeeUserId || undefined,
      });
      setNotice("Assignment saved.");
    } catch (e) {
      setError(e.message || "Couldn't save the assignment.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Assign people to a project</div>
      <form onSubmit={submit}>
        <Field label="Project" required>
          {projects && projects.length ? (
            <select style={selectStyle} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— Choose a project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Numeric project ID" />
          )}
        </Field>

        <Field label="Product Owner" hint={selectedProject ? undefined : "Choose a project first."}>
          {pocs && pocs.length ? (
            <select style={selectStyle} value={form.productOwnerUserId} onChange={(e) => setForm((f) => ({ ...f, productOwnerUserId: e.target.value }))}>
              <option value="">— No change —</option>
              {pocs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={form.productOwnerUserId} onChange={(e) => setForm((f) => ({ ...f, productOwnerUserId: e.target.value }))} placeholder={selectedProject ? "This client has no Product Owner logins yet -- create one under Logins." : "Numeric Product Owner user ID"} />
          )}
        </Field>

        {selectedProject?.type === "internal" && (
          <Field label="Employee" hint={employees.length ? "One Employee per Enterprise project." : "This client has no Employee logins yet."}>
            <select style={selectStyle} value={form.employeeUserId} onChange={(e) => setForm((f) => ({ ...f, employeeUserId: e.target.value }))} disabled={!employees.length}>
              <option value="">— No change —</option>
              {employees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          </Field>
        )}

        {selectedProject?.type === "startup" && (
          <Field label="Startup POC" hint="No picker for this one yet -- there's no listing of candidate Startup POC accounts in the app.">
            <input style={inputStyle} value={form.startupPocUserId} onChange={(e) => setForm((f) => ({ ...f, startupPocUserId: e.target.value }))} placeholder="Numeric Startup POC user ID" />
          </Field>
        )}

        <Field label="RIV Client Partner">
          {managers && managers.length ? (
            <select style={selectStyle} value={form.rivManagerId} onChange={(e) => setForm((f) => ({ ...f, rivManagerId: e.target.value }))}>
              <option value="">— No change —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={form.rivManagerId} onChange={(e) => setForm((f) => ({ ...f, rivManagerId: e.target.value }))} placeholder="Numeric RIV Client Partner user ID" />
          )}
        </Field>

        {notice && <Notice text={notice} />}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={submitting || !projectId}>{submitting ? "Saving…" : "Save assignment"}</PrimaryButton>
      </form>
    </Card>
  );
}

function PeoplePanel() {
  const [pocs, setPocs] = useState([]);
  const [managers, setManagers] = useState([]);
  const [pocForm, setPocForm] = useState({ email: "", password: "", name: "", clientId: "" });
  const [mgrForm, setMgrForm] = useState({ email: "", password: "", name: "", clientIds: [] }); // array of client id strings
  const mgrClients = useClientOptions();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function load() {
    api.listBuildPocs().then((d) => setPocs(d.pocs || [])).catch(() => {});
    api.listBuildManagers().then((d) => setManagers(d.managers || [])).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function createPoc(e) {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api.createBuildPoc(pocForm);
      setPocForm({ email: "", password: "", name: "", clientId: "" });
      setNotice(`Product Owner login created for ${pocForm.email}. An invite email was attempted; keep the temporary password handy as a backup.`);
      load();
    } catch (e) { setError(e.message || "Couldn't create that login."); }
  }
  async function createManager(e) {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api.createBuildManager(mgrForm); // clientIds is already an array of id strings
      setMgrForm({ email: "", password: "", name: "", clientIds: [] });
      setNotice(`RIV Client Partner login created for ${mgrForm.email}. An invite email was attempted; keep the temporary password handy as a backup.`);
      load();
    } catch (e) { setError(e.message || "Couldn't create that login."); }
  }
  function toggleMgrClient(id) {
    setMgrForm((f) => ({
      ...f,
      clientIds: f.clientIds.includes(id) ? f.clientIds.filter((x) => x !== id) : [...f.clientIds, id],
    }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}><Users size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Client POC logins</div>
        <form onSubmit={createPoc}>
          <Field label="Name" required><input style={inputStyle} value={pocForm.name} onChange={(e) => setPocForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={pocForm.email} onChange={(e) => setPocForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required><input style={inputStyle} value={pocForm.password} onChange={(e) => setPocForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <ClientPicker label="Client" required value={pocForm.clientId} onChange={(v) => setPocForm((f) => ({ ...f, clientId: v }))} />
          <PrimaryButton type="submit" icon={Plus}>Create login</PrimaryButton>
        </form>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {pocs.map((p) => (
            <div key={p.id} style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, display: "flex", justifyContent: "space-between" }}>
              <span>{p.name} · {p.email}</span>
              <button onClick={async () => { await api.deleteBuildPoc(p.id); load(); }} style={{ background: "none", border: "none", color: "#C13B3B", cursor: "pointer" }}><X size={13} /></button>
            </div>
          ))}
        </div>
      </Card>
      <Card style={{ padding: 20 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}><Briefcase size={14} style={{ marginRight: 6, verticalAlign: -2 }} />RIV Client Partner logins</div>
        <form onSubmit={createManager}>
          <Field label="Name" required><input style={inputStyle} value={mgrForm.name} onChange={(e) => setMgrForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={mgrForm.email} onChange={(e) => setMgrForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required><input style={inputStyle} value={mgrForm.password} onChange={(e) => setMgrForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          {mgrClients && mgrClients.length ? (
            <Field label="Assigned clients" hint="Which clients this RIV Client Partner can see Build projects for.">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 140, overflowY: "auto", border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "8px 10px" }}>
                {mgrClients.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>
                    <input type="checkbox" checked={mgrForm.clientIds.includes(String(c.id))} onChange={() => toggleMgrClient(String(c.id))} />
                    {c.company || c.name} (ID {c.id})
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="Assigned client IDs" hint="Comma-separated numeric IDs -- find them on each client's card under Manage Clients.">
              <input style={inputStyle} value={mgrForm.clientIds.join(",")} onChange={(e) => setMgrForm((f) => ({ ...f, clientIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} />
            </Field>
          )}
          <PrimaryButton type="submit" icon={Plus}>Create login</PrimaryButton>
        </form>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {managers.map((m) => (
            <div key={m.id} style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, display: "flex", justifyContent: "space-between" }}>
              <span>{m.name} · {m.email} ({(m.client_names || []).filter(Boolean).join(", ") || "no clients"})</span>
              <button onClick={async () => { await api.deleteBuildManager(m.id); load(); }} style={{ background: "none", border: "none", color: "#C13B3B", cursor: "pointer" }}><X size={13} /></button>
            </div>
          ))}
        </div>
      </Card>
      {(error || notice) && <div style={{ gridColumn: "1 / -1" }}>{notice && <Notice text={notice} />}{error && <ErrorBanner text={error} />}</div>}
    </div>
  );
}

// Build-scoped Client Leader logins -- separate from the main RIOS site's
// own "Manage Clients" (which creates a client with full access to the
// audit/Discover Assessment too). A client created here is still the
// Client Leader for whatever Build projects get assigned to it, but only
// ever sees Build.RIV -- the main site refuses the audit/scorecard routes
// for it server-side (routes/responses.js, routes/export.js), not just
// hides the nav button.
// Laid out the same way the main site's own Manage Clients page is
// (App.jsx's AdminView) -- a prominent list of bordered client cards on
// the left, the create form as a compact sidebar on the right -- rather
// than the smaller roster treatment PeoplePanel uses for POC/RIV Client Partner
// logins. These are full client accounts (same weight as a regular
// client), just scoped to Build, so they read as such.
function ManageBuildClientsPanel() {
  const [clients, setClients] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "" });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    api.listBuildClients().then((d) => setClients(d.clients || [])).catch(() => setClients([]));
  }
  useEffect(() => { load(); }, []);

  async function createClient(e) {
    e.preventDefault();
    setError(null); setNotice(null); setSubmitting(true);
    try {
      await api.createBuildClient(form);
      setForm({ name: "", email: "", password: "", company: "" });
      setNotice(`Login created for ${form.name}${form.company ? ` (${form.company})` : ""}. An invite email was attempted; keep the temporary password handy as a backup.`);
      load();
    } catch (e) {
      setError(e.message || "Couldn't create that login.");
    } finally { setSubmitting(false); }
  }

  async function removeClient(c) {
    if (!confirm(`Remove ${c.company || c.name}'s Build-only login? They'll lose access to their project(s).`)) return;
    await api.deleteBuildClient(c.id);
    load();
  }

  async function resetPassword(c) {
    const pw = window.prompt(`New temporary password for ${c.name || c.email} (at least 8 characters).\nThey will be asked to choose their own when they next log in.`);
    if (pw === null) return;
    if (pw.length < 8) { setError("The temporary password must be at least 8 characters."); return; }
    try {
      await api.adminResetPassword(c.id, pw);
      setError(null);
      setNotice(`Password reset for ${c.name || c.email}. Share the new temporary password with them.`);
    } catch (e) { setError(e.message || "Couldn't reset that password."); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
      <div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: BRAND.ink, marginBottom: 4 }}>Build-only client logins</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 16, lineHeight: 1.5 }}>
          Client Leader logins scoped to Build.RIV only -- no access to the Discover Assessment or My Scorecard,
          unlike a client created from the main site's Manage Clients.
        </div>
        {clients === null ? (
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>Loading…</div>
        ) : clients.length === 0 ? (
          <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 24, fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>
            No Build-only client logins yet -- create one on the right.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clients.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14.5, color: BRAND.ink }}>{c.company || c.name}</div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                    {c.name} · {c.email} · <span style={{ color: "#B7B2AE" }}>ID {c.id}</span>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: BRAND.coral, marginTop: 4, fontWeight: 600 }}>Build.RIV only</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => resetPassword(c)} title="Reset password" style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.ink }}><KeyRound size={14} /></button>
                  <button onClick={() => removeClient(c)} title="Remove" style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: "#C13B3B" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card style={{ padding: 20, height: "fit-content" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 14 }}>
          <Building2 size={15} /> New Build-only client login
        </div>
        <form onSubmit={createClient}>
          <Field label="Contact name" required><input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Company"><input style={inputStyle} value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required hint="At least 8 characters."><input style={inputStyle} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          {notice && <Notice text={notice} />}
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" icon={Plus} disabled={submitting} style={{ width: "100%" }}>{submitting ? "Creating…" : "Create login"}</PrimaryButton>
        </form>
      </Card>
    </div>
  );
}

function OverdueDigestPanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setRunning(true); setError(null); setResult(null);
    try {
      const d = await api.runBuildOverdueCheck();
      setResult(d);
    } catch (e) { setError(e.message || "Couldn't run the check."); } finally { setRunning(false); }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 8 }}>Overdue-update digest</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 12, lineHeight: 1.6 }}>
        Notifies each overdue project's POC and RIV Client Partner, and sends admins one digest. A daily GitHub Actions
        workflow now calls this automatically via a cron-secret-gated endpoint (<code>/api/cron/build-overdue-check</code>) —
        this button is for running it on demand in between.
      </div>
      {result && <Notice text={`${result.overdueCount} project(s) overdue${result.codes?.length ? `: ${result.codes.join(", ")}` : "."}`} />}
      <ErrorBanner text={error} />
      <PrimaryButton onClick={run} disabled={running} icon={running ? Loader2 : undefined}>{running ? "Running…" : "Run overdue check now"}</PrimaryButton>
    </Card>
  );
}

// "Requests from Client Partners" (mockup page 5) -- open, free-text asks a
// Client Leader raised on one of their projects (see ProjectDetailView's
// "Raise a request" control), newest first, with a Resolve action.
function RequestsPanel() {
  const [requests, setRequests] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState(null);

  function load() {
    api.getBuildRequests(showAll ? "all" : undefined).then((d) => setRequests(d.requests || [])).catch((e) => setError(e.message || "Couldn't load requests."));
  }
  useEffect(() => { load(); }, [showAll]);

  async function resolve(id) {
    await api.resolveBuildRequest(id);
    load();
  }
  const [deciding, setDeciding] = useState(null); // { r, action: 'approve'|'reject' }
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState(null);
  async function decide() {
    try {
      if (deciding.action === "approve") { await api.approveBuildDelete(deciding.r.id, note); setNotice(`${deciding.r.project_code} was deleted.`); }
      else { await api.rejectBuildDelete(deciding.r.id, note); setNotice(`Delete request for ${deciding.r.project_code} rejected; the Client Partner was told.`); }
      setDeciding(null); setNote(""); load();
    } catch (e) { setError(e.message || "That didn't work."); }
  }

  if (error) return <ErrorBanner text={error} />;
  if (!requests) return <Spinner label="Loading requests…" />;
  const deleteRequests = requests.filter((r) => r.kind === "delete");
  const otherRequests = requests.filter((r) => r.kind !== "delete");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, color: "#7A746F", cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show resolved too
        </label>
      </div>
      <Notice text={notice} />
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, margin: "4px 0 10px" }}>Delete requests from Client Partners</div>
      {deleteRequests.length === 0 ? (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 20 }}>No delete requests waiting.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {deleteRequests.map((r) => (
            <Card key={r.id} style={{ padding: 16, borderColor: r.status === "open" ? "#F3C6C6" : BRAND.line }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink }}>
                    <span style={{ color: BRAND.coralDark }}>{r.project_code}</span> {r.project_title}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>
                    {r.client_name} · asked by {r.requested_by_name || "Client Partner"} · {fmtDate(r.created_at)}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, marginTop: 8 }}><b>Reason:</b> {r.message}</div>
                  {r.status === "rejected" && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#7A746F", marginTop: 6 }}>Rejected by {r.resolved_by_name || "an admin"} · {fmtDate(r.resolved_at)}{r.resolution ? ` · ${r.resolution}` : ""}</div>}
                </div>
                {r.status === "open" && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <GhostButton onClick={() => { setDeciding({ r, action: "approve" }); setNote(""); }} style={{ color: "#C13B3B" }}>Approve & delete</GhostButton>
                    <GhostButton onClick={() => { setDeciding({ r, action: "reject" }); setNote(""); }}>Reject</GhostButton>
                  </div>
                )}
              </div>
              {deciding?.r.id === r.id && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${BRAND.line}`, paddingTop: 14 }}>
                  {deciding.action === "approve" && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#C13B3B", marginBottom: 10 }}>This permanently deletes {r.project_code} with all its updates, files and history.</div>}
                  <Field label={deciding.action === "approve" ? "Note (optional)" : "Note to the Client Partner (optional)"}>
                    <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <div style={{ display: "flex", gap: 10 }}>
                    <PrimaryButton onClick={decide}>{deciding.action === "approve" ? "Delete permanently" : "Reject request"}</PrimaryButton>
                    <GhostButton onClick={() => setDeciding(null)}>Cancel</GhostButton>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, margin: "4px 0 10px" }}>Requests from Client Leaders</div>
      {otherRequests.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing open" text="No Client Leader has an open request right now." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {otherRequests.map((r) => (
            <Card key={r.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink }}>
                    <span style={{ color: BRAND.coralDark }}>{r.project_code}</span> {r.project_title}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>
                    {r.client_name} · {r.requested_by_name || "Client Leader"} · {fmtDate(r.created_at)}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, marginTop: 8 }}>{r.message}</div>
                  {r.status === "resolved" && (
                    <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#1B7A5A", marginTop: 6 }}>✓ Resolved by {r.resolved_by_name || "an admin"} · {fmtDate(r.resolved_at)}</div>
                  )}
                </div>
                {r.status === "open" && <GhostButton onClick={() => resolve(r.id)}>Mark resolved</GhostButton>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminConsoleView({ reload }) {
  const [tab, setTab] = useState("ready");
  const [prefill, setPrefill] = useState(null);
  const tabs = [
    { id: "ready", label: "Ready for Build" },
    { id: "requests", label: "Requests" },
    { id: "create", label: "Create project" },
    { id: "assign", label: "Assign people" },
    { id: "people", label: "Logins" },
    { id: "clients", label: "Manage Clients" },
    { id: "overdue", label: "Overdue digest" },
  ];
  function reviewItem(it) {
    setPrefill({ mode: it.source === "idea" ? "idea" : "application", item: it, key: `${it.source}-${it.sourceId}-${Date.now()}` });
    setTab("create");
  }
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Build admin console</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 20 }}>Create and assign projects, and manage the login types unique to Build.</div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 20, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${BRAND.coral}` : "2px solid transparent",
            color: tab === t.id ? BRAND.ink : "#9B958F", cursor: "pointer", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "ready" && <ReadyForBuildPanel onReview={reviewItem} />}
      {tab === "requests" && <RequestsPanel />}
      {tab === "create" && <CreateProjectPanel onCreated={reload} prefill={prefill} />}
      {tab === "assign" && <AssignPanel />}
      {tab === "people" && <PeoplePanel />}
      {tab === "clients" && <ManageBuildClientsPanel />}
      {tab === "overdue" && <OverdueDigestPanel />}
    </div>
  );
}

/* =========================================================================
   MY WORK -- Screen 5 of the Oct 2026 "Proposed Screens" redesign: a
   personal homepage every logged-in Build role lands on. Backed by
   GET /api/build/my-work, which scopes "my projects" narrower than the
   Projects list does (personally assigned, not "my whole client's
   portfolio") and derives next actions honestly from existing data --
   see the route's own comments for what the mockup asked for that this
   deliberately does NOT fabricate (no discrete "pending upload" events
   exist in the schema, so there's no "review the uploaded NDA" action
   type here, only "add a status update" / "complete the stage").
   ========================================================================= */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function MyWorkTile({ label, value, tone }) {
  const fg = tone === "bad" ? "#C13B3B" : tone === "warn" ? BRAND.coralDark : BRAND.ink;
  return (
    <Card style={{ padding: "16px 18px", flex: 1, minWidth: 130 }}>
      <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: "#9B958F", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: fg }}>{value}</div>
    </Card>
  );
}

function MyWorkActionRow({ a, onOpenProject }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "14px 0", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 2 }}>{a.code} · {a.title}</div>
        <div style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: BRAND.ink }}>{a.title2}</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginTop: 3 }}>{a.detail}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {a.urgent && (
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#C13B3B", background: "#FBEAEA", padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>Overdue</span>
        )}
        <GhostButton onClick={() => onOpenProject(a.projectId)}>Review</GhostButton>
      </div>
    </div>
  );
}

function MyWorkProjectCard({ p, onOpenProject }) {
  const pct = p.stagePosition && p.stageCount ? Math.round((p.stagePosition / p.stageCount) * 100) : 0;
  return (
    <div onClick={() => onOpenProject(p.id)} style={{ cursor: "pointer", padding: "12px 0", borderBottom: `1px solid ${BRAND.line}` }} className="build-row">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH_COLORS[p.health]?.fg || "#9B958F", flexShrink: 0 }} />
      </div>
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>
        {p.code} · {p.type === "startup" ? "Startup" : "Internal"} · {p.stageLabel}{p.stagePosition ? ` · ${p.stagePosition} of ${p.stageCount}` : ""}
      </div>
      <div style={{ height: 5, borderRadius: 999, background: BRAND.cream, marginTop: 7, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: BRAND.coral, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function MyWorkView({ session, onOpenProject }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api.getMyWork().then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e.message || "Couldn't load My work."); });
    return () => { live = false; };
  }, []);

  if (error) {
    return <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px" }}><ErrorBanner text={error} /></div>;
  }
  if (!data) return <Spinner label="Loading your work…" />;

  const { summary, nextActions, myProjects, recentlyChanged } = data;
  const firstName = (session.name || "").split(" ")[0] || session.name;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink, marginBottom: 4 }}>{greeting()}, {firstName}</div>
      <div style={{ fontFamily: FONT, fontSize: 13.5, color: "#9B958F", marginBottom: 22 }}>
        {summary.toDo > 0 ? `${summary.toDo} thing${summary.toDo === 1 ? "" : "s"} need${summary.toDo === 1 ? "s" : ""} you this week.` : "Nothing urgent needs you right now."}
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <MyWorkTile label="To do" value={summary.toDo} tone={summary.toDo > 0 ? "warn" : undefined} />
        <MyWorkTile label="Update overdue" value={summary.updateOverdue} tone={summary.updateOverdue > 0 ? "bad" : undefined} />
        <MyWorkTile label="Red or amber" value={summary.redAmber} tone={summary.redAmber > 0 ? "bad" : undefined} />
        <MyWorkTile label="My projects" value={`${summary.myProjects} (${summary.internalCount} internal, ${summary.startupCount} startup)`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "flex-start" }}>
        <div>
          <Card style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink, marginBottom: 4 }}>Your next actions</div>
            {nextActions.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing assigned to you yet" text="When a project needs an update from you, or has gaps in its current stage, it'll show up here." />
            ) : (
              <div>{nextActions.map((a, i) => <MyWorkActionRow key={i} a={a} onOpenProject={onOpenProject} />)}</div>
            )}
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink, marginBottom: 10 }}>Recently changed on your projects</div>
            {(!recentlyChanged || recentlyChanged.length === 0) ? (
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>Nothing yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {recentlyChanged.map((f, i) => (
                  <li key={i} style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginBottom: 8, lineHeight: 1.5 }}>
                    {f.text} <span style={{ color: "#B7B2AE" }}>· {fmtDate(f.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card style={{ padding: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink, marginBottom: 6 }}>My projects</div>
          {myProjects.length === 0 ? (
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>No projects assigned to you yet.</div>
          ) : (
            <div>{myProjects.map((p) => <MyWorkProjectCard key={p.id} p={p} onOpenProject={onOpenProject} />)}</div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* =========================== ROOT =========================== */
export default function BuildRivApp() {
  const [view, setView] = useState(() => pathToBuildView(window.location.pathname));
  const [session, setSessionState] = useState(getStoredBuildUser());
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    function onPopState() { setView(pathToBuildView(window.location.pathname)); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function handleAuthed(token, user) {
    setBuildSession(token, user);
    setSessionState(user);
    // Mockup screen 2: everyone lands on their own "My work" page after login.
    window.history.pushState(null, "", "/build/my-work");
    setView("my-work");
  }
  function handleLogout() {
    clearBuildSession(); clearAllSessions();
    setSessionState(null);
    window.history.pushState(null, "", "/build");
    setView("projects");
  }
  function goToView(v) {
    const path = BUILD_VIEW_TO_PATH[v];
    if (path) window.history.pushState(null, "", path);
    setView(v);
    setActiveProjectId(null);
  }

  const canSeeDashboard = session && ["admin", "client", "product_owner", "riv_manager"].includes(session.role);
  // Approved workflow v2: the Admin console (Ready for Build, project
  // creation, people, delete approvals) is RIV Admin only. A Client Partner
  // works inside their assigned projects and asks the Admin for the rest.
  const canSeeAdmin = session && session.role === "admin";

  // Build spans roles with no login of their own here (client leader,
  // admin -- App.jsx seeds their session on the way in) and the ones that
  // do (product_owner, riv_manager, startup_poc). No session at all means
  // the person hasn't authenticated through either path yet.
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
        @media print {
          .build-nav, .build-dashboard-no-print { display: none !important; }
          body, .build-dashboard-no-print ~ * { background: #fff !important; }
        }
      `}</style>
      <BuildNavBar view={view} setView={goToView} session={session} onLogout={handleLogout} canSeeDashboard={canSeeDashboard} canSeeAdmin={canSeeAdmin} />

      {view === "my-work" && (
        <MyWorkView
          session={session}
          onOpenProject={(id) => {
            window.history.pushState(null, "", BUILD_VIEW_TO_PATH.projects);
            setView("projects");
            setActiveProjectId(id);
          }}
        />
      )}
      {view === "projects" && !activeProjectId && (
        <ProjectListView key={listKey} session={session} onOpen={(id) => setActiveProjectId(id)} onNewProject={canSeeAdmin ? () => goToView("admin") : null} />
      )}
      {view === "projects" && activeProjectId && (
        <ProjectDetailView projectId={activeProjectId} session={session} onBack={() => { setActiveProjectId(null); setListKey((k) => k + 1); }} />
      )}
      {view === "dashboard" && canSeeDashboard && (
        <DashboardView
          session={session}
          onOpenProject={(id) => {
            window.history.pushState(null, "", BUILD_VIEW_TO_PATH.projects);
            setView("projects");
            setActiveProjectId(id);
          }}
        />
      )}
      {view === "admin" && canSeeAdmin && <AdminConsoleView reload={() => setListKey((k) => k + 1)} />}
    </div>
  );
}
