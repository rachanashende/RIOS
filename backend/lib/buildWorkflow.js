// Build.RIV workflow rules: stage lists per project type, who may approve
// each stage, what must be filled in before a stage can be completed, the
// automatic health rules, and the ROI/payback calculation.
//
// Workflow v2 (Oct 2026, approved with the CEO):
//   - Internal ideas (Enterprise Innovation): Requirements -> Design -> Build
//     -> Test -> Pilot -> Production -> Closed.
//   - Startup pilots (Open Innovation): Deal stages Requirements -> NDA ->
//     Proposal -> Purchase Order -> Agreement, then Delivery stages Design ->
//     Build -> Test -> Pilot -> Production -> Closed (RISE deal-stage style).
//   - The Product Owner (role client_poc, build_projects.poc_user_id)
//     completes and approves every stage, and records the Pilot decision.
//     The Client Leader reviews. RIV Admin can always act.
//
// Kept as pure functions (no DB access) so the route layer stays thin and
// these rules are easy to unit-test or adjust in one place.

export const STAGES = {
  internal: ["requirements", "design", "build", "test", "pilot", "production", "closed"],
  startup: ["requirements", "nda", "proposal", "purchase_order", "agreement", "design", "build", "test", "pilot", "production", "closed"],
};

// The startup-only "deal" phase, shown as one group on the dashboard.
export const DEAL_STAGES = ["nda", "proposal", "purchase_order", "agreement"];

export const STAGE_LABELS = {
  requirements: "Requirements",
  nda: "NDA",
  proposal: "Proposal",
  purchase_order: "Purchase Order",
  agreement: "Agreement",
  design: "Design",
  build: "Build",
  test: "Test",
  pilot: "Pilot",
  production: "Production",
  // Legacy name for Production, kept so old history rows still read well.
  scale: "Production",
  closed: "Closed",
};

// Every stage is completed and approved by the Product Owner (client_poc
// token, resolved against build_projects.poc_user_id). 'admin' can always
// also approve (see canApproveGate in buildPermissions.js).
export function gateApprovers(type, stage) {
  if (!STAGES[type] || stage === "closed") return [];
  return STAGES[type].includes(stage) ? ["client_poc"] : [];
}

export function nextStage(type, stage) {
  const list = STAGES[type];
  const i = list.indexOf(stage);
  if (i === -1 || i === list.length - 1) return null;
  return list[i + 1];
}

export function prevStage(type, stage) {
  const list = STAGES[type];
  const i = list.indexOf(stage);
  if (i <= 0) return null;
  return list[i - 1];
}

export function isValidStage(type, stage) {
  return STAGES[type]?.includes(stage) ?? false;
}

// 1-based position of the stage and the stage count, for "step 5 of 7"
// and progress bars.
export function stageProgress(type, stage) {
  const list = STAGES[type] || [];
  const i = list.indexOf(stage);
  return { step: i === -1 ? null : i + 1, of: list.length, pct: i === -1 ? 0 : Math.round(((i + 1) / list.length) * 100) };
}

// Fields that must be filled in before a project can leave each stage.
// Checked against the merged { ...project, ...metrics } row the route
// already has in hand.
export function missingFieldsForStage(type, stage, project, metrics) {
  const missing = [];
  const need = (ok, label) => { if (!ok) missing.push(label); };

  switch (stage) {
    case "requirements":
      need(metrics?.kpi_name, "KPI name");
      need(metrics?.baseline != null, "KPI baseline");
      need(metrics?.target != null, "KPI target");
      need(metrics?.est_cost != null, "Budget estimate");
      need(project.target_end, "Target end date");
      break;
    case "nda":
      need(project.nda_signed_at, "NDA signed date");
      break;
    case "proposal":
      need(project.proposal_value != null, "Proposal value");
      need(project.proposal_accepted_at, "Proposal accepted date");
      break;
    case "purchase_order":
      need(project.po_number, "PO number");
      need(project.po_date, "PO date");
      break;
    case "agreement":
      need(project.agreement_type, "Agreement type");
      need(project.agreement_signed_at, "Signed date");
      break;
    case "design":
      need(project.systems_touched, "Systems touched");
      if (type === "startup") need(project.security_check_done != null, "Security check done (yes/no)");
      break;
    case "build":
      need(project.demo_link, "Demo link or evidence");
      break;
    case "test":
      need(project.test_result, "Test result");
      break;
    case "pilot":
      need(project.pilot_scope, "Pilot scope");
      need(project.pilot_start, "Pilot start date");
      need(project.pilot_end, "Pilot end date");
      break;
    case "production":
    case "scale":
      need(project.rollout_scope, "Rollout scope");
      need(metrics?.actual_cost != null, "Actual cost");
      if (type === "startup") need(project.contract_value != null, "Contract value");
      break;
    default:
      break;
  }
  return missing;
}

/* -------------------------------------------------------------------------
   AUTOMATIC HEALTH RULES (approved thresholds)
   The Product Owner picks a health in each status update. RIOS also checks
   the rules below; the worse result shows, with its reasons.
   ------------------------------------------------------------------------- */
const SEVERITY = { on_track: 0, at_risk: 1, off_track: 2 };
const BY_SEVERITY = ["on_track", "at_risk", "off_track"];

function daysBetween(a, b) {
  return Math.floor((new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0)) / 86400000);
}

// input: {
//   status, stage, type, target_end, stage_due, started_at,
//   manual_health        -- health picked in the latest status update (or null)
//   last_update_date     -- date of the latest update (or null)
//   needs_help           -- latest update ticked "Needs leadership help"
//   est_cost, actual_cost, baseline, target, kpi_latest
// }
// returns { health: 'on_track'|'at_risk'|'off_track'|null, reasons: [{level, text}] }
export function evaluateHealth(p, today = new Date()) {
  const reasons = [];
  const add = (level, text) => reasons.push({ level, text });
  const active = p.status === "active";

  if (active) {
    // Status update rhythm: 15-21 days amber, over 21 red.
    const since = p.last_update_date || p.started_at;
    if (since) {
      const d = daysBetween(since, today);
      if (d > 21) add("off_track", `No status update for ${d} days`);
      else if (d >= 15) add("at_risk", `No status update for ${d} days`);
    }

    // Stage running late against its planned end: up to 14 days amber, over 14 red.
    if (p.stage_due && p.stage !== "closed") {
      const late = daysBetween(p.stage_due, today);
      if (late > 14) add("off_track", `${p.stageLabel || "Stage"} ${late} days late`);
      else if (late > 0) add("at_risk", `${p.stageLabel || "Stage"} ${late} days late`);
    }

    // Target end date: within 14 days and not in Production amber; passed red.
    if (p.target_end) {
      const left = daysBetween(today, p.target_end);
      if (left < 0) add("off_track", `Target end date passed ${-left} days ago`);
      else if (left <= 14 && !["production", "scale", "closed"].includes(p.stage)) add("at_risk", `Target end in ${left} days, not yet in Production`);
    }

    // Budget: 10-20% over amber, over 20% red.
    const est = p.est_cost != null ? Number(p.est_cost) : null;
    const act = p.actual_cost != null ? Number(p.actual_cost) : null;
    if (est && est > 0 && act != null) {
      const over = (act - est) / est;
      if (over > 0.2) add("off_track", `Budget ${Math.round(over * 100)}% over estimate`);
      else if (over > 0.1) add("at_risk", `Budget ${Math.round(over * 100)}% over estimate`);
    }

    // KPI during Pilot: under half-way to target amber; worse than baseline red.
    if (p.stage === "pilot" && p.kpi_latest != null && p.baseline != null && p.target != null && Number(p.baseline) !== Number(p.target)) {
      const progress = (Number(p.baseline) - Number(p.kpi_latest)) / (Number(p.baseline) - Number(p.target));
      if (progress < 0) add("off_track", "KPI worse than baseline in Pilot");
      else if (progress < 0.5) add("at_risk", `KPI ${Math.round(progress * 100)}% of the way to target`);
    }

    if (p.needs_help) add("off_track", "Leadership help requested");
  }

  const manual = p.manual_health || null;
  if (manual === "off_track") add("off_track", "Marked Off track in the latest update");
  else if (manual === "at_risk") add("at_risk", "Marked At risk in the latest update");

  let worst = manual ? SEVERITY[manual] : null;
  for (const r of reasons) worst = worst == null ? SEVERITY[r.level] : Math.max(worst, SEVERITY[r.level]);
  // De-duplicate and put the most serious reasons first.
  const seen = new Set();
  const ordered = reasons
    .sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level])
    .filter((r) => (seen.has(r.text) ? false : seen.add(r.text)));
  return { health: worst == null ? null : BY_SEVERITY[worst], reasons: ordered };
}

// ROI % = (realised annual benefit - cost) / cost * 100
// Payback (months) = cost / (benefit / 12)
// Uses actual cost when known, else the estimate; realised benefit when
// known, else the estimate -- and says so with estimated=true.
export function computeRoi(metrics) {
  if (!metrics) return { roiPct: null, paybackMonths: null, estimated: true };
  const cost = metrics.actual_cost != null ? Number(metrics.actual_cost) : (metrics.est_cost != null ? Number(metrics.est_cost) : null);
  const estimated = metrics.realised_benefit == null;
  const benefit = metrics.realised_benefit != null ? Number(metrics.realised_benefit) : (metrics.est_benefit != null ? Number(metrics.est_benefit) : null);
  if (cost == null || benefit == null || cost === 0) return { roiPct: null, paybackMonths: null, estimated };
  const roiPct = ((benefit - cost) / cost) * 100;
  const paybackMonths = benefit > 0 ? cost / (benefit / 12) : null;
  return { roiPct, paybackMonths, estimated };
}

export function fmtUSD(n) {
  if (n == null || isNaN(n)) return null;
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  const trim = (x) => String(Number(x.toFixed(1)));
  if (n >= 1e9) return sign + "US$" + trim(n / 1e9) + "B";
  if (n >= 1e6) return sign + "US$" + trim(n / 1e6) + "M";
  if (n >= 1e3) return sign + "US$" + Math.round(n / 1e3).toLocaleString() + "K";
  return sign + "US$" + Math.round(n).toLocaleString();
}
