import React, { useState, useEffect } from "react";
import {
  BarChart3, LogOut, CheckCircle2, ArrowRight, ChevronLeft, ChevronRight,
  Loader2, ClipboardList, AlertCircle, UserCircle2, Plus, Trash2,
  FileSpreadsheet, FileText, TrendingUp,
} from "lucide-react";
import {
  api, getStoredIndexUser, setIndexSession, clearIndexSession,
} from "./api.js";
import { BRAND } from "./brand.js";

// R-Index's own tabs. This module is reachable two ways from the SAME
// single deployment (one Render static site, two DNS names pointed at
// it): as a path on the main site (rios.retailinnovation.ai/rindex), or
// on its own subdomain (audit.retailinnovation.ai) with clean root-level
// URLs. isIndexSubdomain() is the one place that checks which hostname
// the app is actually running on right now; everything else in this file
// (path tables, the "back to RIOS" link) reads that instead of assuming.
//
// This only works once audit.retailinnovation.ai is 1) pointed at this
// same Render static site via a CNAME in DNS and 2) added as a Custom
// Domain in Render's dashboard for the RIOS-frontend service — neither of
// which this code can do by itself. Until that's done, R-Index is only
// reachable via the /rindex path on the main domain.
const INDEX_SUBDOMAIN_HOST = "audit.retailinnovation.ai";
const MAIN_SITE_URL = "https://rios.retailinnovation.ai";
export function isIndexSubdomain() {
  return typeof window !== "undefined" && window.location.hostname === INDEX_SUBDOMAIN_HOST;
}

const INDEX_VIEW_TO_PATH = isIndexSubdomain()
  ? { landing: "/", "my-entries": "/my-entries" }
  : { landing: "/rindex", "my-entries": "/rindex/my-entries" };
const INDEX_PATH_TO_VIEW = isIndexSubdomain()
  ? { "/": "landing", "/my-entries": "my-entries" }
  : { "/rindex": "landing", "/rindex/my-entries": "my-entries" };
function pathToIndexView(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return INDEX_PATH_TO_VIEW[path] || "landing";
}

const FONT = "'Poppins',sans-serif";

/* =========================================================================
   SMALL UI PRIMITIVES — deliberately redefined here rather than imported
   from App.jsx/RiseRiv.jsx, so this module has zero dependency on the
   other two beyond api.js/brand.js (same isolation as RiseRiv.jsx).
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

function GhostButton({ children, onClick, style, icon: Icon }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13, background: "#fff",
      color: BRAND.ink, border: `1px solid ${BRAND.line}`, borderRadius: 9, padding: "10px 16px",
      cursor: "pointer", ...style,
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

function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "#FBEAEA", border: "1px solid #F3C6C6", marginBottom: 16 }}>
      <AlertCircle size={15} color={BRAND.coralDark} />
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>{text}</div>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "60px 20px", fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>
      <Loader2 size={16} className="index-spin" /> {label || "Loading…"}
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
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 6, maxWidth: 340, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

// 1-5 (or scale-N) rating picker for a single audit question — plain
// numbered buttons rather than stars, since this is a maturity/agreement
// scale (per question `scale`, default 5), not a 5-star rating like
// Startup's jury criteria. `scaleLabels`, when supplied (every real
// question has one — see indexQuestions.json), shows the actual sheet
// wording (e.g. "Never / Rarely / Occasionally...") under the selected
// point, so the number alone isn't the only cue.
function ScalePicker({ value, onChange, scale = 5, scaleLabels }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: scale }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n} type="button" onClick={() => onChange(n)}
              aria-label={scaleLabels?.[n - 1] ? `${n} — ${scaleLabels[n - 1]}` : `Rate ${n} out of ${scale}`}
              title={scaleLabels?.[n - 1] || undefined}
              style={{
                width: 38, height: 38, borderRadius: 9, cursor: "pointer",
                fontFamily: FONT, fontWeight: 700, fontSize: 14,
                border: `1px solid ${active ? BRAND.coral : BRAND.line}`,
                background: active ? BRAND.coral : "#fff",
                color: active ? "#fff" : BRAND.ink,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {scaleLabels && (
        <div style={{ fontFamily: FONT, fontSize: 11.5, color: value ? BRAND.coral : "#B7B2AE", marginTop: 7, fontWeight: 600 }}>
          {value ? scaleLabels[value - 1] : scaleLabels.join(" · ")}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   NAV
   ========================================================================= */
function IndexNavBar({ view, setView, session, onLogout, openCampaignCount }) {
  const items = [{ id: "landing", label: "Overview" }];
  if (session) items.push({ id: "my-entries", label: "My entries" });
  if (session?.role === "admin") items.push({ id: "admin-campaigns", label: "Manage campaigns", badge: openCampaignCount });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>
            <BarChart3 size={18} color={BRAND.coral} /> R-Index
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {/* Real link (full navigation) back to the main site's Overview
                page — this module doesn't render inside the main site's own
                header, so this is the only way back to it. On the R-Index
                subdomain, "/" is this same module's own landing page, so
                this has to be an absolute cross-domain link instead. */}
            <a href={isIndexSubdomain() ? MAIN_SITE_URL : "/"} style={{
              fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
              textDecoration: "none", color: BRAND.ink, display: "inline-block",
            }}>RIOS</a>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink, display: "flex", alignItems: "center", gap: 6,
              }}>
                {it.label}
                {/* Live count of open campaigns, right on the nav tab — so
                    "which campaign is going on" doesn't require clicking in
                    at all, per the admin request this satisfies. Only shown
                    once campaigns have actually loaded (undefined while
                    loading), not as a misleading "0" flash. */}
                {it.id === "admin-campaigns" && it.badge !== undefined && (
                  <span style={{
                    fontFamily: FONT, fontSize: 10.5, fontWeight: 700, minWidth: 16, height: 16, padding: "0 4px",
                    borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: it.badge > 0 ? BRAND.coral : (view === it.id ? "rgba(255,255,255,0.18)" : "#EFEBE7"),
                    color: it.badge > 0 ? "#fff" : (view === it.id ? "#fff" : "#9B958F"),
                  }}>{it.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div>
          {session ? (
            <GhostButton onClick={onLogout} icon={LogOut}>{session.name}</GhostButton>
          ) : (
            <GhostButton onClick={() => setView("login")} icon={UserCircle2}>Log in</GhostButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LANDING — public. Content ported from "Turning Retail Innovation into a
   Flywheel" / "From AI Experimentation to AI-Native Retail" (the Executive
   Conversation deck) — RIV's value props, the 5-stage maturity model used
   throughout the Index, the 30-minute conversation agenda, and what a
   respondent gets at the end.
   ========================================================================= */
const VALUE_PROPS = [
  { title: "Retailers", copy: "Get an AI & Innovation edge", color: BRAND.coral },
  { title: "Startups", copy: "Get customers & capital", color: "#2F6FEB" },
  { title: "Investors", copy: "Get early access to quality opportunities", color: "#D9A441" },
];
const MATURITY_MODEL = [
  { n: "01", label: "Curious", quote: "We're learning what AI can do." },
  { n: "02", label: "Experimenting", quote: "We're testing where AI can help." },
  { n: "03", label: "Deploying", quote: "We have AI working in production." },
  { n: "04", label: "Scaling", quote: "We're redesigning and scaling workflows around AI." },
  { n: "05", label: "AI-Native", quote: "AI is embedded in how we operate." },
];
const CONVERSATION_AGENDA = [
  { n: "01", title: "Leadership & Strategy", copy: "How leadership is actually using AI" },
  { n: "02", title: "AI Use Cases", copy: "Where AI is creating / could create value" },
  { n: "03", title: "Technology & Data", copy: "What enables or constrains scale" },
  { n: "04", title: "Organisation", copy: "How roles and workflows are changing" },
  { n: "05", title: "Agentic AI", copy: "Where AI could move from assisting to executing" },
  { n: "06", title: "Ecosystem", copy: "How you work with startups and external innovation" },
];
const YOU_RECEIVE = ["Private AI Readiness Benchmark", "Early access to the Index", "Anonymised peer insights", "Invitation to the Executive Roundtable"];

function LandingView({ campaigns, loading, session, onPickCampaign, setView }) {
  function scrollToCampaigns() {
    document.getElementById("index-open-campaigns")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      {/* Hero — full-width dark BRAND.ink band, matching the main Overview
          page's hero pattern (pill badge, headline, italic subhead, single
          CTA) rather than a plain light hero, so this reads as the same
          product family even standing alone on its own subdomain. */}
      <div style={{ background: BRAND.ink, padding: "64px 24px 56px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            display: "inline-block", fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: "#fff",
            letterSpacing: 0.5, textTransform: "uppercase", background: "rgba(255,255,255,0.12)",
            padding: "6px 14px", borderRadius: 999, marginBottom: 20,
          }}>
            The India Retail AI &amp; Innovation Index
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: "#fff", lineHeight: 1.25 }}>
            From AI Experimentation to AI-Native Retail
          </div>
          <div style={{ fontFamily: FONT, fontSize: 15, fontStyle: "italic", color: "rgba(255,255,255,0.72)", marginTop: 16, lineHeight: 1.65, maxWidth: 540, marginLeft: "auto", marginRight: "auto" }}>
            A 30-minute executive conversation on where Retail AI is actually heading — and a private benchmark showing you where your organization stands against the cohort.
          </div>
          <PrimaryButton icon={ArrowRight} onClick={scrollToCampaigns} style={{ margin: "28px auto 0", padding: "13px 26px" }}>
            {session ? "Take the Index" : "Get started"}
          </PrimaryButton>
        </div>
      </div>

      {/* Retailers / Startups / Investors */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px 8px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {VALUE_PROPS.map((v) => (
          <Card key={v.title} style={{ flex: "1 1 200px", padding: "18px 20px", background: BRAND.cream, border: "none" }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: v.color }}>{v.title}</div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, marginTop: 4 }}>{v.copy}</div>
          </Card>
        ))}
      </div>

      {/* Open campaigns / CTA */}
      <div id="index-open-campaigns" style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px 8px" }}>
        {loading ? <Spinner label="Loading campaigns…" /> : campaigns.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No index is open right now" text="Check back soon, or contact the RIV team directly." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {campaigns.map((c) => (
              <Card key={c.id} style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{c.name}</div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                    {[c.geo, c.quarter_label].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <PrimaryButton icon={ArrowRight} onClick={() => onPickCampaign(c, session ? "audit" : "signup")}>
                  {session ? "Take the index" : "Get started"}
                </PrimaryButton>
              </Card>
            ))}
          </div>
        )}
        {!session && (
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 18, textAlign: "center" }}>
            Already have an account? <button onClick={() => setView("login")} style={{ background: "none", border: "none", color: BRAND.coral, fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>Log in</button>
          </div>
        )}
      </div>

      {/* RIV Retail AI Maturity Model */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 8px" }}>
        <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: BRAND.coral, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
          The RIV Retail AI Maturity Model
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>
          Where is your organisation today?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 12, overflow: "hidden", border: `1px solid ${BRAND.line}` }}>
          {MATURITY_MODEL.map((m, i) => (
            <div key={m.n} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: i % 2 === 1 ? BRAND.cream : "#fff" }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.coral, width: 22 }}>{m.n}</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: BRAND.ink, width: 130 }}>{m.label.toUpperCase()}</div>
              <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", fontStyle: "italic" }}>"{m.quote}"</div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-minute conversation agenda */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 8px" }}>
        <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: BRAND.coral, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
          Executive Research Conversation
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>
          Today's 30-Minute Executive Conversation
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {CONVERSATION_AGENDA.map((a) => (
            <Card key={a.n} style={{ padding: "16px 18px", background: BRAND.cream, border: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: BRAND.coral, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.n}</div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: BRAND.ink }}>{a.title}</div>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F" }}>{a.copy}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* What you receive */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 100px" }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink, marginBottom: 14 }}>At the end, you will receive</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {YOU_RECEIVE.map((r) => (
            <div key={r} style={{
              fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: "#2F6FEB",
              background: "#EEF3FD", padding: "8px 14px", borderRadius: 999,
            }}>{r}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SIGNUP / LOGIN — self-service, always creates an 'index_respondent'
   account (distinct role from the main site's 'client' — see
   RIOS-PRD-RIndex-Module.md §3). Login reuses the shared /api/auth/login
   endpoint, same as Rise.RIV jury does.
   ========================================================================= */
function SignupView({ pendingCampaign, onAuthed, setView }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function set(key) { return (e) => setForm((f) => ({ ...f, [key]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Name, email, and password are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.indexSignup(form);
      onAuthed(token, user);
    } catch (e) {
      setError(e.message || "Couldn't sign up — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "56px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Create your account</div>
      {pendingCampaign && (
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 22 }}>
          To take the <strong>{pendingCampaign.name}</strong> index.
        </div>
      )}
      <Card style={{ padding: 26 }}>
        <form onSubmit={submit}>
          <Field label="Full name" required><input style={inputStyle} value={form.name} onChange={set("name")} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={form.email} onChange={set("email")} /></Field>
          <Field label="Company"><input style={inputStyle} value={form.company} onChange={set("company")} /></Field>
          <Field label="Password" required hint="At least 8 characters."><input type="password" style={inputStyle} value={form.password} onChange={set("password")} /></Field>
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : ArrowRight} style={{ width: "100%" }}>
            {submitting ? "Creating account…" : "Sign up"}
          </PrimaryButton>
        </form>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 16, textAlign: "center" }}>
          Already have an account? <button onClick={() => setView("login")} style={{ background: "none", border: "none", color: BRAND.coral, fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>Log in</button>
        </div>
      </Card>
    </div>
  );
}

function LoginView({ onAuthed, setView }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.indexLogin(email, password);
      if (user.role !== "index_respondent" && user.role !== "admin") {
        throw new Error("This login isn't set up for R-Index.");
      }
      onAuthed(token, user);
    } catch (e) {
      setError(e.message || "Couldn't log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", padding: "56px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 22 }}>Log in</div>
      <Card style={{ padding: 26 }}>
        <form onSubmit={submit}>
          <Field label="Email" required><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" required><input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <ErrorBanner text={error} />
          <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : ArrowRight} style={{ width: "100%" }}>
            {submitting ? "Logging in…" : "Log in"}
          </PrimaryButton>
        </form>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 16, textAlign: "center" }}>
          New here? <button onClick={() => setView("signup")} style={{ background: "none", border: "none", color: BRAND.coral, fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>Create an account</button>
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   AUDIT FORM — dynamic renderer over the real Q3 2026 instrument in
   backend/data/indexQuestions.json (12 sections, 30 questions, 7 question
   types). Grouped by section, in the order the sections come back from the
   API, so re-ordering or adding sections later is a data-file change, not
   a UI change.
   ========================================================================= */
function MultiSelectChips({ options, value = [], onChange }) {
  function toggle(opt) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = value.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)} style={{
            fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 999,
            border: `1px solid ${active ? BRAND.coral : BRAND.line}`,
            background: active ? BRAND.coral : "#fff", color: active ? "#fff" : BRAND.ink, cursor: "pointer",
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function YesNoToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {["Yes", "No"].map((opt) => {
        const active = value === opt;
        return (
          <button key={opt} type="button" onClick={() => onChange(opt)} style={{
            fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "9px 22px", borderRadius: 9,
            border: `1px solid ${active ? BRAND.coral : BRAND.line}`,
            background: active ? BRAND.coral : "#fff", color: active ? "#fff" : BRAND.ink, cursor: "pointer",
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Picks the right input for a question's `type` — the one place that has
// to know about every type in the instrument. Everything else (AuditView,
// the admin manual-entry form, etc.) just calls this.
function QuestionInput({ q, value, onChange }) {
  switch (q.type) {
    case "scored":
      return <ScalePicker scale={q.scale || 5} scaleLabels={q.scaleLabels} value={value} onChange={onChange} />;
    case "single_select":
      return (
        <select style={inputStyle} value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose one…</option>
          {q.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "multi_select":
      return <MultiSelectChips options={q.options} value={value || []} onChange={onChange} />;
    case "yesno":
    case "consent":
      return <YesNoToggle value={value} onChange={onChange} />;
    case "open":
      return (
        <textarea
          value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: FONT }}
        />
      );
    case "profile":
    default:
      return <input style={inputStyle} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

function AuditView({ campaign, campaigns, onDone }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaign?.id || campaigns[0]?.id || null);
  const [questions, setQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getIndexQuestions()
      .then((d) => { setQuestions(d.questions); setSections(d.sections); })
      .finally(() => setLoading(false));
  }, []);

  function setAnswer(id, val) { setAnswers((a) => ({ ...a, [id]: val })); }

  async function submit(e) {
    e.preventDefault();
    if (!selectedCampaignId) { setError("Please choose which campaign you're submitting for."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.submitIndexEntry({ campaignId: selectedCampaignId, answers });
      setDone(true);
    } catch (e) {
      setError(e.message || "Couldn't submit — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Loading the audit…" />;

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <CheckCircle2 size={44} color={BRAND.coral} style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>Thanks — your responses are in.</div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#7A746F", marginTop: 8 }}>
          Check your dashboard to see how you compare to your cohort.
        </div>
        <GhostButton onClick={onDone} style={{ margin: "26px auto 0" }}>Go to my entries</GhostButton>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "44px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Take the index</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Only your own responses and your cohort's average are ever shown to you — no other respondent's individual score is visible here.
      </div>

      {campaigns.length > 1 && (
        <Field label="Campaign" required>
          <select style={inputStyle} value={selectedCampaignId || ""} onChange={(e) => setSelectedCampaignId(Number(e.target.value))}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      <form onSubmit={submit}>
        {sections.map((section) => {
          const sectionQuestions = questions.filter((q) => q.section === section.id);
          if (!sectionQuestions.length) return null;
          return (
            <div key={section.id} style={{ marginBottom: 22 }}>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: BRAND.coral, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingLeft: 2 }}>
                {section.id} · {section.label}
              </div>
              <Card style={{ padding: 24 }}>
                {sectionQuestions.map((q, i) => (
                  <div key={q.id} style={{ marginBottom: i < sectionQuestions.length - 1 ? 22 : 0, paddingBottom: i < sectionQuestions.length - 1 ? 22 : 0, borderBottom: i < sectionQuestions.length - 1 ? `1px solid ${BRAND.line}` : "none" }}>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: BRAND.ink, marginBottom: q.hint ? 4 : 12, lineHeight: 1.5 }}>{q.text}</div>
                    {q.hint && <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginBottom: 12 }}>{q.hint}</div>}
                    <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
                  </div>
                ))}
              </Card>
            </div>
          );
        })}
        <ErrorBanner text={error} />
        <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : ArrowRight} style={{ width: "100%", marginTop: 6 }}>
          {submitting ? "Submitting…" : "Submit responses"}
        </PrimaryButton>
      </form>
    </div>
  );
}

/* =========================================================================
   MY ENTRIES — every campaign this respondent has ever submitted to,
   supports re-participation across quarters/geos (PRD §7).
   ========================================================================= */
function MyEntriesView({ setView, setActiveEntryId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getMyIndexEntries()
      .then((d) => setEntries(d.entries))
      .catch((e) => setError(e.message || "Couldn't load your entries."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading your entries…" />;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>My entries</div>
      <ErrorBanner text={error} />

      {entries.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <EmptyState icon={ClipboardList} title="No entries yet" text="Take an open index from the Overview tab to get started." />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {entries.map((e) => (
            <Card key={e.id} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{e.campaign_name}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                  {[e.geo, e.quarter_label].filter(Boolean).join(" · ") || "—"}
                  {" · "}{e.campaign_is_open ? "Open" : "Closed"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1B7A5A", background: "#E7F5EF", padding: "4px 10px", borderRadius: 999 }}>
                  {e.score != null ? `${e.score.toFixed(1)}/5` : "Not scored"}
                </span>
                <button
                  onClick={() => { setActiveEntryId(e.id); setView("dashboard"); }}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                  aria-label={`View dashboard for ${e.campaign_name}`}
                >
                  <ChevronRight size={18} color="#B7B2AE" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   DASHBOARD — one entry's overall score + Five Dimensions breakdown vs.
   its campaign's cohort average, plus maturity stage. Same shape as the
   sample report's "Five Dimensions" table, just for one respondent.
   ========================================================================= */
function DimensionBar({ label, mine, cohort }) {
  const pct = (v) => (v != null ? `${(v / 5) * 100}%` : "0%");
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{label}</div>
        <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F" }}>
          {mine != null ? mine.toFixed(1) : "—"} / 5
          {cohort != null && <span> · cohort {cohort.toFixed(1)}</span>}
        </div>
      </div>
      <div style={{ position: "relative", height: 8, borderRadius: 999, background: "#EFEBE7" }}>
        {cohort != null && (
          <div style={{ position: "absolute", left: pct(cohort), top: -3, width: 2, height: 14, background: "#B7B2AE" }} title="Cohort average" />
        )}
        <div style={{ height: 8, borderRadius: 999, background: BRAND.coral, width: pct(mine) }} />
      </div>
      {mine == null && (
        <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#B7B2AE", marginTop: 3 }}>Not yet measurable for this campaign.</div>
      )}
    </div>
  );
}

function DashboardView({ entryId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getIndexEntryDashboard(entryId)
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load your dashboard."))
      .finally(() => setLoading(false));
  }, [entryId]);

  if (loading) return <Spinner label="Loading your dashboard…" />;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={14} /> My entries
      </button>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 20 }}>Your dashboard</div>
      <ErrorBanner text={error} />

      {data && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
            <Card style={{ padding: 22, flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 6 }}>Your Index score</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: BRAND.coral }}>
                {data.myScore != null ? data.myScore.toFixed(1) : "—"}<span style={{ fontSize: 15, color: "#9B958F" }}>/5</span>
              </div>
              {data.stage && <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: "#9B958F", marginTop: 4 }}>{data.stage}</div>}
            </Card>
            <Card style={{ padding: 22, flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 6 }}>Cohort average</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: BRAND.ink }}>
                {data.cohortAverage != null ? data.cohortAverage.toFixed(1) : "—"}<span style={{ fontSize: 15, color: "#9B958F" }}>/5</span>
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 4 }}>
                across {data.cohortSize} {data.cohortSize === 1 ? "response" : "responses"}
              </div>
            </Card>
          </div>

          {data.selfReportedStage && data.selfReportedStage !== data.stage && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginBottom: 20 }}>
              You described your organization as <strong style={{ color: BRAND.ink }}>{data.selfReportedStage}</strong> — the computed Index score places you closer to <strong style={{ color: BRAND.ink }}>{data.stage}</strong>.
            </div>
          )}

          <Card style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 16 }}>Five Dimensions</div>
            {(data.indexDimensions || []).map((dim) => (
              <DimensionBar key={dim} label={dim} mine={data.dimensionScores?.[dim]} cohort={data.dimensionCohortAverage?.[dim]} />
            ))}
          </Card>
        </>
      )}
      <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", display: "flex", alignItems: "center", gap: 6 }}>
        <TrendingUp size={13} /> Only cohort averages are shown — no other respondent's individual score is ever visible here.
      </div>
    </div>
  );
}

/* =========================================================================
   ADMIN — campaign management (self-contained here so this module has
   everything it needs without a large edit to App.jsx's admin panel; an
   admin reaches this by logging in with their existing main-site admin
   credentials through the same login form above).
   ========================================================================= */
function AdminCampaignsView({ setView, setActiveCampaignId }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", geo: "", quarterLabel: "", endsAt: "" });

  function load() {
    setLoading(true);
    api.listIndexCampaignsAdmin()
      .then((d) => setCampaigns(d.campaigns))
      .catch((e) => setError(e.message || "Couldn't load campaigns."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function createCampaign(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Campaign name is required."); return; }
    setCreating(true);
    setError(null);
    try {
      await api.createIndexCampaign(form);
      setForm({ name: "", geo: "", quarterLabel: "", endsAt: "" });
      load();
    } catch (e) {
      setError(e.message || "Couldn't create campaign.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleOpen(c) {
    try {
      if (c.is_open) await api.closeIndexCampaign(c.id); else await api.openIndexCampaign(c.id);
      load();
    } catch (e) {
      setError(e.message || "Couldn't update campaign.");
    }
  }

  const openCampaigns = campaigns.filter((c) => c.is_open);
  // Open campaigns first (most recent first within each group) — matches
  // what actually matters day-to-day: "what's live right now" outranks
  // chronological order once a few quarters of history pile up.
  const sortedCampaigns = [...campaigns].sort((a, b) => (b.is_open - a.is_open) || (new Date(b.created_at) - new Date(a.created_at)));

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>Manage campaigns</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 4, marginBottom: 18 }}>
        Each campaign is its own quarter/geo cohort — comparisons never blend across campaigns.
      </div>

      {/* At-a-glance summary — campaigns can pile up over quarters, so
          "which one is actually live right now" shouldn't require scanning
          the whole list below. */}
      {!loading && (
        <Card style={{ padding: "16px 18px", marginBottom: 22, background: openCampaigns.length ? "#E7F5EF" : BRAND.cream, border: "none" }}>
          {openCampaigns.length === 0 ? (
            <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F" }}>No campaign is currently open — respondents will see an empty landing page until one is.</div>
          ) : (
            <div>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#1B7A5A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Currently open ({openCampaigns.length})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {openCampaigns.map((c) => (
                  <div key={c.id} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, background: "#fff", padding: "6px 12px", borderRadius: 999, border: "1px solid #CFE9DD" }}>
                    {c.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card style={{ padding: 22, marginBottom: 26 }}>
        <form onSubmit={createCampaign} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Campaign name" required>
              <input style={inputStyle} placeholder="e.g. Q4 2026 Dubai Retail AI and Innovation Index" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </div>
          <Field label="Geo"><input style={inputStyle} placeholder="e.g. India, Dubai" value={form.geo} onChange={(e) => setForm((f) => ({ ...f, geo: e.target.value }))} /></Field>
          <Field label="Quarter label"><input style={inputStyle} placeholder="e.g. Q4 2026" value={form.quarterLabel} onChange={(e) => setForm((f) => ({ ...f, quarterLabel: e.target.value }))} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <ErrorBanner text={error} />
            <PrimaryButton type="submit" disabled={creating} icon={creating ? Loader2 : Plus}>
              {creating ? "Creating…" : "Create campaign"}
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {loading ? <Spinner label="Loading campaigns…" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sortedCampaigns.map((c) => (
            <Card key={c.id} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{c.name}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                  {[c.geo, c.quarter_label].filter(Boolean).join(" · ") || "—"} · {c.entry_count} {c.entry_count === 1 ? "entry" : "entries"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                  color: c.is_open ? "#1B7A5A" : "#7A746F", background: c.is_open ? "#E7F5EF" : "#EFEBE7",
                }}>{c.is_open ? "Open" : "Closed"}</span>
                <GhostButton onClick={() => toggleOpen(c)}>{c.is_open ? "Close" : "Reopen"}</GhostButton>
                <PrimaryButton onClick={() => { setActiveCampaignId(c.id); setView("admin-entries"); }}>
                  View entries
                </PrimaryButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   ADMIN — entries for one campaign: full list, manual add (interview-sheet
   entry), and report export.
   ========================================================================= */
function AdminEntriesView({ campaignId, onBack }) {
  const [campaign, setCampaign] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ respondentName: "", respondentEmail: "", company: "" });

  function load() {
    setLoading(true);
    api.listIndexEntriesAdmin(campaignId)
      .then((d) => { setCampaign(d.campaign); setEntries(d.entries); })
      .catch((e) => setError(e.message || "Couldn't load entries."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [campaignId]);

  async function addEntry(e) {
    e.preventDefault();
    if (!form.respondentName.trim() || !form.respondentEmail.trim()) {
      setError("Respondent name and email are required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      // Manual add here doesn't collect per-question answers inline (the
      // interview-capture sheet's questions aren't ported yet — see
      // RIOS-PRD-RIndex-Module.md §11); this creates the respondent record
      // now, and answers/score can be filled in via a follow-up edit once
      // the real question set lands, using PUT /api/admin/index/entries/:id.
      await api.createIndexEntryAdmin({ campaignId, ...form, answers: {} });
      setForm({ respondentName: "", respondentEmail: "", company: "" });
      load();
    } catch (e) {
      setError(e.message || "Couldn't add entry.");
    } finally {
      setAdding(false);
    }
  }

  async function removeEntry(id) {
    try {
      await api.deleteIndexEntryAdmin(id);
      load();
    } catch (e) {
      setError(e.message || "Couldn't delete entry.");
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={14} /> Campaigns
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>{campaign?.name || "Entries"}</div>
            {campaign && (
              <span style={{
                fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                color: campaign.is_open ? "#1B7A5A" : "#7A746F", background: campaign.is_open ? "#E7F5EF" : "#EFEBE7",
              }}>{campaign.is_open ? "Open" : "Closed"}</span>
            )}
          </div>
          {campaign && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 3 }}>
              {[campaign.geo, campaign.quarter_label].filter(Boolean).join(" · ") || "—"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={api.indexExportUrl("excel", campaignId)} target="_blank" rel="noreferrer">
            <GhostButton icon={FileSpreadsheet}>Excel</GhostButton>
          </a>
          <a href={api.indexExportUrl("pdf", campaignId)} target="_blank" rel="noreferrer">
            <GhostButton icon={FileText}>PDF</GhostButton>
          </a>
        </div>
      </div>

      <Card style={{ padding: 22, marginBottom: 26 }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink, marginBottom: 14 }}>
          Add a respondent (e.g. from the interview-capture sheet)
        </div>
        <form onSubmit={addEntry} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label="Name" required><input style={inputStyle} value={form.respondentName} onChange={(e) => setForm((f) => ({ ...f, respondentName: e.target.value }))} /></Field>
          <Field label="Email" required><input type="email" style={inputStyle} value={form.respondentEmail} onChange={(e) => setForm((f) => ({ ...f, respondentEmail: e.target.value }))} /></Field>
          <Field label="Company"><input style={inputStyle} value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <ErrorBanner text={error} />
            <PrimaryButton type="submit" disabled={adding} icon={adding ? Loader2 : Plus}>
              {adding ? "Adding…" : "Add respondent"}
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {loading ? <Spinner label="Loading entries…" /> : entries.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No entries yet" text="Respondents who sign up, or entries you add above, will show up here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => (
            <Card key={e.id} style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink }}>{e.respondent_name}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                  {e.respondent_email}{e.company ? ` · ${e.company}` : ""} · {e.source === "admin" ? "Added by admin" : "Self-signup"}{!e.account_email && e.source === "admin" ? " (no account yet)" : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1B7A5A", background: "#E7F5EF", padding: "4px 10px", borderRadius: 999 }}>
                  {e.score != null ? `${e.score.toFixed(1)}/5` : "Not scored"}
                </span>
                <button onClick={() => removeEntry(e.id)} aria-label={`Remove ${e.respondent_name}`} style={{ background: "none", border: "none", cursor: "pointer", color: "#B7B2AE", display: "flex", alignItems: "center", padding: 4 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================== ROOT =========================== */
export default function IndexRivApp() {
  const [view, setView] = useState(() => {
    const v = pathToIndexView(window.location.pathname);
    return v === "my-entries" && !getStoredIndexUser() ? "login" : v;
  });
  const [session, setSession] = useState(getStoredIndexUser());
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [pendingCampaign, setPendingCampaign] = useState(null);
  const [activeEntryId, setActiveEntryId] = useState(null);
  const [activeCampaignId, setActiveCampaignId] = useState(null);

  useEffect(() => {
    api.getIndexCampaigns()
      .then((d) => setCampaigns(d.campaigns))
      .finally(() => setCampaignsLoading(false));
  }, []);

  useEffect(() => {
    function onPopState() {
      const v = pathToIndexView(window.location.pathname);
      setView(v === "my-entries" && !session ? "login" : v);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [session]);

  function handleAuthed(token, user) {
    setIndexSession(token, user);
    setSession(user);
    window.history.pushState(null, "", INDEX_VIEW_TO_PATH["my-entries"]);
    setView(pendingCampaign ? "audit" : "my-entries");
  }
  function handleLogout() {
    clearIndexSession();
    setSession(null);
    window.history.pushState(null, "", INDEX_VIEW_TO_PATH.landing);
    setView("landing");
  }
  function goToView(v) {
    if ((v === "my-entries" || v === "admin-campaigns") && !session) { setView("login"); return; }
    const path = INDEX_VIEW_TO_PATH[v];
    if (path) window.history.pushState(null, "", path);
    setView(v);
  }
  function onPickCampaign(campaign, nextView) {
    setPendingCampaign(campaign);
    if (nextView === "audit" && !session) { setView("login"); return; }
    setView(nextView);
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh" }}>
      <style>{`
        /* App.jsx normally loads this Google Font import, but on the
           R-Index subdomain this component renders standalone — RiosApp's
           own render (and its font import) never runs at all. Without this,
           every 'Poppins' reference below would silently fall back to a
           system sans-serif on audit.retailinnovation.ai specifically,
           while looking correct everywhere else this module is reachable
           (main domain, localhost) since App.jsx's import covers it there. */
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        .index-spin { animation: index-spin 0.8s linear infinite; }
        @keyframes index-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <IndexNavBar view={view} setView={goToView} session={session} onLogout={handleLogout} openCampaignCount={campaignsLoading ? undefined : campaigns.length} />

      {view === "landing" && (
        <LandingView campaigns={campaigns} loading={campaignsLoading} session={session} onPickCampaign={onPickCampaign} setView={goToView} />
      )}
      {view === "signup" && <SignupView pendingCampaign={pendingCampaign} onAuthed={handleAuthed} setView={goToView} />}
      {view === "login" && <LoginView onAuthed={handleAuthed} setView={goToView} />}
      {view === "audit" && session && (
        <AuditView campaign={pendingCampaign} campaigns={campaigns} onDone={() => goToView("my-entries")} />
      )}
      {view === "my-entries" && session && (
        <MyEntriesView setView={goToView} setActiveEntryId={setActiveEntryId} />
      )}
      {view === "dashboard" && session && activeEntryId && (
        <DashboardView entryId={activeEntryId} onBack={() => goToView("my-entries")} />
      )}
      {view === "admin-campaigns" && session?.role === "admin" && (
        <AdminCampaignsView setView={goToView} setActiveCampaignId={setActiveCampaignId} />
      )}
      {view === "admin-entries" && session?.role === "admin" && activeCampaignId && (
        <AdminEntriesView campaignId={activeCampaignId} onBack={() => goToView("admin-campaigns")} />
      )}
    </div>
  );
}
