import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Lightbulb, Plus, Trash2, LogOut,
  CheckCircle2, ArrowRight, Sparkles, Gavel, ChevronRight,
  ChevronLeft, Loader2, Compass, Trophy, UserCircle2,
  ClipboardList, Star, AlertCircle,
} from "lucide-react";
import { api, getStoredIdeasUser, setIdeasSession, clearIdeasSession } from "./api.js";
import { BRAND } from "./brand.js";

const FONT = "'Poppins',sans-serif";
const SERIF = "'Newsreader',Georgia,serif";

function fmtMoney(n) {
  if (!n) return "$0";
  if (n >= 1e7) return "$" + (n / 1e7).toFixed(1) + "Cr";
  if (n >= 1e5) return "$" + (n / 1e5).toFixed(1) + "L";
  return "$" + Math.round(n).toLocaleString();
}

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

/* =========================================================================
   SMALL UI PRIMITIVES
   ========================================================================= */
function Pill({ children, tone = "default" }) {
  const tones = {
    default: { bg: "#EFEAE4", color: BRAND.ink },
    coral: { bg: "#FCEEE1", color: BRAND.coralDark },
    green: { bg: "#E7F5EF", color: "#1B7A5A" },
    blue: { bg: "#EAF0FE", color: BRAND.blue },
  };
  const t = tones[tone] || tones.default;
  return (
    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: t.color, background: t.bg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, style, icon: Icon }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: FONT, fontWeight: 600, fontSize: 13.5, background: disabled ? "#E7B4B4" : BRAND.coral,
      color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px",
      cursor: disabled ? "not-allowed" : "pointer", transition: "background .15s", ...style,
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
      <Loader2 size={16} className="crit-spin" /> {label || "Loading…"}
    </div>
  );
}

/* =========================================================================
   TOP NAV
   ========================================================================= */
function IdeasNavBar({ view, setView, session, onLogout }) {
  const items = [{ id: "landing", label: "Opportunities" }];
  if (session?.role === "employee") items.push({ id: "my-ideas", label: "My submissions" });
  if (session?.role === "jury") items.push({ id: "jury", label: "Rate ideas" }, { id: "leaderboard", label: "Leaderboard" });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <img src="/rios-logo-mark.png" alt="Retail Innovation Ventures" style={{ width: 32, height: 32, objectFit: "contain" }} />
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em", color: BRAND.ink }}>Ideas<span style={{ color: BRAND.coral }}>.RIV</span></span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {items.map((it) => (
              <button key={it.id} onClick={() => setView(it.id)} style={{
                fontFamily: FONT, fontSize: 13.5, fontWeight: 500, padding: "8px 14px", borderRadius: 999,
                border: "none", cursor: "pointer", background: view === it.id ? BRAND.ink : "transparent",
                color: view === it.id ? "#fff" : BRAND.ink, transition: "all .15s",
              }}>{it.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {session ? (
            <>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{session.name}</div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F", textTransform: "capitalize" }}>{session.role === "jury" ? "Leader · Jury member" : "Employee"}</div>
              </div>
              <button onClick={onLogout} title="Log out" style={{
                display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}`,
              }}><LogOut size={13} /> Log out</button>
            </>
          ) : (
            <>
              <GhostButton onClick={() => setView("login-employee")} icon={UserCircle2}>Employee login</GhostButton>
              <PrimaryButton onClick={() => setView("login-jury")} icon={Gavel}>Leader login</PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   OPPORTUNITY CARD (landing grid)
   ========================================================================= */
function OpportunityCard({ opp, ideaCount, onOpen }) {
  return (
    <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp.module} · {opp.submodule}</div>
        {opp.hasDollar ? (
          <Pill tone="coral">{fmtMoney(opp.revLow + opp.costLow)} – {fmtMoney(opp.revHigh + opp.costHigh)}</Pill>
        ) : (
          <Pill tone="coral">AI weight ×{opp.weight}</Pill>
        )}
      </div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14.5, color: BRAND.ink, lineHeight: 1.5 }}>&ldquo;{opp.q}&rdquo;</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 12, borderTop: `1px solid ${BRAND.line}` }}>
        <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>{ideaCount} idea{ideaCount !== 1 ? "s" : ""} submitted</div>
        <button onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.coralDark, background: "none", border: "none", cursor: "pointer" }}>
          View &amp; submit <ChevronRight size={14} />
        </button>
      </div>
    </Card>
  );
}

/* =========================================================================
   LANDING VIEW
   ========================================================================= */
function LandingView({ session, setView, opportunities, ideas, loading, error, sourceClient, setActiveOpp }) {
  return (
    <div>
      <div style={{ background: BRAND.ink, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -180, right: -160, width: 480, height: 480, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.coral}55 0%, transparent 70%)` }} />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 24px 56px", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F3B4B5", border: "1px solid #4a4442", borderRadius: 999, padding: "6px 14px", marginBottom: 24 }}>
            <Sparkles size={13} /> Sourced from a live Discover Audit
          </div>
          <h1 style={{ fontFamily: FONT, fontWeight: 600, fontSize: "clamp(28px,4.2vw,44px)", lineHeight: 1.12, letterSpacing: "-0.02em", maxWidth: 720, margin: 0 }}>
            Five gaps. Turn each one into ideas worth funding.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(15px,1.6vw,18px)", color: "#D8D3CF", maxWidth: 600, marginTop: 18, lineHeight: 1.6 }}>
            {sourceClient
              ? `These five opportunities are the current Top 5 from ${sourceClient.company || sourceClient.name}'s scored audit. Employees submit ideas against each one; leaders sit as jury and rate them.`
              : "Employees submit ideas against each opportunity; leaders sit as jury and rate them."}
          </p>
          {!session && (
            <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
              <PrimaryButton onClick={() => setView("login-employee")} icon={UserCircle2}>Log in as employee</PrimaryButton>
              <GhostButton onClick={() => setView("login-jury")} icon={Gavel} style={{ background: "transparent", color: "#fff", borderColor: "#4a4442" }}>Log in as leader / jury</GhostButton>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Compass size={17} color={BRAND.coral} />
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 17, color: BRAND.ink }}>All 5 innovation opportunities</div>
        </div>

        {!session && (
          <EmptyState icon={UserCircle2} title="Log in to see this audit's live opportunities" text="These are pulled from a real client's scored assessment, so they're only visible once you're signed in as an employee or a jury member." />
        )}

        {session && loading && <Spinner label="Loading opportunities…" />}
        {session && !loading && error && <ErrorBanner text={error} />}
        {session && !loading && !error && opportunities.length === 0 && (
          <EmptyState icon={Compass} title="No source audit configured yet" text="An admin needs to pick which client's scored audit feeds Ideas.RIV before opportunities show up here." />
        )}

        {session && !loading && !error && opportunities.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                ideaCount={ideas.filter((i) => i.question_id === opp.id).length}
                onOpen={() => {
                  setActiveOpp(opp.id);
                  if (session.role === "employee") setView("submit");
                  else if (session.role === "jury") setView("jury");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN VIEW — real email + password against your users table
   ========================================================================= */
function LoginView({ role, onLogin, setView }) {
  const isJury = role === "jury";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.login(email.trim(), password);
      if (user.role !== role) {
        setError(`That account is logged in as "${user.role}", not "${role}" — use the ${user.role === "jury" ? "Leader" : "Employee"} login instead.`);
        setSubmitting(false);
        return;
      }
      setIdeasSession(token, user);
      onLogin(user);
    } catch (e) {
      setError(e.message || "Login failed.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "70px auto", padding: "0 24px" }}>
      <Card style={{ padding: 32 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: isJury ? "#EAF0FE" : "#FCEEE1", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          {isJury ? <Gavel size={20} color={BRAND.blue} /> : <UserCircle2 size={20} color={BRAND.coralDark} />}
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>{isJury ? "Leader login" : "Employee login"}</div>
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 6, lineHeight: 1.6 }}>
          {isJury ? "Sign in as a jury member to rate ideas submitted against the five opportunities." : "Sign in to submit ideas against any of the five innovation opportunities."}
        </div>

        <ErrorBanner text={error} />

        <div style={{ marginTop: error ? 0 : 24 }}>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="you@company.com" style={{
            width: "100%", marginTop: 6, marginBottom: 14, fontFamily: FONT, fontSize: 14, padding: "11px 13px", borderRadius: 9,
            border: `1px solid ${BRAND.line}`, boxSizing: "border-box",
          }} />
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} placeholder="••••••••" style={{
            width: "100%", marginTop: 6, fontFamily: FONT, fontSize: 14, padding: "11px 13px", borderRadius: 9,
            border: `1px solid ${BRAND.line}`, boxSizing: "border-box",
          }} />
        </div>
        <PrimaryButton
          disabled={!email.trim() || !password || submitting}
          onClick={handleSubmit}
          icon={submitting ? Loader2 : ArrowRight}
          style={{ width: "100%", marginTop: 20 }}
        >
          {submitting ? "Signing in…" : isJury ? "Enter as jury member" : "Enter"}
        </PrimaryButton>
        <button onClick={() => setView("landing")} style={{ display: "block", margin: "16px auto 0", fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer" }}>
          ← Back to opportunities
        </button>
      </Card>
    </div>
  );
}

/* =========================================================================
   EMPLOYEE — submit ideas view
   ========================================================================= */
function SubmitIdeasView({ opp, ideas, onIdeasChanged, setView }) {
  const [rows, setRows] = useState([{ id: uid("row"), title: "", description: "" }]);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!opp) {
    return (
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "60px 24px" }}>
        <EmptyState icon={Lightbulb} title="Pick an opportunity first" text="Choose one of the five innovation opportunities to submit ideas against it." />
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <GhostButton onClick={() => setView("landing")} icon={Compass}>Browse opportunities</GhostButton>
        </div>
      </div>
    );
  }

  const existing = ideas.filter((i) => i.question_id === opp.id);

  function updateRow(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: uid("row"), title: "", description: "" }]);
  }
  function removeRow(id) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }

  async function handleSubmit() {
    const valid = rows.filter((r) => r.title.trim());
    if (valid.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitIdeas(valid.map((r) => ({ questionId: opp.id, title: r.title.trim(), description: r.description.trim() })));
      setRows([{ id: uid("row"), title: "", description: "" }]);
      setJustSubmitted(true);
      await onIdeasChanged();
      setTimeout(() => setJustSubmitted(false), 3200);
    } catch (e) {
      setError(e.message || "Couldn't submit — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 100px" }}>
      <button onClick={() => setView("landing")} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All opportunities
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp.module} · {opp.submodule}</div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 20, color: BRAND.ink, marginTop: 6, lineHeight: 1.45 }}>&ldquo;{opp.q}&rdquo;</div>

      {justSubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 16px", borderRadius: 12, background: "#E7F5EF", border: "1px solid #C7E8D8" }}>
          <CheckCircle2 size={16} color="#1B7A5A" />
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>Idea(s) submitted — the jury will rate these.</div>
        </div>
      )}

      <Card style={{ padding: 24, marginTop: 24 }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink, marginBottom: 4 }}>Submit your idea{rows.length > 1 ? "s" : ""}</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 18 }}>Start with one idea below — use the + button to add as many more as you like for this opportunity.</div>

        <ErrorBanner text={error} />

        {rows.map((r, i) => (
          <div key={r.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, marginBottom: 14, position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12, color: "#9B958F" }}>Idea {i + 1}</div>
              {rows.length > 1 && (
                <button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B7B2AE" }} title="Remove">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <input
              value={r.title}
              onChange={(e) => updateRow(r.id, "title", e.target.value)}
              placeholder="Idea title — e.g. Weekly AI stand-up for the exec team"
              style={{ width: "100%", fontFamily: FONT, fontSize: 14, fontWeight: 500, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, boxSizing: "border-box", marginBottom: 8 }}
            />
            <textarea
              value={r.description}
              onChange={(e) => updateRow(r.id, "description", e.target.value)}
              placeholder="A couple of sentences on how it works and why it closes this gap..."
              rows={3}
              style={{ width: "100%", fontFamily: FONT, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, boxSizing: "border-box", resize: "vertical" }}
            />
          </div>
        ))}

        <button onClick={addRow} style={{
          display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontWeight: 600, fontSize: 12.5,
          color: BRAND.coralDark, background: "#FCEEE1", border: "none", borderRadius: 9, padding: "9px 14px", cursor: "pointer", marginBottom: 18,
        }}>
          <Plus size={14} /> Add another idea
        </button>

        <div>
          <PrimaryButton onClick={handleSubmit} disabled={submitting} icon={submitting ? Loader2 : Send}>
            {submitting ? "Submitting…" : "Submit to jury"}
          </PrimaryButton>
        </div>
      </Card>

      {existing.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink, marginBottom: 12 }}>Already submitted for this opportunity ({existing.length})</div>
          {existing.map((idea) => (
            <Card key={idea.id} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 13.5, color: BRAND.ink }}>{idea.title}</div>
              {idea.description && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginTop: 4, lineHeight: 1.5 }}>{idea.description}</div>}
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 8 }}>Submitted by {idea.submitted_by_name || "you"}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   MY SUBMISSIONS (employee)
   ========================================================================= */
function MyIdeasView({ myIdeas, loading, error }) {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>My submissions</div>
      {loading && <Spinner />}
      <ErrorBanner text={error} />
      {!loading && !error && myIdeas.length === 0 && (
        <EmptyState icon={Lightbulb} title="You haven't submitted any ideas yet" text="Pick an opportunity from the landing page to submit your first idea." />
      )}
      {!loading && myIdeas.map((idea) => (
        <Card key={idea.id} style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{idea.question?.module} · {idea.question?.submodule}</div>
          <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14.5, color: BRAND.ink, marginTop: 3 }}>{idea.title}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            {idea.avg_score !== null ? <Pill tone="blue">{idea.avg_score.toFixed(1)}/5 avg · {idea.rating_count} rating{idea.rating_count !== 1 ? "s" : ""}</Pill> : <Pill>Awaiting jury rating</Pill>}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* =========================================================================
   JURY — list of ideas to rate
   ========================================================================= */
function JuryListView({ opportunities, ideas, myRatings, loading, error, setActiveIdea }) {
  const grouped = opportunities
    .map((opp) => ({ opp, ideas: ideas.filter((i) => i.question_id === opp.id) }))
    .filter((g) => g.ideas.length > 0);

  if (loading) return <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}><Spinner label="Loading ideas…" /></div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Gavel size={17} color={BRAND.blue} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Rate submitted ideas</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Rate each submitted idea out of 5. Ratings from all jury members are averaged into the leaderboard.
      </div>

      <ErrorBanner text={error} />

      {grouped.length === 0 && !error && (
        <EmptyState icon={ClipboardList} title="No ideas submitted yet" text="Once employees submit ideas against an opportunity, they'll show up here for the jury to rate." />
      )}

      {grouped.map(({ opp, ideas: ideaList }) => (
        <div key={opp.id} style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink, marginBottom: 10 }}>{opp.module} · {opp.submodule}</div>
          {ideaList.map((idea) => {
            const myRating = myRatings[idea.id];
            return (
              <Card key={idea.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14, color: BRAND.ink }}>{idea.title}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 4 }}>
                    By {idea.submitted_by_name} · {idea.rating_count} jury rating{idea.rating_count !== 1 ? "s" : ""}
                  </div>
                </div>
                {myRating ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Pill tone="green">You rated {Number(myRating.score)}/5</Pill>
                    <GhostButton onClick={() => setActiveIdea(idea.id)} icon={Star}>Change rating</GhostButton>
                  </div>
                ) : (
                  <PrimaryButton onClick={() => setActiveIdea(idea.id)} icon={Star}>Rate idea</PrimaryButton>
                )}
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   SIMPLE RATING FLOW — jury rates an idea out of 5, no AI interview.
   (The CRIT-guided flow this replaced is still fully intact server-side —
   see backend/routes/critAssistant.js and lib/ideasScoring.js — so it can
   be switched back on later without rebuilding anything.)
   ========================================================================= */
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`Rate ${n} out of 5`}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <Star size={30} color={filled ? BRAND.coral : "#D9D3CC"} fill={filled ? BRAND.coral : "none"} />
          </button>
        );
      })}
    </div>
  );
}

function SimpleRatingView({ idea, existingRating, onSaveRating, onBack }) {
  const opp = idea.question;
  const [score, setScore] = useState(existingRating ? Number(existingRating.score) : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function confirmSave() {
    if (!score) { setError("Pick a star rating first."); return; }
    setSaving(true);
    setError(null);
    try {
      const rating = await api.submitRating(idea.id, { score });
      onSaveRating(rating.rating);
    } catch (e) {
      setError(e.message || "Couldn't save the rating — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All ideas to rate
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp?.module} · {opp?.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 21, color: BRAND.ink, marginTop: 4 }}>{idea.title}</div>
      {idea.description && <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{idea.description}</div>}
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 6 }}>Submitted by {idea.submitted_by_name}</div>

      <Card style={{ padding: 26, marginTop: 24, textAlign: "center" }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 16 }}>Your rating</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <StarPicker value={score} onChange={setScore} />
        </div>
        {score > 0 && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 10 }}>{score} out of 5</div>}

        <ErrorBanner text={error} />

        <PrimaryButton onClick={confirmSave} disabled={saving} icon={saving ? Loader2 : CheckCircle2} style={{ marginTop: 22, marginLeft: "auto", marginRight: "auto" }}>
          {saving ? "Saving…" : existingRating ? "Update rating" : "Save rating"}
        </PrimaryButton>
      </Card>
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD — top ideas by average jury score
   ========================================================================= */
function LeaderboardView({ leaderboard, loading, error }) {
  if (loading) return <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Trophy size={17} color={BRAND.coral} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Leader dashboard — top ideas</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Ranked by average jury star rating. The top 3 are published below.
      </div>

      <ErrorBanner text={error} />

      {!loading && !error && leaderboard.length === 0 && (
        <EmptyState icon={Trophy} title="No rated ideas yet" text="Once jury members rate ideas, the top-scoring ones will publish here automatically." />
      )}

      {leaderboard.map((r, i) => (
        <Card key={r.id} style={{ padding: 18, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONT, fontWeight: 700, fontSize: 13,
              background: r.published ? BRAND.coral : "#EFEAE4", color: r.published ? "#fff" : BRAND.ink,
            }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{r.question?.module} · {r.question?.submodule}</div>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14.5, color: BRAND.ink, marginTop: 2 }}>{r.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 4 }}>By {r.submitted_by_name} · {r.rating_count} jury rating{r.rating_count !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {r.published && <Pill tone="green">Published</Pill>}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{r.avg_score.toFixed(1)}</div>
              <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F" }}>/ 5 avg</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* =========================================================================
   ROOT
   ========================================================================= */
export default function IdeasRivApp() {
  const [view, setView] = useState("landing");
  const [session, setSessionState] = useState(() => {
    const u = getStoredIdeasUser();
    return u && (u.role === "employee" || u.role === "jury") ? u : null;
  });

  const [opportunities, setOpportunities] = useState([]);
  const [sourceClient, setSourceClient] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [myIdeas, setMyIdeas] = useState([]);
  const [myRatings, setMyRatings] = useState({}); // ideaId -> rating
  const [leaderboard, setLeaderboard] = useState([]);

  const [loadingOpps, setLoadingOpps] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState(null);

  const [activeOppId, setActiveOppId] = useState(null);
  const [activeIdeaId, setActiveIdeaId] = useState(null);

  const activeOpp = opportunities.find((o) => o.id === activeOppId) || null;
  const activeIdea = ideas.find((i) => i.id === activeIdeaId) || null;

  const refreshIdeas = useCallback(async () => {
    setLoadingIdeas(true);
    setError(null);
    try {
      const { ideas: rows } = await api.getIdeas();
      setIdeas(rows);
      if (session?.role === "jury") {
        const pairs = await Promise.all(
          rows.map((idea) => api.getMyRatingForIdea(idea.id).then((r) => [idea.id, r.rating]).catch(() => [idea.id, null]))
        );
        setMyRatings(Object.fromEntries(pairs.filter(([, r]) => r)));
      }
    } catch (e) {
      setError(e.message || "Couldn't load ideas.");
    } finally {
      setLoadingIdeas(false);
    }
  }, [session]);

  // Load opportunities + ideas once a session exists
  useEffect(() => {
    if (!session) return;
    setLoadingOpps(true);
    api.getOpportunities()
      .then((d) => { setOpportunities(d.opportunities || []); setSourceClient(d.sourceClient || null); })
      .catch((e) => setError(e.message || "Couldn't load opportunities."))
      .finally(() => setLoadingOpps(false));
    refreshIdeas();
  }, [session, refreshIdeas]);

  // My submissions (employee)
  useEffect(() => {
    if (session?.role !== "employee" || view !== "my-ideas") return;
    api.getMyIdeas().then((d) => setMyIdeas(d.ideas || [])).catch((e) => setError(e.message));
  }, [session, view]);

  // Leaderboard (jury)
  useEffect(() => {
    if (session?.role !== "jury" || view !== "leaderboard") return;
    setLoadingBoard(true);
    api.getLeaderboard()
      .then((d) => setLeaderboard(d.leaderboard || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingBoard(false));
  }, [session, view]);

  function handleLogin(user) {
    setSessionState(user);
    setView(user.role === "jury" ? "jury" : "landing");
  }
  function handleLogout() {
    clearIdeasSession();
    setSessionState(null);
    setView("landing");
    setActiveOppId(null);
    setActiveIdeaId(null);
    setOpportunities([]); setIdeas([]); setMyIdeas([]); setMyRatings({}); setLeaderboard([]);
  }

  function handleSaveRating(rating) {
    setMyRatings((m) => ({ ...m, [rating.idea_id]: rating }));
    setActiveIdeaId(null);
    refreshIdeas();
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100%" }}>
      {/* Fonts, box-sizing, and focus rings are already set globally by RiosApp's own <style> block —
          this component only adds the keyframe its loading spinner needs. */}
      <style>{`
        .crit-spin { animation: crit-spin 0.8s linear infinite; }
        @keyframes crit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .crit-spin { animation: none; } }
      `}</style>

      <IdeasNavBar view={view} setView={setView} session={session} onLogout={handleLogout} />

      {view === "landing" && (
        <LandingView
          session={session} setView={setView}
          opportunities={opportunities} ideas={ideas}
          loading={loadingOpps} error={error} sourceClient={sourceClient}
          setActiveOpp={setActiveOppId}
        />
      )}

      {view === "login-employee" && <LoginView role="employee" onLogin={handleLogin} setView={setView} />}
      {view === "login-jury" && <LoginView role="jury" onLogin={handleLogin} setView={setView} />}

      {view === "submit" && session?.role === "employee" && (
        <SubmitIdeasView opp={activeOpp} ideas={ideas} onIdeasChanged={refreshIdeas} setView={setView} />
      )}

      {view === "my-ideas" && session?.role === "employee" && (
        <MyIdeasView myIdeas={myIdeas} loading={false} error={error} />
      )}

      {view === "jury" && session?.role === "jury" && (
        <JuryListView
          opportunities={opportunities} ideas={ideas} myRatings={myRatings}
          loading={loadingIdeas} error={error} setActiveIdea={setActiveIdeaId}
        />
      )}

      {view === "leaderboard" && session?.role === "jury" && (
        <LeaderboardView leaderboard={leaderboard} loading={loadingBoard} error={error} />
      )}

      {/* Rating overlay */}
      {activeIdeaId && activeIdea && session?.role === "jury" && view === "jury" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.5)", zIndex: 60, overflowY: "auto" }}>
          <div style={{ background: BRAND.cream, minHeight: "100%" }}>
            <SimpleRatingView
              idea={activeIdea}
              existingRating={myRatings[activeIdea.id] || null}
              onSaveRating={handleSaveRating}
              onBack={() => setActiveIdeaId(null)}
            />
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${BRAND.line}`, padding: "28px 24px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "#B7B2AE" }}>
        Ideas.RIV — submit and rate innovation ideas from your live Discover Audit.
      </div>
    </div>
  );
}