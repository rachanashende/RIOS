import React, { useState, useEffect, useMemo } from "react";
import { api } from "./api.js";
import { BRAND } from "./brand.js";

/* ---------------- Admin: startup applications for one opportunity ----------------
   O3 / ST3: the admin could only see an application count. This opens from an
   opportunity's "N applications" link in Manage Clients → Startup team and shows
   every application with its average jury score, then each application in full
   (including founder email/phone) with every juror's individual scores and notes.
   Read-only: it uses the existing GET /api/admin/rise/applications endpoints. */

const FONT = "'Poppins',sans-serif";

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; }
}
function fmtScore(n) { return n == null ? "Not scored" : Number(n).toFixed(1) + " / 5"; }

const RIV_STATUS_LABEL = { pending: "Awaiting RIV review", approved: "Approved for jury", rejected: "Rejected" };
const RIV_STATUS_TONE = { pending: { bg: "#FFF3E0", fg: "#9A6B1E" }, approved: { bg: "#E7F5EF", fg: "#1B7A5A" }, rejected: { bg: "#FBEAEA", fg: "#C13B3B" } };
const DECISION_LABEL = { shortlist: "Shortlisted", on_hold: "On hold", not_selected: "Not selected", selected_for_pilot: "Selected for Pilot" };

const SORTS = {
  score: { label: "Highest score", fn: (a, b) => (b.avg_total ?? -1) - (a.avg_total ?? -1) || new Date(b.created_at) - new Date(a.created_at) },
  recent: { label: "Most recent", fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  name: { label: "Startup name (A–Z)", fn: (a, b) => (a.startup_name || "").localeCompare(b.startup_name || "") },
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 13.5, color: BRAND.ink, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{children || "—"}</div>
    </div>
  );
}

function ApplicationDetail({ id, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.getRiseApplicationAdmin(id).then(setData).catch((e) => setError(e.message || "Could not load this application."));
  useEffect(() => { setData(null); setError(""); load(); }, [id]);

  async function review(status) {
    setBusy(true); setError("");
    try { await api.reviewRiseApplication(id, status); await load(); onChanged?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function decide(decision) {
    setBusy(true); setError("");
    try { await api.decideRiseApplication(id, decision); await load(); onChanged?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const backBtn = (
    <button onClick={onBack} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer", marginBottom: 16 }}>← Back to applications</button>
  );

  if (error && !data) return <div>{backBtn}<div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.coralDark }}>{error}</div></div>;
  if (!data) return <div>{backBtn}<div style={{ fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>Loading…</div></div>;

  const { application: a, scores, criteria } = data;
  const avg = scores.length ? scores.reduce((s, r) => s + r.total, 0) / scores.length : null;
  const extra = a.extra && typeof a.extra === "object" ? Object.entries(a.extra).filter(([, v]) => v !== "" && v != null) : [];
  const btnStyle = (active) => ({ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, background: active ? BRAND.ink : "#fff", color: active ? "#fff" : BRAND.ink, cursor: busy ? "not-allowed" : "pointer" });

  return (
    <div>
      {backBtn}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 20, color: BRAND.ink }}>{a.startup_name}</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: "#9B958F" }}>Applied {fmtDate(a.created_at)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 22, color: BRAND.coral }}>{fmtScore(avg)}</div>
          <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>average of {scores.length} jury score{scores.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {error && <div style={{ fontFamily: FONT, fontSize: 12.5, color: BRAND.coralDark, marginBottom: 10 }}>{error}</div>}

      <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em" }}>RIV quality check</div>
          <div style={{ display: "inline-block", marginTop: 4, fontFamily: FONT, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, color: RIV_STATUS_TONE[a.riv_status]?.fg, background: RIV_STATUS_TONE[a.riv_status]?.bg }}>
            {RIV_STATUS_LABEL[a.riv_status] || a.riv_status}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", marginTop: 4 }}>Only an approved application is ever shown to the retailer's jury.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={() => review("approved")} style={btnStyle(a.riv_status === "approved")}>Approve for jury</button>
          <button disabled={busy} onClick={() => review("rejected")} style={btnStyle(a.riv_status === "rejected")}>Reject</button>
        </div>
      </div>

      <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff", marginBottom: 20 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
          Shortlist decision {a.decision && <span style={{ color: BRAND.coralDark }}>— {DECISION_LABEL[a.decision] || a.decision}</span>}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 11, color: "#9B958F", marginBottom: 10 }}>"Selected for Pilot" is what unlocks creating a Build project from this application.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(DECISION_LABEL).map(([k, label]) => (
            <button key={k} disabled={busy} onClick={() => decide(k)} style={btnStyle(a.decision === k)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px", border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 18, background: "#fff", marginBottom: 20 }}>
        <Field label="Founder">{a.founder_name}</Field>
        <Field label="Email">{a.email ? <a href={`mailto:${a.email}`} style={{ color: BRAND.blue }}>{a.email}</a> : null}</Field>
        <Field label="Phone">{a.phone}</Field>
        <Field label="Website">{a.website}</Field>
        <Field label="Sector">{a.sector}</Field>
        <Field label="Stage">{a.stage}</Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Pitch">{a.pitch}</Field></div>
        {extra.map(([k, v]) => (
          <div key={k} style={{ gridColumn: "1 / -1" }}><Field label={k}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Field></div>
        ))}
      </div>

      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: BRAND.ink, marginBottom: 10 }}>Jury scores</div>
      {scores.length === 0 ? (
        <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 18, fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>No juror has scored this application yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {scores.map((s) => (
            <div key={s.id} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: BRAND.ink }}>{s.jury_name}</div>
                  <div style={{ fontFamily: FONT, fontSize: 11.5, color: "#9B958F" }}>{s.jury_email} · scored {fmtDate(s.updated_at)}</div>
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: BRAND.coral }}>{fmtScore(s.total)}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: s.comments ? 10 : 0 }}>
                {criteria.map((c) => (
                  <span key={c.key} style={{ fontFamily: FONT, fontSize: 12, color: BRAND.ink, background: BRAND.cream, border: `1px solid ${BRAND.line}`, borderRadius: 999, padding: "4px 10px" }}>
                    {c.label}: <strong>{s.scores?.[c.key] ?? "—"}</strong>/5
                  </span>
                ))}
              </div>
              {s.comments && <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}><span style={{ color: "#9B958F" }}>Notes: </span>{s.comments}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RiseApplicationsAdmin({ opportunity, onClose }) {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("score");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const load = () => api.listRiseApplicationsAdmin()
    .then((d) => setApps((d.applications || []).filter((a) => a.opportunity_id === opportunity.id)))
    .catch((e) => setError(e.message || "Could not load applications."));

  useEffect(() => {
    setApps(null); setError(""); setOpenId(null);
    load();
  }, [opportunity.id]);

  const rows = useMemo(() => {
    if (!apps) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? apps.filter((a) => [a.startup_name, a.founder_name, a.sector, a.stage].some((v) => (v || "").toLowerCase().includes(q))) : apps;
    return [...filtered].sort(SORTS[sort].fn);
  }, [apps, sort, query]);

  const th = { fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#9B958F", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${BRAND.line}`, whiteSpace: "nowrap" };
  const td = { fontFamily: FONT, fontSize: 13, color: BRAND.ink, padding: "10px", borderBottom: `1px solid ${BRAND.line}`, verticalAlign: "top" };

  return (
    <div style={{ border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 20, background: "#fff", marginBottom: 24 }}>
      {openId != null ? (
        <ApplicationDetail id={openId} onBack={() => setOpenId(null)} onChanged={load} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: BRAND.ink }}>Applications — {opportunity.title}</div>
              <div style={{ fontFamily: FONT, fontSize: 12, color: "#9B958F" }}>{apps ? `${apps.length} application${apps.length !== 1 ? "s" : ""}` : "Loading…"} · average of all jury scores, out of 5</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input placeholder="Search startup, founder, sector…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ fontFamily: FONT, fontSize: 12.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "7px 10px", background: BRAND.cream, color: BRAND.ink, minWidth: 210 }} />
              <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ fontFamily: FONT, fontSize: 12.5, border: `1px solid ${BRAND.line}`, borderRadius: 8, padding: "7px 10px", background: "#fff", color: BRAND.ink }}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={onClose} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8, border: `1px solid ${BRAND.line}`, background: "#fff", cursor: "pointer" }}>Close</button>
            </div>
          </div>

          {error ? (
            <div style={{ fontFamily: FONT, fontSize: 13, color: BRAND.coralDark }}>{error}</div>
          ) : apps === null ? null : rows.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.line}`, borderRadius: 12, padding: 18, fontFamily: FONT, fontSize: 13, color: "#9B958F" }}>{apps.length === 0 ? "No applications for this opportunity yet." : "No applications match your search."}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={th}>Startup</th><th style={th}>Founder</th><th style={th}>Sector</th><th style={th}>Stage</th>
                    <th style={th}>Applied</th><th style={th}>RIV review</th><th style={th}>Avg score</th><th style={th}>Jurors scored</th><th style={th}>Decision</th><th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: "pointer" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{a.startup_name}</td>
                      <td style={td}>{a.founder_name}</td>
                      <td style={td}>{a.sector || "—"}</td>
                      <td style={td}>{a.stage || "—"}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: RIV_STATUS_TONE[a.riv_status]?.fg, background: RIV_STATUS_TONE[a.riv_status]?.bg }}>
                          {RIV_STATUS_LABEL[a.riv_status] || a.riv_status}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: a.avg_total == null ? "#9B958F" : BRAND.coral, whiteSpace: "nowrap" }}>{fmtScore(a.avg_total)}</td>
                      <td style={td}>{a.score_count}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{a.decision ? DECISION_LABEL[a.decision] || a.decision : "—"}</td>
                      <td style={td}><span style={{ fontSize: 12, fontWeight: 600, color: BRAND.ink, textDecoration: "underline" }}>View</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
