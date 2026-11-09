# XTERA Job Reports — Development Guide

## Backend Setup (Local Development)

### Prerequisites
- Node.js 20+ (LTS)
- PostgreSQL 13+
- Git

### Environment Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Create a local PostgreSQL database:**
   ```bash
   # Connect to PostgreSQL as a user with admin privileges
   psql -U postgres
   
   # In psql:
   CREATE USER jobreports WITH PASSWORD 'dev_password_123';
   CREATE DATABASE jobreports_dev OWNER jobreports;
   \q
   ```

3. **Apply the schema:**
   ```bash
   psql postgresql://jobreports:dev_password_123@localhost:5432/jobreports_dev -f backend/db/schema.sql
   ```

4. **Set up `.env` file in the backend folder:**
   ```bash
   cd backend
   cp .env.example .env
   ```

   Edit `.env`:
   ```
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgresql://jobreports:dev_password_123@localhost:5432/jobreports_dev
   CLIENT_ORIGIN=http://127.0.0.1:8765
   SESSION_SECRET=your-dev-secret-key-here
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

   The API should listen on `http://127.0.0.1:3000`

### Testing Login Locally

`schema.sql` does not seed any users. Create an admin for local testing (see the hash steps below), for example:
- **Email:** `infoxtera@gmail.com`
- **Role:** admin

To create it (or change a password):
```bash
npm run hash -- "YourNewPassword"
# Copy the output hash and update the user in the database:
psql postgresql://jobreports:dev_password_123@localhost:5432/jobreports_dev
-- First time: INSERT INTO users (name, email, password_hash, role) VALUES ('Bill Usman', 'infoxtera@gmail.com', 'paste_hash_here', 'admin');
-- Later: UPDATE users SET password_hash = 'paste_hash_here' WHERE email = 'infoxtera@gmail.com';
```

## Frontend Development

The frontend calls the backend API at `/api/...`. For local development:

1. **Start the backend** (as above)

2. **Serve the frontend** (you can use Python or Node):
   ```bash
   # Python 3
   cd /path/to/Xtera\ Website
   python -m http.server 8765
   ```

3. **Open** `http://127.0.0.1:8765/app/login.html`

The frontend will connect to the backend at `http://127.0.0.1:3000/api/...` (the `API_BASE` in `app/js/api.js` uses relative paths, so it works locally too).

## Database Access

### Connect to the local development database

```bash
psql postgresql://jobreports:dev_password_123@localhost:5432/jobreports_dev
```

### Useful queries

List all jobs:
```sql
SELECT id, job_number, client_name, status, created_at FROM jobs ORDER BY created_at DESC;
```

List users:
```sql
SELECT id, name, email, role FROM users;
```

Clear all jobs (for testing):
```sql
DELETE FROM jobs;
```

## API Endpoints

All endpoints require authentication (session cookie) except `/api/jobs/accept/:token`.

### Authentication
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get a single job
- `POST /api/jobs` - Create a new job
- `PATCH /api/jobs/:id` - Update a job
- `GET /api/jobs/:id/notes` - Get notes for a job
- `POST /api/jobs/:id/notes` - Add a note to a job

### Settings
- `GET /api/settings` - Get company settings
- `PATCH /api/settings` - Update company settings

### Health
- `GET /api/health` - Health check (no auth required)

## Deployment

The deployment is automated via GitHub Actions (`.github/workflows/deploy.yml`):

1. **Push to `main` branch** triggers a deploy
2. **Workflow steps:**
   - Verify dependencies install and entry file parses
   - Configure SSH with the deploy key
   - rsync backend to `/var/www/jobreports/app`
   - Install dependencies and restart `jobreports` systemd service
   - rsync frontend and assets to `/var/www/jobreports/web`
   - Run health check against the deployed app

### Secrets required in GitHub
- `DEPLOY_KEY` - Base64-encoded SSH private key for the `deploy` user
- `VPS_HOST` - VPS IP address

### Server environment (`/etc/jobreports.env`)
- `PORT` - Port to listen on (default: 3000)
- `NODE_ENV` - Environment (production)
- `DATABASE_URL` - PostgreSQL connection string
- `CLIENT_ORIGIN` - Frontend origin for CORS
- `SESSION_SECRET` - Secret for signing sessions
- `APP_BASE_URL` - Public site URL used in password reset links (`https://reports.xtera.co.nz`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - SMTP login for reset emails (Gmail: `smtp.gmail.com`, `465`, `infoxtera@gmail.com`, and a Google App Password)
- `MAIL_FROM` - Sender shown on emails, e.g. `XTERA Job Reports <infoxtera@gmail.com>`

## Troubleshooting

### Database connection fails
Check `DATABASE_URL` in `.env`:
- Format: `postgresql://user:password@host:port/database`
- Special characters in password must be URL-encoded (`*` → `%2A`, etc.)

### Can't connect to local PostgreSQL
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start it if needed
sudo systemctl start postgresql

# List databases
psql -U postgres -l
```

### API not responding after deploy
```bash
# Check service status on VPS
sudo systemctl status jobreports

# View recent logs
sudo journalctl -u jobreports -n 50
```

### Frontend not loading on VPS
- Check nginx is serving files from `/var/www/jobreports/web`
- Check assets are in `/var/www/jobreports/web/assets`
- Check logs: `sudo nginx -t` and `sudo tail -f /var/log/nginx/error.log`
