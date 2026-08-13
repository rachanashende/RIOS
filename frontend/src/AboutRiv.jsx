import React, { useState } from "react";
import {
  Globe, Lightbulb, Search, ArrowLeft, ArrowRight, Handshake, Building2,
  TrendingUp, Users, Rocket, Target, Award, Sparkles,
} from "lucide-react";
import { BRAND } from "./brand.js";

/* ---------------------------------------------------------------
   About RIV — Retail Innovation Ventures' own site, one level
   below RIOS. Separate sub-nav, separate audience-specific pages
   (Investors / Startups / Retailers), same brand system as RIOS.
----------------------------------------------------------------*/

const NETWORK_STATS = [
  { value: "351+", label: "Organisations in the RIV network" },
  { value: "67", label: "Retail startups" },
  { value: "51", label: "Retail enterprises" },
  { value: "48", label: "Investment firms" },
  { value: "15", label: "Retail Global Capability Centres" },
];

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${BRAND.line}`,
        display: "flex", alignItems: "center", justifyContent: "center", background: "#fff",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B7A5A" strokeWidth="2">
          <path d="M12 22V12" strokeLinecap="round" />
          <path d="M12 12C12 12 6 12 6 6C12 6 12 12 12 12Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 8C12 8 18 8 18 3C12 3 12 8 12 8Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ lineHeight: 1.1 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 12.5, color: BRAND.ink, letterSpacing: "0.01em" }}>RETAIL INNOVATION</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 9.5, color: "#8a8480", letterSpacing: "0.12em" }}>VENTURES</div>
      </div>
    </div>
  );
}

function SubNav({ tab, setTab, onBackToRios }) {
  const [open, setOpen] = useState(false);
  const tabs = [
    { id: "home", label: "Home" },
    { id: "aboutus", label: "About Us" },
    { id: "investors", label: "For Investors" },
    { id: "startups", label: "For Startups" },
    { id: "retailers", label: "For Retailers" },
  ];
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#fff", borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <Logo />
        <div className="riv-subnav-desktop" style={{ display: "flex", gap: 26 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "6px 0",
              fontFamily: "'Poppins',sans-serif", fontSize: 14, fontWeight: 500,
              color: tab === t.id ? BRAND.blue : BRAND.ink,
              borderBottom: tab === t.id ? `2px solid ${BRAND.blue}` : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
        <div className="riv-subnav-desktop" style={{ display: "flex", gap: 10 }}>
          <button onClick={onBackToRios} style={{
            display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12.5,
            padding: "9px 15px", borderRadius: 8, cursor: "pointer", background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.line}`,
          }}><ArrowLeft size={13} /> Back to RIOS</button>
          <button onClick={() => setTab("investors")} style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12.5, padding: "9px 15px", borderRadius: 8,
            cursor: "pointer", background: BRAND.coral, color: "#fff", border: "none",
          }}>Our Portfolio</button>
        </div>
        <button className="riv-subnav-mobile-btn" onClick={() => setOpen(!open)} style={{ display: "none", background: "none", border: "none", cursor: "pointer" }}>☰</button>
      </div>
      {open && (
        <div className="riv-subnav-mobile" style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpen(false); }} style={{
              textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 14, fontWeight: 500, padding: "9px 10px", borderRadius: 8,
              border: "none", cursor: "pointer", background: tab === t.id ? BRAND.ink : "transparent", color: tab === t.id ? "#fff" : BRAND.ink,
            }}>{t.label}</button>
          ))}
          <button onClick={onBackToRios} style={{ textAlign: "left", fontFamily: "'Poppins',sans-serif", fontSize: 13.5, fontWeight: 600, padding: "9px 10px", borderRadius: 8, border: `1px solid ${BRAND.line}`, cursor: "pointer", background: "#fff", color: BRAND.ink, marginTop: 6 }}>← Back to RIOS</button>
        </div>
      )}
    </div>
  );
}

function StatStrip() {
  return (
    <div style={{ background: BRAND.cream, borderTop: `1px solid ${BRAND.line}`, borderBottom: `1px solid ${BRAND.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 24 }}>
        {NETWORK_STATS.map((s) => (
          <div key={s.label}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 32, color: BRAND.coral }}>{s.value}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#7A746F", marginTop: 4, lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Pages ---------------- */
function HomePage({ setTab }) {
  return (
    <>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 24px 60px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48, alignItems: "center" }} className="riv-hero-grid">
        <div>
          <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(32px,4.6vw,50px)", lineHeight: 1.12, letterSpacing: "-0.02em", margin: 0 }}>
            Backing bold retail startups with <span style={{ color: BRAND.coral }}>capital</span>, <span style={{ color: BRAND.blue }}>conviction</span> &amp; <span style={{ color: BRAND.blue }}>capability</span>
          </h1>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: "#7A746F", marginTop: 22, maxWidth: 480, lineHeight: 1.6 }}>
            We back bold ideas with the potential to disrupt and transform <span style={{ color: BRAND.coral, fontWeight: 600 }}>retail</span>.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
            <button onClick={() => setTab("startups")} style={pillBtn(BRAND.coral, "#fff")}>I'm a Founder</button>
            <button onClick={() => setTab("investors")} style={pillBtn("#fff", BRAND.coral, BRAND.coral)}>I'm an Investor</button>
            <button onClick={() => setTab("retailers")} style={pillBtn(BRAND.coral, "#fff")}>I'm a Retailer</button>
          </div>
        </div>
        <div style={{
          position: "relative", height: 340, borderRadius: 20, background: `linear-gradient(135deg, ${BRAND.ink} 0%, #3a3432 100%)`,
          overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.blue}55 0%, transparent 70%)` }} />
          <div style={{ position: "absolute", bottom: -80, left: -40, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.coral}55 0%, transparent 70%)` }} />
          <div style={{ display: "flex", gap: 22, position: "relative" }}>
            {[Handshake, TrendingUp, Building2].map((Icon, i) => (
              <div key={i} style={{
                width: 76, height: 76, borderRadius: 18, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}><Icon size={30} color="#fff" strokeWidth={1.5} /></div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: BRAND.coral, padding: "48px 24px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 26, color: "#fff" }}>Experts backing builders</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#FBD9D9", marginTop: 8, maxWidth: 560, lineHeight: 1.6 }}>
            RIV pairs operator-grade retail experience with capital and an active network of startups, investors, and enterprises — RIOS is the diagnostic that starts every relationship.
          </div>
        </div>
      </div>

      <StatStrip />
    </>
  );
}

function AboutUsPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "72px 24px 90px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.2, textAlign: "center" }}>
        <span style={{ color: BRAND.coral }}>Retail Innovation Ventures</span> — <span style={{ color: BRAND.blue }}>accelerating the future of retail</span>
      </h1>
      <div style={{ marginTop: 56 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.06em" }}>Our mission</div>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 16, color: BRAND.ink, lineHeight: 1.75, marginTop: 12 }}>
          We exist to accelerate the development and deployment of retail innovation that actually gets used — pairing evidence from the RIOS diagnostic with capital, mentorship, and a live network of startups, investors, and enterprises, so good ideas move from a slide to a shop floor.
        </p>
      </div>
      <div style={{ marginTop: 44 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: BRAND.coral, textTransform: "uppercase", letterSpacing: "0.06em" }}>How we work</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 16 }}>
          {[
            { icon: Search, title: "Diagnose", desc: "RIOS scores where a retailer actually stands on AI and innovation maturity — evidence, not opinion." },
            { icon: Rocket, title: "Connect", desc: "We match diagnosed gaps to vetted startups, technology partners, and capability centres already in the network." },
            { icon: Target, title: "Prove", desc: "Pilots run to a measured business case, not a demo — ROI is tracked back against the original diagnostic." },
          ].map((c) => (
            <div key={c.title} style={{ border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: 20 }}>
              <c.icon size={20} color={BRAND.blue} />
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15, color: BRAND.ink, marginTop: 12 }}>{c.title}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InvestorsPage() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px 40px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.2vw,46px)", color: BRAND.coral, lineHeight: 1.15 }}>Investing in the future of retail</h1>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 18, maxWidth: 640, lineHeight: 1.7 }}>
        At <strong>Retail Innovation Ventures</strong>, we back ground-breaking retail innovation that solves problems real operators actually have — sourced through a diagnostic pipeline instead of cold inbound.
      </p>

      <div style={{ marginTop: 44 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: BRAND.ink }}>Our investment thesis</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
          {[
            "Retail-only focus — every deal is judged against operator reality, not general-purpose SaaS metrics.",
            "Evidence-backed sourcing — RIOS's 165-question diagnostic surfaces real, quantified gaps before a term sheet is ever discussed.",
            "Embedded distribution — portfolio companies get warm access to the retailers already inside the RIV network.",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: BRAND.blue, marginTop: 8, flexShrink: 0 }} />
              <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.ink, lineHeight: 1.6 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StartupsPage() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px 90px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.2vw,46px)", color: BRAND.coral, lineHeight: 1.15 }}>Powering retail startups</h1>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 18, maxWidth: 640, lineHeight: 1.7 }}>
        We're more than a capital provider. We offer capital, mentorship, and market access to propel early-stage retail-tech companies to their first real enterprise deployment.
      </p>
      <div style={{
        marginTop: 24, padding: "18px 22px", borderLeft: `3px solid ${BRAND.blue}`, background: BRAND.cream, borderRadius: "0 10px 10px 0",
        fontFamily: "'Newsreader',Georgia,serif", fontStyle: "italic", fontSize: 16, color: BRAND.ink,
      }}>"With you at every step" — from seed to scale.</div>

      <div style={{ marginTop: 44 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: BRAND.ink, marginBottom: 18 }}>How it works for founders</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { n: 1, t: "Apply", d: "Tell us what you've built and which part of the retail operating stack it moves." },
            { n: 2, t: "Get matched to a pilot", d: "We connect you to a retailer whose RIOS diagnostic already surfaced the exact gap you solve." },
            { n: 3, t: "Scale with RIV backing", d: "Capital, mentorship, and warm intros across the network as the pilot proves out." },
          ].map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: BRAND.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14.5, color: BRAND.ink }}>{s.t}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 3, lineHeight: 1.5 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RetailersPage() {
  const pillars = [
    { icon: Globe, title: "Global Capability Centre Setup", desc: "Centralise technology expertise and scale operations globally." },
    { icon: Lightbulb, title: "Innovation Ecosystems", desc: "Drive internal innovation and startup-ecosystem collaboration for breakthrough solutions." },
    { icon: Search, title: "Hackathon Hiring", desc: "Recruit top talent through competitive innovation challenges." },
  ];
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px 90px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(26px,3.6vw,38px)", color: BRAND.coral, lineHeight: 1.2 }}>Three pillars of retail excellence: unlocking growth &amp; innovation</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20, marginTop: 40 }}>
        {pillars.map((p) => (
          <div key={p.title} style={{ borderTop: `2px solid ${BRAND.coral}`, paddingTop: 16 }}>
            <p.icon size={20} color={BRAND.ink} strokeWidth={1.6} />
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink, marginTop: 12 }}>{p.title}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 56, paddingTop: 40, borderTop: `1px solid ${BRAND.line}` }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, color: BRAND.coral }}>Pillar 1: Global Capability Centre Setup</div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#FCEEE1", flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15, color: BRAND.ink }}>Centralised Excellence</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 4 }}>Unified technology platform across all markets.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function pillBtn(bg, color, border) {
  return {
    fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, background: bg, color,
    border: border ? `1.5px solid ${border}` : "none", borderRadius: 9, padding: "12px 20px", cursor: "pointer",
  };
}

export default function AboutRivSite({ onBackToRios }) {
  const [tab, setTab] = useState("home");
  return (
    <div style={{ background: "#fff" }}>
      <style>{`
        @media (max-width: 900px) {
          .riv-subnav-desktop { display: none !important; }
          .riv-subnav-mobile-btn { display: block !important; }
          .riv-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <SubNav tab={tab} setTab={setTab} onBackToRios={onBackToRios} />
      {tab === "home" && <HomePage setTab={setTab} />}
      {tab === "aboutus" && <AboutUsPage />}
      {tab === "investors" && <InvestorsPage />}
      {tab === "startups" && <StartupsPage />}
      {tab === "retailers" && <RetailersPage />}
    </div>
  );
}
