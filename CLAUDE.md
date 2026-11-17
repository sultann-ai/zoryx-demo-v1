# Zoryx — POS Frontend

## Stack
- React + Vite + TypeScript, react-router-dom, @tanstack/react-query for server state, axios, socket.io-client for live kitchen updates
- Tailwind v4, themed via `pos-frontend/src/index.css`'s `@theme` block — palette, type scale, and spacing tokens live there per the agreed design plan (`docs/DESIGN_SYSTEM.md`). Build UI from the shared components in `pos-frontend/src/components/ui/` (Button, Input/Select/Textarea, Card, Table, StatusBadge, Modal, PageHeader, EmptyState) rather than hand-rolling styles or picking new colors ad hoc.

## Backend
@docs/BACKEND_API.md
Base URL from VITE_API_URL env var. Every request needs Authorization: Bearer <staff token> except login.

## Conventions
- Staff auth only in this app — no customer auth here, that's the separate online-frontend
- Money fields come back from the API as strings — parse before doing math, format for display
- Errors are {error: string} — show that message directly, no generic fallback
- Check the logged-in staff's role before rendering a screen, not only before calling the API
- KITCHEN role only ever sees the Kitchen Display — no shared app shell, no nav for them

## Working rules for this repo
- Folders: backend/ (Express + Prisma + Postgres), pos-frontend/ (React POS). Reference docs: docs/AS_BUILT_BACKEND.md and docs/AS_BUILT_FRONTEND.md (adjust path if they live elsewhere).
- Every schema change is additive (new tables, new nullable columns) through `prisma migrate dev`. Never edit an already-applied migration.
- Never run `prisma migrate reset`, `db push --force-reset`, or anything destructive unless DATABASE_URL clearly points at localhost. If it doesn't, stop and tell me.
- Money is Prisma.Decimal on the server. Never trust a price or total sent by the client.
- Never run git push, never change git remotes, never touch deployment settings. I commit and push myself.
- When you change behavior described in docs/AS_BUILT_*.md, update the matching section in the same task and tell me which sections you touched.
- Finish every task by running the backend build and the frontend build and lint, and report the result.
- Don't add a dependency without telling me why.