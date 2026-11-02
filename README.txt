XTERA Exterior Cleaning Services — HTML landing page

FILES
-----
index.html      Main responsive page
styles.css      Custom CSS
script.js       Editable contact details + localStorage
assets/         Separate photo assets cropped from the supplied reference

BOOTSTRAP
---------
Bootstrap 5.3.3 is loaded from jsDelivr CDN.
Bootstrap Icons are also loaded from jsDelivr CDN.

EDIT PHONE / WEBSITE / EMAIL
----------------------------
1. Open index.html.
2. Click the "Edit" button at the bottom-right.
3. Change phone, website and email.
4. Click "Save contact details".

The values are saved in the visitor's browser with localStorage.

For permanent default values, edit DEFAULT_CONTACT in script.js:

const DEFAULT_CONTACT = {
  phone: "0800326002",
  website: "xtera.co.nz",
  email: "infoxtera@gmail.com"
};

NOTES
-----
The original uploaded graphic was used as the visual reference.
The page is rebuilt as separate HTML/CSS elements instead of using the
entire original graphic as a single page background.


NODE + HOSTINGER VPS BACKEND (NO PHP)
-------------------------------------
This repository now includes a Node.js API scaffold for Hostinger VPS in:

backend/
  package.json
  .env.example
  db/schema.sql
  src/server.js
  src/db.js

1) Create MySQL DB in Hostinger hPanel
--------------------------------------
Use short names (no email address in username):
- Database name: xtera_jobs         -> usually becomes u#########_xtera_jobs
- Username:      xtera_admin        -> usually becomes u#########_xtera_admin
- Password:      strong password

2) Import schema
----------------
Open phpMyAdmin for that DB and run/import:
backend/db/schema.sql

Seed users created by schema (change later):
- admin@xtera.co.nz / ChangeMe123!
- staff@xtera.co.nz / ChangeMe123!

3) Configure and run API locally
--------------------------------
Copy env file and fill real values:
- copy backend/.env.example to backend/.env
- set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, SESSION_SECRET

Install + run:
- cd backend
- npm install
- npm run start

Test endpoints:
- GET  http://localhost:3000/api/health
- GET  http://localhost:3000/api/health/db
- POST http://localhost:3000/api/auth/login

4) Deploy to Hostinger VPS
--------------------------
On the VPS (Ubuntu), install Node 20+ and PM2, upload backend/, then:
- cd backend
- npm ci
- cp .env.example .env   (fill real values)
- pm2 start src/server.js --name xtera-api
- pm2 save

Put Nginx in front (example):
location /api/ {
  proxy_pass http://127.0.0.1:3000/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
