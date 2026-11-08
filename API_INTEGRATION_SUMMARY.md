# XTERA Job Reports — API Integration Complete ✅

## What's been done

### Frontend → Real API Integration
- **Rewrote `app/js/api.js`** to call real backend endpoints at `/api/...`
- Frontend now makes authenticated fetch requests to:
  - `/api/auth/login` — Login with email/password
  - `/api/auth/logout` — Logout
  - `/api/auth/me` — Get current user
  - `/api/jobs` — List/create jobs
  - `/api/jobs/:id` — Get/update single job
  - `/api/jobs/:id/notes` — Get/add notes
  - `/api/settings` — Get/update company settings

### Backend API Endpoints
Added 8 new endpoints to `backend/src/server.js`:
1. `GET /api/jobs/:id` — Get single job details
2. `POST /api/jobs` — Create new job
3. `PATCH /api/jobs/:id` — Update job (status, description)
4. `GET /api/jobs/:id/notes` — Get all notes for a job
5. `POST /api/jobs/:id/notes` — Add note to job
6. `GET /api/settings` — Get company settings
7. `PATCH /api/settings` — Update company settings
8. All use PostgreSQL queries with proper camelCase field mapping

### Authentication & Cookies
- All endpoints use `credentials: 'include'` for session cookies
- Session cookie `xtera.sid` persists login state
- CORS is enabled with `credentials: true`

### Database Access for Development

**New file:** `DEVELOPMENT.md` includes:
- ✅ How to set up PostgreSQL locally
- ✅ How to apply the schema
- ✅ How to create a dev `.env` file
- ✅ Demo login credentials (admin@xtera.co.nz / ChangeMe123!)
- ✅ Database connection details
- ✅ How to generate password hashes for new users
- ✅ API endpoint reference
- ✅ Troubleshooting guide

## Next Deploy
When you push to `main`, GitHub Actions will:
1. ✅ Deploy new API endpoints to VPS
2. ✅ Deploy updated frontend (`app/js/api.js`)
3. ✅ Deploy assets
4. ✅ Restart the service
5. ✅ Run health check

The login page at `https://reports.xtera.co.nz/login.html` will then connect to the real database.

## Testing Locally

To test before deploying:

```bash
# Terminal 1: Start backend
cd backend
npm run dev
# API runs on http://127.0.0.1:3000

# Terminal 2: Serve frontend
python -m http.server 8765
# Frontend at http://127.0.0.1:8765/app/login.html

# Login with:
# Email: admin@xtera.co.nz
# Password: ChangeMe123!
```

## Files Changed
- `app/js/api.js` — Complete rewrite (6.3 KB)
- `backend/src/server.js` — Added 8 new endpoints
- `DEVELOPMENT.md` — New development guide (5.2 KB)

All changes are staged and ready to push.
