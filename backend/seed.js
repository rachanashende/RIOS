import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, initSchema } from "./db.js";

const users = [
  { email: "admin@rios.demo", password: "admin123", name: "Saravana Mani", role: "admin", company: "Retailx Innovation Ventures" },
  { email: "client@demo.retailer", password: "client123", name: "Demo Client Contact", role: "client", company: "Demo Retailer Pvt Ltd" },
];

async function seed() {
  await initSchema();

  let created = 0;
  for (const u of users) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (rows.length) continue;
    const password_hash = bcrypt.hashSync(u.password, 10);
    await pool.query(
      "INSERT INTO users (email, password_hash, name, role, company) VALUES ($1, $2, $3, $4, $5)",
      [u.email, password_hash, u.name, u.role, u.company]
    );
    created += 1;
  }

  console.log(`Seed complete — ${created} account(s) created.`);
  console.log("  Admin login:  admin@rios.demo / admin123");
  console.log("  Client login: client@demo.retailer / client123");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
