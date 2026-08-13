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
        CHECK (role IN ('admin','client','employee','jury'));
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
    -- averaged into the leaderboard score.
    CREATE TABLE IF NOT EXISTS idea_ratings (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
      jury_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      impact NUMERIC NOT NULL,
      feasibility NUMERIC NOT NULL,
      innovation NUMERIC NOT NULL,
      cost NUMERIC NOT NULL,
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
}

export default pool;
