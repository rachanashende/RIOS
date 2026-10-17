import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access only." });
  next();
}

// requireRole("junior_employee") — only the roles listed are let through;
// pass "admin" explicitly too if admins should also have access to a route.
export function requireRole(...roles) {
  return function (req, res, next) {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Requires one of: ${roles.join(", ")}.` });
    }
    next();
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, company: user.company, buildScoped: !!user.build_scoped },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// A client login created specifically for a Build/Transform engagement
// (users.build_scoped) is meant to see Build.RIV only -- not the main RIOS
// audit/scorecard. The frontend already hides those nav items for such a
// login, but per this codebase's own stated principle (buildPermissions.js:
// "server-side ... never just hiding a button"), the routes themselves need
// to refuse it too. Apply this after requireAuth to any route that's part
// of the audit/scorecard experience, not Build.
export function blockBuildScopedClient(req, res, next) {
  if (req.user?.role === "client" && req.user?.buildScoped) {
    return res.status(403).json({ error: "This login is for Build.RIV only." });
  }
  next();
}