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
}

export default pool;
