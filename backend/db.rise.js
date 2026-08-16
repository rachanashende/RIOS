// Rise.RIV — startup application + jury scoring module.
// Kept in its own file (rather than appended into db.js's initSchema) so
// this module's schema stays easy to find, review, and — if this module
// is ever retired — delete as a single unit. Call initRiseSchema(pool)
// once at boot, same idempotent CREATE-TABLE-IF-NOT-EXISTS pattern as the
// main schema.
import pool from "./db.js";

export async function initRiseSchema() {
  // Widen users.role to add 'rise_jury' without assuming the existing
  // constraint's name (Postgres autogenerates it, and prior migrations —
  // see Ideas.RIV's 'employee'/'jury' addition — may have already renamed
  // it). Look it up, drop it, re-add with the full allowed list. Safe to
  // run on every boot.
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
        CHECK (role IN ('admin','client','employee','jury','rise_jury'));
    END $$;
  `);

  await pool.query(`
    -- A "posting" startups apply against. Admin controls which one is
    -- currently open; the public application form always applies to
    -- whichever opportunity is marked is_open = true (only one at a time
    -- in this v1, enforced in application code, not a DB constraint).
    CREATE TABLE IF NOT EXISTS rise_opportunities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      is_open BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per startup submission. Deliberately has NO user_id / login —
    -- per spec, applicants never get an account, so there is nothing for
    -- them to authenticate with and no way for them to list or query other
    -- startups' rows (no public GET endpoint exists for this table at all).
    CREATE TABLE IF NOT EXISTS rise_applications (
      id SERIAL PRIMARY KEY,
      opportunity_id INTEGER REFERENCES rise_opportunities(id) ON DELETE SET NULL,
      startup_name TEXT NOT NULL,
      founder_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      sector TEXT,
      stage TEXT,
      pitch TEXT,
      extra JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One row per (application, jury member). scores holds all 5 criteria
    -- as {criterionKey: 1-5}; total is the precomputed average so listing/
    -- sorting queries don't have to unpack JSONB every time.
    CREATE TABLE IF NOT EXISTS rise_scores (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL REFERENCES rise_applications(id) ON DELETE CASCADE,
      jury_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scores JSONB NOT NULL,
      total NUMERIC NOT NULL,
      comments TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(application_id, jury_user_id)
    );
  `);

  // Seed one open opportunity if the table is empty, so the public apply
  // link and jury dashboard both have something to point at immediately
  // after a fresh deploy, without a manual admin step first.
  await pool.query(`
    INSERT INTO rise_opportunities (title, description, is_open)
    SELECT 'Rise GTM — Startup Application', 'Apply to the Rise GTM opportunity program.', true
    WHERE NOT EXISTS (SELECT 1 FROM rise_opportunities);
  `);
}
