# RIoS Discover — full-stack demo

A working prototype of the RIOS Discover assessment: real logins, a
165-question / 19-module intake, a scoring engine, manager-level
dashboards, and Excel/PDF export — backed by an Express + **PostgreSQL**
server (Supabase-compatible) so answers persist properly instead of
living only in the browser or on ephemeral disk.

```
rios-fullstack/
  backend/    Express API + PostgreSQL (the source of truth)
  frontend/   Vite + React app (what you look at in the browser)
```

## 1. Set up the database

Any Postgres works — a Supabase project is the easiest free option with
persistent storage.

1. In your Supabase project: **Project Settings → Database → Connection
   string → URI**. Copy it (looks like
   `postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres`).
2. `cd backend && cp .env.example .env`, then paste that as `DATABASE_URL`
   in `.env`.

The backend auto-detects a `supabase.co` host in the URL and enables SSL
automatically — nothing else to configure. Tables (`users`, `responses`)
are created automatically on first run; there's no manual schema step.

## 2. Run the backend

```bash
cd backend
npm install
node seed.js                # creates two demo accounts (safe to re-run)
npm run dev                  # starts the API on http://localhost:4000
```

Seeded accounts:
| Role | Email | Password |
|--------|--------------------------|-----------|
| Admin | `admin@rios.demo` | `admin123`|
| Client | `client@demo.retailer` | `client123`|

There's also a **Reliance Trends** demo client pre-loaded with a full,
realistic 165-question scorecard (see "Sample data" below) rather than
random numbers — good for showing someone the dashboards without making
them click through the assessment first:
| Role | Email | Password |
|--------|------------------------|----------|
| Client | `reliance@test.com` | `temp123`|

**If your project folder lives inside OneDrive/Dropbox/Google Drive**, move
it outside the synced folder before running `npm install` (e.g. to
`C:\Users\you\Projects\rios-fullstack`). Cloud-sync tools actively lock and
scan `node_modules` while npm is writing to it, which causes random
`EPERM`/`EBUSY` errors on Windows — this isn't specific to this project,
it happens to any Node project installed inside a synced folder.

## 3. Run the frontend

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev                 # opens http://localhost:5173
```

The frontend's dev server proxies any `/api/...` request to the backend on
port 4000 (see `frontend/vite.config.js`), so both need to be running at
the same time.

## Deploying this as a live demo (Render.com)

The fastest free path to a real URL you can share: two services on
[Render](https://render.com) — a Web Service for `backend/`, a Static Site
for `frontend/`. Your database already lives on Supabase, so — unlike a
SQLite file on Render's disk — your data survives redeploys and restarts;
nothing here wipes it. Push this project to a GitHub repo first, then:

**1. Deploy the backend**

- Render dashboard → **New +** → **Web Service** → connect your repo
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `node seed.js && node server.js`
- Environment variables:
  - `DATABASE_URL` = your Supabase connection string (the same one from `.env`)
  - `JWT_SECRET` = any long random string
- Plan: Free → **Create Web Service**
- Once it's live, copy its URL (something like `https://rios-backend-xxxx.onrender.com`)

**2. Deploy the frontend**

- **New +** → **Static Site** → same repo
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Add an environment variable `VITE_API_URL` = the backend URL from step 1 (no trailing slash)
- **Create Static Site**

That's it — the Static Site's URL is your demo link.

**Worth knowing for a free-tier demo:** the free plan spins the backend
down after ~15 minutes of no traffic; the first request after that takes
a few extra seconds to wake it back up. That's normal, not a bug — your
data is unaffected either way since it lives in Supabase, not on Render's
disk.

If you'd rather not use Render, Railway and Fly.io both work the same
way (one service per folder, same build/start commands, same env vars) —
happy to write out the equivalent steps for either.

## Sample data — Reliance Trends

The `reliance@test.com` account (password `temp123`) comes pre-loaded
with a full 165-question scorecard built to tell a believable story for
a large Indian omnichannel fashion retailer, rather than random numbers:
strong in Store Operations & POS, Payments, and Finance (mature legacy
retail muscle most established chains already have), weak in Data & AI
Infrastructure, Agentic AI, and Innovation Practice (the newer,
AI-native layers most chains haven't built yet). Net result: **~45/100,
"Building" tier** overall — realistic and demo-friendly, since it shows
clear, credible opportunity rather than either extreme.

To regenerate or adjust it, see the profile in `module_targets` — the
generation approach was: pick a target maturity 0–4 per module reflecting
the persona, apply small random jitter per question, then save through
the real `PUT /api/responses` endpoint (not a database insert) so it
exercises the same code path a real user hits. Swap the `module_targets`
values and re-run to build a different persona.

## How login works

- **Admin** logs in and lands on **Manage Clients** — create a client login
  (name, company, email, temporary password), then open any client's
  scorecard to review it and export it. Admin viewing is read-only; admins
  don't fill out a client's assessment for them in this build (a
  simplification versus the PRD's admin-conducted diagnostic — see note below).
- **Client** logs in and lands on the **Discover Assessment** — scores
  question by question (or hits "Quick-fill all 165" for a fast demo run),
  then checks **My Scorecard** for the computed results. Every change
  autosaves to the server ~0.7s after you stop typing/clicking.
- There's no self-signup — matches the PRD's "admin-issued invite only" rule
  (FR-2). New client accounts are created by an admin from the Manage
  Clients screen.

## Exporting

From My Scorecard (client) or a client's scorecard (admin), **Export Excel**
and **Export PDF** hit the backend, which regenerates the file live from
the current saved responses:

- **Excel** — three sheets: `Diagnostic Scorecard` (every question, your
  score, and — for admins — your evidence notes), `Module Summary`, and
  `Overall Scorecard` (overall score/tier, Top 5 Opportunities, Priority
  AI-Maturity Gaps).
- **PDF** — a one-page-per-scorecard readout: overall score and tier,
  module breakdown, Top 5 Opportunities, Priority AI-Maturity Gaps.

## Known simplifications (versus the full PRD)

This is still a Discover-tier prototype, not the full Account/Engagement
data model in the PRD:

- One scorecard per client, not versioned Engagements/quarterly re-assessment.
- Admin doesn't score on a client's behalf (clients self-serve in this build).
- Access control is enforced in application code (every query scopes to
  `req.user.id`, checked in `backend/routes/responses.js` and
  `backend/middleware/auth.js`), not database-level Postgres Row-Level
  Security policies. Fine for a demo at this scale; the PRD's recommended
  production stack (§15) would add RLS policies directly on the
  `responses`/`users` tables as defense-in-depth.
- `JWT_SECRET` in `.env.example` is a placeholder — generate a real random
  string before this touches anything beyond your own machine.
- Passwords are hashed with bcrypt, but there's no password-reset flow,
  rate limiting, or HTTPS — all expected before any real deployment.

## About RIV

The **About RIV** nav item (public, no login needed) opens a small site-within-
the-site for Retail Innovation Ventures itself — separate from the RIOS
product pages, with its own sub-nav: Home, About Us, For Investors, For
Startups, For Retailers. It lives entirely in `frontend/src/AboutRiv.jsx`
and is self-contained (no backend calls) — edit that one file to change its
copy or add pages. The network stats on its home page (`351+` organisations,
`67` startups, etc.) are pulled from the RIOS deck rather than invented.

## Editing the instrument

`backend/data/questions.json` and `backend/data/modules.json` are the single
source of truth — the frontend fetches them from `GET /api/questions` on
load, so editing the backend copy is enough; nothing needs to be duplicated
on the frontend side.
