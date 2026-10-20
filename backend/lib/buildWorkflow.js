// Build.RIV workflow rules: stage lists per project type, who may approve
// each gate, what must be filled in before a gate can be passed, and the
// ROI/payback calculation (PRD sections 6, 7, 8.3).
//
// Kept as pure functions (no DB access) so the route layer stays thin and
// these rules are easy to unit-test or adjust in one place if the CEO/
// Saravana/Rachana settle the open questions in PRD section 12.3
// differently than the defaults chosen here.

// Workflow A -- Enterprise Innovation Management (internal ideas), 7 stages.
// Workflow B -- Open Innovation Management (startups), 11 stages: a 5-stage
// "deal" track (Requirements through Agreement) ahead of the same 6-stage
// "delivery" track internal projects use (Design through Closed). This is
// the Oct 2026 "Proposed Screens" stage model -- it replaces the single
// Agreement stage with 4 deal milestones, and renames Scale to Production
// (both workflows). Changed with no live Build projects yet to migrate.
export const STAGES = {
  internal: ["requirements", "design", "build", "test", "pilot", "production", "closed"],
  startup: ["requirements", "nda", "proposal", "purchase_order", "agreement", "design", "build", "test", "pilot", "production", "closed"],
};

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
  closed: "Closed",
};

// Which stages are "deal" (pre-delivery, startup only) vs "delivery" --
// the proposed screens show these as two labelled rows on the stage
// stepper. Internal projects have no deal track at all.
export const STARTUP_DEAL_STAGES = ["requirements", "nda", "proposal", "purchase_order", "agreement"];
export const STARTUP_DELIVERY_STAGES = ["design", "build", "test", "pilot", "production", "closed"];

// "Who can complete and approve a stage" (proposed-screens permission
// table): RIV Admin and Product Owner, for every stage of both workflows --
// Client Leader only "reviews" (comments, notified), never blocks. 'admin'
// can always also approve regardless of what's listed here (callers treat
// this as "one of these OR admin", not exhaustive). Pilot's gate decides
// Production / Iterate / Stop, not just advance -- handled in the route.
const GATE_APPROVERS = Object.fromEntries(
  Object.entries(STAGES).map(([type, stages]) => [
    type,
    Object.fromEntries(stages.filter((s) => s !== "closed").map((s) => [s, ["product_owner"]])),
  ])
);

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

// Who can approve leaving `stage` for `type`. Returns an array of
// relationship tokens ('product_owner' today) meaning "whoever holds that
// relationship to this project" -- resolved against the project row by the
// caller (lib/buildPermissions.js's canApproveGate).
export function gateApprovers(type, stage) {
  return GATE_APPROVERS[type]?.[stage] || [];
}

// BLD-AC04: fields that must be filled in before a project can leave each
// stage (PRD "Must be filled before moving on" columns). Checked against the
// merged { ...project, ...metrics } row the route already has in hand, so
// this stays a plain list -> list-of-missing-labels function.
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
      need(project.proposal_amount != null, "Proposal amount");
      need(project.proposal_accepted_at, "Proposal accepted date");
      break;
    case "purchase_order":
      need(project.po_number, "PO number");
      need(project.po_raised_at, "PO raised date");
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
      need(project.rollout_scope, "Rollout scope");
      need(metrics?.actual_cost != null, "Actual cost");
      if (type === "startup") need(project.contract_value != null, "Contract value");
      break;
    default:
      break;
  }
  return missing;
}

// BLD-AC10: ROI % = (realised annual benefit - actual cost) / actual cost * 100
// Payback (months) = actual cost / (realised annual benefit / 12)
// Returns { roiPct, paybackMonths, estimated } -- estimated=true (and the
// figures computed off est_benefit instead) until realised_benefit exists,
// per PRD 8.3 "the dashboard shows *estimated* ROI and labels it so".
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

// Automated red/amber health rules (Oct 2026 "Proposed Screens" page 7,
// "When a project turns amber or red"). Before this, `health` was purely
// whatever value the last status update picked -- no automatic override.
// This computes the worst rule-triggered health alongside the posted one;
// callers display whichever is worse, with that rule's reason, per the
// mockup's "if an automatic rule is worse than the health you pick, the
// worse one shows, with its reason" note.
//
// "Stage running late" (<=14 days late = amber, >14 days = red) needs an
// *expected* duration per stage to measure lateness against, and no such
// field exists anywhere in the schema (build_projects has no per-stage
// target date, only one overall target_end). Rather than leave the rule
// out, these are explicit, documented DEFAULT expected-duration-in-days
// assumptions, flagged here the same way other undecided inputs in this
// module are flagged rather than silently invented -- an admin reviewing
// this should treat these as a starting point, not a measured fact:
// Requirements/NDA/Proposal/Purchase Order/Agreement (deal/scoping
// stages) ~2 weeks each, Design/Test ~2 weeks, Build ~4 weeks, Pilot ~4
// weeks, Production ~2 weeks. No override field exists yet to replace
// these per-project; if a team's actual norm differs a lot, that's the
// next thing to add (a per-project or per-client expected-duration
// override), not a change to these constants.
export const STAGE_EXPECTED_DAYS = {
  requirements: 14, nda: 14, proposal: 14, purchase_order: 14, agreement: 14,
  design: 14, build: 28, test: 14, pilot: 28, production: 14,
};

const RANK = { on_track: 0, at_risk: 1, off_track: 2 };
function worse(a, b) { return RANK[a.health] >= RANK[b.health] ? a : b; }

export function computeAutoHealth({ project, metrics, daysSinceUpdate, daysInStage, latestKpiValue, needsHelp }) {
  let result = { health: "on_track", reason: null };

  // Status update not done.
  if (daysSinceUpdate != null) {
    if (daysSinceUpdate > 21) result = worse(result, { health: "off_track", reason: `No status update in ${daysSinceUpdate} days (>21).` });
    else if (daysSinceUpdate > 14) result = worse(result, { health: "at_risk", reason: `No status update in ${daysSinceUpdate} days (15-21).` });
  }

  // Target end date, once a target exists and the project isn't done.
  if (project.target_end && project.stage !== "production" && project.stage !== "closed") {
    const daysPast = Math.round((Date.now() - new Date(project.target_end).getTime()) / 86400000);
    if (daysPast > 0) result = worse(result, { health: "off_track", reason: `Target end date (${new Date(project.target_end).toLocaleDateString("en-US", { day: "numeric", month: "short" })}) has passed and the project isn't closed.` });
    else if (daysPast > -14) result = worse(result, { health: "at_risk", reason: "Target end date is within 14 days." });
  }

  // Budget: actual cost vs. estimate.
  if (metrics?.actual_cost != null && metrics?.est_cost != null && Number(metrics.est_cost) > 0) {
    const overPct = ((Number(metrics.actual_cost) - Number(metrics.est_cost)) / Number(metrics.est_cost)) * 100;
    if (overPct > 20) result = worse(result, { health: "off_track", reason: `Actual cost is ${overPct.toFixed(0)}% over budget (>20%).` });
    else if (overPct > 10) result = worse(result, { health: "at_risk", reason: `Actual cost is ${overPct.toFixed(0)}% over budget (10-20%).` });
  }

  // KPI movement during Pilot only (the mockup's rule is explicitly
  // pilot-scoped -- KPI isn't expected to have moved yet at earlier stages).
  if (project.stage === "pilot" && latestKpiValue != null && metrics?.baseline != null && metrics?.target != null) {
    const baseline = Number(metrics.baseline), target = Number(metrics.target), now = Number(latestKpiValue);
    const span = target - baseline;
    if (span !== 0) {
      const progressFrac = (now - baseline) / span;
      if (progressFrac < 0) result = worse(result, { health: "off_track", reason: "Latest KPI reading is worse than baseline during Pilot." });
      else if (progressFrac < 0.5) result = worse(result, { health: "at_risk", reason: "Latest KPI reading is under halfway to target during Pilot." });
    }
  }

  // Stage running late, against the default expected duration above --
  // skipped once a project is done (closed, or sitting in Production
  // awaiting close) since lateness no longer means anything there.
  if (daysInStage != null && project.stage !== "production" && project.stage !== "closed") {
    const expected = STAGE_EXPECTED_DAYS[project.stage];
    if (expected != null) {
      const daysLate = daysInStage - expected;
      if (daysLate > 14) result = worse(result, { health: "off_track", reason: `${daysInStage} days in ${STAGE_LABELS[project.stage] || project.stage} (expected ~${expected}) -- more than 14 days late.` });
      else if (daysLate > 0) result = worse(result, { health: "at_risk", reason: `${daysInStage} days in ${STAGE_LABELS[project.stage] || project.stage} (expected ~${expected}) -- running late.` });
    }
  }

  // Product Owner's "Needs leadership help" flag on the latest update.
  if (needsHelp) result = worse(result, { health: "off_track", reason: "The Product Owner flagged this project as needing leadership help." });

  return result;
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
