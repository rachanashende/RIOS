import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, initSchema } from "./db.js";

const users = [
  { email: "admin@rios.demo", password: "admin123", name: "Saravana Mani", role: "admin", company: "Retailx Innovation Ventures" },
  { email: "client@demo.retailer", password: "client123", name: "Demo Client Contact", role: "client", company: "Demo Retailer Pvt Ltd" },
  { email: "employee@demo.retailer", password: "employee123", name: "Demo Junior Employee", role: "junior_employee", company: "Demo Retailer Pvt Ltd" },
  { email: "jury@demo.retailer", password: "jury123", name: "Demo Jury Member", role: "jury", company: "Demo Retailer Pvt Ltd" },
];

async function seed() {
  await initSchema();

  let created = 0;
  let demoClientId = null;
  for (const u of users) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (rows.length) {
      if (u.email === "client@demo.retailer") demoClientId = rows[0].id;
      continue;
    }
    const password_hash = bcrypt.hashSync(u.password, 10);
    const { rows: inserted } = await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [u.email, password_hash, u.name, u.role, u.company]
    );
    if (u.email === "client@demo.retailer") demoClientId = inserted[0].id;
    created += 1;
  }

  // Ideas.RIV needs a "source client" configured before it has any
  // opportunities to show. Default it to the demo client so the tab isn't
  // empty out of the box — an admin can repoint this at any point from
  // the Ideas.RIV admin panel.
  if (demoClientId) {
    await pool.query(
      `UPDATE ideas_settings SET source_client_id = $1, updated_at = now()
       WHERE id = 1 AND source_client_id IS NULL`,
      [demoClientId]
    );
  }

  console.log(`Seed complete — ${created} account(s) created.`);
  console.log("  Admin login:    admin@rios.demo / admin123");
  console.log("  Client login:   client@demo.retailer / client123");
  console.log("  Junior Employee login: employee@demo.retailer / employee123");
  console.log("  Jury login:     jury@demo.retailer / jury123");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});