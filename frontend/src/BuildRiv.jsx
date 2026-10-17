import React, { useState, useEffect, useMemo } from "react";
import {
  Hammer, LogOut, ArrowRight, ChevronLeft, Loader2, AlertCircle, Briefcase,
  LayoutDashboard, Settings, Plus, CheckCircle2, Paperclip, Download, Upload,
  History, FileText, Users, Building2, Gauge, Search, X,
} from "lucide-react";
import {
  api, divertIfTemporaryPassword, getStoredBuildUser, getToken,
  setBuildSession, clearBuildSession, clearAllSessions,
} from "./api.js";
import { BRAND } from "./brand.js";

// Build.RIV's own tabs, each with a real URL -- same pattern as RiseRiv.jsx.
// BuildRivApp owns all routing beneath "/build" once mounted; the outer
// App.jsx only knows every one of these maps to its single "build-riv"
// container view (see OUTER_PATH_TO_VIEW in App.jsx).
const BUILD_PATH_TO_VIEW = { "/build": "projects", "/build/projects": "projects", "/build/dashboard": "dashboard", "/build/admin": "admin" };
const BUILD_VIEW_TO_PATH = { projects: "/build/projects", dashboard: "/build/dashboard", admin: "/build/admin" };
function pathToBuildView(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/build";
  return BUILD_PATH_TO_VIEW[path] || "projects";
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
function BuildNavBar({ view, setView, session, onLogout, canSeeDashboard, canSeeAdmin }) {
  const items = [{ id: "projects", label: "Projects" }];
  if (canSeeDashboard) items.push({ id: "dashboard", label: "Dashboard" });
  if (canSeeAdmin) items.push({ id: "admin", label: "Admin" });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>
            <Hammer size={18} color={BRAND.coral} /> Build
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {/* Real link back to the main site's Overview page -- this
                module doesn't render inside the main site's own header. */}
            <a href="/" style={{
              fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
              textDecoration: "none", color: BRAND.ink, display: "inline-block",
            }}>Overview</a>
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
            <GhostButton onClick={onLogout} icon={LogOut}>{session.name}</GhostButton>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>Not logged in</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN -- for client_poc / riv_manager (Build.RIV's two new login types,
   same top-down-issued-login convention as every other role in RIOS). A
   client leader or admin arriving here is normally already authenticated
   through the main site (App.jsx seeds Build's session on the way in), so
   this screen is mostly what client_poc/riv_manager actually see.
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
   PROJECT LIST (PRD 8.1)
   ========================================================================= */
function ProjectListView({ session, onOpen }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ type: "", stage: "", health: "", status: "", q: "" });

  useEffect(() => {
    setLoading(true);
    api.listBuildProjects(filters)
      .then((d) => setProjects(d.projects || []))
      .catch((e) => setError(e.message || "Couldn't load projects."))
      .finally(() => setLoading(false));
  }, [filters.type, filters.stage, filters.health, filters.status, filters.q]);

  const STAGE_OPTIONS = ["requirements", "agreement", "design", "build", "test", "pilot", "scale", "closed"];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>Build projects</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 4 }}>Ideathon winners and startup pilots tracked from Requirements through to Closed.</div>
        </div>
      </div>

      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <Search size={14} color="#9B958F" style={{ position: "absolute", left: 11, top: 11 }} />
            <input
              placeholder="Search by code or title…" value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>
          <select style={{ ...selectStyle, flex: "0 1 140px" }} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
            <option value="">All types</option>
            <option value="internal">Internal</option>
            <option value="startup">Startup</option>
          </select>
          <select style={{ ...selectStyle, flex: "0 1 160px" }} value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}>
            <option value="">All stages</option>
            {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select style={{ ...selectStyle, flex: "0 1 140px" }} value={filters.health} onChange={(e) => setFilters((f) => ({ ...f, health: e.target.value }))}>
            <option value="">All health</option>
            <option value="on_track">On track</option>
            <option value="at_risk">At risk</option>
            <option value="off_track">Off track</option>
          </select>
          <select style={{ ...selectStyle, flex: "0 1 140px" }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="stopped">Stopped</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </Card>

      <ErrorBanner text={error} />
      {loading ? <Spinner label="Loading projects…" /> : projects.length === 0 ? (
        <EmptyState icon={Briefcase} title="No projects yet" text="Projects created from Ideathon winners, Startup pilots, or added manually by a RIV admin will show up here." />
      ) : (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: "left", background: BRAND.cream }}>
                  {["Code", "Title", "Type", "Client", "Stage", "Health", "Status", "Owner", "Last update"].map((h) => (
                    <th key={h} style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: "#7A746F", textTransform: "uppercase", letterSpacing: "0.03em", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer" }} className="build-row">
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coralDark, borderBottom: `1px solid ${BRAND.line}` }}>{p.code}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 13, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}`, maxWidth: 260 }}>{p.title}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, textTransform: "capitalize" }}>{p.type}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.client_company || p.client_name || "—"}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}`, textTransform: "capitalize" }}>{p.stageLabel || p.stage}</td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${BRAND.line}` }}><HealthBadge health={p.health} size="sm" /></td>
                    <td style={{ padding: "12px 14px", borderBottom: `1px solid ${BRAND.line}` }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.owner_name || "—"}</td>
                    <td style={{ padding: "12px 14px", fontFamily: FONT, fontSize: 12.5, borderBottom: `1px solid ${BRAND.line}`, color: p.updateOverdue ? "#C13B3B" : "#7A746F", fontWeight: p.updateOverdue ? 700 : 400 }}>
                      {p.updateOverdue ? "Overdue" : fmtDate(p.last_update_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* =========================================================================
   PROJECT DETAIL -- header + tabs (Overview, Status updates, ROI, Lessons
   learned, Files, History) and the stage-action buttons (PRD 8, 6, 7).
   ========================================================================= */
function StageActions({ project, missing, gateApprovers, session, onAction, busy }) {
  const [reasonModal, setReasonModal] = useState(null); // 'send-back' | 'hold' | 'stop' | 'close' | 'pilot-iterate' | 'pilot-stop'
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("scaled");

  if (!project || project.stage === "closed" && project.status === "closed") {
    return <Notice text="This project is closed." />;
  }

  function submitReason(kind) {
    if (kind === "send-back") onAction("sendBack", { reason });
    else if (kind === "hold") onAction("hold", { reason });
    else if (kind === "stop") onAction("stop", { reason });
    else if (kind === "close") onAction("close", { outcome });
    else if (kind === "pilot-iterate") onAction("pilotDecision", { decision: "iterate", reason });
    else if (kind === "pilot-stop") onAction("pilotDecision", { decision: "stop", reason });
    setReasonModal(null); setReason("");
  }

  return (
    <Card style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 10 }}>Stage actions</div>
      {gateApprovers?.length > 0 && (
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 10 }}>
          Approver for this gate: {gateApprovers.join(", ")}
        </div>
      )}
      {missing?.length > 0 && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.coralDark, marginBottom: 12, background: "#FCEEE1", padding: "8px 12px", borderRadius: 9 }}>
          Fill in before moving on: {missing.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {project.stage === "pilot" ? (
          <>
            <PrimaryButton disabled={busy || missing?.length > 0} onClick={() => onAction("pilotDecision", { decision: "scale" })}>Scale</PrimaryButton>
            <GhostButton disabled={busy} onClick={() => setReasonModal("pilot-iterate")}>Iterate</GhostButton>
            <GhostButton disabled={busy} onClick={() => setReasonModal("pilot-stop")}>Stop</GhostButton>
          </>
        ) : project.stage !== "closed" ? (
          <>
            <PrimaryButton disabled={busy || missing?.length > 0} onClick={() => onAction("advance", {})}>Advance stage</PrimaryButton>
            <GhostButton disabled={busy} onClick={() => setReasonModal("send-back")}>Send back</GhostButton>
          </>
        ) : null}
        {project.status === "active" && <GhostButton disabled={busy} onClick={() => setReasonModal("hold")}>Put on hold</GhostButton>}
        {project.status === "on_hold" && <GhostButton disabled={busy} onClick={() => onAction("resume", {})}>Resume</GhostButton>}
        {["active", "on_hold"].includes(project.status) && <GhostButton disabled={busy} onClick={() => setReasonModal("stop")}>Stop project</GhostButton>}
        {session.role === "admin" && ["active", "stopped"].includes(project.status) && (
          <GhostButton disabled={busy} onClick={() => setReasonModal("close")} icon={CheckCircle2}>Close project</GhostButton>
        )}
      </div>

      {reasonModal && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${BRAND.line}`, paddingTop: 16 }}>
          {reasonModal === "close" ? (
            <Field label="Outcome" required>
              <select style={selectStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="scaled">Scaled</option>
                <option value="stopped">Stopped</option>
              </select>
            </Field>
          ) : (
            <Field label="Reason" required>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <PrimaryButton disabled={busy || (reasonModal !== "close" && !reason.trim())} onClick={() => submitReason(reasonModal)}>Confirm</PrimaryButton>
            <GhostButton onClick={() => { setReasonModal(null); setReason(""); }}>Cancel</GhostButton>
          </div>
        </div>
      )}
    </Card>
  );
}

function OverviewTab({ project, sources }) {
  const rows = [
    ["Client", project.client_company || project.client_name],
    ["Owner", project.owner_name], ["Client POC", project.poc_name], ["RIV Manager", project.riv_manager_name],
    ["Started", fmtDate(project.started_at)], ["Target end", fmtDate(project.target_end)],
    ["Source", sources?.[0] ? sources[0].source_type.replace("_", " ") : "manual"],
  ].filter(([, v]) => v);
  return (
    <Card style={{ padding: 22 }}>
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
  );
}

function UpdatesTab({ project, updates, canAdd, onAdded }) {
  const [form, setForm] = useState({ health: "on_track", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.progress.trim() || !form.nextSteps.trim()) { setError("Progress and next steps are required."); return; }
    setSubmitting(true); setError(null);
    try {
      await api.addBuildUpdate(project.id, {
        health: form.health, progress: form.progress, nextSteps: form.nextSteps, blockers: form.blockers,
        needsHelp: form.needsHelp, pctComplete: form.pctComplete === "" ? null : Number(form.pctComplete),
      });
      setForm({ health: "on_track", progress: "", nextSteps: "", blockers: "", needsHelp: false, pctComplete: "" });
      onAdded();
    } catch (e) {
      setError(e.message || "Couldn't save update.");
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      {canAdd && (
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Post a status update</div>
          <form onSubmit={submit}>
            <Field label="Health" required>
              <select style={selectStyle} value={form.health} onChange={(e) => setForm((f) => ({ ...f, health: e.target.value }))}>
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="off_track">Off track</option>
              </select>
            </Field>
            <Field label="Progress since last update" required>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
            </Field>
            <Field label="Next steps" required>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.nextSteps} onChange={(e) => setForm((f) => ({ ...f, nextSteps: e.target.value }))} />
            </Field>
            <Field label="Blockers">
              <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} />
            </Field>
            <Field label="% complete">
              <input type="number" min="0" max="100" style={inputStyle} value={form.pctComplete} onChange={(e) => setForm((f) => ({ ...f, pctComplete: e.target.value }))} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: BRAND.ink, marginBottom: 16 }}>
              <input type="checkbox" checked={form.needsHelp} onChange={(e) => setForm((f) => ({ ...f, needsHelp: e.target.checked }))} />
              This project needs leadership help
            </label>
            <ErrorBanner text={error} />
            <PrimaryButton type="submit" disabled={submitting}>{submitting ? "Saving…" : "Post update"}</PrimaryButton>
          </form>
        </Card>
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

function ProjectDetailView({ projectId, session, onBack }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
      load();
    } catch (e) {
      setError(e.message || "That action failed.");
    } finally { setBusy(false); }
  }

  if (loading) return <Spinner label="Loading project…" />;
  if (!data) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}><ErrorBanner text={error || "Project not found."} /></div>;

  const { project, sources, history, updates, lessons, files } = data;
  // These only toggle what's shown -- lib/buildPermissions.js on the
  // backend is the real gate (PRD 10.2); a frontend slip here just hides a
  // button a server call would reject anyway, never grants extra access.
  const isOwner = Number(session.id) === Number(project.owner_user_id);
  const isClientLeader = session.role === "client" && Number(session.id) === Number(project.client_id);
  const canAddUpdate = session.role === "admin" || session.role === "riv_manager" || session.role === "client_poc" || isOwner;
  const canEditRoi = canAddUpdate || isClientLeader;
  const canUpload = canAddUpdate;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "updates", label: "Status updates" },
    { id: "roi", label: "ROI" },
    { id: "lessons", label: "Lessons learned" },
    { id: "files", label: "Files" },
    { id: "history", label: "History" },
  ];

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "32px 24px 100px" }}>
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
        <div style={{ display: "flex", gap: 8 }}>
          <HealthBadge health={project.health} />
          <StatusBadge status={project.status} />
        </div>
      </div>

      <ErrorBanner text={error} />

      {project.status !== "closed" && (
        <StageActions
          project={project} missing={data.missingForNextStage} gateApprovers={data.gateApprovers}
          session={session} onAction={doAction} busy={busy}
        />
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 20, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${BRAND.coral}` : "2px solid transparent",
            color: tab === t.id ? BRAND.ink : "#9B958F", cursor: "pointer", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={project} sources={sources} />}
      {tab === "updates" && <UpdatesTab project={project} updates={updates} canAdd={canAddUpdate} onAdded={load} />}
      {tab === "roi" && <RoiTab project={project} canEdit={canEditRoi} isClientLeader={isClientLeader && !canAddUpdate} onSaved={load} />}
      {tab === "lessons" && <LessonsTab project={project} lessons={lessons} canEdit={canAddUpdate} onSaved={load} />}
      {tab === "files" && <FilesTab project={project} files={files} canUpload={canUpload} onUploaded={load} />}
      {tab === "history" && <HistoryTab history={history} />}
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD (PRD 9) -- Client Leader view (own client) + RIV
   portfolio view (admin, every client). A client_poc sees their client's
   dashboard too; a riv_manager sees the clients assigned to them via the
   same client-dashboard endpoint, one client at a time, from a picker.
   ========================================================================= */
function SummaryStat({ label, value, sub, color }) {
  return (
    <Card style={{ padding: 18, flex: "1 1 160px" }}>
      <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: color || BRAND.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function ClientDashboard({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.getBuildClientDashboard(clientId).then(setData).catch((e) => setError(e.message || "Couldn't load dashboard.")).finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!data) return null;

  const { summary, needsAttention, projects } = data;
  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <SummaryStat label="Active projects" value={summary.activeCount} />
        <SummaryStat label="Red / Amber" value={summary.redAmberCount} color={summary.redAmberCount ? "#C13B3B" : undefined} />
        <SummaryStat label="Overdue updates" value={summary.overdueCount} color={summary.overdueCount ? BRAND.coralDark : undefined} />
        <SummaryStat label="Invested to date" value={summary.investedToDateFmt} />
        <SummaryStat label="Realised benefit" value={summary.realisedBenefitFmt} sub={summary.estimated ? "partly estimated" : undefined} />
        <SummaryStat label="Portfolio ROI" value={fmtPct(summary.portfolioRoi)} color={summary.portfolioRoi >= 0 ? "#1B7A5A" : "#C13B3B"} />
      </div>

      {needsAttention.length > 0 && (
        <Card style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 10 }}>Needs attention</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {needsAttention.map((n) => (
              <div key={n.projectId} style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 13 }}>
                <span><b style={{ color: BRAND.coralDark }}>{n.code}</b> {n.title}</span>
                <span style={{ color: "#9B958F" }}>{n.reason}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr style={{ background: BRAND.cream, textAlign: "left" }}>
              {["Code", "Title", "Stage", "Health", "Owner", "ROI"].map((h) => (
                <th key={h} style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7A746F", textTransform: "uppercase", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: BRAND.coralDark, borderBottom: `1px solid ${BRAND.line}` }}>{p.code}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 13, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}` }}>{p.title}</td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}`, textTransform: "capitalize" }}>{p.stage}</td>
                  <td style={{ padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}><HealthBadge health={p.health} size="sm" /></td>
                  <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12.5, color: "#7A746F", borderBottom: `1px solid ${BRAND.line}` }}>{p.ownerName || "—"}</td>
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

  if (loading) return <Spinner label="Loading portfolio…" />;
  if (error) return <ErrorBanner text={error} />;
  if (!clients.length) return <EmptyState icon={Building2} title="No clients with Build projects yet" text="Once a project exists for a client, their row will appear here." />;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr style={{ background: BRAND.cream, textAlign: "left" }}>
            {["Client", "Active", "Red/Amber", "Invested", "Benefit", "ROI", "Latest audit score"].map((h) => (
              <th key={h} style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7A746F", textTransform: "uppercase", padding: "10px 14px", borderBottom: `1px solid ${BRAND.line}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.clientId}>
                <td style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: BRAND.ink, borderBottom: `1px solid ${BRAND.line}` }}>{c.company || c.name}</td>
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
  );
}

function DashboardView({ session }) {
  const [sub, setSub] = useState(session.role === "admin" ? "portfolio" : "client");
  const isAdmin = session.role === "admin";
  const isClientLike = ["client", "client_poc"].includes(session.role);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Leader dashboard</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 20 }}>What's in flight, what's in trouble, and what it has returned.</div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <GhostButton style={sub === "portfolio" ? { background: BRAND.ink, color: "#fff" } : {}} onClick={() => setSub("portfolio")}>RIV portfolio</GhostButton>
          <GhostButton style={sub === "client" ? { background: BRAND.ink, color: "#fff" } : {}} onClick={() => setSub("client")}>My client view</GhostButton>
        </div>
      )}

      {sub === "portfolio" ? <PortfolioDashboard /> : (
        isClientLike
          ? <ClientDashboard clientId={session.role === "client" ? session.id : session.client_id} />
          : <EmptyState icon={Gauge} title="Pick a client" text="RIV Manager client-by-client view is coming soon — use the RIV portfolio for now, or open a project directly." />
      )}
    </div>
  );
}

/* =========================================================================
   ADMIN CONSOLE (PRD 6/7 "How a project starts", 10.1) -- create projects
   (manual / from an Ideathon winner / from a selected startup), assign
   people, and manage client_poc + riv_manager logins.
   ========================================================================= */
function CreateProjectPanel({ onCreated }) {
  const [mode, setMode] = useState("manual");
  const [form, setForm] = useState({ type: "internal", title: "", description: "", clientId: "", targetEnd: "" });
  const [ideaId, setIdeaId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null); setNotice(null);
    try {
      if (mode === "manual") {
        if (!form.title.trim() || !form.clientId) throw new Error("Title and clientId are required.");
        const d = await api.createBuildProject(form);
        setNotice(`Created ${d.project.code}.`);
        onCreated();
      } else if (mode === "idea") {
        const d = await api.createBuildProjectFromIdea(ideaId);
        setNotice(`Created ${d.project.code} from idea #${ideaId}.`);
        onCreated();
      } else {
        const d = await api.createBuildProjectFromApplication(applicationId);
        setNotice(`Created ${d.project.code} from application #${applicationId}.`);
        onCreated();
      }
    } catch (e) {
      setError(e.message || "Couldn't create the project.");
    } finally { setSubmitting(false); }
  }

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>Create a Build project</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["manual", "Manual"], ["idea", "From Ideathon winner"], ["application", "From startup pilot"]].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "8px 12px", borderRadius: 999,
            border: `1px solid ${BRAND.line}`, cursor: "pointer", background: mode === id ? BRAND.ink : "#fff", color: mode === id ? "#fff" : BRAND.ink,
          }}>{label}</button>
        ))}
      </div>
      <form onSubmit={submit}>
        {mode === "manual" && (
          <>
            <Field label="Type" required>
              <select style={selectStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="internal">Internal</option>
                <option value="startup">Startup</option>
              </select>
            </Field>
            <Field label="Title" required><input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Description"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
            <Field label="Client ID" required hint="The RIOS client (leader) account this project belongs to."><input style={inputStyle} value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} /></Field>
            <Field label="Target end date"><input type="date" style={inputStyle} value={form.targetEnd} onChange={(e) => setForm((f) => ({ ...f, targetEnd: e.target.value }))} /></Field>
          </>
        )}
        {mode === "idea" && (
          <Field label="Idea ID" required hint="The idea must already be marked “Selected for Build” (Ideathon admin console).">
            <input style={inputStyle} value={ideaId} onChange={(e) => setIdeaId(e.target.value)} />
          </Field>
        )}
        {mode === "application" && (
          <Field label="Application ID" required hint="The startup application must already be decided “Selected for Pilot” (Startup admin console).">
            <input style={inputStyle} value={applicationId} onChange={(e) => setApplicationId(e.target.value)} />
          </Field>
        )}
        {notice && <Notice text={notice} />}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : Plus}>{submitting ? "Creating…" : "Create project"}</PrimaryButton>
      </form>
    </Card>
  );
}

function AssignPanel() {
  const [projectId, setProjectId] = useState("");
  const [form, setForm] = useState({ ownerUserId: "", pocUserId: "", rivManagerId: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null); setNotice(null);
    try {
      await api.assignBuildProject(projectId, {
        ownerUserId: form.ownerUserId || undefined, pocUserId: form.pocUserId || undefined, rivManagerId: form.rivManagerId || undefined,
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
        <Field label="Project ID" required><input style={inputStyle} value={projectId} onChange={(e) => setProjectId(e.target.value)} /></Field>
        <Field label="Owner user ID"><input style={inputStyle} value={form.ownerUserId} onChange={(e) => setForm((f) => ({ ...f, ownerUserId: e.target.value }))} /></Field>
        <Field label="Client POC user ID"><input style={inputStyle} value={form.pocUserId} onChange={(e) => setForm((f) => ({ ...f, pocUserId: e.target.value }))} /></Field>
        <Field label="RIV Manager user ID"><input style={inputStyle} value={form.rivManagerId} onChange={(e) => setForm((f) => ({ ...f, rivManagerId: e.target.value }))} /></Field>
        {notice && <Notice text={notice} />}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save assignment"}</PrimaryButton>
      </form>
    </Card>
  );
}

function PeoplePanel() {
  const [pocs, setPocs] = useState([]);
  const [managers, setManagers] = useState([]);
  const [pocForm, setPocForm] = useState({ email: "", password: "", name: "", clientId: "" });
  const [mgrForm, setMgrForm] = useState({ email: "", password: "", name: "", clientIds: "" });
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
      setNotice("Client POC login created.");
      load();
    } catch (e) { setError(e.message || "Couldn't create that login."); }
  }
  async function createManager(e) {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api.createBuildManager({
        ...mgrForm, clientIds: mgrForm.clientIds.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setMgrForm({ email: "", password: "", name: "", clientIds: "" });
      setNotice("RIV Manager login created.");
      load();
    } catch (e) { setError(e.message || "Couldn't create that login."); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}><Users size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Client POC logins</div>
        <form onSubmit={createPoc}>
          <Field label="Name" required><input style={inputStyle} value={pocForm.name} onChange={(e) => setPocForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={pocForm.email} onChange={(e) => setPocForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required><input style={inputStyle} value={pocForm.password} onChange={(e) => setPocForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <Field label="Client ID" required><input style={inputStyle} value={pocForm.clientId} onChange={(e) => setPocForm((f) => ({ ...f, clientId: e.target.value }))} /></Field>
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
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}><Briefcase size={14} style={{ marginRight: 6, verticalAlign: -2 }} />RIV Manager logins</div>
        <form onSubmit={createManager}>
          <Field label="Name" required><input style={inputStyle} value={mgrForm.name} onChange={(e) => setMgrForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={mgrForm.email} onChange={(e) => setMgrForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Temporary password" required><input style={inputStyle} value={mgrForm.password} onChange={(e) => setMgrForm((f) => ({ ...f, password: e.target.value }))} /></Field>
          <Field label="Assigned client IDs" hint="Comma-separated"><input style={inputStyle} value={mgrForm.clientIds} onChange={(e) => setMgrForm((f) => ({ ...f, clientIds: e.target.value }))} /></Field>
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
        Notifies each overdue project's POC and RIV Manager, and sends admins one digest. This isn't scheduled automatically yet —
        run it manually here, or point a daily scheduled task at this action.
      </div>
      {result && <Notice text={`${result.overdueCount} project(s) overdue${result.codes?.length ? `: ${result.codes.join(", ")}` : "."}`} />}
      <ErrorBanner text={error} />
      <PrimaryButton onClick={run} disabled={running} icon={running ? Loader2 : undefined}>{running ? "Running…" : "Run overdue check now"}</PrimaryButton>
    </Card>
  );
}

function AdminConsoleView({ reload }) {
  const [tab, setTab] = useState("create");
  const tabs = [
    { id: "create", label: "Create project" },
    { id: "assign", label: "Assign people" },
    { id: "people", label: "POC / Manager logins" },
    { id: "overdue", label: "Overdue digest" },
  ];
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Build admin console</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 20 }}>Create and assign projects, and manage the two login types unique to Build.</div>
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BRAND.line}`, marginBottom: 20, overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${BRAND.coral}` : "2px solid transparent",
            color: tab === t.id ? BRAND.ink : "#9B958F", cursor: "pointer", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>
      {tab === "create" && <CreateProjectPanel onCreated={reload} />}
      {tab === "assign" && <AssignPanel />}
      {tab === "people" && <PeoplePanel />}
      {tab === "overdue" && <OverdueDigestPanel />}
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
    window.history.pushState(null, "", "/build/projects");
    setView("projects");
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

  const canSeeDashboard = session && ["admin", "client", "client_poc", "riv_manager"].includes(session.role);
  const canSeeAdmin = session && ["admin", "riv_manager"].includes(session.role);

  // Build spans roles with no login of their own here (client leader,
  // admin -- App.jsx seeds their session on the way in) and the two new
  // ones that do (client_poc, riv_manager). No session at all means the
  // person hasn't authenticated through either path yet.
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
      `}</style>
      <BuildNavBar view={view} setView={goToView} session={session} onLogout={handleLogout} canSeeDashboard={canSeeDashboard} canSeeAdmin={canSeeAdmin} />

      {view === "projects" && !activeProjectId && (
        <ProjectListView key={listKey} session={session} onOpen={(id) => setActiveProjectId(id)} />
      )}
      {view === "projects" && activeProjectId && (
        <ProjectDetailView projectId={activeProjectId} session={session} onBack={() => { setActiveProjectId(null); setListKey((k) => k + 1); }} />
      )}
      {view === "dashboard" && canSeeDashboard && <DashboardView session={session} />}
      {view === "admin" && canSeeAdmin && <AdminConsoleView reload={() => setListKey((k) => k + 1)} />}
    </div>
  );
}
