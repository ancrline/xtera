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

app.get("/api/jobs/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
              client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
              description, status, token, terms_sent_at AS "termsSentAt", terms_version AS "termsVersion",
              accepted_by AS "acceptedBy", accepted_at AS "acceptedAt", accepted_terms_version AS "acceptedTermsVersion",
              created_by AS "createdBy", created_at AS "createdAt"
       FROM jobs
       WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Job not found" });
    res.json({ job: rows[0] });
  } catch (error) {
    console.error("Get job failed:", error);
    res.status(500).json({ error: "Could not load job" });
  }
});

app.post("/api/jobs", authRequired, async (req, res) => {
  try {
    const { jobNumber, clientName, clientEmail, clientPhone, propertyAddress, workType, description } = req.body;
    const token = require("crypto").randomBytes(24).toString("hex");
    
    const { rows } = await pool.query(
      `INSERT INTO jobs (job_number, client_name, client_email, client_phone, property_address, work_type, description, token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
                 client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
                 description, status, created_by AS "createdBy", created_at AS "createdAt"`,
      [jobNumber, clientName, clientEmail, clientPhone, propertyAddress, workType, description || null, token, req.session.user.name]
    );
    res.json({ job: rows[0] });
  } catch (error) {
    console.error("Create job failed:", error);
    res.status(500).json({ error: "Could not create job" });
  }
});

app.patch("/api/jobs/:id", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, description } = req.body;
    
    const { rows } = await pool.query(
      `UPDATE jobs
       SET status = COALESCE($2, status), description = COALESCE($3, description)
       WHERE id = $1
       RETURNING id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
                 client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
                 description, status, created_by AS "createdBy", created_at AS "createdAt"`,
      [id, status, description]
    );
    if (!rows.length) return res.status(404).json({ error: "Job not found" });
    res.json({ job: rows[0] });
  } catch (error) {
    console.error("Update job failed:", error);
    res.status(500).json({ error: "Could not update job" });
  }
});

app.get("/api/jobs/:id/notes", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, job_id AS "jobId", author, text, created_at AS "createdAt"
       FROM job_notes
       WHERE job_id = $1
       ORDER BY created_at ASC`,
      [id]
    );
    res.json({ notes: rows });
  } catch (error) {
    console.error("Get notes failed:", error);
    res.status(500).json({ error: "Could not load notes" });
  }
});

app.post("/api/jobs/:id/notes", authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    const { rows } = await pool.query(
      `INSERT INTO job_notes (job_id, author, text)
       VALUES ($1, $2, $3)
       RETURNING id, job_id AS "jobId", author, text, created_at AS "createdAt"`,
      [id, req.session.user.name, text]
    );
    res.json({ note: rows[0] });
  } catch (error) {
    console.error("Add note failed:", error);
    res.status(500).json({ error: "Could not add note" });
  }
});

app.get("/api/settings", authRequired, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, company_name AS "companyName", email, phone, website
       FROM settings
       WHERE id = 1`
    );
    res.json({ settings: rows[0] || {} });
  } catch (error) {
    console.error("Get settings failed:", error);
    res.status(500).json({ error: "Could not load settings" });
  }
});

app.patch("/api/settings", authRequired, async (req, res) => {
  try {
    const { companyName, email, phone, website } = req.body;
    
    const { rows } = await pool.query(
      `UPDATE settings
       SET company_name = COALESCE($2, company_name),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           website = COALESCE($5, website)
       WHERE id = 1
       RETURNING id, company_name AS "companyName", email, phone, website`,
      [1, companyName, email, phone, website]
    );
    res.json({ settings: rows[0] });
  } catch (error) {
    console.error("Update settings failed:", error);
    res.status(500).json({ error: "Could not update settings" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});
