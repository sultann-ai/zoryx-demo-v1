# Deployment — demo environment

| Piece | Where | Address |
|---|---|---|
| `backend/` + PostgreSQL | Railway, deploys from the `demo` branch | Railway URL (or a custom domain) |
| `pos-frontend/` (staff POS) | Hostinger, uploaded by hand | https://pos.zoryx.sultaann.com |
| `online-frontend/` (customer ordering site) | Hostinger, uploaded by hand | https://order.zoryx.sultaann.com |
| `print-agent/` | Cashier's PC only, never deployed | — |

Branches: `demo` is what restaurants see. Day-to-day work happens on `main`; to update the demo, merge `main` into `demo` and push. Railway redeploys the backend on its own, while the frontends need a rebuild and re-upload (below).

## 1. Railway: database + backend

1. New project → **Deploy from GitHub repo** → `zoryx-demo-v1`.
2. Service **Settings**:
   - **Root Directory:** `/backend`.
   - **Config-as-code → Railway Config File:** `/backend/railway.json` (the config file path does not follow the Root Directory, so give the full path). It sets the build (`npm run build`), start (`npm start`, which runs `prisma migrate deploy` first), health check (`/health`) and redeploys only when `backend/` changes.
   - **Branch:** `demo`.
3. In the same project: **+ New → Database → PostgreSQL**.
4. Backend service → **Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
   | `JWT_SECRET` | a long random string, e.g. the output of `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `CORS_ORIGIN` | `https://pos.zoryx.sultaann.com,https://order.zoryx.sultaann.com` |
   | `TRUST_PROXY_HOPS` | `1` |
   | `ENABLE_CUSTOMER_ACCOUNTS` | `false` |
   | `PRINT_AGENT_KEY` | optional, 24+ random characters, only if a print agent will connect |

   Don't set `PORT`: Railway provides it.
5. **Settings → Networking → Generate Domain** (or add a custom domain such as `api.zoryx.sultaann.com`). That URL is the frontends' `VITE_API_URL`.
6. Check: `https://<api-url>/health` returns `{"status":"ok"}`.

The first boot creates every table from the migrations. The database starts empty, so load data with one of these, run from `backend/` on your PC against the database's **public** URL (Postgres service → Variables → `DATABASE_PUBLIC_URL`):

```powershell
# Windows PowerShell, inside backend/. The variables last only for this terminal window; close it afterwards.
$env:DATABASE_URL = "<DATABASE_PUBLIC_URL>"

# Demo restaurant: menu, staff (all passwords demo1234), 60 days of history, DEMO pill on.
# Refuses on a database that already has real orders.
$env:DEMO_RESET_ALLOWED = "true"; npm run demo:reset -- --yes

# Or just one Super Admin account
$env:ADMIN_USERNAME = "admin"; $env:ADMIN_PASSWORD = "<8+ chars>"; node scripts/create-admin.js
```

## 2. Build the frontends (on your PC)

Production settings live in each app's `.env.production` (committed, no secrets):

| File | Variables |
|---|---|
| `pos-frontend/.env.production` | `VITE_API_URL`, `VITE_PRINTER_ID`, `VITE_ONLINE_SITE_URL=https://order.zoryx.sultaann.com` |
| `online-frontend/.env.production` | `VITE_API_URL`, `VITE_SITE_URL=https://order.zoryx.sultaann.com` |

`VITE_API_URL` is compiled into the files, so put the Railway URL in **both** files (no trailing slash), then:

```bash
cd pos-frontend && npm ci && npm run build
cd ../online-frontend && npm ci && npm run build
```

The online build warns if `VITE_API_URL` is still the `REPLACE-WITH-...` placeholder. Any change of the API URL needs a rebuild and re-upload.

## 3. Hostinger: upload

1. hPanel → **Domains → Subdomains**: create `pos.zoryx` and `order.zoryx` under `sultaann.com`. Note each one's folder.
2. hPanel → **Security → SSL**: install the free SSL certificate for both subdomains, then turn on **Force HTTPS**.
3. Upload the **contents** of `pos-frontend/dist/` into the POS subdomain's folder and `online-frontend/dist/` into the ordering one. The easiest way is to zip the contents of `dist/`, upload the zip in File Manager and extract it there.
   - `dist/.htaccess` must be uploaded too. It handles page refreshes on inner pages (React routing), caching and security headers; for the ordering site it also holds the Content-Security-Policy that allows the API. File Manager hides dotfiles by default.
   - When re-uploading, delete the old `assets/` folder first so stale files don't pile up.
4. Check: open https://pos.zoryx.sultaann.com, log in, refresh on an inner page (it must not show a 404), and open https://order.zoryx.sultaann.com and place a test order.

## Troubleshooting

- **Login or every request fails with a network/CORS error:** the frontend's origin isn't in `CORS_ORIGIN` exactly (scheme and no trailing slash), or `VITE_API_URL` was wrong at build time.
- **Ordering site loads but shows no menu or images:** the CSP in the uploaded `.htaccess` doesn't list the API origin, so rebuild with the right `VITE_API_URL` and upload `.htaccess` again.
- **404 on refresh:** `.htaccess` is missing from the subdomain's folder.
- **Kitchen Display not updating live:** Socket.io uses the same `VITE_API_URL` and `CORS_ORIGIN`; Railway supports WebSockets without extra setup.
