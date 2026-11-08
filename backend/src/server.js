import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import { pool, testDbConnection } from "./db.js";
import { verifyPassword } from "./password.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://127.0.0.1:8765";
const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";

if (!sessionSecret) {
  throw new Error("Missing required environment variable: SESSION_SECRET");
}

// Nginx terminates TLS, so trust X-Forwarded-Proto for secure cookies.
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(
  session({
    name: "xtera.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

function publicUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role
  };
}

function authRequired(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

app.get("/api/health", async (_req, res) => {
  try {
    const ok = await testDbConnection();
    if (!ok) throw new Error("Unexpected health query result");
    res.json({ ok: true });
  } catch (error) {
    console.error("DB health check failed:", error.message);
    res.status(500).json({ ok: false });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role, password_hash FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const safeUser = publicUserRow(user);
    req.session.user = safeUser;
    res.json({ user: safeUser });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Could not login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Logout failed:", err);
      return res.status(500).json({ error: "Could not logout" });
    }
    res.clearCookie("xtera.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.session.user });
});

app.get("/api/jobs", authRequired, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
              client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
              description, status, created_by AS "createdBy", created_at AS "createdAt"
       FROM jobs
       ORDER BY created_at DESC`
    );
    res.json({ jobs: rows });
  } catch (error) {
    console.error("List jobs failed:", error);
    res.status(500).json({ error: "Could not load jobs" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
