import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";
import { pool, testDbConnection } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendPasswordResetEmail, sendJobTermsEmail, verifyMailer } from "./mailer.js";

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

app.get("/api/work-types", authRequired, async (req, res) => {
  const includeInactive = req.query.all === "1" && req.session.user?.role === "admin";
  try {
    const { rows } = await pool.query(
      `SELECT id, label, active FROM work_types
       ${includeInactive ? "" : "WHERE active"}
       ORDER BY id`
    );
    res.json({ workTypes: rows });
  } catch (error) {
    console.error("List work types failed:", error);
    res.status(500).json({ error: "Could not load work types" });
  }
});

app.post("/api/work-types", authRequired, adminRequired, async (req, res) => {
  const label = String(req.body?.label || "").trim();
  if (!label || label.length > 120) {
    return res.status(400).json({ error: "Work type name is required (max 120 characters)" });
  }

  try {
    // Re-adding a removed work type brings it back instead of failing on the unique label.
    const { rows } = await pool.query(
      `INSERT INTO work_types (label) VALUES ($1)
       ON CONFLICT (label) DO UPDATE SET active = TRUE
       RETURNING id, label, active`,
      [label]
    );
    res.status(201).json({ workType: rows[0] });
  } catch (error) {
    console.error("Add work type failed:", error);
    res.status(500).json({ error: "Could not add work type" });
  }
});

app.delete("/api/work-types/:id", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Invalid work type" });
  }

  try {
    const { rowCount } = await pool.query("UPDATE work_types SET active = FALSE WHERE id = $1", [id]);
    if (!rowCount) {
      return res.status(404).json({ error: "Work type not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Remove work type failed:", error);
    res.status(500).json({ error: "Could not remove work type" });
  }
});

app.get("/api/terms", authRequired, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT version, text, created_at AS "createdAt"
       FROM terms_versions ORDER BY version DESC LIMIT 1`
    );
    res.json({ terms: rows[0] || { version: 0, text: "", createdAt: null } });
  } catch (error) {
    console.error("Get terms failed:", error);
    res.status(500).json({ error: "Could not load terms" });
  }
});

app.get("/api/terms/versions", authRequired, adminRequired, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT version, created_at AS "createdAt"
       FROM terms_versions ORDER BY version`
    );
    res.json({ versions: rows });
  } catch (error) {
    console.error("List terms versions failed:", error);
    res.status(500).json({ error: "Could not load terms history" });
  }
});

app.post("/api/terms", authRequired, adminRequired, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "Terms text cannot be empty" });
  }
  if (text.length > 100000) {
    return res.status(400).json({ error: "Terms text is too long" });
  }

  try {
    const latest = await pool.query(
      "SELECT text FROM terms_versions ORDER BY version DESC LIMIT 1"
    );
    if (latest.rows.length && latest.rows[0].text === text) {
      return res.status(400).json({ error: "No changes to save. The terms match the current version." });
    }

    const { rows } = await pool.query(
      `INSERT INTO terms_versions (text) VALUES ($1)
       RETURNING version, text, created_at AS "createdAt"`,
      [text]
    );
    res.status(201).json({ terms: rows[0] });
  } catch (error) {
    console.error("Save terms failed:", error);
    res.status(500).json({ error: "Could not save terms" });
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

const JOB_DETAIL_SQL = `
  SELECT id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
         client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
         description, status, token, terms_sent_at AS "termsSentAt", terms_version AS "termsVersion",
         accepted_by AS "acceptedBy", accepted_at AS "acceptedAt", accepted_terms_version AS "acceptedTermsVersion",
         created_by AS "createdBy", created_at AS "createdAt"
  FROM jobs`;

function withAcceptance(row) {
  const { acceptedBy, acceptedAt, acceptedTermsVersion, ...job } = row;
  job.acceptance = acceptedAt
    ? { acceptedBy, acceptedAt, termsVersion: acceptedTermsVersion }
    : null;
  return job;
}

// The job page expects notes, images and history alongside the job itself.
async function loadJobDetail(id) {
  const { rows } = await pool.query(`${JOB_DETAIL_SQL} WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const notes = await pool.query(
    `SELECT id, author, text, created_at AS "createdAt"
     FROM job_notes WHERE job_id = $1 ORDER BY created_at, id`,
    [id]
  );
  const history = await pool.query(
    `SELECT event, actor AS "by", created_at AS "at"
     FROM job_history WHERE job_id = $1 ORDER BY created_at, id`,
    [id]
  );
  const images = await pool.query(
    `SELECT id, kind, caption, uploaded_by AS "uploadedBy", created_at AS "createdAt"
     FROM job_images WHERE job_id = $1 ORDER BY created_at, id`,
    [id]
  );
  // The page puts this straight into <img src>; the bytes are served by GET /api/images/:id.
  const imageList = images.rows.map(img => ({ ...img, dataUrl: `/api/images/${img.id}` }));
  return { ...withAcceptance(rows[0]), notes: notes.rows, images: imageList, history: history.rows };
}

app.get("/api/jobs/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Job not found" });
  try {
    const job = await loadJobDetail(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ job });
  } catch (error) {
    console.error("Get job failed:", error);
    res.status(500).json({ error: "Could not load job" });
  }
});

function buildTermsEmail(job, settings, link) {
  return {
    subject: `${settings.companyName} — Job ${job.jobNumber}: please review and accept our terms`,
    text:
`Hi ${job.clientName},

Thank you for choosing ${settings.companyName}.

Your job "${job.workType}" at ${job.propertyAddress} (Job ${job.jobNumber}) has been scheduled for review.

Before we begin, please review and accept our terms and conditions using the secure link below:

${link}

If you have any questions, reply to this email or call us on ${settings.phone}.

Kind regards,
${settings.companyName}
${settings.email} | ${settings.phone} | ${settings.website}`
  };
}

app.post("/api/jobs/:id/send-terms", authRequired, adminRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Job not found" });

  try {
    const jobResult = await pool.query(
      `SELECT id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
              property_address AS "propertyAddress", work_type AS "workType", token, accepted_at AS "acceptedAt"
       FROM jobs WHERE id = $1`,
      [id]
    );
    if (!jobResult.rows.length) return res.status(404).json({ error: "Job not found" });
    const job = jobResult.rows[0];

    const terms = await pool.query("SELECT version FROM terms_versions ORDER BY version DESC LIMIT 1");
    if (!terms.rows.length) {
      return res.status(400).json({ error: "Save your terms & conditions in Settings before sending them to a client." });
    }
    const settingsResult = await pool.query(
      `SELECT company_name AS "companyName", email, phone, website FROM settings WHERE id = 1`
    );
    const settings = settingsResult.rows[0];

    const link = `${appBaseUrl}/client-accept.html?token=${job.token}`;
    const email = buildTermsEmail(job, settings, link);

    let sent = true;
    let sendError = null;
    try {
      await sendJobTermsEmail({ to: job.clientEmail, subject: email.subject, text: email.text, link, replyTo: settings.email });
    } catch (error) {
      sent = false;
      sendError = error;
      console.error("Terms email failed:", error.message);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO email_log (job_id, recipient, subject, link, success) VALUES ($1, $2, $3, $4, $5)",
        [id, job.clientEmail, email.subject, link, sent]
      );
      if (sent) {
        // A resend after acceptance only re-sends the link; the accepted version stays recorded.
        await client.query(
          `UPDATE jobs
           SET terms_sent_at = now(),
               terms_version = CASE WHEN accepted_at IS NULL THEN $2 ELSE terms_version END,
               status = CASE WHEN status = 'Draft' THEN 'Awaiting acceptance' ELSE status END
           WHERE id = $1`,
          [id, terms.rows[0].version]
        );
        await client.query(
          "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
          [id, `Terms & conditions emailed to ${job.clientEmail}`, req.session.user.name]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (!sent) {
      return res.status(502).json({ error: "The email could not be sent. Please check the email settings and try again." });
    }
    res.json({ job: await loadJobDetail(id) });
  } catch (error) {
    console.error("Send terms failed:", error);
    res.status(500).json({ error: "Could not send terms" });
  }
});

const acceptLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

// What a client may see from their emailed link: no contact details, no internal fields.
function publicJob(row) {
  return {
    jobNumber: row.jobNumber,
    clientName: row.clientName,
    propertyAddress: row.propertyAddress,
    workType: row.workType,
    description: row.description,
    createdAt: row.createdAt,
    acceptance: row.acceptedAt
      ? { acceptedBy: row.acceptedBy, acceptedAt: row.acceptedAt, termsVersion: row.acceptedTermsVersion }
      : null
  };
}

const PUBLIC_JOB_SQL = `
  SELECT id, job_number AS "jobNumber", client_name AS "clientName", property_address AS "propertyAddress",
         work_type AS "workType", description, created_at AS "createdAt",
         terms_version AS "termsVersion", accepted_by AS "acceptedBy", accepted_at AS "acceptedAt",
         accepted_terms_version AS "acceptedTermsVersion"
  FROM jobs
  WHERE token = $1 AND terms_sent_at IS NOT NULL`;

app.get("/api/jobs/accept/:token", acceptLimiter, async (req, res) => {
  const token = String(req.params.token || "");
  if (!TOKEN_PATTERN.test(token)) return res.status(404).json({ error: "Invalid or expired link" });

  try {
    const { rows } = await pool.query(PUBLIC_JOB_SQL, [token]);
    if (!rows.length) return res.status(404).json({ error: "Invalid or expired link" });
    const row = rows[0];

    const version = row.acceptedAt ? row.acceptedTermsVersion : row.termsVersion;
    const terms = await pool.query("SELECT version, text FROM terms_versions WHERE version = $1", [version]);
    if (!terms.rows.length) return res.status(404).json({ error: "Invalid or expired link" });

    const settings = await pool.query(
      `SELECT company_name AS "companyName", email, phone, website FROM settings WHERE id = 1`
    );
    res.json({ job: publicJob(row), terms: terms.rows[0], settings: settings.rows[0] });
  } catch (error) {
    console.error("Load accept page failed:", error);
    res.status(500).json({ error: "Could not load this page" });
  }
});

app.post("/api/jobs/accept/:token", acceptLimiter, async (req, res) => {
  const token = String(req.params.token || "");
  const name = String(req.body?.acceptedByName || "").trim();
  if (!TOKEN_PATTERN.test(token)) return res.status(404).json({ error: "Invalid or expired link" });
  if (!name || name.length > 190) {
    return res.status(400).json({ error: "Please type your full name to accept." });
  }

  try {
    // The conditions in WHERE make acceptance happen once, even if the button is clicked twice.
    const update = await pool.query(
      `UPDATE jobs
       SET accepted_by = $2, accepted_at = now(), accepted_terms_version = terms_version,
           status = CASE WHEN status IN ('Draft', 'Awaiting acceptance') THEN 'Accepted' ELSE status END
       WHERE token = $1 AND terms_sent_at IS NOT NULL AND accepted_at IS NULL
       RETURNING id`,
      [token, name]
    );
    if (update.rows.length) {
      await pool.query(
        "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
        [update.rows[0].id, "Terms & conditions accepted online", name]
      );
    }

    const { rows } = await pool.query(PUBLIC_JOB_SQL, [token]);
    if (!rows.length) return res.status(404).json({ error: "Invalid or expired link" });
    res.json({ job: publicJob(rows[0]) });
  } catch (error) {
    console.error("Accept terms failed:", error);
    res.status(500).json({ error: "Could not record your acceptance" });
  }
});

app.post("/api/jobs", authRequired, async (req, res) => {
  const clean = value => String(value ?? "").trim();
  const clientName = clean(req.body?.clientName);
  const clientEmail = clean(req.body?.clientEmail);
  const clientPhone = clean(req.body?.clientPhone);
  const propertyAddress = clean(req.body?.propertyAddress);
  const workType = clean(req.body?.workType);
  const description = clean(req.body?.description);

  if (!clientName || !clientEmail || !clientPhone || !propertyAddress || !workType) {
    return res.status(400).json({ error: "Client name, email, phone, property address and work type are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return res.status(400).json({ error: "A valid client email address is required" });
  }
  if (clientName.length > 190 || clientEmail.length > 190 || clientPhone.length > 60 ||
      propertyAddress.length > 255 || workType.length > 120) {
    return res.status(400).json({ error: "One of the fields is too long" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise job-number assignment so two jobs created together can't share a number.
    await client.query("SELECT pg_advisory_xact_lock(7301)");
    const next = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(job_number, '\\D', '', 'g'), '')::int), 0) + 1 AS n FROM jobs`
    );
    const jobNumber = "XT-" + String(next.rows[0].n).padStart(4, "0");

    const { rows } = await client.query(
      `INSERT INTO jobs (job_number, client_name, client_email, client_phone, property_address, work_type, description, token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, job_number AS "jobNumber", client_name AS "clientName", client_email AS "clientEmail",
                 client_phone AS "clientPhone", property_address AS "propertyAddress", work_type AS "workType",
                 description, status, token, created_by AS "createdBy", created_at AS "createdAt"`,
      [jobNumber, clientName, clientEmail, clientPhone, propertyAddress, workType, description || null, token, req.session.user.name]
    );
    await client.query(
      "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
      [rows[0].id, "Job created", req.session.user.name]
    );
    await client.query("COMMIT");
    res.status(201).json({ job: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Create job failed:", error);
    res.status(500).json({ error: "Could not create job" });
  } finally {
    client.release();
  }
});

// Each status can only be reached from one other status, so work can't start before the client accepts.
const STATUS_PREREQUISITE = { "In progress": "Accepted", "Completed": "In progress" };

app.patch("/api/jobs/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Job not found" });

  const status = req.body?.status;
  const description = req.body?.description;
  if (status === undefined && description === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  if (status !== undefined && !STATUS_PREREQUISITE[status]) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (description !== undefined && (typeof description !== "string" || description.length > 10000)) {
    return res.status(400).json({ error: "Invalid description" });
  }

  try {
    const current = await pool.query("SELECT status FROM jobs WHERE id = $1", [id]);
    if (!current.rows.length) return res.status(404).json({ error: "Job not found" });

    if (status !== undefined) {
      const update = await pool.query(
        "UPDATE jobs SET status = $2 WHERE id = $1 AND status = $3 RETURNING id",
        [id, status, STATUS_PREREQUISITE[status]]
      );
      if (!update.rows.length) {
        return res.status(409).json({
          error: `This job can't be moved to "${status}" from "${current.rows[0].status}". Refresh the page and try again.`
        });
      }
      await pool.query(
        "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
        [id, `Status changed to ${status}`, req.session.user.name]
      );
    }
    if (description !== undefined) {
      await pool.query("UPDATE jobs SET description = $2 WHERE id = $1", [id, description.trim() || null]);
    }

    res.json({ job: await loadJobDetail(id) });
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Job not found" });

  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Note text is required" });
  if (text.length > 5000) return res.status(400).json({ error: "Note is too long (max 5000 characters)" });

  try {
    const job = await pool.query("SELECT 1 FROM jobs WHERE id = $1", [id]);
    if (!job.rows.length) return res.status(404).json({ error: "Job not found" });

    const { rows } = await pool.query(
      `INSERT INTO job_notes (job_id, author, text)
       VALUES ($1, $2, $3)
       RETURNING id, job_id AS "jobId", author, text, created_at AS "createdAt"`,
      [id, req.session.user.name, text]
    );
    res.status(201).json({ note: rows[0] });
  } catch (error) {
    console.error("Add note failed:", error);
    res.status(500).json({ error: "Could not add note" });
  }
});

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGES_PER_JOB = 40;

// Identify the image from its first bytes rather than trusting the type the browser sent.
function sniffImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

app.post("/api/jobs/:id/images", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Job not found" });

  const kind = req.body?.kind;
  const dataUrl = String(req.body?.dataUrl || "");
  const caption = String(req.body?.caption || "").trim().slice(0, 255);
  if (!["before", "after"].includes(kind)) {
    return res.status(400).json({ error: "Photo type must be before or after" });
  }
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ error: "Please choose a JPEG, PNG or WebP image" });

  const bytes = Buffer.from(match[1], "base64");
  const mimeType = sniffImageType(bytes);
  if (!mimeType) return res.status(400).json({ error: "That file isn't a valid image" });
  if (bytes.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: "That photo is too large (max 3 MB)" });
  }

  try {
    const job = await pool.query("SELECT 1 FROM jobs WHERE id = $1", [id]);
    if (!job.rows.length) return res.status(404).json({ error: "Job not found" });

    const count = await pool.query("SELECT count(*)::int AS n FROM job_images WHERE job_id = $1", [id]);
    if (count.rows[0].n >= MAX_IMAGES_PER_JOB) {
      return res.status(400).json({ error: `A job can have at most ${MAX_IMAGES_PER_JOB} photos` });
    }

    const { rows } = await pool.query(
      `INSERT INTO job_images (job_id, kind, mime_type, data, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, caption, uploaded_by AS "uploadedBy", created_at AS "createdAt"`,
      [id, kind, mimeType, bytes, caption, req.session.user.name]
    );
    await pool.query(
      "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
      [id, `${kind === "before" ? "Before" : "After"} photo added`, req.session.user.name]
    );
    res.status(201).json({ image: { ...rows[0], dataUrl: `/api/images/${rows[0].id}` } });
  } catch (error) {
    console.error("Add image failed:", error);
    res.status(500).json({ error: "Could not save the photo" });
  }
});

app.get("/api/images/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Photo not found" });

  try {
    const { rows } = await pool.query("SELECT mime_type, data FROM job_images WHERE id = $1 AND data IS NOT NULL", [id]);
    if (!rows.length) return res.status(404).json({ error: "Photo not found" });
    res.set({
      "Content-Type": rows[0].mime_type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400"
    });
    res.send(rows[0].data);
  } catch (error) {
    console.error("Get image failed:", error);
    res.status(500).json({ error: "Could not load the photo" });
  }
});

app.delete("/api/images/:id", authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Photo not found" });

  try {
    const found = await pool.query(
      `SELECT job_id AS "jobId", kind, uploaded_by AS "uploadedBy" FROM job_images WHERE id = $1`,
      [id]
    );
    if (!found.rows.length) return res.status(404).json({ error: "Photo not found" });
    const image = found.rows[0];

    const user = req.session.user;
    if (user.role !== "admin" && image.uploadedBy !== user.name) {
      return res.status(403).json({ error: "Only an admin or the person who added a photo can delete it" });
    }

    await pool.query("DELETE FROM job_images WHERE id = $1", [id]);
    await pool.query(
      "INSERT INTO job_history (job_id, event, actor) VALUES ($1, $2, $3)",
      [image.jobId, `${image.kind === "before" ? "Before" : "After"} photo deleted`, user.name]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete image failed:", error);
    res.status(500).json({ error: "Could not delete the photo" });
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
