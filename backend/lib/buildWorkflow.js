// Build.RIV workflow rules: stage lists per project type, who may approve
// each gate, what must be filled in before a gate can be passed, and the
// ROI/payback calculation (PRD sections 6, 7, 8.3).
//
// Kept as pure functions (no DB access) so the route layer stays thin and
// these rules are easy to unit-test or adjust in one place if the CEO/
// Saravana/Rachana settle the open questions in PRD section 12.3
// differently than the defaults chosen here.

// Workflow A -- Enterprise Innovation Management (internal ideas), PRD section 6.
// Workflow B -- Open Innovation Management (startups), PRD section 7, with the
// extra Agreement stage (NDA + pilot/POC contract) before Design.
export const STAGES = {
  internal: ["requirements", "design", "build", "test", "pilot", "scale", "closed"],
  startup: ["requirements", "agreement", "design", "build", "test", "pilot", "scale", "closed"],
};

export const STAGE_LABELS = {
  requirements: "Requirements",
  agreement: "Agreement",
  design: "Design",
  build: "Build",
  test: "Test",
  pilot: "Pilot",
  scale: "Scale",
  closed: "Closed",
};

// "Gate approved by" columns in PRD sections 6 and 7. 'admin' can always
// also approve (permission table 10.2: RIV Admin = Yes on every row) --
// callers should treat this as "one of these OR admin", not exhaustive.
// Pilot's gate decides Scale / Iterate / Stop, not just advance -- handled
// in the route, not here.
const GATE_APPROVERS = {
  internal: {
    requirements: ["client_poc"],
    design: ["client_poc"],
    build: ["owner"], // "Project owner" -- whoever is build_projects.owner_user_id
    test: ["client_poc"],
    pilot: ["client"], // Client Leader
    scale: ["client"],
  },
  startup: {
    requirements: ["client_poc"],
    agreement: ["client_poc", "riv_manager"],
    design: ["client_poc"],
    build: ["riv_manager"],
    test: ["client_poc"],
    pilot: ["client"],
    scale: ["client"],
  },
};

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
// role-or-relationship tokens: a literal role name, or 'owner'/'client_poc'/
// 'riv_manager'/'client' meaning "whoever holds that relationship to this
// project" (resolved against the project row by the caller).
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
