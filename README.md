# Zoryx

Point-of-sale and kitchen system for Zoryx: order taking, live kitchen displays,
menu/deals management, inventory, vendor ledger, reports, and thermal receipt printing.

## Repository layout

```
zoryx-demo/
├── backend/       REST + Socket.io API — Express 5, Prisma 6, PostgreSQL
├── pos-frontend/      Staff POS web app — React, Vite, TypeScript, Tailwind v4
├── print-agent/   Runs on the cashier's PC; receives print jobs and drives the thermal printer
├── landing/       Static landing page
└── docs/          Project documentation
```

Each app is built and deployed on its own — there is no root `package.json`.

| App | Deployed to |
|---|---|
| `backend/` | Railway (with its PostgreSQL), from the `demo` branch |
| `pos-frontend/` | Hostinger — https://pos-zoryx.sultaann.com |
| `online-frontend/` | Hostinger — https://order-zoryx.sultaann.com |
| `print-agent/` | Not deployed — installed on the cashier's PC |

Step-by-step setup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Getting started

Requirements: Node.js (LTS) and a PostgreSQL database.

### Backend

```bash
cd backend
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN, PRINT_AGENT_KEY
npm install                 # also runs prisma generate
npx prisma migrate dev      # apply migrations to your local database
# optional, local demo data ("Scoops & Slices Café", 60 days of history, all passwords demo1234):
# DEMO_RESET_ALLOWED=true npm run demo:reset -- --yes   (refuses on a database that has real orders)
node scripts/create-admin.js
npm run dev
```

Tests: `npm test` · Production build: `npm run build && npm start`

### Frontend

```bash
cd pos-frontend
cp .env.example .env        # set VITE_API_URL to the backend URL
npm install
npm run dev
```

Lint: `npm run lint` · Production build: `npm run build`

### Print agent

See [print-agent/README.md](print-agent/README.md) for the Windows setup.

## Documentation

| Document | What it covers |
|---|---|
| [docs/AS_BUILT_BACKEND.md](docs/AS_BUILT_BACKEND.md) | How the backend actually works: schema, endpoints, sockets, business rules |
| [docs/AS_BUILT_FRONTEND.md](docs/AS_BUILT_FRONTEND.md) | Frontend routes, screens, roles, and printing |
| [docs/BACKEND_API.md](docs/BACKEND_API.md) | Short API reference for frontend work |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Day-to-day workflows and use cases in the cafe |
| [docs/PRINT_PROTOCOL.md](docs/PRINT_PROTOCOL.md) | Print-job format and the backend ↔ print-agent contract |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | UI palette, typography, and layout decisions |
| [docs/SRS.md](docs/SRS.md) | Original requirements specification |
| [docs/PRE_LAUNCH_PLAN.md](docs/PRE_LAUNCH_PLAN.md) | Step-by-step pre-launch checklist |

A Postman collection for the API is in [backend/Zoryx-API.postman_collection.json](backend/Zoryx-API.postman_collection.json).
