import pg from "pg";

const { Pool } = pg;

// Supabase (and most managed Postgres) requires SSL on external
// connections; a local/self-hosted Postgres usually doesn't have it
// configured at all. Auto-detect Supabase by hostname so this works
// against both without extra configuration; override with PGSSL=true
// or PGSSL=false if you're pointing at something else.
// Covers both connection styles Supabase hands out:
//   direct:  db.xxxx.supabase.co
//   pooler:  aws-0-region.pooler.supabase.com
function wantsSsl() {
  if (process.env.PGSSL === "true") return true;
  if (process.env.PGSSL === "false") return false;
  const url = process.env.DATABASE_URL || "";
  return url.includes("supabase.co") || url.includes("supabase.com");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: wantsSsl() ? { rejectUnauthorized: false } : false,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','client')),
      company TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS responses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL,
      maturity INTEGER,
      evidence TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, question_id)
    );
  `);

  // ------------------------------------------------------------------
  // Ideas.RIV additions
  // ------------------------------------------------------------------
  // The users.role CHECK constraint above only allows ('admin','client').
  // Widening it needs an ALTER, not another CREATE TABLE IF NOT EXISTS —
  // and initSchema() runs on every boot, so this has to be safe to repeat.
  // We look up whatever the constraint is actually named (Postgres's
  // default naming can vary) rather than assuming "users_role_check",
  // drop it, and re-add it under a known name with the wider list.
  //
  // "employee" was renamed to "junior_employee". This needs two ALTER
  // passes, not one: the CHECK constraint has to allow BOTH values before
  // the UPDATE can move existing rows over (Postgres validates the UPDATE
  // against whatever constraint is live at that moment), and only after
  // that UPDATE can the constraint be tightened to drop "employee" for
  // good (tightening first would fail validation against rows that still
  // say "employee"). All three steps are safe to repeat every boot.
  await pool.query(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'users'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%role%';

      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
      END IF;

      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','client','employee','junior_employee','jury'));
    END $$;
  `);
  await pool.query(`UPDATE users SET role = 'junior_employee' WHERE role = 'employee';`);
  await pool.query(`
    DO $$
    BEGIN
      ALTER TABLE users DROP CONSTRAINT users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','client','junior_employee','jury'));
    END $$;
  `);

  await pool.query(`
    -- One row per idea. question_id refers to the static 165-question
    -- instrument (backend/data/questions.json) — same convention as
    -- responses.question_id — so an idea always points at the exact
    -- diagnostic question/opportunity it was submitted against.
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      question_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per (idea, jury member) — a jury member can revise their
    -- own rating (upsert), but each idea can carry many jury ratings,
    -- averaged into the leaderboard score. criteria_scores holds the
    -- current rating system: an object of 4-5 named criteria, each 1-5,
    -- e.g. {"impact":4,"feasibility":5,"innovation":3,"cost":4,"strategicFit":5}.
    -- score is always the plain average of those values, 1-5 scale.
    --
    -- impact/feasibility/innovation/cost/rationale/transcript below are
    -- vestigial: they backed the CRIT AI-interview rating flow, which has
    -- been removed. Left in place (nullable, unused by any current code)
    -- rather than dropped, since dropping columns is irreversible and
    -- there's no real cost to leaving them — but nothing writes to them
    -- anymore, and any old CRIT-era rows are cleared below because they
    -- used an incompatible 0-10 scale that can't be mixed with the
    -- current 1-5 criteria system.
    CREATE TABLE IF NOT EXISTS idea_ratings (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
      jury_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      criteria_scores JSONB,
      impact NUMERIC,
      feasibility NUMERIC,
      innovation NUMERIC,
      cost NUMERIC,
      rationale TEXT,
      transcript JSONB,
      score NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(idea_id, jury_user_id)
    );

    -- Single-row config: which client's scored audit currently feeds the
    -- Top-5 opportunities shown on the Ideas.RIV landing page.
    CREATE TABLE IF NOT EXISTS ideas_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      source_client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (id = 1)
    );
    INSERT INTO ideas_settings (id, source_client_id)
      VALUES (1, NULL)
      ON CONFLICT (id) DO NOTHING;
  `);

  // idea_ratings.criteria_scores didn't exist before this migration — add
  // it for tables created under the old schema. Safe to run every boot.
  await pool.query(`ALTER TABLE idea_ratings ADD COLUMN IF NOT EXISTS criteria_scores JSONB;`);
  await pool.query(`
    ALTER TABLE idea_ratings ALTER COLUMN impact DROP NOT NULL;
    ALTER TABLE idea_ratings ALTER COLUMN feasibility DROP NOT NULL;
    ALTER TABLE idea_ratings ALTER COLUMN innovation DROP NOT NULL;
    ALTER TABLE idea_ratings ALTER COLUMN cost DROP NOT NULL;
  `);

  // The CRIT AI-interview rating flow is removed. Any ratings it produced
  // used a 0-10 weighted-average scale that's incompatible with the
  // current plain 1-5 criteria average, so they're cleared here rather
  // than left to silently corrupt averages/leaderboards. Whoever gave
  // that rating will need to re-rate under the new criteria system.
  // Idempotent: matches nothing once already cleared.
  await pool.query(`DELETE FROM idea_ratings WHERE impact IS NOT NULL AND criteria_scores IS NULL;`);

  // PRD alignment migration 1: the 5 criteria were renamed to match
  // opportunities-platform-prd-v1.md §7 (impact/feasibility/innovation/
  // cost/strategicFit -> team/marketOpportunity/product/traction/
  // gtmStrategy). Existing rows still have the old keys inside
  // criteria_scores; remap them in place rather than orphan that data.
  // Idempotent: the WHERE clause matches nothing once already remapped.
  await pool.query(`
    UPDATE idea_ratings
    SET criteria_scores = jsonb_build_object(
      'team', criteria_scores->'impact',
      'marketOpportunity', criteria_scores->'feasibility',
      'product', criteria_scores->'innovation',
      'traction', criteria_scores->'cost',
      'gtmStrategy', criteria_scores->'strategicFit'
    )
    WHERE criteria_scores ? 'impact';
  `);

  // PRD alignment migration 2: §7 allows an optional comment per rating.
  // Rather than add a new column, this re-purposes the existing
  // (currently unused, vestigial-from-CRIT) `rationale` text column —
  // same nullable TEXT shape already fits. No schema change needed here;
  // this comment documents the repurposing for anyone reading the schema.

  // PRD alignment migration 3: §6 allows an optional "expertise" field at
  // jury sign-up.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise TEXT;`);
}

export default pool;