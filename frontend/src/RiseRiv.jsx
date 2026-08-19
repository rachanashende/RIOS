import React, { useState, useEffect } from "react";
import {
  Rocket, LogOut, CheckCircle2, ArrowRight, ChevronLeft, ChevronRight,
  Loader2, ClipboardList, Star, AlertCircle, Gavel, Building2, UserCircle2,
} from "lucide-react";
import {
  api, getStoredRiseUser, setRiseSession, clearRiseSession,
} from "./api.js";
import { BRAND } from "./brand.js";

const FONT = "'Poppins',sans-serif";

/* =========================================================================
   SMALL UI PRIMITIVES — deliberately redefined here rather than imported
   from App.jsx/IdeasRiv.jsx, so this module has zero dependency on the
   other two beyond api.js/brand.js (same isolation as IdeasRiv.jsx).
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

function Field({ label, children, required }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>
        {label}{required && <span style={{ color: BRAND.coral }}> *</span>}
      </div>
      {children}
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
      <Loader2 size={16} className="rise-spin" /> {label || "Loading…"}
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

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n} type="button" onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} out of 5`}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3 }}
          >
            <Star size={24} color={filled ? BRAND.coral : "#D9D3CC"} fill={filled ? BRAND.coral : "none"} />
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   NAV
   ========================================================================= */
function RiseNavBar({ view, setView, session, onLogout }) {
  const items = [{ id: "landing", label: "Apply" }];
  if (session) items.push({ id: "jury-dashboard", label: "Rate startups" });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink }}>
            <Rocket size={18} color={BRAND.coral} /> Startup
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {/* Real link (full navigation) back to the main site's Overview
                page — this module no longer renders inside the main site's
                own header, so this is the only way back to it. */}
            <a href="/" style={{
              fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
              textDecoration: "none", color: BRAND.ink, display: "inline-block",
            }}>Overview</a>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink,
              }}>
                {it.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          {session ? (
            <GhostButton onClick={onLogout} icon={LogOut}>{session.name}</GhostButton>
          ) : (
            <GhostButton onClick={() => setView("jury-login")} icon={Gavel}>Jury login</GhostButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LANDING — public opportunity page
   ========================================================================= */
function LandingView({ opportunity, loading, setView }) {
  if (loading) return <Spinner label="Loading opportunity…" />;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 100px", textAlign: "center" }}>
      <div style={{ width: 54, height: 54, borderRadius: 16, background: "#FCEEE1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
        <Rocket size={26} color={BRAND.coralDark} />
      </div>
      {opportunity ? (
        <>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 27, color: BRAND.ink }}>{opportunity.title}</div>
          {opportunity.description && (
            <div style={{ fontFamily: FONT, fontSize: 14.5, color: "#7A746F", marginTop: 12, lineHeight: 1.65 }}>{opportunity.description}</div>
          )}
          <PrimaryButton onClick={() => setView("apply")} icon={ArrowRight} style={{ margin: "28px auto 0" }}>
            Apply now
          </PrimaryButton>
        </>
      ) : (
        <EmptyState icon={ClipboardList} title="Applications aren't open right now" text="Check back soon, or contact the Rise team directly." />
      )}
    </div>
  );
}

/* =========================================================================
   APPLICATION FORM + ACKNOWLEDGMENT
   ========================================================================= */
function ApplyView({ onDone }) {
  const [form, setForm] = useState({
    startupName: "", founderName: "", email: "", phone: "", website: "", sector: "", stage: "", pitch: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  function set(key) { return (e) => setForm((f) => ({ ...f, [key]: e.target.value })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.startupName.trim() || !form.founderName.trim() || !form.email.trim()) {
      setError("Startup name, founder name, and email are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.submitRiseApplication(form);
      setDone(true);
    } catch (e) {
      setError(e.message || "Couldn't submit your application — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <CheckCircle2 size={44} color={BRAND.coral} style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>
          Thanks for filling your details.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 14, color: "#7A746F", marginTop: 8 }}>
          We will get back to you.
        </div>
        <GhostButton onClick={onDone} style={{ margin: "26px auto 0" }}>Back to Startup</GhostButton>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "44px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 4 }}>Startup application</div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Only your own submission is visible to you — other applicants' entries and jury scores are never shown here.
      </div>
      <Card style={{ padding: 26 }}>
        <form onSubmit={submit}>
          <Field label="Startup name" required>
            <input style={inputStyle} value={form.startupName} onChange={set("startupName")} />
          </Field>
          <Field label="Founder name" required>
            <input style={inputStyle} value={form.founderName} onChange={set("founderName")} />
          </Field>
          <Field label="Email" required>
            <input type="email" style={inputStyle} value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <input style={inputStyle} value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Website">
            <input style={inputStyle} value={form.website} onChange={set("website")} placeholder="https://" />
          </Field>
          <Field label="Sector">
            <input style={inputStyle} value={form.sector} onChange={set("sector")} placeholder="e.g. Retail tech, Fintech" />
          </Field>
          <Field label="Stage">
            <input style={inputStyle} value={form.stage} onChange={set("stage")} placeholder="e.g. Seed, Series A" />
          </Field>
          <Field label="Tell us about your startup">
            <textarea style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} value={form.pitch} onChange={set("pitch")} />
          </Field>

          <ErrorBanner text={error} />
          <PrimaryButton type="submit" disabled={submitting} icon={submitting ? Loader2 : ArrowRight} style={{ width: "100%", marginTop: 6 }}>
            {submitting ? "Submitting…" : "Submit application"}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}

/* =========================================================================
   JURY AUTH — login only. Startup jury accounts are created by an admin
   (App.jsx's RiseTeamPanel → POST /api/admin/rise/jury), matching RIOS's
   app-wide rule that no role self-registers — a juror logs in with the
   email + temporary password an admin gave them.
   ========================================================================= */
function JuryLoginView({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.riseJuryLogin(email, password);
      if (user.role !== "rise_jury" && user.role !== "admin") {
        throw new Error("This login isn't set up for the Startup jury.");
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
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink, marginBottom: 22 }}>Jury login</div>
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
          Don't have a login yet? Ask your Startup admin to create one for you.
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   JURY DASHBOARD — progress + list of applications to score
   ========================================================================= */
function JuryDashboardView({ setView, setActiveApplicationId }) {
  const [applications, setApplications] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getRiseApplications(), api.getRiseDashboard()])
      .then(([appsRes, dashRes]) => { setApplications(appsRes.applications); setDashboard(dashRes); })
      .catch((e) => setError(e.message || "Couldn't load applications."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading applications…" />;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.ink }}>Rate startups</div>
      {dashboard && (
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 4 }}>
          You've scored {dashboard.scored} of {dashboard.total} applications.
        </div>
      )}
      <ErrorBanner text={error} />

      {applications.length === 0 ? (
        <EmptyState icon={Building2} title="No applications yet" text="Check back once startups start applying." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 20 }}>
          {groupByOpportunity(applications).map((group) => (
            <div key={group.opportunityId ?? "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13.5, color: BRAND.ink }}>
                  {group.opportunityTitle || "Unassigned"}
                </div>
                {group.opportunityId != null && (
                  <span style={{
                    fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                    color: group.isOpen ? "#1B7A5A" : "#7A746F", background: group.isOpen ? "#E7F5EF" : "#EFEBE7",
                  }}>{group.isOpen ? "Open" : "Closed"}</span>
                )}
                <div style={{ fontFamily: FONT, fontSize: 12, color: "#B7B2AE" }}>
                  {group.apps.length} application{group.apps.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {group.apps.map((a) => (
                  <Card key={a.id} style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{a.startup_name}</div>
                      <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2 }}>
                        {[a.sector, a.stage].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {a.scored_by_me ? (
                        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1B7A5A", background: "#E7F5EF", padding: "4px 10px", borderRadius: 999 }}>
                          Scored · {Number(a.my_total).toFixed(1)}/5
                        </span>
                      ) : (
                        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: BRAND.coralDark, background: "#FCEEE1", padding: "4px 10px", borderRadius: 999 }}>
                          Not scored
                        </span>
                      )}
                      <button
                        onClick={() => { setActiveApplicationId(a.id); setView("jury-score"); }}
                        style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                        aria-label={`Review ${a.startup_name}`}
                      >
                        <ChevronRight size={18} color="#B7B2AE" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Groups a flat, already-ordered applications list into per-opportunity
// sections without re-sorting -- the backend already orders by opportunity
// (newest first) then by application within it, so this just walks the
// list once and breaks on opportunity_id changes.
function groupByOpportunity(applications) {
  const groups = [];
  for (const a of applications) {
    const last = groups[groups.length - 1];
    if (last && last.opportunityId === a.opportunity_id) {
      last.apps.push(a);
    } else {
      groups.push({
        opportunityId: a.opportunity_id,
        opportunityTitle: a.opportunity_title,
        isOpen: a.opportunity_is_open,
        apps: [a],
      });
    }
  }
  return groups;
}

/* =========================================================================
   JURY SCORING — 5 fixed criteria, star rating each
   ========================================================================= */
function JuryScoreView({ applicationId, onBack }) {
  const [application, setApplication] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getRiseApplication(applicationId), api.getRiseCriteria()])
      .then(([appRes, critRes]) => {
        setApplication(appRes.application);
        setCriteria(critRes.criteria);
        if (appRes.myScore) {
          setScores(appRes.myScore.scores);
          setComments(appRes.myScore.comments || "");
        }
      })
      .catch((e) => setError(e.message || "Couldn't load this application."))
      .finally(() => setLoading(false));
  }, [applicationId]);

  async function submit() {
    const missing = criteria.filter((c) => !scores[c.key]);
    if (missing.length) {
      setError(`Rate "${missing[0].label}" before saving.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.submitRiseScore(applicationId, { scores, comments });
      setSaved(true);
    } catch (e) {
      setError(e.message || "Couldn't save your score.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading application…" />;
  if (!application) return <ErrorBanner text={error || "Application not found."} />;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All applications
      </button>

      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 21, color: BRAND.ink }}>{application.startup_name}</div>
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 4 }}>
        {[application.founder_name, application.sector, application.stage].filter(Boolean).join(" · ")}
      </div>
      {application.website && (
        <div style={{ fontFamily: FONT, fontSize: 12.5, marginTop: 4 }}>
          <a href={application.website} target="_blank" rel="noreferrer" style={{ color: BRAND.blue }}>{application.website}</a>
        </div>
      )}
      {application.pitch && (
        <div style={{ fontFamily: FONT, fontSize: 13.5, color: "#4A4642", marginTop: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{application.pitch}</div>
      )}

      <Card style={{ padding: 24, marginTop: 24 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.ink, marginBottom: 18 }}>Your score</div>
        {criteria.map((c) => (
          <div key={c.key} style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink }}>{c.label}</div>
            {c.description && <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2, marginBottom: 8 }}>{c.description}</div>}
            <StarPicker value={scores[c.key] || 0} onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))} />
          </div>
        ))}

        <Field label="Notes (optional, visible to admins only)">
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>

        <ErrorBanner text={error} />
        {saved && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 13, color: "#1B7A5A", marginBottom: 14 }}>
            <CheckCircle2 size={15} /> Score saved.
          </div>
        )}
        <PrimaryButton onClick={submit} disabled={saving} icon={saving ? Loader2 : CheckCircle2} style={{ marginLeft: "auto", marginRight: "auto" }}>
          {saving ? "Saving…" : "Save score"}
        </PrimaryButton>
      </Card>
    </div>
  );
}

/* =========================== ROOT =========================== */
export default function RiseRivApp() {
  const [view, setView] = useState("landing");
  const [session, setSession] = useState(getStoredRiseUser());
  const [opportunity, setOpportunity] = useState(null);
  const [oppLoading, setOppLoading] = useState(true);
  const [activeApplicationId, setActiveApplicationId] = useState(null);

  useEffect(() => {
    api.getRiseOpportunity()
      .then((d) => setOpportunity(d.opportunity))
      .finally(() => setOppLoading(false));
  }, []);

  function handleAuthed(token, user) {
    setRiseSession(token, user);
    setSession(user);
    setView("jury-dashboard");
  }
  function handleLogout() {
    clearRiseSession();
    setSession(null);
    setView("landing");
  }
  function goToView(v) {
    if (v === "jury-dashboard" && !session) { setView("jury-login"); return; }
    setView(v);
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh" }}>
      <style>{`
        .rise-spin { animation: rise-spin 0.8s linear infinite; }
        @keyframes rise-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <RiseNavBar view={view} setView={goToView} session={session} onLogout={handleLogout} />

      {view === "landing" && <LandingView opportunity={opportunity} loading={oppLoading} setView={goToView} />}
      {view === "apply" && <ApplyView onDone={() => goToView("landing")} />}
      {view === "jury-login" && <JuryLoginView onAuthed={handleAuthed} />}
      {view === "jury-dashboard" && session && (
        <JuryDashboardView setView={goToView} setActiveApplicationId={setActiveApplicationId} />
      )}
      {view === "jury-score" && session && activeApplicationId && (
        <JuryScoreView applicationId={activeApplicationId} onBack={() => setView("jury-dashboard")} />
      )}
    </div>
  );
}
