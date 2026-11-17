# Zoryx — Backend

## Stack
- Node.js + Express + TypeScript
- PostgreSQL via Prisma (schema at `prisma/schema.prisma` — don't change models without asking me first)
- Socket.io for live kitchen notifications
- One backend serves both the POS and the Online Ordering frontends — routes are split under `/api/pos/*` and `/api/online/*`

## Folder structure
Each feature lives in its own folder under `src/modules/<name>/`, with:
- `<name>.routes.ts` — Express router
- `<name>.controller.ts` — request/response handling only
- `<name>.service.ts` — the actual logic, talks to Prisma

## Conventions
- All money fields are Prisma `Decimal` — never convert to a JS `number` for calculations
- Every route is guarded by role: `SUPER_ADMIN`, `POS_ADMIN`, `ONLINE_ADMIN`, `KITCHEN` (see `src/common/middlewares/auth.ts`)
- Return errors as `{ error: string }` with the correct HTTP status — no silent failures
- Run `npx prisma generate` after any schema change, then `npx prisma migrate dev --name <description>`
- After building a module, list its endpoints in the chat so I can test them in Postman — don't just say "done"

## Business rules (don't relearn these)
- Orders are grouped by BusinessDay, not calendar date — see Section B.5 of the SRS (`docs/SRS.md`)
- Order numbers reset to 1 at the start of each BusinessDay
- Online orders (`source: ONLINE`) are real Order rows the moment they're created — there's no separate online-orders table