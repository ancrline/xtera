import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";
import { pool, testDbConnection } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendPasswordResetEmail, verifyMailer } from "./mailer.js";

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

const RESET_TTL_MINUTES = 120;
const RESET_EMAIL_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 10;
const appBaseUrl = (process.env.APP_BASE_URL || clientOrigin).replace(/\/+$/, "");

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Simple in-memory limiter keyed by client IP; enough for a single-process API.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (!v.some(t => now - t < windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.post("/api/auth/forgot-password", resetLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  // Same response whether or not the account exists, so emails can't be enumerated.
  const genericResponse = {
    ok: true,
    message: "If an account exists for that email, a reset link has been sent."
  };

  try {
    const { rows } = await pool.query(
      "SELECT id, name, email FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!rows.length) {
      return res.json(genericResponse);
    }
    const user = rows[0];

    const recent = await pool.query(
      `SELECT 1 FROM password_resets
       WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2)
       LIMIT 1`,
      [user.id, RESET_EMAIL_COOLDOWN_SECONDS]
    );
    if (recent.rows.length) {
      console.log("Password reset skipped: a link was already requested in the last minute");
      return res.json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString("hex");
    await pool.query("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [user.id, hashResetToken(token), RESET_TTL_MINUTES]
    );

    const link = `${appBaseUrl}/reset-password.html?token=${token}`;
    sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      link,
      expiresMinutes: RESET_TTL_MINUTES
    }).catch(mailError => {
      console.error("Password reset email failed:", mailError.message);
    });

    res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password failed:", error);
    res.status(500).json({ error: "Could not process request" });
  }
});

app.post("/api/auth/reset-password", resetLimiter, async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: "This reset link is invalid or has expired" });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Marking the token used in the same statement stops a link being redeemed twice.
    const { rows } = await client.query(
      `UPDATE password_resets
       SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [hashResetToken(token)]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This reset link is invalid or has expired" });
    }

    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      hashPassword(password),
      rows[0].user_id
    ]);
    await client.query("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [rows[0].user_id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Reset password failed:", error);
    res.status(500).json({ error: "Could not reset password" });
  } finally {
    client.release();
  }
});

function adminRequired(req, res, next) {
  if (req.session.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

app.get("/api/users", authRequired, adminRequired, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, email, role FROM users ORDER BY created_at, id"
    );
    res.json({ users: rows });
  } catch (error) {
    console.error("List users failed:", error);
    res.status(500).json({ error: "Could not load users" });
  }
});

app.post("/api/users", authRequired, adminRequired, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "staff");

  if (!name || name.length > 120) {
    return res.status(400).json({ error: "Name is required (max 120 characters)" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (!["admin", "staff"].includes(role)) {
    return res.status(400).json({ error: "Role must be admin or staff" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, hashPassword(password), role]
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "A user with that email already exists" });
    }
    console.error("Add user failed:", error);
    res.status(500).json({ error: "Could not add user" });
  }
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
  verifyMailer();
});
