// R-Index — India/Dubai Retail AI & Innovation Index module.
// Kept in its own file (same convention as db.rise.js) so this module's
// schema stays easy to find, review, and delete as a single unit if this
// module is ever retired. Call initIndexSchema() once at boot, same
// idempotent CREATE-TABLE-IF-NOT-EXISTS pattern as db.js/db.rise.js.
import pool from "./db.js";

export async function initIndexSchema() {
  // Widen users.role to add 'index_respondent'. Reads whatever role list is
  // *actually* live on the constraint right now (same technique as
  // db.rise.js's 'rise_jury' migration) rather than hardcoding the other
  // values, so this can never fall out of sync with a role added by a
  // different migration file.
  await pool.query(`
    DO $$
    DECLARE
      cname text;
      cdef text;
      vals text;
    BEGIN
      SELECT con.conname, pg_get_constraintdef(con.oid) INTO cname, cdef
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%role%';

      IF cname IS NOT NULL AND cdef NOT ILIKE '%index_respondent%' THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);

        SELECT string_agg(quote_literal(m[1]), ',') INTO vals
        FROM regexp_matches(cdef, '''([a-zA-Z_]+)''::text', 'g') AS m;

        EXECUTE format('ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (%s, ''index_respondent''))', vals);
      ELSIF cname IS NULL THEN
        -- Shouldn't happen once db.js has run first, but fail safe.
        ALTER TABLE users ADD CONSTRAINT users_role_check
          CHECK (role IN ('admin','client','index_respondent'));
      END IF;
    END $$;
  `);

  await pool.query(`
    -- One row per quarterly/geo cohort, e.g. "Q3 2026 — India Retail AI &
    -- Innovation Index" or "Q4 2026 — Dubai Retail AI and Innovation Index".
    -- Unlike Rise.RIV's rise_opportunities (only one open at a time,
    -- enforced in app code), campaigns are independently opened/closed —
    -- India Q3 and Dubai Q4 can legitimately be open at overlapping times,
    -- since they're different geos/cohorts, not competing single postings.
    CREATE TABLE IF NOT EXISTS index_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,               -- e.g. "Q3 2026 Retail AI and Innovation Index"
      geo TEXT,                         -- e.g. "India", "Dubai" — free text, not an enum, since new geos will keep appearing
      quarter_label TEXT,               -- e.g. "Q3 2026" — used to scope comparisons; entries never compare across quarter_label values
      is_open BOOLEAN NOT NULL DEFAULT true,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,              -- e.g. Q3 2026 ends by September; informational + used to auto-flag "closed" in the UI, doesn't hard-block submission on its own (admin's is_open toggle is the actual gate)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per respondent submission into a campaign. user_id is
    -- nullable: a self-signup respondent (index_respondent role) has one,
    -- but an admin can also key in a record straight from an offline
    -- interview-capture sheet before that person ever creates an account —
    -- same "admin can add on behalf of" allowance as the PRD calls for.
    -- If that respondent later signs up with the same email, the admin can
    -- link the two (see indexAdmin.js) so both paths feed one dashboard.
    --
    -- answers is intentionally a single JSONB blob keyed by question id
    -- rather than a normalized per-question table (contrast with the main
    -- RIOS responses table) — the question set itself is still pending
    -- (see backend/data/indexQuestions.json), so the schema shouldn't have
    -- to change shape once the real question list arrives; only the JSON
    -- contents and the scoring function in lib/indexScoring.js will.
    --
    -- source records whether this entry came from self-signup ('self') or
    -- was keyed in by an admin ('admin'), for traceability back to the
    -- interview-capture sheet.
    --
    -- A respondent can re-participate in a later campaign (e.g. Q3 India,
    -- then Q4 Dubai) — that's a second row with a different campaign_id,
    -- not an update to this one. Within the SAME campaign, a respondent
    -- (by user_id) has at most one entry — re-submitting updates it.
    CREATE TABLE IF NOT EXISTS index_entries (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES index_campaigns(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      respondent_name TEXT NOT NULL,
      respondent_email TEXT NOT NULL,
      company TEXT,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      score NUMERIC,                    -- computed server-side by lib/indexScoring.js; never trusted as client-sent
      source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self','admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Enforces "at most one entry per respondent per campaign" only for
    -- entries that DO have a linked account; admin-entered rows with no
    -- user_id yet are intentionally not constrained this way (an admin
    -- keying in a batch from a spreadsheet may not have accounts for any
    -- of them yet, and duplicate-by-email cleanup is an admin judgment
    -- call, not something the DB should silently block).
    CREATE UNIQUE INDEX IF NOT EXISTS index_entries_one_per_user_per_campaign
      ON index_entries (campaign_id, user_id)
      WHERE user_id IS NOT NULL;
  `);
}
