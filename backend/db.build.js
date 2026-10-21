// Build.RIV — the Transform-stage module (RIOS Build Module & Leader Dashboard
// PRD, v0.1, Oct 2026). Turns an Ideathon winner or a selected startup into a
// tracked project through Requirements -> ... -> Closed, captures ROI and
// lessons learned, and feeds the Leader dashboard.
//
// Kept in its own file/init function, same convention as db.rise.js and
// db.index.js: self-contained, idempotent (CREATE TABLE IF NOT EXISTS + safe
// repeatable ALTERs), callable once at boot, deletable as one unit if this
// module is ever retired.
import pool from "./db.js";

// PRD open question (12.3): two new roles are added as real roles rather than
// reusing existing ones — client_poc (co-owns a client's Build projects,
// enters status jointly with RIV) and riv_manager (Saravana's role: runs
// joint reviews, scoped to assigned clients, not every client like admin).
// Same dynamic "read the live constraint, add to it" technique as
// db.rise.js's widening of users.role for rise_jury — never hardcode the
// existing list, since it has already drifted at least once in this repo's
// history (see that file's comment) and widening it incorrectly bricks every
// deploy with a CHECK violation.
async function widenRoleConstraint(newRoles) {
  await pool.query(
    `
    DO $$
    DECLARE
      cname text;
      cdef text;
      vals text;
      missing text[] := ARRAY[${newRoles.map((r) => `'${r}'`).join(",")}]::text[];
      r text;
    BEGIN
      SELECT con.conname, pg_get_constraintdef(con.oid) INTO cname, cdef
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%role%';

      IF cname IS NULL THEN
        -- Shouldn't happen once db.js has run first, but fail safe.
        EXECUTE format(
          'ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (%s))',
          array_to_string(ARRAY(SELECT quote_literal(x) FROM unnest(missing) x), ',')
        );
        RETURN;
      END IF;

      SELECT string_agg(DISTINCT quote_literal(m[1]), ',') INTO vals
      FROM regexp_matches(cdef, '''([a-zA-Z_]+)''::text', 'g') AS m;

      FOREACH r IN ARRAY missing LOOP
        IF vals NOT ILIKE '%' || quote_literal(r) || '%' THEN
          vals := vals || ',' || quote_literal(r);
        END IF;
      END LOOP;

      IF vals IS DISTINCT FROM (
        SELECT string_agg(DISTINCT quote_literal(m[1]), ',')
        FROM regexp_matches(cdef, '''([a-zA-Z_]+)''::text', 'g') AS m
      ) THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
        EXECUTE format('ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (%s))', vals);
      END IF;
    END $$;
  `
  );
}

export async function initBuildSchema() {
  // Oct 2026 "Proposed Screens" redesign: client_poc is renamed product_owner
  // (same client-side co-owner of delivery, just the name the screens use),
  // and startup_poc is new -- the external startup's own rep on a startup
  // pilot project (uploads deal documents, posts updates), scoped to one
  // project via build_projects.startup_poc_user_id below. riv_manager is
  // unchanged as a role value -- only its on-screen label becomes "RIV
  // Client Partner" (frontend-only).
  await widenRoleConstraint(["product_owner", "riv_manager", "startup_poc"]);
  await pool.query(`UPDATE users SET role = 'product_owner' WHERE role = 'client_poc';`);

  // The owner wants client logins created specifically for a Build/Transform
  // engagement to be scoped to Build.RIV only -- no access to the main RIOS
  // audit (Discover Assessment / My Scorecard). Rather than a new role (which
  // would mean teaching every isClientLeaderOf()/canSeeClientDashboard() etc.
  // check in buildPermissions.js a second "is this a client" case, and would
  // split what "the client_id FK on build_projects points at a client" means),
  // this stays role='client' -- still the Client Leader for Build purposes --
  // with a flag that (a) the frontend uses to show only the Build nav item and
  // redirect straight into it on login, and (b) the backend uses to actually
  // block the audit/scorecard endpoints (routes/responses.js, routes/export.js),
  // not just hide the button. Defaults false, so every existing client login
  // (created from the main site's own Manage Clients) is completely unaffected.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS build_scoped BOOLEAN NOT NULL DEFAULT false;`);

  // ------------------------------------------------------------------
  // Dependencies this module needs on tables that belong to Ideathon /
  // Startup (PRD section 10.1 "Changes to existing tables" + section 12.2
  // dependencies: R21 publish winners, R22 shortlist decision, client_id
  // on startup calls). Additive only — nothing here changes how Ideathon
  // or Startup already behave for anyone not touching Build.
  // ------------------------------------------------------------------

  // A startup call isn't linked to a retailer today, so a Build project
  // created from a selected application has no client to attach to.
  await pool.query(`ALTER TABLE rise_opportunities ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);

  // R22: the jury's shortlist decision on an application. 'selected_for_pilot'
  // is what unlocks "Create Build project" (section 7, "How a project starts").
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS decision TEXT;`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE rise_applications ADD CONSTRAINT rise_applications_decision_check
        CHECK (decision IN ('shortlist','on_hold','not_selected','selected_for_pilot'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;`);
  // Second half of the riv_status backfill started in db.rise.js (see its
  // comment) -- 'decision' is this module's own column and didn't exist
  // yet when that one ran, so an application already decided (but perhaps
  // never scored, e.g. decided straight from a quick read) is caught here
  // instead. Idempotent, same as the first half.
  await pool.query(`UPDATE rise_applications SET riv_status = 'approved' WHERE riv_status = 'pending' AND decision IS NOT NULL;`);

  // R21: an Ideathon winner marked "Selected for Build" (section 6, "How a
  // project starts"). ideas has no generic status column today — rather than
  // add one and risk colliding with however Ideas.RIV itself grows a status
  // concept later, this is scoped explicitly to Build's own concern.
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS selected_for_build_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS selected_for_build_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`);

  // ------------------------------------------------------------------
  // Core Build tables (PRD section 10.1)
  // ------------------------------------------------------------------

  await pool.query(`CREATE SEQUENCE IF NOT EXISTS build_project_code_seq;`);

  await pool.query(`
    -- One row per Build project, either workflow. type drives which stage
    -- list and gate-approver rules apply (see backend/lib/buildWorkflow.js);
    -- deliberately not CHECKed against a fixed stage list here since the
    -- two workflows have different, type-dependent stage sets (7 stages
    -- internal, 8 with Agreement for startup) -- validated in app code
    -- instead, same way Ideas.RIV validates idea_ratings.criteria_scores
    -- against its JSON rubric rather than a DB CHECK.
    CREATE TABLE IF NOT EXISTS build_projects (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('internal','startup')),
      title TEXT NOT NULL,
      description TEXT,
      client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      riv_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      startup_poc_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','stopped','closed')),
      health TEXT CHECK (health IN ('on_track','at_risk','off_track')),
      outcome TEXT CHECK (outcome IN ('scaled','stopped')),
      hold_reason TEXT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      target_end DATE,
      closed_at TIMESTAMPTZ,

      -- Requirements (both workflows)
      kpi_baseline_note TEXT,

      -- Agreement (startup only, PRD section 7 stage 2)
      agreement_type TEXT,
      agreement_signed_at DATE,
      pilot_fee NUMERIC,

      -- Design
      systems_touched TEXT,
      data_shared TEXT,
      risks TEXT,
      security_check_done BOOLEAN,

      -- Build
      demo_link TEXT,

      -- Test
      test_result TEXT CHECK (test_result IN ('pass','pass_with_issues')),

      -- Pilot
      pilot_scope TEXT,
      pilot_start DATE,
      pilot_end DATE,

      -- Scale / Production
      rollout_scope TEXT,
      contract_value NUMERIC,

      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- BLD-AC01/02/03: where a project came from, and the duplicate guard.
    -- source_type='manual' is never unique-constrained (an admin can create
    -- as many hand-entered projects as they like); idea/rise_application
    -- are, so the same idea or application can't silently spawn a second
    -- project (BLD-AC03's "Already in Build as BLD-xxxx").
    CREATE TABLE IF NOT EXISTS build_project_sources (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('idea','rise_application','manual')),
      source_id INTEGER,
      question_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS build_project_sources_source_uq
      ON build_project_sources (source_type, source_id)
      WHERE source_type IN ('idea','rise_application');

    -- Every stage change, with who/when/why. Append-only -- nothing in this
    -- module ever UPDATEs or DELETEs a row here.
    CREATE TABLE IF NOT EXISTS build_stage_history (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT,
      action TEXT NOT NULL CHECK (action IN ('advance','send_back','iterate','hold','resume','stop','close')),
      reason TEXT,
      by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Joint RIV + client status updates (PRD 8.2). Can't be deleted; a typo
    -- can be edited within 24h (enforced in the route, edited_at logged).
    CREATE TABLE IF NOT EXISTS build_updates (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      update_date DATE NOT NULL DEFAULT CURRENT_DATE,
      health TEXT NOT NULL CHECK (health IN ('on_track','at_risk','off_track')),
      progress TEXT NOT NULL,
      next_steps TEXT NOT NULL,
      blockers TEXT,
      needs_help BOOLEAN NOT NULL DEFAULT false,
      pct_complete INTEGER CHECK (pct_complete BETWEEN 0 AND 100),
      by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agreed_with_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      edited_at TIMESTAMPTZ
    );

    -- One row per project (PRD 8.3 ROI tracking). KPI + cost/benefit fields
    -- live here rather than on build_projects so they can be edited/zeroed
    -- independently of stage data, and so ROI/payback can be computed from
    -- one place (backend/lib/buildWorkflow.js).
    CREATE TABLE IF NOT EXISTS build_metrics (
      project_id INTEGER PRIMARY KEY REFERENCES build_projects(id) ON DELETE CASCADE,
      kpi_name TEXT,
      kpi_unit TEXT,
      baseline NUMERIC,
      target NUMERIC,
      currency TEXT NOT NULL DEFAULT 'USD',
      est_cost NUMERIC,
      actual_cost NUMERIC,
      est_benefit NUMERIC,
      realised_benefit NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- KPI actual, over time, captured alongside a status update (baseline ->
    -- actual trend, PRD 8.3).
    CREATE TABLE IF NOT EXISTS build_kpi_readings (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
      value NUMERIC NOT NULL,
      update_id INTEGER REFERENCES build_updates(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Required before Closed (PRD 8.4), whether Scaled or Stopped.
    CREATE TABLE IF NOT EXISTS build_lessons (
      project_id INTEGER PRIMARY KEY REFERENCES build_projects(id) ON DELETE CASCADE,
      worked TEXT,
      not_worked TEXT,
      do_differently TEXT,
      recommendation TEXT CHECK (recommendation IN ('scale_to_others','reuse_approach','dont_repeat')),
      tags TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Files attached to a project or a stage (PRD 8.6). Stored as bytea --
    -- no object storage is wired up anywhere else in RIOS yet, and v1's
    -- 10MB/file cap is small enough that Postgres bytea is simplest rather
    -- than standing up a new storage dependency for this alone.
    CREATE TABLE IF NOT EXISTS build_files (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      stage TEXT,
      file_name TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL,
      content BYTEA NOT NULL,
      by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Which clients a riv_manager is assigned to (permission table 10.2:
    -- RIV Manager sees/creates/updates only "Assigned clients", not every
    -- client the way RIV Admin does). Not named in the PRD's table list
    -- directly -- it's the natural implementation of that scoping rule.
    CREATE TABLE IF NOT EXISTS build_manager_clients (
      manager_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (manager_user_id, client_id)
    );

    -- In-app notification feed (PRD 10.3). Email (via backend/lib/email.js,
    -- already wired up for auth) fires alongside these for the same
    -- triggers; this table is what a "Needs attention" list reads from
    -- without re-deriving it from stage history and updates every time.
    CREATE TABLE IF NOT EXISTS build_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES build_projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Phase 3 "re-assess" loop (PRD 8.5): records that a Closed/Scaled
    -- project addresses a given audit question for a client, so the next
    -- audit view can show "Addressed by BLD-xxxx (Scaled, <date>)" without
    -- RIOS needing full audit versioning (R2, out of scope here) first.
    CREATE TABLE IF NOT EXISTS build_reassess_links (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(project_id, question_id)
    );
  `);

  // Oct 2026 "Proposed Screens" redesign -- rename the two pre-existing
  // relationship columns on an already-live build_projects table (the
  // CREATE TABLE IF NOT EXISTS above only applies to a brand-new table).
  // poc_user_id -> product_owner_user_id (role rename, see widenRoleConstraint
  // call above); owner_user_id is retired outright (merged into Product
  // Owner -- there is no longer a separate "project owner" relationship).
  // Both steps are guarded so they're safe to run against a table that
  // either still has the old columns (live deploy) or never did (fresh DB,
  // where CREATE TABLE above already created product_owner_user_id/
  // startup_poc_user_id directly and these are no-ops).
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'build_projects' AND column_name = 'poc_user_id')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'build_projects' AND column_name = 'product_owner_user_id') THEN
        ALTER TABLE build_projects RENAME COLUMN poc_user_id TO product_owner_user_id;
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS product_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE build_projects DROP COLUMN IF EXISTS owner_user_id;`);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS startup_poc_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);

  // New deal-stage fields (Startup pilot's Agreement stage split into NDA ->
  // Proposal -> Purchase Order -> Agreement, per the proposed-screens deal
  // summary panel). agreement_type/agreement_signed_at/pilot_fee already
  // existed and keep covering the Agreement stage itself.
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS nda_signed_at DATE;`);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS proposal_amount NUMERIC;`);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS proposal_accepted_at DATE;`);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS po_number TEXT;`);
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS po_raised_at DATE;`);

  // Idempotent backfill: a project created from an idea or application
  // inherits client_id from that source where it's missing (safe no-op
  // once already set).
  await pool.query(`
    UPDATE build_projects p
    SET client_id = i.source_client_id
    FROM build_project_sources s
    JOIN ideas i ON i.id = s.source_id AND s.source_type = 'idea'
    WHERE s.project_id = p.id AND p.client_id IS NULL AND i.source_client_id IS NOT NULL;
  `);

  // "Not now" (defer) on a Ready for Build row (mockup page 5) -- previously
  // skipped for lack of a field to hold it. deferred_until is a plain
  // "hide from Ready for Build until this date" marker, not a decline: the
  // row is untouched otherwise and reappears on its own once the date
  // passes, or immediately if an admin clears it. Default defer length (14
  // days) is chosen the same way the health-rule stage-duration defaults
  // are -- a documented starting assumption, not a measured one.
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS build_deferred_until TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS build_deferred_until TIMESTAMPTZ;`);

  // "Requests from Client Partners" (mockup page 5's admin tab) -- a
  // generic request a Client Leader can raise against one of their
  // projects (e.g. "please remove this file", a access question, anything
  // that doesn't fit a structured field), for an admin to see and resolve.
  // Kept deliberately generic (free-text message, open/resolved) rather
  // than inventing specific request "types" the mockup didn't spell out.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS build_requests (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES build_projects(id) ON DELETE CASCADE,
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Approved workflow v2 (Oct 2026):
  // - one assigned Employee per Enterprise project (Admin picks them);
  // - Client Partner delete requests ride on build_requests (kind='delete');
  // - "Decline" on a Ready for Build row (permanent, unlike "Not now").
  await pool.query(`ALTER TABLE build_projects ADD COLUMN IF NOT EXISTS employee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE build_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general';`);
  await pool.query(`ALTER TABLE build_requests ADD COLUMN IF NOT EXISTS resolution TEXT;`);
  await pool.query(`ALTER TABLE build_requests DROP CONSTRAINT IF EXISTS build_requests_status_check;`);
  await pool.query(`ALTER TABLE build_requests ADD CONSTRAINT build_requests_status_check CHECK (status IN ('open','resolved','approved','rejected'));`);
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS build_declined_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS build_declined_reason TEXT;`);
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS build_declined_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE rise_applications ADD COLUMN IF NOT EXISTS build_declined_reason TEXT;`);
}
