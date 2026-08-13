import React, { useState, useRef } from "react";
import {
  Globe, Lightbulb, Search, ArrowLeft, ArrowRight, Handshake, Building2,
  TrendingUp, Users, Rocket, Target, Award, Sparkles, ShoppingBag,
  HeartHandshake, Sprout, Store, Wallet, Network, LineChart, Layers, LogOut,
  Zap, Smile, Settings, User, CheckCircle2, Ear, Activity, Briefcase,
  Compass, ArrowUpDown, Shield, Landmark,
} from "lucide-react";
import { BRAND } from "./brand.js";

/* ---------------------------------------------------------------
   About RIV — Retail Innovation Ventures' own site, one level
   below RIOS. Separate sub-nav, separate audience-specific pages
   (Investors / Startups / Retailers), same brand system as RIOS.
   Content below is sourced directly from the RIV Lovable site.
----------------------------------------------------------------*/

const NETWORK_STATS = [
  { value: "351+", label: "Organisations in the RIV network" },
  { value: "67", label: "Retail startups" },
  { value: "51", label: "Retail enterprises" },
  { value: "48", label: "Investment firms" },
  { value: "15", label: "Retail Global Capability Centres" },
];

// Real team roster from the RIV site. `linkedin` is intentionally blank —
// paste real profile URLs in once you have them; until then the label
// renders as plain text instead of a fake link.
const TEAM = [
  { name: "Saravana Mani", role: "CEO & Managing Partner", bio: "Ex-Innovation Head, Future Group India, Kmart Group Australia. Ex-NASSCOM. MIT Sloan, IIMB Alumnus.", linkedin: "" },
  { name: "Deepak Agrawal", role: "Partner", bio: "Seasoned venture capital industry leader. Venture Catalyst | Dexter Capital | Ideaspring Capital | The Hive.", linkedin: "" },
  { name: "Pavan Panchamukhi", role: "Venture Partner", bio: "4X Retail Tech entrepreneur with multiple exits.", linkedin: "" },
  { name: "Ramanan Natarajan", role: "Enterprise Architect", bio: "Lowes | Future Group | TESCO.", linkedin: "" },
  { name: "Naresh Teckchandani", role: "Retail Technology Leader, Australia", bio: "Forever New Australia | Kmart Group Australia | Coles Group.", linkedin: "" },
  { name: "Sundar Iyer", role: "Australia Market Entry Specialist", bio: "", linkedin: "" },
  { name: "Subramanian Chandramouli", role: "Venture Partner, SilverX Ventures", bio: "GTM thought leader.", linkedin: "" },
];

const WHY_WE_DO_IT = [
  { icon: ShoppingBag, title: "Opening Doors to Everyday Innovation", desc: "We believe every shopper deserves access to smarter, simpler, and joyful retail experiences." },
  { icon: HeartHandshake, title: "Powering Dreams of Entrepreneurs", desc: "By backing bold retail founders, we fuel ideas that uplift communities and economies." },
  { icon: Wallet, title: "Creating a Conscious Consumer World", desc: "We champion ventures that balance growth with responsibility towards people and the planet." },
  { icon: Store, title: "Building Tomorrow's Marketplaces", desc: "Our work shapes vibrant, connected ecosystems where innovation serves society at large." },
];

const STARTUP_BENEFITS = [
  { title: "Funding", desc: "Investing in early-stage disruptive startups and supporting them in their aspirational growth journey." },
  { title: "Expert Mentorship", desc: "Hands-on guidance from experienced retail operators, CXOs and investors." },
  { title: "Global Expansion", desc: "Powering startups with local traction and global scale." },
  { title: "Strategic Partnerships", desc: "Helping access the right retail strategy partners for long-term success." },
];

const INVESTOR_BENEFITS = [
  { title: "Exclusive Network", desc: "Invite-only group of retail thought leaders and changemakers." },
  { title: "Capital Growth", desc: "Expert-led thesis for non-linear returns in a high-potential sector." },
  { title: "Sectoral Expertise", desc: "Sharp focus and broad reach to spot and curate high-potential disruptive startups." },
  { title: "Exits", desc: "Ability to chart a tangible growth path for value enhancement and exit." },
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

function initials(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function TeamAvatar({ name, size = 96 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: BRAND.cream, border: `1px solid ${BRAND.line}`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: size * 0.32, color: BRAND.coral }}>{initials(name)}</span>
    </div>
  );
}

function LinkedInLabel({ url }) {
  if (url) {
    return <a href={url} target="_blank" rel="noreferrer" style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, color: BRAND.blue, textDecoration: "underline" }}>LinkedIn</a>;
  }
  // No real URL on file yet — render as a plain (non-clickable) label rather than invent a link.
  return <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, color: "#C8C3BF" }}>LinkedIn — add URL</span>;
}

/* ---------------- Home-page sections ---------------- */
function HeroSection({ setTab }) {
  return (
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
  );
}

function ExpertsBackingBuildersSection({ onKnowMore }) {
  return (
    <div style={{ background: BRAND.coral, padding: "64px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48, alignItems: "center" }} className="riv-experts-grid">
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(26px,3.4vw,36px)", color: BRAND.ink }}>Experts Backing Builders</div>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, color: BRAND.ink, marginTop: 20, lineHeight: 1.7 }}>
            We are a group of passionate retail innovators, CXOs, founders, ecosystem builders, and investors on a mission to redefine the future of retail.
          </p>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, color: BRAND.ink, marginTop: 14, lineHeight: 1.7 }}>
            Our mission is to build a dedicated retail funding system supporting startups through capital, mentorship, and global market access — creating an ecosystem where bold ideas, technology, and entrepreneurship converge to improve lives globally.
          </p>
          <button onClick={onKnowMore} style={{
            marginTop: 24, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13.5, background: BRAND.ink, color: "#fff",
            border: "none", borderRadius: 9, padding: "12px 22px", cursor: "pointer",
          }}>Know More</button>
        </div>
        <div style={{
          height: 300, borderRadius: 18, background: "rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Users size={54} color="rgba(39,37,37,0.35)" strokeWidth={1.3} />
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "56px auto 0", textAlign: "center" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(22px,2.8vw,30px)", color: BRAND.ink }}>Shaping Retail Together</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: "#5a2426", marginTop: 8 }}>Uniting experience and purpose to power the next generation of innovation.</div>
      </div>
    </div>
  );
}

function MeetOurTeamSection({ sectionRef }) {
  return (
    <div ref={sectionRef} style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 24px" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(24px,3.2vw,34px)", color: BRAND.coral }}>Meet Our Team — Industry Experts and Venture Partners</div>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 18, maxWidth: 820, lineHeight: 1.7 }}>
        Our strength lies in experience — across retail formats, startups, corporates, and capital. We know the challenges of building in retail, and we're here to help ambitious teams overcome them, with strategic support that's grounded in purpose and built for scale.
      </p>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 12, maxWidth: 820, lineHeight: 1.7 }}>
        Our industry experts and venture partners are seasoned professionals shaping smarter decisions, helping navigate retail sector's complexity and hand-holding ventures in their journey to scale.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 32, marginTop: 44 }}>
        {TEAM.map((m) => (
          <div key={m.name}>
            <TeamAvatar name={m.name} />
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color: BRAND.ink, marginTop: 16 }}>{m.name}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: BRAND.coral, marginTop: 2 }}>{m.role}</div>
            {m.bio && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#7A746F", marginTop: 8, lineHeight: 1.55 }}>{m.bio}</div>}
            <div style={{ marginTop: 10 }}><LinkedInLabel url={m.linkedin} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BenefitColumn({ heading, color, items, onKnowMore }) {
  return (
    <div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 28, color }}>{heading}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
        {items.map((it) => (
          <div key={it.title} style={{ borderLeft: `3px solid ${color}`, border: `1px solid ${BRAND.line}`, borderLeftWidth: 3, borderLeftColor: color, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{it.title}</div>
            <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 5, lineHeight: 1.55 }}>{it.desc}</div>
          </div>
        ))}
      </div>
      <button onClick={onKnowMore} style={{
        marginTop: 18, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, background: BRAND.coral, color: "#fff",
        border: "none", borderRadius: 9, padding: "11px 20px", cursor: "pointer",
      }}>Know More</button>
    </div>
  );
}

function StartupsInvestorsSection({ setTab }) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 24px 72px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }} className="riv-benefits-grid">
        <BenefitColumn heading="Startups" color={BRAND.coral} items={STARTUP_BENEFITS} onKnowMore={() => setTab("startups")} />
        <BenefitColumn heading="Investors" color={BRAND.blue} items={INVESTOR_BENEFITS} onKnowMore={() => setTab("investors")} />
      </div>
    </div>
  );
}

function WhyWeDoItSection() {
  return (
    <div style={{ background: BRAND.cream, padding: "72px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(26px,3.4vw,36px)" }}>
          <span style={{ color: BRAND.coral }}>Why</span> <span style={{ color: BRAND.blue }}>We Do It</span>
        </div>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, color: BRAND.ink, marginTop: 18, maxWidth: 900, lineHeight: 1.75 }}>
          We strongly believe startups as catalysts for change will shape the future of retail and consumer technology. We are committed to unlocking the full potential of retail entrepreneurs, transforming how customers get delighted while shopping and enjoy great value at every touchpoint.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginTop: 36 }}>
          {WHY_WE_DO_IT.map((c) => (
            <div key={c.title} style={{ background: "#FBEAEA", borderRadius: 14, padding: 24 }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: BRAND.coral, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <c.icon size={20} color="#fff" strokeWidth={1.6} />
              </div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink, marginTop: 16 }}>{c.title}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#5a4f4d", marginTop: 8, lineHeight: 1.6 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- shared small pieces for About Us / Investors / Startups ---------------- */
function SubHeading({ children, color = BRAND.coral }) {
  return <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(24px,3vw,32px)", color, marginTop: 56 }}>{children}</div>;
}

function IconRow({ icon: Icon, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 24 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: "#FBEAEA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={BRAND.ink} strokeWidth={1.6} />
      </div>
      <div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 4, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function ValueCard({ icon: Icon, title, desc }) {
  return (
    <div style={{ background: "#FBEAEA", borderRadius: 14, padding: 28 }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: BRAND.coral, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color="#fff" strokeWidth={1.6} />
      </div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: BRAND.ink, marginTop: 16 }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#5a4f4d", marginTop: 8, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function InfoCard({ title, desc, color }) {
  return (
    <div style={{ background: "#FBEAEA", borderRadius: 12, padding: "22px 24px" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: color || BRAND.ink }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#5a4f4d", marginTop: 8, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function AudienceCard({ icon: Icon, title, desc }) {
  return (
    <div style={{ background: "#FBEAEA", borderRadius: 14, padding: 28 }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: BRAND.coral, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={22} color="#fff" strokeWidth={1.6} />
      </div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: BRAND.ink, marginTop: 18 }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#5a4f4d", marginTop: 8, lineHeight: 1.65 }}>{desc}</div>
    </div>
  );
}

function ApartCard({ icon: Icon, title, desc }) {
  return (
    <div style={{ border: `2px solid ${BRAND.coral}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ height: 4, background: BRAND.coral, position: "relative" }}>
        <div style={{
          position: "absolute", top: -18, left: 24, width: 36, height: 36, borderRadius: "50%", background: BRAND.coral,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Icon size={16} color="#fff" strokeWidth={1.8} /></div>
      </div>
      <div style={{ padding: "34px 24px 24px" }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 8, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ---------------- Pages ---------------- */
function HomePage({ setTab }) {
  const teamRef = useRef(null);
  return (
    <>
      <HeroSection setTab={setTab} />
      <ExpertsBackingBuildersSection onKnowMore={() => teamRef.current?.scrollIntoView({ behavior: "smooth" })} />
      <MeetOurTeamSection sectionRef={teamRef} />
      <StartupsInvestorsSection setTab={setTab} />
      <WhyWeDoItSection />
      <StatStrip />
    </>
  );
}

function AboutUsPage() {
  const strategyItems = [
    { icon: Globe, title: "Global Investor Network", desc: "Building worldwide connections and partnerships to strengthen funding opportunities" },
    { icon: Sprout, title: "Early Stage Investment", desc: "Supporting startups from pre-seed to Series A with targeted capital" },
    { icon: Activity, title: "Active Nurturing", desc: "Providing hands-on mentorship, guidance, and critical support to fast-track growth" },
    { icon: Briefcase, title: "Business Expansion", desc: "Helping scale operations and accelerate market penetration" },
    { icon: Compass, title: "Global Market Access", desc: "Opening doors to international opportunities and new markets" },
  ];
  const values = [
    { icon: Shield, title: "Integrity", desc: "We operate with unwavering honesty, transparency, and ethics in everything we do" },
    { icon: Lightbulb, title: "Innovation", desc: "We push boundaries, challenge the status quo, and back breakthrough ideas" },
    { icon: Compass, title: "Purpose", desc: "We are driven by a strong purpose behind what we do" },
    { icon: ArrowUpDown, title: "Potential", desc: "We identify, unlock and amplify potential to create maximum and lasting impact" },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "72px 24px 90px" }}>
      <h1 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: "clamp(28px,3.6vw,40px)", lineHeight: 1.2, textAlign: "center" }}>
        <span style={{ color: BRAND.coral }}>Retail Innovation Ventures</span> — <span style={{ color: BRAND.blue }}>accelerating the future of retail</span>
      </h1>

      <SubHeading>Our Mission</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 14, lineHeight: 1.75 }}>
        At Retail Innovation Ventures, our mission is to accelerate the development and deployment of groundbreaking retail solutions by fostering collaboration between cutting-edge technology, pioneering innovation, and strategic investment. We are dedicated to improving the global retail landscape and delighting retail shoppers.
      </p>

      <SubHeading>Our Value Proposition</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 14, lineHeight: 1.75 }}>
        Retail Innovation Ventures provides a unique and powerful ecosystem that connects advanced technological advancements with innovative retail ventures and essential investment capital. We empower founders and innovators to overcome complex retail challenges, scale their solutions, and make a significant global impact.
      </p>

      <SubHeading>Our Strategy</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 14, lineHeight: 1.75 }}>
        A clear, multi-faceted approach designed to support early-stage retail startups, ensuring groundbreaking innovations scale to their market potential.
      </p>
      {strategyItems.map((it) => <IconRow key={it.title} {...it} />)}

      <SubHeading>Our Ecosystem</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 14, lineHeight: 1.75, textAlign: "center" }}>
        We are fostering a comprehensive innovation ecosystem keeping startups at the centre, helping them accomplish their strategic objectives.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 28, marginTop: 32 }}>
        <IconRow icon={Rocket} title="Premier Accelerators & Incubators" desc="We work jointly with premier accelerators and incubators, offering funding, mentorship, and critical support to fast-track growth." />
        <IconRow icon={Handshake} title="Co-investments & Strategic Partnerships" desc="Through co-investments with angel networks, family offices, and VC funds, we strengthen sector-focused portfolios with targeted retail expertise." />
        <IconRow icon={Globe} title="Retail Industry Collaborations" desc="Our collaborations with retail enterprises, SMEs and distributors enable business expansion in both current and new markets in India and beyond." />
      </div>

      <SubHeading>Our Values</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: "#7A746F", marginTop: 10 }}>
        The principles that guide everything we do at <span style={{ color: BRAND.coral, fontWeight: 600 }}>Retail Innovation Ventures</span>.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 24 }}>
        {values.map((v) => <ValueCard key={v.title} {...v} />)}
      </div>
    </div>
  );
}

function InvestorsPage() {
  const audiences = [
    { icon: User, title: "Individual Investors", desc: "Retail industry enthusiasts and visionary leaders including CXOs, founders, and professionals uniting to power the future of retail." },
    { icon: Building2, title: "Retail Companies", desc: "Innovation ecosystem including corporates, retail SMEs, and growth/late-stage startups building custom portfolios." },
    { icon: Landmark, title: "Institutional Investors", desc: "Family offices, venture funds, and investment firms seeking differentiated retail exposure through a sector-focused early-stage fund." },
  ];
  const apart = [
    { icon: Search, title: "Unique Sectoral Focus", desc: "Focused thesis and deep networks unlock first-mover advantage in a high-growth sector." },
    { icon: Award, title: "Expertise and Leadership", desc: "Retail expertise with hands-on operating and investing experience for smarter choices." },
    { icon: Handshake, title: "Strategic Partnerships", desc: "Work with prominent incubators, industry, and global investors in co-shaping companies." },
    { icon: Layers, title: "Diversification", desc: "Invest across a wide range of retail sub-sectors for a well-balanced risk-return profile." },
    { icon: Shield, title: "Transparency and Governance", desc: "Strong governance and transparent operations maximising value creation." },
    { icon: ArrowUpDown, title: "Active Portfolio Monitoring", desc: "Hands-on portfolio management and data-driven exit strategies." },
  ];
  const whyInvest = [
    { title: "The World's Largest Consumer Opportunity", desc: "Retail is a $30+ trillion global market (2024), growing steadily at 5% CAGR — touching every consumer, every day." },
    { title: "Tech is Rewriting Shopping", desc: "AI-driven personalisation, AR/VR commerce, and social shopping are driving an $8T+ digital retail shift by 2030." },
    { title: "Brands Define Culture", desc: "D2C and new-age retail brands are attracting record capital, with India's consumer market set to hit $6T by 2030." },
    { title: "Resilient Growth, Endless Scale", desc: "From essentials to experiences, retail has shown defensibility across downturns and offers multi-decade scale." },
  ];
  const themes = [
    { title: "AI-Powered Retail Intelligence", desc: "Harnessing AI and data to personalise, predict, and transform consumer experiences." },
    { title: "Consumer Brands of Tomorrow (D2C)", desc: "Backing tech-enabled, purpose-driven brands that reshape how people discover and buy." },
    { title: "Retail SaaS & Infrastructure", desc: "Cloud, AI, and automation platforms powering efficiency, visibility, and decision-making." },
    { title: "Smart & Sustainable Supply Chains", desc: "IoT, blockchain, and AI to build transparent, resilient, and eco-conscious systems." },
    { title: "Experiential & Immersive Commerce", desc: "Turning transactions into immersive experiences that inspire loyalty and delight." },
    { title: "Sustainable & Inclusive Retail", desc: "Investing in models that create conscious consumption and equitable access." },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px 90px" }}>
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

      <SubHeading>Our Investments</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 12, lineHeight: 1.7, maxWidth: 700 }}>
        Focused on the retail sector only, including e-commerce, supply chain, D2C, digital and allied sectors.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, marginTop: 20 }}>
        <InfoCard title="Investment Focus" desc="Early Stage" color={BRAND.coral} />
        <InfoCard title="Sector Focus" desc="Retail and Consumer" color={BRAND.coral} />
      </div>

      <SubHeading>Who Can Invest With Us?</SubHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 24 }}>
        {audiences.map((a) => <AudienceCard key={a.title} {...a} />)}
      </div>

      <SubHeading>What Sets Us Apart?</SubHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, marginTop: 30 }}>
        {apart.map((a) => <ApartCard key={a.title} {...a} />)}
      </div>

      <SubHeading>Why Invest In Retail?</SubHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginTop: 24 }}>
        {whyInvest.map((w) => <InfoCard key={w.title} {...w} />)}
      </div>

      <SubHeading>Key Investment Themes</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 12, lineHeight: 1.7, maxWidth: 800 }}>
        We invest in early-stage retail startups from pre-seed to Series A, focused on high-impact themes with strong differentiation, IP, and early traction.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginTop: 24 }}>
        {themes.map((t) => <InfoCard key={t.title} {...t} />)}
      </div>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 28, lineHeight: 1.7, maxWidth: 800 }}>
        We back A-rated founding teams building scalable businesses with large market potential and a clear path to profitability.
      </p>
    </div>
  );
}

function StartupsPage({ onBackToRios }) {
  const support = [
    { icon: Wallet, title: "Funding & Strategic Investments", desc: "Capital investment, co-investment and strategic support for follow-on funding, helping you align capital with impact, scale, and long-term success." },
    { icon: Lightbulb, title: "Expert Mentorship & Business Growth", desc: "Guidance on winning strategies, unlocking opportunities with enterprise clients, and driving growth post early product-market fit." },
    { icon: Handshake, title: "Industry Access & Strategic Partnerships", desc: "Access a powerful ecosystem of retailers, influencers, and the broader industry to sharpen your GTM strategy and drive adoption." },
    { icon: Globe, title: "Global Entry & Market Expansion", desc: "Strategic support to navigate international markets and forge partnerships beyond borders — expanding reach while improving unit economics." },
  ];

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

      <SubHeading>Our Comprehensive Support System</SubHeading>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 32, marginTop: 30 }}>
        {support.map((s) => <IconRow key={s.title} {...s} />)}
      </div>

      <SubHeading>What We Look For</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 14, lineHeight: 1.75 }}>
        We invest with purpose and back bold teams solving systemic challenges and creating lasting value in the areas that truly matter.
      </p>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15.5, color: BRAND.ink, marginTop: 12, lineHeight: 1.75 }}>
        We look for a compelling need, real differentiation, strong market validation, and the potential for scale. We back teams with conviction, clarity of purpose, and the grit to go the distance. Great teams build great companies — and we're here for those who are all in.
      </p>

      <SubHeading>Ready to Transform Retail?</SubHeading>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 12 }}>Submit your details in the form.</p>
      <button onClick={onBackToRios} style={{
        marginTop: 18, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff",
        border: "none", borderRadius: 9, padding: "13px 24px", cursor: "pointer",
      }}>Raise Capital &amp; Win Customers</button>
    </div>
  );
}

/* ---------------- Retailers page — shared small building blocks ---------------- */
function ImagePanel({ icon: Icon, height = 340 }) {
  return (
    <div style={{
      height, borderRadius: 18, background: `linear-gradient(135deg, ${BRAND.ink} 0%, #3a3432 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND.blue}55 0%, transparent 70%)` }} />
      <Icon size={56} color="rgba(255,255,255,0.5)" strokeWidth={1.2} />
    </div>
  );
}

function IconBullet({ icon: Icon, title, desc, color = BRAND.coral }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <Icon size={26} color={color} strokeWidth={1.6} />
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: BRAND.ink, marginTop: 12 }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 6, lineHeight: 1.6, maxWidth: 380 }}>{desc}</div>
    </div>
  );
}

function StatCard4({ value, title, desc }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 34, color: BRAND.ink }}>{value}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14.5, color: BRAND.ink, marginTop: 6 }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{desc}</div>
    </div>
  );
}

function SectionHeading({ children, color = BRAND.coral, size = "clamp(24px,3.2vw,32px)" }) {
  return <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: size, color, lineHeight: 1.25 }}>{children}</div>;
}

function PinkCard({ title, desc, borderColor = BRAND.coral }) {
  return (
    <div style={{ border: `1px solid ${BRAND.line}`, borderLeft: `3px solid ${borderColor}`, borderRadius: 10, padding: "20px 22px" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 8, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function ChevronStep({ icon: Icon, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 26 }}>
      <div style={{
        width: 64, height: 64, background: "#FBEAEA", borderRadius: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={24} color={BRAND.ink} strokeWidth={1.6} />
      </div>
      <div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 4, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

function NumberedStep({ n, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 18, marginBottom: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: "#FBEAEA", color: BRAND.coral,
          display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, flexShrink: 0,
        }}>{n}</div>
        <div style={{ width: 1.5, flex: 1, background: BRAND.line, marginTop: 4, marginBottom: 4, minHeight: 30 }} />
      </div>
      <div style={{ paddingBottom: 26 }}>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 5, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function MatterCard({ title, color, desc }) {
  return (
    <div style={{ background: "#FBEAEA", borderRadius: 12, padding: "22px 24px" }}>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: BRAND.ink, marginTop: 8, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function NextStepPill({ icon: Icon, title, desc }) {
  return (
    <div>
      <div style={{
        height: 64, background: "#FBEAEA", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={24} color={BRAND.ink} strokeWidth={1.6} />
      </div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink, marginTop: 16 }}>{title}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{desc}</div>
    </div>
  );
}

function RetailersPage({ onBackToRios }) {
  const pillars = [
    { icon: Globe, title: "Global Capability Centre Setup", desc: "Centralise technology expertise and scale operations globally." },
    { icon: Lightbulb, title: "Innovation Ecosystems", desc: "Drive internal innovation and startup-ecosystem collaboration for breakthrough solutions." },
    { icon: Search, title: "Hackathon Hiring", desc: "Recruit top talent through competitive innovation challenges." },
  ];
  return (
    <div>
      {/* Intro + 3 pillars */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px 0" }}>
        <SectionHeading size="clamp(28px,3.8vw,42px)">Three Pillars of Retail Excellence: Unlocking Growth &amp; Innovation</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 20, marginTop: 40 }}>
          {pillars.map((p) => (
            <div key={p.title} style={{ borderTop: `2px solid ${BRAND.coral}`, paddingTop: 16 }}>
              <p.icon size={20} color={BRAND.ink} strokeWidth={1.6} />
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink, marginTop: 12 }}>{p.title}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#7A746F", marginTop: 6, lineHeight: 1.55 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pillar 1 */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading>Pillar 1: Global Capability Centre Setup</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginTop: 32, alignItems: "center" }} className="riv-ret-grid">
            <div>
              <IconBulletDot title="Centralised Excellence" desc="Unified technology platform across all markets." />
              <IconBulletDot title="Global Talent Access" desc="Premium expertise at competitive costs." />
              <IconBulletDot title="Digital Transformation" desc="Advanced analytics and streamlined processes." />
            </div>
            <ImagePanel icon={Layers} />
          </div>
        </div>
      </div>

      {/* Benefits of GCCs */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <SectionHeading color={BRAND.blue} size="clamp(22px,2.8vw,28px)">Benefits of Global Capability Centres for Retailers</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 24, marginTop: 32 }}>
          <StatCard4 value="30%" title="Cost Reduction" desc="Operational savings through process standardisation and automation" />
          <StatCard4 value="50%" title="Faster Innovation" desc="Accelerated time-to-market for new retail technologies" />
          <StatCard4 value="24/7" title="Global Support" desc="Round-the-clock operational excellence" />
          <StatCard4 value="3x" title="Talent Pool" desc="Access to diverse, skilled professionals worldwide" />
        </div>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.ink, marginTop: 32, lineHeight: 1.75, maxWidth: 900 }}>
          Enhanced customer experience through data-driven insights, personalised solutions, and resilient operations that withstand supply chain and market disruptions with global reach.
        </p>
      </div>

      {/* Pillar 2 */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading>Pillar 2: Innovation — Internal &amp; Open Innovation Models</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginTop: 32 }}>
            <PinkCard title="Internal Innovation Culture" desc="Foster continuous innovation within your organisation through design thinking and agile methodologies. Empower teams to rapidly prototype and scale breakthrough retail solutions." />
            <PinkCard title="External Ecosystem Access" desc="Tap into dynamic networks of startups, academic institutions, and technology partners. Harness collective intelligence for game-changing ideas and development." />
          </div>
        </div>
      </div>

      {/* Innovation value for retailers */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <SectionHeading color={BRAND.blue} size="clamp(22px,2.8vw,28px)">Innovation Value for Retailers</SectionHeading>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, marginTop: 32, alignItems: "center" }} className="riv-ret-grid">
          <div>
            <IconBullet icon={TrendingUp} title="Revenue Growth" desc="Launch differentiated products and services faster to capture new market opportunities" />
            <IconBullet icon={Smile} title="Customer Excellence" desc="Stay ahead of evolving expectations with cutting-edge, personalised solutions" />
            <IconBullet icon={Settings} title="Operational Efficiency" desc="Transform operations through AI, automation, and IoT-enabled retail environments" />
          </div>
          <ImagePanel icon={Sparkles} />
        </div>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.ink, marginTop: 8, lineHeight: 1.75, maxWidth: 900 }}>
          Build unshakeable brand loyalty by delivering immersive shopping experiences that captivate and engage customers at every touchpoint.
        </p>
      </div>

      {/* Pillar 3 */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading>Pillar 3: Hiring Through Hackathons</SectionHeading>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 18, lineHeight: 1.75, maxWidth: 820 }}>
            Transform your talent acquisition strategy by using hackathons to identify and recruit top technology talent passionate about solving retail challenges. Engage diverse problem solvers to co-create innovative solutions in real-time whilst accelerating recruitment cycles.
          </p>
          <div style={{ marginTop: 36, maxWidth: 560 }}>
            <ChevronStep icon={Search} title="Talent Discovery" desc="Identify exceptional candidates through practical challenges" />
            <ChevronStep icon={Zap} title="Rapid Hiring" desc="Accelerate recruitment cycles and reduce traditional hiring costs" />
            <ChevronStep icon={Ear} title="Cultural Fit" desc="Assess creativity, problem-solving, and team dynamics" />
          </div>

          <SectionHeading color={BRAND.blue} size="clamp(20px,2.4vw,24px)">Hackathon Hiring Benefits for Retailers</SectionHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginTop: 24 }}>
            <PinkCard title="Global Talent Pool Access" desc="Connect with skilled developers, data scientists, and UX designers from around the world, bringing diverse perspectives to retail challenges." />
            <PinkCard title="Skills-Based Evaluation" desc="Assess candidates' technical abilities and problem-solving in practical, high-pressure environments that mirror real work environments." />
            <PinkCard title="Employer Branding Excellence" desc="Position your company as an innovation-driven, tech-forward retailer that attracts top talent and industry recognition." />
            <PinkCard title="Entrepreneurial Mindsets" desc="Build internal innovation teams with fresh perspectives and entrepreneurial drive to accelerate digital transformation initiatives." />
          </div>
        </div>
      </div>

      {/* Case study */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading>Case Study Snapshot: Transformation Journey</SectionHeading>
          <div style={{ marginTop: 32, maxWidth: 720 }}>
            <NumberedStep n="1" title="Global Centre Launch" desc="Established a Technology Capability Centre in Bangalore for an Australian fashion brand with seamless team integration." />
            <NumberedStep n="2" title="Innovation Challenge Success" desc="Launched an open innovation program generating 15 viable retail technology pilots in just 6 months." />
            <NumberedStep n="3" title="Hackathon Hiring Triumph" desc="Recruited 20 exceptional performers through competitive hackathons, accelerating digital project delivery by 40%." />
          </div>
          <div style={{
            display: "flex", gap: 12, alignItems: "flex-start", marginTop: 8, padding: "16px 20px",
            background: "#EAF8F1", borderRadius: 12, maxWidth: 820,
          }}>
            <CheckCircle2 size={18} color="#1B7A5A" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: BRAND.ink, lineHeight: 1.65 }}>
              The combined strategy delivered measurable results: reduced costs, accelerated innovation, and enhanced capabilities across all retail operations.
            </span>
          </div>
        </div>
      </div>

      {/* Why these pillars matter now */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading>Why These Three Pillars Matter Now</SectionHeading>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 18, lineHeight: 1.75, maxWidth: 900 }}>
            Retail operates in an era of constant disruption: supply chain shocks, inflation pressures, and rapidly shifting consumer behaviours demand immediate adaptation. Digital capabilities and strategic talent acquisition have become the key differentiators in a competitive global marketplace.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginTop: 28 }}>
            <MatterCard title="Market Disruption" color={BRAND.coral} desc="Economic volatility requires resilient, adaptable operations." />
            <MatterCard title="Digital Imperative" color={BRAND.blue} desc="Technology capabilities drive competitive advantage." />
            <MatterCard title="Sustainable Growth" color="#1B7A5A" desc="Innovation ecosystems create lasting market leadership." />
          </div>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 24, lineHeight: 1.75, maxWidth: 900 }}>
            Combining global scale, innovation ecosystems, and agile hiring practices creates the foundation for sustainable growth and operational resilience.
          </p>
        </div>
      </div>

      {/* Next step */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 90px" }}>
        <div style={{ borderTop: `1px solid ${BRAND.line}`, paddingTop: 40 }}>
          <SectionHeading size="clamp(28px,3.6vw,40px)">Your Next Step: Partner to Build the Future of Retail</SectionHeading>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 18, lineHeight: 1.75, maxWidth: 900 }}>
            Embrace these three transformational pillars to revolutionise your retail operations and elevate customer engagement to unprecedented levels. The future of retail belongs to organisations that act decisively today.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20, marginTop: 32 }}>
            <NextStepPill icon={Handshake} title="Strategic Collaboration" desc="Partner with us to design your tailored transformation roadmap" />
            <NextStepPill icon={User} title="Comprehensive Planning" desc="Develop your Global Capability Centre and innovation strategy" />
            <NextStepPill icon={Rocket} title="Market Leadership" desc="Unlock new value, agility, and dominance in retail's next era" />
          </div>

          <div style={{ borderLeft: `3px solid ${BRAND.coral}`, paddingLeft: 22, marginTop: 44 }}>
            <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, lineHeight: 1.75, maxWidth: 800 }}>
              Together, we'll transform challenges into competitive advantages and position your brand at the forefront of retail innovation.
            </p>
            <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14.5, color: BRAND.ink, marginTop: 10, lineHeight: 1.75, maxWidth: 800 }}>
              Please fill out a quick profile of your retail enterprise on RIOS and we'll get back to you.
            </p>
            <button onClick={onBackToRios} style={{
              marginTop: 20, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, background: BRAND.coral, color: "#fff",
              border: "none", borderRadius: 9, padding: "13px 24px", cursor: "pointer",
            }}>Get Your AI &amp; Innovation Audit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBulletDot({ title, desc }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 26 }}>
      <div style={{ width: 14, height: 14, borderRadius: 4, background: "#FCEEE1", marginTop: 4, flexShrink: 0 }} />
      <div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{title}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13.5, color: "#7A746F", marginTop: 4, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ---------------- Footer (global — renders under every tab) ---------------- */
function Footer({ setTab }) {
  return (
    <div style={{ borderTop: `1px solid ${BRAND.line}`, background: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 24px 40px", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 40 }} className="riv-footer-grid">
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, color: BRAND.coral }}>Retail Innovation Ventures</div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.ink, marginTop: 18, lineHeight: 1.8 }}>
            WeWork, 9th Floor, Mahogany,<br />Manyata Tech Park, Bangalore
          </div>
          <a href="mailto:contact@retailinnovation.ventures" style={{ display: "inline-block", marginTop: 12, fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.blue, textDecoration: "underline" }}>
            contact@retailinnovation.ventures
          </a>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#9B958F", marginTop: 28 }}>© 2026 by Retail Innovation Ventures</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <a href="#" style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: BRAND.blue, textDecoration: "underline" }}>Terms & Conditions</a>
            <span style={{ color: "#C8C3BF" }}>|</span>
            <a href="#" style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: BRAND.blue, textDecoration: "underline" }}>Privacy Policy</a>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18 }}>
            <span style={{ color: BRAND.coral }}>Quick</span> <span style={{ color: BRAND.blue }}>links</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
            <button onClick={() => setTab("startups")} style={footerLinkBtn}>Startups</button>
            <button onClick={() => setTab("investors")} style={footerLinkBtn}>Investors</button>
            <button onClick={() => setTab("aboutus")} style={footerLinkBtn}>About Us</button>
          </div>
        </div>
      </div>
    </div>
  );
}
const footerLinkBtn = {
  textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0,
  fontFamily: "'Poppins',sans-serif", fontSize: 14, color: BRAND.blue, textDecoration: "underline", width: "fit-content",
};

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
          .riv-experts-grid { grid-template-columns: 1fr !important; }
          .riv-benefits-grid { grid-template-columns: 1fr !important; }
          .riv-footer-grid { grid-template-columns: 1fr !important; }
          .riv-ret-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <SubNav tab={tab} setTab={setTab} onBackToRios={onBackToRios} />
      {tab === "home" && <HomePage setTab={setTab} />}
      {tab === "aboutus" && <AboutUsPage />}
      {tab === "investors" && <InvestorsPage />}
      {tab === "startups" && <StartupsPage onBackToRios={onBackToRios} />}
      {tab === "retailers" && <RetailersPage onBackToRios={onBackToRios} />}
      <Footer setTab={setTab} />
    </div>
  );
}
