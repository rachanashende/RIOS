import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Lightbulb, Plus, Trash2, LogOut, Users, Award, TrendingUp, MessageSquare,
  CheckCircle2, ArrowRight, Sparkles, Gavel, Star, Send, X, ChevronRight,
  ChevronLeft, LayoutDashboard, Loader2, Compass, Trophy, UserCircle2,
  ClipboardList, BadgeCheck, AlertCircle,
} from "lucide-react";

/* =========================================================================
   BRAND — pulled directly from the live RIoS site (src/brand.js) so this
   tab is indistinguishable from the rest of the product, not a fresh skin.
   ========================================================================= */
const BRAND = {
  coral: "#EF4C4F",
  coralDark: "#D33639",
  blue: "#2F6FEB",
  ink: "#272525",
  cream: "#FBF9F6",
  line: "#E7E2DC",
};
const FONT = "'Poppins',sans-serif";
const SERIF = "'Newsreader',Georgia,serif";

/* =========================================================================
   MOCK SEED DATA
   The 5 opportunities below are surfaced from Discover Audit — Module 1
   (Leadership & Governance). The first four map to real diagnostic
   questions in that module; the fifth is a representative gap in the same
   module, added so the jury has a full slate of five to seed with ideas.
   ========================================================================= */
const OPPORTUNITIES = [
  {
    id: "opp-1",
    submodule: "Executive AI Usage",
    title: "Leadership doesn't yet use AI in its own daily work",
    q: "Does leadership actively use AI in their own daily work — not just sponsor it for others?",
    weight: 3,
  },
  {
    id: "opp-2",
    submodule: "AI Budget Ownership",
    title: "No dedicated, named AI budget",
    q: "Does leadership allocate a dedicated, named AI budget, rather than burying AI spend inside IT?",
    weight: 3,
  },
  {
    id: "opp-3",
    submodule: "Board-Level AI Review",
    title: "AI strategy isn't a standing board topic",
    q: "Does the board formally review AI strategy and risk on a recurring cadence?",
    weight: 3,
  },
  {
    id: "opp-4",
    submodule: "AI-Strategy Linkage",
    title: "AI is absent from the corporate strategy document",
    q: "Is AI explicitly named in corporate strategy documents, rather than run as a side initiative?",
    weight: 3,
  },
  {
    id: "opp-5",
    submodule: "AI Talent & Upskilling",
    title: "No structured path for leaders to build AI fluency",
    q: "Is there a structured programme for leadership to build hands-on AI fluency, rather than ad hoc exposure?",
    weight: 2,
  },
];

// Rating criteria + weights for the jury's weighted average score.
const CRITERIA = [
  { key: "impact", label: "Impact", weight: 0.35, desc: "Size of the opportunity this idea unlocks" },
  { key: "feasibility", label: "Feasibility", weight: 0.25, desc: "Realistic to execute with current resources" },
  { key: "innovation", label: "Innovation", weight: 0.25, desc: "How novel this is versus the status quo" },
  { key: "cost", label: "Cost-effectiveness", weight: 0.15, desc: "Value relative to likely investment" },
];

function weightedAvg(scores) {
  let total = 0;
  CRITERIA.forEach((c) => { total += (scores[c.key] || 0) * c.weight; });
  return total; // 0–10 scale
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

/* =========================================================================
   TOP NAV — mirrors NavBar from the main site, extended with Ideas.RIV
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
            <div style={{ width: 30, height: 30, borderRadius: 8, background: BRAND.coral, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 15 }}>R</div>
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
        <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>Leadership &amp; Governance · {opp.submodule}</div>
        <Pill tone="coral">AI weight ×{opp.weight}</Pill>
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 16, color: BRAND.ink, lineHeight: 1.35 }}>{opp.title}</div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 13, color: "#7A746F", lineHeight: 1.55 }}>&ldquo;{opp.q}&rdquo;</div>
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
   LANDING VIEW — all 5 opportunities
   ========================================================================= */
function LandingView({ ideas, setView, session, setActiveOpp }) {
  return (
    <div>
      <div style={{ background: BRAND.ink, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -180, right: -160, width: 480, height: 480, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.coral}55 0%, transparent 70%)` }} />
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 24px 56px", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F3B4B5", border: "1px solid #4a4442", borderRadius: 999, padding: "6px 14px", marginBottom: 24 }}>
            <Sparkles size={13} /> Sourced from Discover Audit — Module 1
          </div>
          <h1 style={{ fontFamily: FONT, fontWeight: 600, fontSize: "clamp(28px,4.2vw,44px)", lineHeight: 1.12, letterSpacing: "-0.02em", maxWidth: 720, margin: 0 }}>
            Five gaps. Turn each one into ideas worth funding.
          </h1>
          <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "clamp(15px,1.6vw,18px)", color: "#D8D3CF", maxWidth: 600, marginTop: 18, lineHeight: 1.6 }}>
            The audit's Leadership &amp; Governance module surfaced these five opportunities. Employees submit ideas against each one; leaders sit as jury and rate them with the CRIT method.
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
          {OPPORTUNITIES.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              ideaCount={ideas.filter((i) => i.oppId === opp.id).length}
              onOpen={() => {
                setActiveOpp(opp.id);
                if (session?.role === "employee") setView("submit");
                else if (session?.role === "jury") setView("jury");
                else setView("login-employee");
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN VIEW — separate flows for Employee and Leader/Jury
   ========================================================================= */
function LoginView({ role, onLogin, setView }) {
  const [name, setName] = useState("");
  const isJury = role === "jury";
  return (
    <div style={{ maxWidth: 420, margin: "70px auto", padding: "0 24px" }}>
      <Card style={{ padding: 32 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: isJury ? "#EAF0FE" : "#FCEEE1", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          {isJury ? <Gavel size={20} color={BRAND.blue} /> : <UserCircle2 size={20} color={BRAND.coralDark} />}
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>{isJury ? "Leader login" : "Employee login"}</div>
        <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginTop: 6, lineHeight: 1.6 }}>
          {isJury ? "You'll sign in as a jury member to rate ideas submitted against the five opportunities." : "Sign in to submit ideas against any of the five innovation opportunities."}
        </div>
        <div style={{ marginTop: 24 }}>
          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Nair" style={{
            width: "100%", marginTop: 6, fontFamily: FONT, fontSize: 14, padding: "11px 13px", borderRadius: 9,
            border: `1px solid ${BRAND.line}`, boxSizing: "border-box",
          }} />
        </div>
        <PrimaryButton
          disabled={!name.trim()}
          onClick={() => onLogin({ name: name.trim(), role })}
          icon={ArrowRight}
          style={{ width: "100%", marginTop: 20 }}
        >
          {isJury ? "Enter as jury member" : "Enter"}
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
   One idea row to start, "+" adds more, all against the chosen opportunity.
   ========================================================================= */
function SubmitIdeasView({ opp, ideas, session, onSubmit, setView, setActiveOpp }) {
  const [rows, setRows] = useState([{ id: uid("row"), title: "", description: "" }]);
  const [justSubmitted, setJustSubmitted] = useState(false);

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

  const existing = ideas.filter((i) => i.oppId === opp.id);

  function updateRow(id, field, value) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: uid("row"), title: "", description: "" }]);
  }
  function removeRow(id) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }
  function handleSubmit() {
    const valid = rows.filter((r) => r.title.trim());
    if (valid.length === 0) return;
    valid.forEach((r) => onSubmit({ id: uid("idea"), oppId: opp.id, title: r.title.trim(), description: r.description.trim(), submittedBy: session.name, createdAt: Date.now() }));
    setRows([{ id: uid("row"), title: "", description: "" }]);
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3200);
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 100px" }}>
      <button onClick={() => setView("landing")} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All opportunities
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>Leadership &amp; Governance · {opp.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 24, color: BRAND.ink, marginTop: 6 }}>{opp.title}</div>
      <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: "#7A746F", marginTop: 8, lineHeight: 1.6 }}>&ldquo;{opp.q}&rdquo;</div>

      {justSubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, padding: "12px 16px", borderRadius: 12, background: "#E7F5EF", border: "1px solid #C7E8D8" }}>
          <CheckCircle2 size={16} color="#1B7A5A" />
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.ink }}>Idea(s) submitted — the jury will rate these using the CRIT method.</div>
        </div>
      )}

      <Card style={{ padding: 24, marginTop: 24 }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink, marginBottom: 4 }}>Submit your idea{rows.length > 1 ? "s" : ""}</div>
        <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 18 }}>Start with one idea below — use the + button to add as many more as you like for this opportunity.</div>

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
          <PrimaryButton onClick={handleSubmit} icon={Send}>Submit to jury</PrimaryButton>
        </div>
      </Card>

      {existing.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink, marginBottom: 12 }}>Already submitted for this opportunity ({existing.length})</div>
          {existing.map((idea) => (
            <Card key={idea.id} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 13.5, color: BRAND.ink }}>{idea.title}</div>
              {idea.description && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginTop: 4, lineHeight: 1.5 }}>{idea.description}</div>}
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", marginTop: 8 }}>Submitted by {idea.submittedBy}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   JURY — list of ideas to rate
   ========================================================================= */
function JuryListView({ ideas, ratings, session, setView, setActiveIdea }) {
  const grouped = OPPORTUNITIES.map((opp) => ({
    opp,
    ideas: ideas.filter((i) => i.oppId === opp.id),
  })).filter((g) => g.ideas.length > 0);

  if (grouped.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 24px" }}>
        <EmptyState icon={ClipboardList} title="No ideas submitted yet" text="Once employees submit ideas against an opportunity, they'll show up here for the jury to rate." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Gavel size={17} color={BRAND.blue} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Rate submitted ideas</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Each idea is rated using the <strong>CRIT method</strong> — Context, Role, Interview me, Task — an AI-guided conversation that ends in a structured, weighted score.
      </div>

      {grouped.map(({ opp, ideas: ideaList }) => (
        <div key={opp.id} style={{ marginBottom: 30 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink, marginBottom: 10 }}>{opp.title}</div>
          {ideaList.map((idea) => {
            const myRating = ratings.find((r) => r.ideaId === idea.id && r.juryName === session.name);
            const allRatingsForIdea = ratings.filter((r) => r.ideaId === idea.id);
            return (
              <Card key={idea.id} style={{ padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14, color: BRAND.ink }}>{idea.title}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 4 }}>
                    By {idea.submittedBy} · {allRatingsForIdea.length} jury rating{allRatingsForIdea.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {myRating ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Pill tone="green">You rated {myRating.score.toFixed(1)}/10</Pill>
                    <GhostButton onClick={() => setActiveIdea(idea.id)} icon={MessageSquare}>Review</GhostButton>
                  </div>
                ) : (
                  <PrimaryButton onClick={() => setActiveIdea(idea.id)} icon={Gavel}>Rate with CRIT</PrimaryButton>
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
   CRIT RATING FLOW
   Context → Role → Interview me (live AI chat) → Task (structured score)
   ========================================================================= */
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

function buildSystemPrompt(opp, idea) {
  return `You are the AI jury assistant inside "Ideas.RIV", a retail-innovation ideas platform. You help a jury member (a company leader) evaluate an employee-submitted idea, using the CRIT prompting method: Context, Role, Interview me, Task.

CONTEXT
Innovation opportunity (from the Discover Audit, Leadership & Governance module, "${opp.submodule}"): "${opp.title}" — diagnostic question: "${opp.q}"
Idea submitted: "${idea.title}"
Idea description: "${idea.description || "(no additional description provided)"}"

ROLE
Act as a sharp, fair, retail-innovation jury advisor. You are candid, concise, and never sycophantic. You are talking directly to the jury member, not the idea's author.

INTERVIEW ME
Before you score anything, interview the jury member. Ask short, targeted questions ONE AT A TIME to draw out their honest judgement on the idea's impact, feasibility, innovation and cost-effectiveness relative to the opportunity above. Ask at most 3 questions total, one per turn, waiting for their answer each time. Keep each question to one sentence. Do not summarize or restate the idea back to them at length — get straight to the question.

TASK
Once you've asked your questions (up to 3) and have enough signal, stop the interview and respond with ONLY a raw JSON object, nothing else — no markdown fences, no commentary before or after it — in exactly this shape:
{"impact": <0-10 number>, "feasibility": <0-10 number>, "innovation": <0-10 number>, "cost": <0-10 number>, "rationale": "<2-3 sentence rationale citing what the jury member said>"}
Base the four scores on what the jury member told you during the interview, not on your own independent judgment of the idea.`;
}

function CritRatingView({ opp, idea, session, existingRating, onSaveRating, onBack }) {
  const [stepIdx, setStepIdx] = useState(existingRating ? 3 : 0);
  const [messages, setMessages] = useState([]); // {role:'assistant'|'user', text}
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalScores, setFinalScores] = useState(existingRating ? existingRating.scores : null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  const systemPrompt = useMemo(() => buildSystemPrompt(opp, idea), [opp, idea]);

  const callClaude = useCallback(async (history) => {
    setLoading(true);
    setError(null);
    try {
      const apiMessages = history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: apiMessages.length ? apiMessages : [{ role: "user", content: "Begin the interview with your first question." }],
        }),
      });
      const data = await res.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      const text = textBlock ? textBlock.text.trim() : "";

      // Try to parse as the final JSON scoring object
      const cleaned = text.replace(/^```json\s*|```$/g, "").trim();
      let parsed = null;
      try { parsed = JSON.parse(cleaned); } catch { parsed = null; }

      if (parsed && typeof parsed.impact === "number") {
        setFinalScores({
          impact: clamp10(parsed.impact),
          feasibility: clamp10(parsed.feasibility),
          innovation: clamp10(parsed.innovation),
          cost: clamp10(parsed.cost),
          rationale: parsed.rationale || "",
        });
        setStepIdx(3);
      } else {
        setMessages((ms) => [...ms, { role: "assistant", text: text || "Could you tell me a bit more?" }]);
      }
    } catch (e) {
      setError("Couldn't reach the AI jury assistant. You can try again.");
    } finally {
      setLoading(false);
    }
  }, [systemPrompt]);

  function clamp10(n) { n = Number(n); if (isNaN(n)) return 0; return Math.max(0, Math.min(10, n)); }

  // Kick off the interview once we reach the "interview" step
  useEffect(() => {
    if (stepIdx === 2 && !startedRef.current && !existingRating) {
      startedRef.current = true;
      callClaude([]);
    }
  }, [stepIdx, callClaude, existingRating]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  function sendAnswer() {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user", text: input.trim() }];
    setMessages(next);
    setInput("");
    callClaude(next);
  }

  function confirmSave() {
    const score = weightedAvg(finalScores);
    onSaveRating({
      id: existingRating?.id || uid("rating"),
      ideaId: idea.id,
      juryName: session.name,
      scores: finalScores,
      score,
      transcript: messages,
      createdAt: Date.now(),
    });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All ideas to rate
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 21, color: BRAND.ink, marginTop: 4 }}>{idea.title}</div>
      {idea.description && <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{idea.description}</div>}
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 6 }}>Submitted by {idea.submittedBy}</div>

      <div style={{ marginTop: 26 }}>
        <StepDots stepIdx={stepIdx} />
      </div>

      {stepIdx === 0 && (
        <Card style={{ padding: 22 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 8 }}>Context</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", lineHeight: 1.6 }}>
            This idea targets the opportunity <strong>&ldquo;{opp.title}&rdquo;</strong> from the audit's Leadership &amp; Governance module. That context, plus the idea's title and description, has been passed to the AI jury assistant automatically.
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
            {error && <div style={{ color: BRAND.coralDark, fontFamily: FONT, fontSize: 12 }}>{error}</div>}
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

          {CRITERIA.map((c) => (
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
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: BRAND.ink }}>{weightedAvg(finalScores).toFixed(1)}<span style={{ fontSize: 13, color: "#9B958F", fontWeight: 500 }}>/10</span></div>
            </div>
            <PrimaryButton onClick={confirmSave} icon={CheckCircle2}>{existingRating ? "Update rating" : "Save rating"}</PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD — top ideas by weighted average score
   ========================================================================= */
function LeaderboardView({ ideas, ratings }) {
  const ranked = useMemo(() => {
    return ideas.map((idea) => {
      const rs = ratings.filter((r) => r.ideaId === idea.id);
      const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null;
      const opp = OPPORTUNITIES.find((o) => o.id === idea.oppId);
      return { idea, opp, ratingCount: rs.length, avg };
    }).filter((x) => x.avg !== null).sort((a, b) => b.avg - a.avg);
  }, [ideas, ratings]);

  const published = ranked.slice(0, 3);

  if (ranked.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 24px" }}>
        <EmptyState icon={Trophy} title="No rated ideas yet" text="Once jury members rate ideas with CRIT, the top-scoring ones will publish here automatically." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Trophy size={17} color={BRAND.coral} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Leader dashboard — top ideas</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Ranked by overall weighted-average jury score. The top 3 are published below.
      </div>

      {ranked.map((r, i) => (
        <Card key={r.idea.id} style={{ padding: 18, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONT, fontWeight: 700, fontSize: 13,
              background: i < 3 ? BRAND.coral : "#EFEAE4", color: i < 3 ? "#fff" : BRAND.ink,
            }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{r.opp.title}</div>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14.5, color: BRAND.ink, marginTop: 2 }}>{r.idea.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 4 }}>By {r.idea.submittedBy} · {r.ratingCount} jury rating{r.ratingCount !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {i < 3 && <Pill tone="green">Published</Pill>}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink }}>{r.avg.toFixed(1)}</div>
              <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F" }}>/ 10 avg</div>
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
  const [session, setSession] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [activeOppId, setActiveOppId] = useState(null);
  const [activeIdeaId, setActiveIdeaId] = useState(null);

  const activeOpp = OPPORTUNITIES.find((o) => o.id === activeOppId) || null;
  const activeIdea = ideas.find((i) => i.id === activeIdeaId) || null;
  const activeIdeaOpp = activeIdea ? OPPORTUNITIES.find((o) => o.id === activeIdea.oppId) : null;
  const existingRatingForActive = activeIdea && session ? ratings.find((r) => r.ideaId === activeIdea.id && r.juryName === session.name) : null;

  function handleLogin(s) {
    setSession(s);
    setView(s.role === "jury" ? "jury" : "landing");
  }
  function handleLogout() {
    setSession(null); setView("landing"); setActiveOppId(null); setActiveIdeaId(null);
  }
  function addIdea(idea) {
    setIdeas((is) => [...is, idea]);
  }
  function saveRating(rating) {
    setRatings((rs) => {
      const others = rs.filter((r) => !(r.ideaId === rating.ideaId && r.juryName === rating.juryName));
      return [...others, rating];
    });
    setActiveIdeaId(null);
    setView("jury");
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
        <LandingView ideas={ideas} setView={setView} session={session} setActiveOpp={setActiveOppId} />
      )}

      {view === "login-employee" && <LoginView role="employee" onLogin={handleLogin} setView={setView} />}
      {view === "login-jury" && <LoginView role="jury" onLogin={handleLogin} setView={setView} />}

      {view === "submit" && session?.role === "employee" && (
        <SubmitIdeasView opp={activeOpp} ideas={ideas} session={session} onSubmit={addIdea} setView={setView} setActiveOpp={setActiveOppId} />
      )}

      {view === "my-ideas" && session?.role === "employee" && (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>My submissions</div>
          {ideas.filter((i) => i.submittedBy === session.name).length === 0 ? (
            <EmptyState icon={Lightbulb} title="You haven't submitted any ideas yet" text="Pick an opportunity from the landing page to submit your first idea." />
          ) : (
            ideas.filter((i) => i.submittedBy === session.name).map((idea) => {
              const opp = OPPORTUNITIES.find((o) => o.id === idea.oppId);
              const rs = ratings.filter((r) => r.ideaId === idea.id);
              const avg = rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null;
              return (
                <Card key={idea.id} style={{ padding: 16, marginBottom: 10 }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp?.title}</div>
                  <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 14.5, color: BRAND.ink, marginTop: 3 }}>{idea.title}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    {avg !== null ? <Pill tone="blue">{avg.toFixed(1)}/10 avg · {rs.length} rating{rs.length !== 1 ? "s" : ""}</Pill> : <Pill>Awaiting jury rating</Pill>}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {view === "jury" && session?.role === "jury" && (
        <JuryListView ideas={ideas} ratings={ratings} session={session} setView={setView} setActiveIdea={setActiveIdeaId} />
      )}

      {view === "leaderboard" && session?.role === "jury" && (
        <LeaderboardView ideas={ideas} ratings={ratings} />
      )}

      {/* CRIT rating overlay: shown whenever an idea is selected while jury is on the "jury" tab */}
      {activeIdeaId && activeIdea && activeIdeaOpp && session?.role === "jury" && view === "jury" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.5)", zIndex: 60, overflowY: "auto" }}>
          <div style={{ background: BRAND.cream, minHeight: "100%" }}>
            <CritRatingView
              opp={activeIdeaOpp}
              idea={activeIdea}
              session={session}
              existingRating={existingRatingForActive}
              onSaveRating={saveRating}
              onBack={() => setActiveIdeaId(null)}
            />
          </div>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${BRAND.line}`, padding: "28px 24px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "#B7B2AE" }}>
        Ideas.RIV — prototype tab for RIoS. Ratings use the CRIT method (Context · Role · Interview me · Task) with a live Claude interview.
      </div>
    </div>
  );
}
