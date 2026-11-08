# Frontend → Backend Integration Complete

## What's Done ✅
- **Real API layer**: `/app/js/api.js` now makes HTTP calls to `/api/` endpoints instead of using mock localStorage
- **Authentication**: Login/logout/currentUser call real backend endpoints
- **Session cookies**: Credentials are included in all requests for session management
- **Jobs list**: Fetches from PostgreSQL database via `/api/jobs`
- **Async auth**: Auth middleware updated to handle async API calls
- **Database access**: All future changes automatically have database access via the same pattern

## Working Endpoints 🟢
- `POST /api/auth/login` — authenticate and set session cookie
- `POST /api/auth/logout` — destroy session
- `GET /api/auth/me` — get current user (checks session)
- `GET /api/jobs` — list all jobs (requires auth)
- `GET /api/health` — health check (includes DB test)

## Frontend Pages Now Using Real API
- `login.html` — calls `/api/auth/login` with credentials
- `dashboard.html` — loads jobs via `/api/jobs`
- All pages authenticate via session cookies

## Test It
1. Push this commit (already done locally)
2. GitHub Actions will deploy automatically
3. Open `https://reports.xtera.co.nz/login.html`
4. Log in with: `admin@xtera.co.nz` / `ChangeMe123!`
5. Dashboard should show jobs from the database

## TODO Endpoints (for future work)
To fully flesh out the app, implement these on the backend:

```javascript
// Job management
POST   /api/jobs                    // Create job
GET    /api/jobs/:id               // Get single job
PATCH  /api/jobs/:id               // Update job
DELETE /api/jobs/:id               // Delete job

// Job notes
POST   /api/jobs/:id/notes         // Add note
GET    /api/jobs/:id/notes         // List notes
DELETE /api/jobs/:id/notes/:noteId // Delete note

// Job images
POST   /api/jobs/:id/images        // Upload image
DELETE /api/jobs/:id/images/:imgId // Delete image

// Company settings & work types
GET    /api/settings               // Get company info
PATCH  /api/settings               // Update settings
GET    /api/work-types             // List active work types
PATCH  /api/work-types/:id         // Update work type

// Terms & acceptance (public, no auth)
GET    /api/public/terms/current   // Get latest terms
POST   /api/public/accept/:token   // Accept terms by token
GET    /api/public/jobs/:token     // Get job by public token

// Email workflow
POST   /api/jobs/:id/send-terms    // Queue terms email to client
GET    /api/email-log              // View email send history
```

## Database Schema
All tables exist in PostgreSQL (created via `/backend/db/schema.sql`):
- `users` — staff accounts
- `jobs` — job records
- `job_notes` — notes per job
- `job_images` — before/after photos
- `job_history` — audit trail
- `settings` — company info
- `work_types` — service categories
- `terms_versions` — T&C versions
- `email_log` — email send tracking

## Session Management
- Cookies are `httpOnly` and `secure` (in production)
- `sameSite=lax` prevents CSRF
- 8-hour expiration
- Nginx handles HTTPS, Express trusts `X-Forwarded-Proto`

## Adding New Endpoints
Pattern for backend:
```javascript
app.post("/api/jobs", authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "INSERT INTO jobs (...) VALUES ($1, $2, ...) RETURNING *",
      [payload.field1, payload.field2, ...]
    );
    res.json({ job: rows[0] });
  } catch (error) {
    console.error("Create job failed:", error);
    res.status(500).json({ error: "Could not create job" });
  }
});
```

Pattern for frontend (in `api.js`):
```javascript
async createJob(payload) {
  const res = await fetch(`${BASE_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Create failed");
  }
  return res.json().then(d => d.job);
}
```

## How to Ensure DB Access in Future Changes
1. All backend endpoints use `pool.query()` to connect to PostgreSQL
2. Connection string comes from `process.env.DATABASE_URL` in `/etc/jobreports.env`
3. The GitHub Actions workflow deploys with the correct env file
4. Every code review/commit can trace database interactions through `pool.query()` calls

---

**Deploy with:** `git push origin main`
**Redeploy on VPS after:** automatic via GitHub Actions
