import React, { useState, useEffect, useCallback } from "react";
import {
  Lightbulb, Plus, Trash2, LogOut, Send,
  CheckCircle2, Sparkles, Gavel, ChevronRight,
  ChevronLeft, Loader2, Compass, Trophy,
  ClipboardList, Star, AlertCircle,
} from "lucide-react";
import { api, getStoredIdeasUser, setIdeasSession, clearIdeasSession } from "./api.js";
import { BRAND } from "./brand.js";

const FONT = "'Poppins',sans-serif";
const SERIF = "'Newsreader',Georgia,serif";

// Mirrors backend/lib/ideasScoring.js's CRITERIA exactly — kept in sync
// manually, same convention as scoring.js's frontend/backend duplication
// elsewhere in this project. Every idea is rated on these 5, each 1-5
// stars; the overall score is always their plain average.
export const CRITERIA = [
  { key: "team", label: "Team", question: "Founder/team strength and relevant experience." },
  { key: "marketOpportunity", label: "Market Opportunity", question: "Size and timing of the market being addressed." },
  { key: "product", label: "Product", question: "Maturity, differentiation, and quality of the product." },
  { key: "traction", label: "Traction", question: "Evidence of validation — users, revenue, pilots, partnerships." },
  { key: "gtmStrategy", label: "GTM Strategy", question: "Clarity and credibility of the go-to-market plan." },
];

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
      <Loader2 size={16} className="spin" /> {label || "Loading…"}
    </div>
  );
}

function StarPicker({ value, onChange, size = 22 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
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
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3 }}
          >
            <Star size={size} color={filled ? BRAND.coral : "#D9D3CC"} fill={filled ? BRAND.coral : "none"} />
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   TOP NAV
   ========================================================================= */
function IdeasNavBar({ view, setView, session, onLogout }) {
  const items = [{ id: "landing", label: "Opportunities" }];
  if (session.role === "junior_employee") items.push({ id: "my-ideas", label: "My submissions" });
  // Per PRD §8: aggregate scores across jurors are admin-only, not visible
  // to jury (blind scoring — a juror seeing the aggregate could infer how
  // far their own score sits from the group's). Jury only gets "Rate
  // ideas"; the Leaderboard view now lives in the admin panel instead.
  if (session.role === "jury") items.push({ id: "jury", label: "Rate ideas" });

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(251,249,246,0.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
          <img src="/riv-logo-full.png" alt="Retail Innovation Ventures" style={{ height: 36, width: "auto", objectFit: "contain" }} />
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
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: BRAND.ink }}>{session.name}</div>
            <div style={{ fontFamily: FONT, fontSize: 10.5, color: "#9B958F" }}>{session.role === "jury" ? "Leader · Jury member" : "Junior Employee"}</div>
          </div>
          <button onClick={onLogout} title="Log out" style={{
            display: "flex", alignItems: "center", gap: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
            padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}`,
          }}><LogOut size={13} /> Log out</button>
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
              ? `These five opportunities are the current Top 5 from ${sourceClient.company || sourceClient.name}'s scored audit. Junior employees submit ideas against each one; leaders sit as jury and rate them.`
              : "Junior employees submit ideas against each opportunity; leaders sit as jury and rate them."}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <Compass size={17} color={BRAND.coral} />
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 17, color: BRAND.ink }}>All 5 innovation opportunities</div>
        </div>

        {loading && <Spinner label="Loading opportunities…" />}
        {!loading && error && <ErrorBanner text={error} />}
        {!loading && !error && opportunities.length === 0 && (
          <EmptyState icon={Compass} title="No source audit configured yet" text="An admin needs to pick which client's scored audit feeds Ideas.RIV before opportunities show up here." />
        )}

        {!loading && !error && opportunities.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                ideaCount={ideas.filter((i) => i.question_id === opp.id).length}
                onOpen={() => {
                  setActiveOpp(opp.id);
                  if (session.role === "junior_employee") setView("submit");
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
   JUNIOR EMPLOYEE — submit ideas view
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
   MY SUBMISSIONS (junior employee)
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
          {idea.description && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#7A746F", marginTop: 4, lineHeight: 1.5 }}>{idea.description}</div>}
        </Card>
      ))}
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

  const totalIdeas = ideas.length;
  const ratedCount = ideas.filter((i) => myRatings[i.id]).length;

  if (loading) return <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}><Spinner label="Loading ideas…" /></div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Gavel size={17} color={BRAND.blue} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Rate submitted ideas</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 14 }}>
        Rate each idea on 5 criteria, 1-5 stars each. Your ratings are private — no other jury member can see them.
      </div>
      {totalIdeas > 0 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 26 }}>
          <Pill tone={ratedCount === totalIdeas ? "green" : "blue"}>{ratedCount} of {totalIdeas} rated</Pill>
        </div>
      )}

      <ErrorBanner text={error} />

      {grouped.length === 0 && !error && (
        <EmptyState icon={ClipboardList} title="No ideas submitted yet" text="Once junior employees submit ideas against an opportunity, they'll show up here for the jury to rate." />
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
                    <Pill tone="green">You rated {Number(myRating.score).toFixed(1)}/5</Pill>
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
   CRITERIA RATING FLOW — 5 criteria, 1-5 stars each
   ========================================================================= */
function CriteriaRatingView({ idea, existingRating, onSaveRating, onBack }) {
  const opp = idea.question;
  const [scores, setScores] = useState(() => {
    const init = {};
    CRITERIA.forEach((c) => { init[c.key] = existingRating?.criteria_scores?.[c.key] || 0; });
    return init;
  });
  const [comment, setComment] = useState(existingRating?.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const rated = CRITERIA.filter((c) => scores[c.key] > 0);
  const allRated = rated.length === CRITERIA.length;
  const runningAvg = rated.length ? rated.reduce((s, c) => s + scores[c.key], 0) / rated.length : 0;

  async function confirmSave() {
    if (!allRated) { setError("Please rate all 5 criteria before saving."); return; }
    setSaving(true);
    setError(null);
    try {
      const rating = await api.submitRating(idea.id, scores, comment.trim());
      onSaveRating(rating.rating);
    } catch (e) {
      setError(e.message || "Couldn't save the rating — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 24px 100px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: FONT, fontSize: 12.5, color: "#9B958F", background: "none", border: "none", cursor: "pointer", marginBottom: 18 }}>
        <ChevronLeft size={14} /> All ideas to rate
      </button>

      <div style={{ fontFamily: FONT, fontSize: 11, color: "#B7B2AE", fontWeight: 600 }}>{opp?.module} · {opp?.submodule}</div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 21, color: BRAND.ink, marginTop: 4 }}>{idea.title}</div>
      {idea.description && <div style={{ fontFamily: FONT, fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{idea.description}</div>}
      <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F", marginTop: 6 }}>Submitted by {idea.submitted_by_name}</div>

      <ErrorBanner text={error} />

      <Card style={{ padding: 24, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink }}>Rate each criterion</div>
          {rated.length > 0 && (
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>
              Running avg: <strong style={{ color: BRAND.ink }}>{runningAvg.toFixed(1)}/5</strong>
            </div>
          )}
        </div>

        {CRITERIA.map((c, i) => (
          <div key={c.key} style={{ paddingBottom: 18, marginBottom: 18, borderBottom: i < CRITERIA.length - 1 ? `1px solid ${BRAND.line}` : "none" }}>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink }}>{c.label}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F", marginTop: 2, marginBottom: 10 }}>{c.question}</div>
            <StarPicker value={scores[c.key]} onChange={(n) => setScores((s) => ({ ...s, [c.key]: n }))} />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink, marginBottom: 8 }}>Comment <span style={{ fontWeight: 400, color: "#9B958F" }}>(optional)</span></div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any context for this score — optional."
            rows={3}
            maxLength={2000}
            style={{ width: "100%", fontFamily: FONT, fontSize: 13, padding: "10px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, boxSizing: "border-box", resize: "vertical" }}
          />
        </div>

        <PrimaryButton onClick={confirmSave} disabled={saving || !allRated} icon={saving ? Loader2 : CheckCircle2} style={{ width: "100%" }}>
          {saving ? "Saving…" : existingRating ? "Update rating" : "Save rating"}
        </PrimaryButton>
      </Card>
    </div>
  );
}

/* =========================================================================
   LEADER DASHBOARD — top ideas by average jury score
   ========================================================================= */
export function LeaderboardView({ leaderboard, loading, error }) {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Trophy size={17} color={BRAND.coral} />
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>Leaderboard</div>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F", marginBottom: 26 }}>
        Ranked by average jury star rating. The top 3 are published below.
      </div>

      {loading && <Spinner label="Loading leaderboard…" />}
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
   MAIN — the actual Ideas.RIV app, once a session exists.
   ========================================================================= */
function IdeasRivMain({ session, onLogout }) {
  const [view, setView] = useState(session.role === "jury" ? "jury" : "landing");

  const [opportunities, setOpportunities] = useState([]);
  const [sourceClient, setSourceClient] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [myIdeas, setMyIdeas] = useState([]);
  const [myRatings, setMyRatings] = useState({}); // ideaId -> rating

  const [loadingOpps, setLoadingOpps] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
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
      if (session.role === "jury") {
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

  // Load opportunities + ideas on mount
  useEffect(() => {
    setLoadingOpps(true);
    api.getOpportunities()
      .then((d) => { setOpportunities(d.opportunities || []); setSourceClient(d.sourceClient || null); })
      .catch((e) => setError(e.message || "Couldn't load opportunities."))
      .finally(() => setLoadingOpps(false));
    refreshIdeas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // My submissions (junior employee)
  useEffect(() => {
    if (session.role !== "junior_employee" || view !== "my-ideas") return;
    api.getMyIdeas().then((d) => setMyIdeas(d.ideas || [])).catch((e) => setError(e.message));
  }, [session, view]);

  function handleSaveRating(rating) {
    setMyRatings((m) => ({ ...m, [rating.idea_id]: rating }));
    setActiveIdeaId(null);
    refreshIdeas();
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Newsreader:ital@1&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible { outline: 2px solid ${BRAND.coral}; outline-offset: 2px; }
        input:focus, textarea:focus { outline: 2px solid ${BRAND.coral}; outline-offset: 0; }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
      `}</style>

      <IdeasNavBar view={view} setView={setView} session={session} onLogout={onLogout} />

      {/* flex: 1 makes this fill all leftover space, pushing the footer below
          to the bottom of the viewport on short pages (e.g. an empty
          leaderboard) while still scrolling normally on long ones. */}
      <div style={{ flex: 1 }}>
        {view === "landing" && (
          <LandingView
            session={session} setView={setView}
            opportunities={opportunities} ideas={ideas}
            loading={loadingOpps} error={error} sourceClient={sourceClient}
            setActiveOpp={setActiveOppId}
          />
        )}

        {view === "submit" && session.role === "junior_employee" && (
          <SubmitIdeasView opp={activeOpp} ideas={ideas} onIdeasChanged={refreshIdeas} setView={setView} />
        )}

        {view === "my-ideas" && session.role === "junior_employee" && (
          <MyIdeasView myIdeas={myIdeas} loading={false} error={error} />
        )}

        {view === "jury" && session.role === "jury" && (
          <JuryListView
            opportunities={opportunities} ideas={ideas} myRatings={myRatings}
            loading={loadingIdeas} error={error} onOpenIdea={(idea) => setActiveIdeaId(idea.id)}
          />
        )}

        {/* Rating overlay */}
        {activeIdeaId && activeIdea && session.role === "jury" && view === "jury" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(39,37,37,0.5)", zIndex: 60, overflowY: "auto" }}>
            <div style={{ background: BRAND.cream, minHeight: "100vh" }}>
              <CriteriaRatingView
                idea={activeIdea}
                existingRating={myRatings[activeIdea.id] || null}
                onSaveRating={handleSaveRating}
                onBack={() => setActiveIdeaId(null)}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${BRAND.line}`, padding: "28px 24px", textAlign: "center", fontFamily: FONT, fontSize: 12, color: "#B7B2AE" }}>
        Questions? Write to <a href="mailto:contact@retailinnovation.ventures" style={{ color: BRAND.coralDark }}>contact@retailinnovation.ventures</a>.
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN — Ideas.RIV accounts (junior_employee / jury) are admin-created
   only, same rule as everywhere else in RIOS: no self-signup. A user logs
   in with credentials an admin already gave them.
   ========================================================================= */
function IdeasLoginView({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.ideasLogin(email, password);
      if (!["junior_employee", "jury", "admin"].includes(user.role)) {
        throw new Error("This login isn't set up for Ideas.RIV.");
      }
      onAuthed(token, user);
    } catch (e) {
      setError(e.message || "Couldn't log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: FONT, background: BRAND.cream, minHeight: "100vh" }}>
      <div style={{ maxWidth: 400, margin: "0 auto", padding: "80px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontWeight: 700, fontSize: 16, color: BRAND.ink, marginBottom: 24 }}>
          <Lightbulb size={19} color={BRAND.coral} /> Ideas.RIV
        </div>
        <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: 28, background: "#fff" }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 4 }}>Log in</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F", marginBottom: 22 }}>Employee and jury logins are issued by an RIV admin.</div>
          <form onSubmit={submit}>
            <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink }}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoFocus style={{ width: "100%", marginTop: 6, fontFamily: FONT, fontSize: 13.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box", background: BRAND.cream, color: BRAND.ink }} />
            <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: BRAND.ink, marginTop: 14, display: "block" }}>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: "100%", marginTop: 6, fontFamily: FONT, fontSize: 13.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "10px 12px", boxSizing: "border-box", background: BRAND.cream, color: BRAND.ink }} />
            {error && <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#D33639", marginTop: 12 }}>{error}</div>}
            <button type="submit" disabled={submitting} style={{
              width: "100%", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: FONT, fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff",
              border: "none", borderRadius: 9, padding: "12px 0", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1,
            }}>{submitting && <Loader2 size={14} className="spin" />} Log in</button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   ROOT — owns the Ideas.RIV session (separate from the main site's and
   from Rise.RIV's), same isolated-token pattern as RiseRivApp. This is
   what App.jsx actually mounts with no props (<IdeasRivApp />), so all
   login/logout state has to live in here, not be passed in from outside.
   ========================================================================= */
export default function IdeasRivApp() {
  const [session, setSession] = useState(getStoredIdeasUser());

  function handleAuthed(token, user) {
    setIdeasSession(token, user);
    setSession(user);
  }
  function handleLogout() {
    clearIdeasSession();
    setSession(null);
  }

  if (!session) return <IdeasLoginView onAuthed={handleAuthed} />;
  return <IdeasRivMain session={session} onLogout={handleLogout} />;
}