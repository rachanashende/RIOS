import "dotenv/config";
import express from "express";
import cors from "cors";

import { initSchema } from "./db.js";
import { initRiseSchema } from "./db.rise.js";
import { initIndexSchema } from "./db.index.js";
import { initBuildSchema } from "./db.build.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import responsesRoutes from "./routes/responses.js";
import exportRoutes from "./routes/export.js";
import ideasRoutes from "./routes/ideas.js";
import ideasAdminRoutes from "./routes/ideasAdmin.js";
import critAssistantRoutes from "./routes/critAssistant.js";
import riseRoutes from "./routes/rise.js";
import riseAdminRoutes from "./routes/riseAdmin.js";
import indexRoutes from "./routes/index.js";
import indexAdminRoutes from "./routes/indexAdmin.js";
import indexExportRoutes from "./routes/indexExport.js";
import buildRoutes from "./routes/build.js";
import buildAdminRoutes, { runOverdueCheck } from "./routes/buildAdmin.js";
import buildDashboardRoutes from "./routes/buildDashboard.js";

const app = express();
app.set("trust proxy", 1); // behind Render's proxy: req.ip is the real client (used by the login throttle)
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// POST /api/cron/build-overdue-check -- an external scheduler's entry
// point (e.g. a Render Cron Job) for the overdue-update digest, mounted
// outside every other router's requireAuth chain since a scheduled job has
// no user login to authenticate as. Gated by a shared secret instead --
// set CRON_SECRET in the environment and have the scheduler send it as
// `X-Cron-Secret`. Without CRON_SECRET set, this route always 503s rather
// than silently running unauthenticated, so it's a no-op until someone
// deliberately configures it (the admin console's "Overdue digest" tab's
// manual button still works either way, unaffected by this).
app.post("/api/cron/build-overdue-check", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: "CRON_SECRET is not configured -- set it in the environment to enable this endpoint." });
    if (req.get("X-Cron-Secret") !== secret) return res.status(401).json({ error: "Invalid or missing X-Cron-Secret." });
    const result = await runOverdueCheck();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin/ideas", ideasAdminRoutes); // more specific path — must be mounted before /api/admin
app.use("/api/admin/rise", riseAdminRoutes); // more specific path — must be mounted before /api/admin
app.use("/api/admin/index", indexAdminRoutes); // more specific path — must be mounted before /api/admin
app.use("/api/admin/build", buildAdminRoutes); // more specific path — must be mounted before /api/admin
app.use("/api/admin", adminRoutes);
app.use("/api", responsesRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/ideas", ideasRoutes);
app.use("/api/ideas", critAssistantRoutes);
app.use("/api/rise", riseRoutes);
app.use("/api/index/export", indexExportRoutes); // more specific path — must be mounted before /api/index
app.use("/api/index", indexRoutes);
app.use("/api/build/dashboard", buildDashboardRoutes); // more specific path — must be mounted before /api/build
app.use("/api/build", buildRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4000;

// Previously schema setup only ran from seed.js (a one-off script), which
// meant a fresh migration — like the Ideas.RIV tables/role change below —
// needed a manual `node seed.js` re-run after every deploy. initSchema()
// is fully idempotent (CREATE TABLE IF NOT EXISTS + a safe repeatable
// ALTER), so running it on every boot keeps Render/Supabase in sync
// automatically without that extra manual step.
// Rise.RIV's schema lives in its own file/function (db.rise.js) rather than
// being folded into initSchema() above, so the module stays a self-contained
// unit — deleting it is "remove these files + this one extra call", not a
// surgical edit inside the main schema function.
initSchema()
  .then(() => initRiseSchema())
  .then(() => initIndexSchema())
  .then(() => initBuildSchema())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RIOS backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
