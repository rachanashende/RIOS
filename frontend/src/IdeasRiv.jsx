import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Lightbulb, Plus, Trash2, LogOut, MessageSquare, Send, BadgeCheck,
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
function RatingBreakdown({ ratings }) {
  if (!ratings.length) return null;
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BRAND.line}`, display: "flex", flexDirection: "column", gap: 12 }}>
      {ratings.map((r) => {
        const isCrit = r.impact !== null && r.impact !== undefined;
        return (
          <div key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, color: BRAND.ink }}>{r.jury_name}</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: BRAND.ink }}>{Number(r.score).toFixed(isCrit ? 1 : 0)}/{isCrit ? 10 : 5}</div>
            </div>
            {isCrit ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                  {[["Impact", r.impact], ["Feasibility", r.feasibility], ["Innovation", r.innovation], ["Cost-effectiveness", r.cost]].map(([label, v]) => (
                    <div key={label} style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>
                      {label}: <span style={{ color: BRAND.ink, fontWeight: 600 }}>{Number(v).toFixed(1)}/10</span>
                    </div>
                  ))}
                </div>
                {r.rationale && (
                  <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: "#7A746F", marginTop: 8, lineHeight: 1.55 }}>
                    &ldquo;{r.rationale}&rdquo;
                  </div>
                )}
                <div style={{ fontFamily: FONT, fontSize: 10, color: "#B7B2AE", marginTop: 6 }}>Rated via the CRIT interview flow (0-10 scale)</div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={14} color={n <= Number(r.score) ? BRAND.coral : "#D9D3CC"} fill={n <= Number(r.score) ? BRAND.coral : "none"} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MyIdeasView({ myIdeas, loading, error }) {
  const [ratingsByIdea, setRatingsByIdea] = useState({}); // ideaId -> ratings[] | "loading"
  const [expanded, setExpanded] = useState({}); // ideaId -> bool

  function toggleWhy(idea) {
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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>My submissions</div>
      {loading && <Spinner />}
      <ErrorBanner text={error} />
      {!loading && !error && myIdeas.length === 0 && (
        <EmptyState icon={Lightbulb} title="You haven't submitted any ideas yet" text="Pick an opportunity from the landing page to submit your first idea." />
      )}
      {!loading && myIdeas.map((idea) => {
        // A rating saved before CRIT was removed lives on a 0-10 scale, not
        // 1-5 — has_crit_rating (computed server-side) picks the right
        // denominator so this never shows something impossible like "6.6/5".
        const denom = idea.has_crit_rating ? 10 : 5;
        const isOpen = !!expanded[idea.id];
        const ratings = ratingsByIdea[idea.id];
        return (
          <Card key={idea.id} style={{ padding: 16, marginBottom: 10 }}>
            <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{idea.question?.module} · {idea.question?.submodule}</div>
            <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14.5, color: BRAND.ink, marginTop: 3 }}>{idea.title}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {idea.avg_score !== null ? (
                <>
                  <Pill tone="blue">{idea.avg_score.toFixed(1)}/{denom} avg · {idea.rating_count} rating{idea.rating_count !== 1 ? "s" : ""}</Pill>
                  <button onClick={() => toggleWhy(idea)} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: FONT, fontWeight: 600, fontSize: 11.5, color: BRAND.coralDark, background: "none", border: "none", cursor: "pointer" }}>
                    {isOpen ? "Hide" : "Why this score?"} {isOpen ? <ChevronRight size={12} style={{ transform: "rotate(90deg)" }} /> : <ChevronRight size={12} />}
                  </button>
                </>
              ) : <Pill>Awaiting jury rating</Pill>}
            </div>
            {isOpen && (
              ratings === "loading" || ratings === undefined ? (
                <div style={{ marginTop: 12 }}><Spinner label="Loading breakdown…" /></div>
              ) : (
                <RatingBreakdown ratings={ratings} />
              )
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* =========================================================================
   JURY — list of ideas to rate
   ========================================================================= */
function JuryListView({ opportunities, ideas, myRatings, loading, error, onOpenIdea }) {
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
        Rate each submitted idea — either a quick 1-5 star pick, or the CRIT-guided AI interview. Ratings from all jury members are averaged into the leaderboard.
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
                    <Pill tone="green">You rated {Number(myRating.score).toFixed(myRating.impact != null ? 1 : 0)}/{myRating.impact != null ? 10 : 5}</Pill>
                    <GhostButton onClick={() => onOpenIdea(idea)} icon={Star}>Change rating</GhostButton>
                  </div>
                ) : (
                  <PrimaryButton onClick={() => onOpenIdea(idea)} icon={Star}>Rate idea</PrimaryButton>
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
   RATING METHOD CHOICE — jury picks quick stars or the CRIT interview
   ========================================================================= */
function MethodCard({ icon: Icon, title, desc, onClick, accent }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left",
      border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 18, background: "#fff",
      cursor: "pointer", width: "100%",
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: accent === "coral" ? "#FCEEE1" : "#EAF0FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color={accent === "coral" ? BRAND.coralDark : BRAND.blue} />
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <ChevronRight size={16} color="#B7B2AE" style={{ marginLeft: "auto", flexShrink: 0, marginTop: 10 }} />
    </button>
  );
}

function RatingMethodChoice({ idea, onChoose, onBack }) {
  const opp = idea.question;
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All ideas to rate
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp?.module} · {opp?.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 21, color: BRAND.ink, marginTop: 4 }}>{idea.title}</div>
      {idea.description && <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{idea.description}</div>}
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 6 }}>Submitted by {idea.submitted_by_name}</div>

      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginTop: 26, marginBottom: 12 }}>How do you want to rate this idea?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <MethodCard
          icon={Star} accent="coral"
          title="Quick rating"
          desc="Pick 1-5 stars. Done in seconds."
          onClick={() => onChoose("simple")}
        />
        <MethodCard
          icon={Sparkles} accent="blue"
          title="CRIT-guided interview"
          desc="Context, Role, Interview me, Task — a short AI-guided conversation that draws out your reasoning and ends in a structured, weighted score."
          onClick={() => onChoose("crit")}
        />
      </div>
    </div>
  );
}

/* =========================================================================
   CRIT RATING FLOW — Context, Role, Interview me, Task
   ========================================================================= */
const CRIT_CRITERIA = [
  { key: "impact", label: "Impact", weight: 0.35 },
  { key: "feasibility", label: "Feasibility", weight: 0.25 },
  { key: "innovation", label: "Innovation", weight: 0.25 },
  { key: "cost", label: "Cost-effectiveness", weight: 0.15 },
];
function critWeightedAvg(scores) {
  let total = 0;
  CRIT_CRITERIA.forEach((c) => { total += (scores[c.key] || 0) * c.weight; });
  return total;
}
function clampCrit10(n) { n = Number(n); if (isNaN(n)) return 0; return Math.max(0, Math.min(10, n)); }

const CRIT_STEPS = [
  { key: "context", label: "Context" },
  { key: "role", label: "Role" },
  { key: "interview", label: "Interview me" },
  { key: "task", label: "Task" },
];

function StepDots({ stepIdx }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
      {CRIT_STEPS.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <div style={{
            width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT, fontWeight: 700, fontSize: 11,
            background: i < stepIdx ? "#1B7A5A" : i === stepIdx ? BRAND.blue : "#EFEAE4",
            color: i <= stepIdx ? "#fff" : "#9B958F",
          }}>{i < stepIdx ? <CheckCircle2 size={13} /> : i + 1}</div>
          <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: i === stepIdx ? 700 : 500, color: i === stepIdx ? BRAND.ink : "#9B958F" }}>{s.label}</div>
          {i < CRIT_STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: BRAND.line, marginLeft: 4 }} />}
        </div>
      ))}
    </div>
  );
}

function CritRatingView({ idea, existingRating, onSaveRating, onBack }) {
  const opp = idea.question;
  const hasExistingCrit = existingRating && existingRating.impact !== null && existingRating.impact !== undefined;
  const [stepIdx, setStepIdx] = useState(hasExistingCrit ? 3 : 0);
  const [messages, setMessages] = useState(
    hasExistingCrit && existingRating.transcript?.length ? existingRating.transcript : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalScores, setFinalScores] = useState(
    hasExistingCrit
      ? { impact: Number(existingRating.impact), feasibility: Number(existingRating.feasibility), innovation: Number(existingRating.innovation), cost: Number(existingRating.cost), rationale: existingRating.rationale }
      : null
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  const callAssistant = useCallback(async (history) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.critTurn(idea.id, history);
      if (result.type === "final") {
        setFinalScores({
          impact: clampCrit10(result.scores.impact),
          feasibility: clampCrit10(result.scores.feasibility),
          innovation: clampCrit10(result.scores.innovation),
          cost: clampCrit10(result.scores.cost),
          rationale: result.scores.rationale || "",
        });
        setStepIdx(3);
      } else {
        setMessages((ms) => [...ms, { role: "assistant", text: result.text }]);
      }
    } catch (e) {
      setError(e.message || "Couldn't reach the AI jury assistant. You can try again.");
    } finally {
      setLoading(false);
    }
  }, [idea.id]);

  useEffect(() => {
    if (stepIdx === 2 && !startedRef.current && !hasExistingCrit) {
      startedRef.current = true;
      callAssistant([]);
    }
  }, [stepIdx, callAssistant, hasExistingCrit]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function sendAnswer() {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user", text: input.trim() }];
    setMessages(next);
    setInput("");
    callAssistant(next);
  }

  async function confirmSave() {
    setSaving(true);
    setError(null);
    try {
      const rating = await api.submitRating(idea.id, {
        impact: finalScores.impact,
        feasibility: finalScores.feasibility,
        innovation: finalScores.innovation,
        cost: finalScores.cost,
        rationale: finalScores.rationale,
        transcript: messages,
      });
      onSaveRating(rating.rating);
    } catch (e) {
      setError(e.message || "Couldn't save the rating — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All ideas to rate
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp?.module} · {opp?.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 21, color: BRAND.ink, marginTop: 4 }}>{idea.title}</div>
      {idea.description && <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{idea.description}</div>}
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 6 }}>Submitted by {idea.submitted_by_name}</div>

      <div style={{ marginTop: 26 }}>
        <StepDots stepIdx={stepIdx} />
      </div>

      <ErrorBanner text={error} />

      {stepIdx === 0 && (
        <Card style={{ padding: 22 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 8 }}>Context</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", lineHeight: 1.6 }}>
            This idea targets the opportunity <strong>&ldquo;{opp?.q}&rdquo;</strong>. That context, plus the idea's title and description, is passed to the AI jury assistant automatically — pulled fresh from the database, not from anything typed in this browser.
          </div>
          <PrimaryButton onClick={() => setStepIdx(1)} icon={ArrowRight} style={{ marginTop: 18 }}>Continue to Role</PrimaryButton>
        </Card>
      )}

      {stepIdx === 1 && (
        <Card style={{ padding: 22 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 8 }}>Role</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", lineHeight: 1.6 }}>
            The assistant will act as a sharp, fair retail-innovation jury advisor — candid and concise, never a yes-man. It'll interview <em>you</em>, then turn your answers into a scored recommendation.
          </div>
          <PrimaryButton onClick={() => setStepIdx(2)} icon={ArrowRight} style={{ marginTop: 18 }}>Start the interview</PrimaryButton>
        </Card>
      )}

      {stepIdx === 2 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BRAND.line}`, display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={15} color={BRAND.blue} />
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: BRAND.ink }}>Interview me</div>
          </div>
          <div ref={scrollRef} style={{ height: 320, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "assistant" ? "flex-start" : "flex-end", maxWidth: "85%" }}>
                <div style={{
                  fontFamily: FONT, fontSize: 13, lineHeight: 1.55, padding: "10px 14px", borderRadius: 12,
                  background: m.role === "assistant" ? BRAND.cream : BRAND.blue,
                  color: m.role === "assistant" ? BRAND.ink : "#fff",
                  border: m.role === "assistant" ? `1px solid ${BRAND.line}` : "none",
                }}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: "#9B958F", fontFamily: FONT, fontSize: 12 }}>
                <Loader2 size={13} className="crit-spin" /> Thinking…
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 14, borderTop: `1px solid ${BRAND.line}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
              placeholder="Type your answer…"
              disabled={loading}
              style={{ flex: 1, fontFamily: FONT, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}` }}
            />
            <PrimaryButton onClick={sendAnswer} disabled={loading || !input.trim()} icon={Send}>Send</PrimaryButton>
          </div>
        </Card>
      )}

      {stepIdx === 3 && finalScores && (
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <BadgeCheck size={16} color="#1B7A5A" />
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink }}>Task — structured score</div>
          </div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 16 }}>Generated from your interview answers. Review before saving — this is what feeds the leaderboard.</div>

          {CRIT_CRITERIA.map((c) => (
            <div key={c.key} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 12.5 }}>
                <span style={{ color: BRAND.ink, fontWeight: 500 }}>{c.label} <span style={{ color: "#B7B2AE", fontWeight: 400 }}>({Math.round(c.weight * 100)}% weight)</span></span>
                <span style={{ color: BRAND.ink, fontWeight: 700 }}>{finalScores[c.key].toFixed(1)}/10</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#EFEAE4", marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${finalScores[c.key] * 10}%`, background: BRAND.coral, borderRadius: 999 }} />
              </div>
            </div>
          ))}

          {finalScores.rationale && (
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 12.5, color: "#7A746F", marginTop: 12, borderTop: `1px solid ${BRAND.line}`, paddingTop: 12, lineHeight: 1.6 }}>
              &ldquo;{finalScores.rationale}&rdquo;
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BRAND.line}` }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F" }}>Weighted average</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink }}>{critWeightedAvg(finalScores).toFixed(1)}<span style={{ fontSize: 13, color: "#9B958F", fontWeight: 500 }}>/10</span></div>
            </div>
            <PrimaryButton onClick={confirmSave} disabled={saving} icon={saving ? Loader2 : CheckCircle2}>
              {saving ? "Saving…" : existingRating ? "Update rating" : "Save rating"}
            </PrimaryButton>
          </div>
        </Card>
      )}
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
              <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F" }}>/ {r.has_crit_rating ? 10 : 5} avg</div>
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
  const [ratingMethod, setRatingMethod] = useState(null); // null (show choice) | "simple" | "crit"

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
    setRatingMethod(null);
    refreshIdeas();
  }

  // Opening an idea that already has one of my ratings goes straight back
  // into whichever method produced it (no point re-asking); a fresh idea
  // shows the choice screen first.
  function openRating(idea) {
    const existing = myRatings[idea.id];
    setActiveIdeaId(idea.id);
    if (existing) setRatingMethod(existing.impact != null ? "crit" : "simple");
    else setRatingMethod(null);
  }
  function closeRating() {
    setActiveIdeaId(null);
    setRatingMethod(null);
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
          loading={loadingIdeas} error={error} onOpenIdea={openRating}
        />
      )}

      {view === "leaderboard" && session?.role === "jury" && (
        <LeaderboardView leaderboard={leaderboard} loading={loadingBoard} error={error} />
      )}

      {/* Rating overlay: choice screen, then simple stars or the CRIT interview */}
      {activeIdeaId && activeIdea && session?.role === "jury" && view === "jury" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.5)", zIndex: 60, overflowY: "auto" }}>
          <div style={{ background: BRAND.cream, minHeight: "100%" }}>
            {ratingMethod === null && (
              <RatingMethodChoice idea={activeIdea} onChoose={setRatingMethod} onBack={closeRating} />
            )}
            {ratingMethod === "simple" && (
              <SimpleRatingView
                idea={activeIdea}
                existingRating={myRatings[activeIdea.id] || null}
                onSaveRating={handleSaveRating}
                onBack={closeRating}
              />
            )}
            {ratingMethod === "crit" && (
              <CritRatingView
                idea={activeIdea}
                existingRating={myRatings[activeIdea.id] || null}
                onSaveRating={handleSaveRating}
                onBack={closeRating}
              />
            )}
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${BRAND.line}`, padding: "28px 24px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "#B7B2AE" }}>
        Ideas.RIV — submit and rate innovation ideas from your live Discover Audit.
      </div>
    </div>
  );
}