# Rise.RIV — startup application + jury scoring module

A self-contained addition to the RIOS repo, built the same way Ideas.RIV was:
its own DB tables, its own routes, its own isolated login session, its own
frontend page — wired into the app at only a few small points.

## What this covers, from your original notes

- Public link → public opportunity page → **startup application form**
- On submit: **acknowledgment message** ("Thanks for filling your details.
  We will get back to you."), and nothing else — no way to see other
  startups' entries, no way to see jury scores.
- **Jury sign-up** (self-serve — see "Assumptions" below).
- **Jury rates each application on 5 criteria, star rating each.**
- **Jury dashboard** — list of applications with per-juror scored/unscored
  status and progress ("X of Y scored").

## Files in this package

### New files — copy these in as-is

```
backend/db.rise.js                    → RIOS/backend/db.rise.js
backend/lib/riseScoring.js            → RIOS/backend/lib/riseScoring.js
backend/data/riseCriteria.json        → RIOS/backend/data/riseCriteria.json
backend/routes/rise.js                → RIOS/backend/routes/rise.js
backend/routes/riseAdmin.js           → RIOS/backend/routes/riseAdmin.js
frontend/src/RiseRiv.jsx              → RIOS/frontend/src/RiseRiv.jsx
```

### Edited files — small, isolated diffs only

```
backend/server.js       → import + mount 2 new route files, call initRiseSchema()
frontend/src/api.js     → new isolated Rise.RIV session (own localStorage keys/token) + endpoint methods
frontend/src/App.jsx    → 1 import, 1 nav item, 1 view mount, 1 footer visibility tweak
```

These three are full replacement copies of the current repo versions with the
Rise.RIV additions already applied — diff them against your current files
before overwriting, in case you've made unrelated changes since I pulled the
repo. `App.jsx` in particular is large (834 lines) and I only touched 4 spots
in it (search for `RiseRiv` / `rise-riv` to find them).

## Setup — nothing new to configure

Because `initRiseSchema()` runs on every boot (same pattern as the existing
`initSchema()`), there's no manual migration step. Deploying these files and
restarting the backend creates the new tables automatically, on both local
Postgres and your existing Supabase database.

No new environment variables, no new npm packages — this reuses the same
`pg`, `bcryptjs`, and `jsonwebtoken` already in `backend/package.json`, and
the same `lucide-react` icon set already in the frontend.

## How it works

- **Public**: `GET /api/rise/opportunity` (current open posting) and
  `POST /api/rise/apply` (submit — no login, no way to list or query other
  applicants; the endpoint returns only a bare acknowledgment, never an ID
  or any other applicant's data).
- **Jury**: self-signup at `POST /api/rise/jury/signup` creates a
  `rise_jury` user and logs them in immediately, matching your original
  note ("Jury signs up") rather than the main site's admin-issued-invite
  pattern. Jury then browses applications, scores each on 5 fixed criteria
  (1–5 stars each, all required), and can revise their own score any time.
  **A juror never sees another juror's individual score for the same
  application** — only the admin view aggregates across jurors.
- **Admin** (`/api/admin/rise/*`, admin role only): manage which opportunity
  is currently open, view every application with the full jury-score
  breakdown, manage the jury roster.

## Assumptions I made (flagged as open items in the earlier PRD)

These were genuinely unspecified in your notes — I picked defaults so the
module works end-to-end, but they're easy to change:

1. **Jury sign-up is self-serve** (open registration, not admin-invited).
   Your notes said "Jury signs up," which reads as self-serve — but this
   differs from how every other role in RIOS works (admin creates client/
   employee/jury-for-Ideas accounts). If you'd rather jury accounts be
   admin-issued like the rest, that's a small change to `routes/rise.js`
   (drop the public `/jury/signup` route, add a `POST /users` route to
   `routes/riseAdmin.js` — copy the pattern from `routes/ideasAdmin.js`).
2. **The 5 criteria** are my placeholder: Team, Market Opportunity,
   Product & Differentiation, Traction, GTM Fit with RIV — defined in
   `backend/data/riseCriteria.json`, editable without touching code.
3. **One opportunity open at a time.** Multiple postings can exist
   (`rise_opportunities` table), but only one accepts applications at once
   — admin toggles which with `PUT /api/admin/rise/opportunities/:id/open`.
4. **No applicant account/login at all** — matches your note "should not
   be able to see other startup entries" most directly: there's simply
   nothing for an applicant to log into.
5. **Star scale is 1–5** for all 5 criteria, matching the star pattern
   already used by Ideas.RIV's jury rating.

## Known simplifications (worth knowing, not blockers)

- No email confirmation on application submit — just the on-screen
  acknowledgment, per your original notes. Easy to add later using the
  same Resend setup already in the repo (`backend/lib/email.js`).
- No applicant-facing "my submission" view — nothing to log into, so
  nothing to check status against, by design (see assumption 4).
- Access control is enforced in application code (route-level role checks),
  same as the rest of RIOS — not database-level Postgres RLS. Consistent
  with the rest of the repo's current stage.
