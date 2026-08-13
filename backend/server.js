import "dotenv/config";
import express from "express";
import cors from "cors";

import { initSchema } from "./db.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import responsesRoutes from "./routes/responses.js";
import exportRoutes from "./routes/export.js";
import ideasRoutes from "./routes/ideas.js";
import ideasAdminRoutes from "./routes/ideasAdmin.js";
import critAssistantRoutes from "./routes/critAssistant.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/admin/ideas", ideasAdminRoutes); // more specific path — must be mounted before /api/admin
app.use("/api/admin", adminRoutes);
app.use("/api", responsesRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/ideas", ideasRoutes);
app.use("/api/ideas", critAssistantRoutes);

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
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`RIOS backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
