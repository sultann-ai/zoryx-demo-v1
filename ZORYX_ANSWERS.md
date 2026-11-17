# Zoryx audit — answers

## A. Module switches

Q1: Per-deployment toggles that exist today:

| Toggle | Where | Controls |
|---|---|---|
| `ENABLE_CUSTOMER_ACCOUNTS` | backend env (`backend/src/config/env.ts`) | Customer signup/login, addresses, `POST /api/online/orders` (404 when off) |
| `PRINT_AGENT_KEY` | backend env | Unset = every print agent rejected (direct printing off) |
| `CORS_ORIGIN`, `TRUST_PROXY_HOPS`, `LOG_CLIENT_IP` | backend env | Allowed origins, proxy hop count, IP logging |
| `onlineOrderingEnabled` | `SiteSettings` (`backend/prisma/schema.prisma`) | Customer site can/can't place orders |
| `deliveryEnabled`, `pickupEnabled`, `pickupMinOrderAmount` | `SiteSettings` | Online order types offered, pickup minimum |
| `isActive` / `isAvailableInPOS` / `isAvailableOnline` / `isFeatured` | DB rows (menu, deals, kitchens, areas, accounts, gallery, testimonials, staff) | Per-row visibility, not modules |
| `VITE_ONLINE_SITE_URL` | POS env | Empty hides "Open customer website" button |
| `VITE_PRINTER_ID` | POS env | Which print agent receives jobs |
| `PRINTER_INTERFACE=preview`, `DRY_RUN`, `CUT_ENABLED`, `PRINTER_WIDTH_CHARS`, `PRINTER_TYPE`, `PRINTER_CHARSET` | print-agent env (`print-agent/.env.example`) | Preview mode, cutter, paper width, printer model |

No module flags exist.

Q2:

| Module | Switchable today | Coupling to order flow | Breaks if hidden | Effort |
|---|---|---|---|---|
| Online store | No (only `onlineOrderingEnabled` stops orders; nav stays) | Low | Nothing; online orders stop arriving | S |
| Inventory | No | Medium (deduct on create/accept/add, restock on remove) | Nothing (no links = no deduction) | S |
| Vendors | No | Low | Dashboard "expenses"/net become 0 | S |
| Employees/payroll | No | Medium (waiter/rider = `Employee` rows) | Waiter/rider pickers empty | S |
| Kitchen display | No | Medium (`MenuItem.kitchenId` required, item status only set by KDS) | Items never leave PENDING; online status stuck at CONFIRMED | S |
| Order takers | No | Medium (reception gate, sockets) | Nothing if no OT accounts | S |
| Scheduled orders | No | Medium (status, 30s job, End Day check) | Nothing; job idles | S |
| Deals | No | High (explosion, pricing, printing, online) | Nothing if none exist | S |
| Add-ons | No | Medium | Nothing if none exist | S |
| Dining areas/tables | No | Medium (DINE_IN requires `diningAreaId`, taker flow table-first) | Dine-in orders impossible | M |
| Delivery/riders | Partial (online `deliveryEnabled` only) | Medium | POS delivery type still offered | S |
| Reports/dashboard | No | Low | SA/PA home falls to next nav item automatically | S |
| Print-agent | Yes (`PRINT_AGENT_KEY` unset → browser-print fallback) | Low | Print buttons show "offline" + fallback | S |

Q3: Yes, mostly central — `NAV_ITEMS` drives sidebar, mobile tabs and routes.
`pos-frontend/src/routes/navItems.ts`, `pos-frontend/src/App.tsx` (extra routes), `pos-frontend/src/routes/homeRoute.ts`, `pos-frontend/src/routes/mobileShell.ts`; customer site `online-frontend/src/App.tsx`.

Q4: Yes — one mount file per surface; `customerAccountsGate` is an existing per-module gate pattern.
`backend/src/routes/pos.routes.ts`, `backend/src/routes/online.routes.ts`, `backend/src/common/middlewares/customerAccountsGate.ts`.

Q5: Partial — `SiteSettings` (single row) read by backend and by the customer site via `GET /api/online/store`; POS reads it only on Store settings. Could carry flags; effort M.
`backend/src/modules/siteContent/siteContent.service.ts`, `backend/src/modules/store/store.service.ts`.

Q6: Partial — at least one kitchen row is required (`kitchenId` required on menu items); no auto-complete for POS orders (Mark delivered is online-only in UI), so End Day is blocked by PENDING orders without `force`.
`backend/src/modules/menu/menu.controller.ts:64`, `pos-frontend/src/pages/OrderDetailPage.tsx:186`, `backend/src/modules/businessDay/businessDay.controller.ts:71`.

Q7: Yes for TAKEAWAY — no table/waiter needed; DINE_IN still offered and requires a table.
`backend/src/modules/order/order.controller.ts:104`.

Q8: No — every order requires an active business day; numbering, dashboard, reports and `orderingOpen` depend on it.
`backend/src/modules/order/order.service.ts:837-839`, `backend/src/modules/store/store.service.ts`, `backend/src/modules/reports/salesDefinitions.ts`.

Q9: No — `AWAITING_RECEPTION` is hard-set for taker submissions; turning it off needs a flag that auto-runs `acceptOrder`. Effort S–M.
`backend/src/modules/order/order.service.ts:1468`.

Q10: Yes, hardcoded — Prisma enum, `requireRole` lists in every route file, `NAV_ITEMS`, `homeRoute.ts`, socket `canJoinRoom`. Add a role: M; role permissions by config: L.
`backend/prisma/schema.prisma` (enum StaffRole), `backend/src/config/socket.ts:25`, `backend/src/modules/*/*.routes.ts`.

## B. Per-client settings

Q11: Customer-site name/tagline/phone/WhatsApp/address/hours/socials = database (`SiteSettings`). Everything else hardcoded:
- POS receipt name/wordmark/footer/phone/address/currency/timezone: `pos-frontend/src/config/shop.ts`
- Receipt "DEMO", "Thank you for visiting!": `pos-frontend/src/print/buildReceiptDoc.ts:41-42,125`
- POS logo + "DEMO" pill: `pos-frontend/src/components/BrandLogo.tsx`
- POS colours: `pos-frontend/src/index.css`
- Site names/palette: `online-frontend/src/brand/brand.config.ts`; logo `online-frontend/src/brand/logo.svg`, `Logo.tsx`
- Site fallback phone/WhatsApp/map: `online-frontend/site.config.json`
- Site titles "Zoryx": `online-frontend/src/i18n/en.ts`, `ur.ts`, `online-frontend/public/site.webmanifest`
- Settings placeholders "Zoryx": `backend/src/modules/siteContent/siteContent.service.ts:18`

Q12: Yes:
- Demo data: `backend/prisma/demo/` ("Scoops & Slices Café", `npm run demo:reset`, phase 2; replaced the old bakery seed)
- Phone 0300 5760395 / 923005760395, map link: `online-frontend/site.config.json`
- Placeholder hero/"why us" copy: `online-frontend/src/i18n/en.ts:16,64`, `ur.ts:16,64`
- Hall types FAMILY_HALL/GENTS_HALL: `backend/prisma/schema.prisma`
- Bilingual reject reasons: `pos-frontend/src/pages/incoming/RejectReasonModal.tsx`
- Pakistani phone formats: `backend/src/common/phone.ts`
- `zoryx.dev` default site URL: `online-frontend/.env.example`; footer URL `pos-frontend/src/config/shop.ts`

Q13: One token set per app, two different sources — POS `pos-frontend/src/index.css` (`@theme`, 50 colour tokens, 1 stray hex in `imageResize.ts`); site `online-frontend/src/brand/brand.config.ts` → generated `theme.css`. Rebrand both from one config: M.

Q14: Hardcoded. Currency "Rs": `pos-frontend/src/config/shop.ts`, `online-frontend/src/lib/format.ts`. Timezone Asia/Karachi: `backend/src/common/pkTime.ts:6`, `pos-frontend/src/config/shop.ts`; payroll uses UTC `backend/src/modules/employee/payroll.service.ts:61`. Language: site ur/en toggle (`online-frontend/src/i18n/`), POS English only.

Q15: English only — Urdu appears only as RTL input fields for website content (11 `dir="rtl"` inputs); no POS i18n.

Q16:
- Order number: integer `MAX+1` per business day, hardcoded — `backend/src/modules/order/order.service.ts:874-891`
- Discount limits: none beyond "not above total" (`DiscountExceedsTotalError`), no role/percent cap — `order.service.ts:1285,1562`
- Scheduled window: 24h hardcoded `SCHEDULE_MAX_AHEAD_MS` — `order.service.ts:227`
- Guest order limits: hardcoded constants — `backend/src/modules/guestOrder/guestOrderLimits.ts`, `guestOrder.validators.ts:27-30`
- Delivery fee: configurable per `DeliveryArea` (fee + minimum) in DB; unlisted area = no fee; pickup minimum in `SiteSettings`
- Content caps 30/4/24/12: hardcoded — `backend/src/modules/siteContent/siteContent.errors.ts:9-12`

Q17: Two templates plus a duplicate — receipt `pos-frontend/src/print/buildReceiptDoc.ts` (browser fallback `PrintReceiptPage.tsx` is a separate layout); kitchen slip `pos-frontend/src/print/kitchenSlip.ts` shared by `buildKitchenTicketDocs.ts` and `PrintKitchenTicketsPage.tsx`. Logo: no image block in protocol (text only); footer hardcoded; width via agent env `PRINTER_WIDTH_CHARS` (48/32), builders assume 48, browser CSS fixed 80mm (`PrintStyles.tsx`). Not by settings.

## C. New client deployment

Q18:
1. Create Postgres (Railway) — 10 min
2. Deploy backend with env; `start` runs `prisma migrate deploy` — 20 min
3. `node scripts/create-admin.js` in Railway console — 5 min
4. Edit per-client code: `brand.config.ts`, `logo.svg`, `site.config.json`, i18n strings, `site.webmanifest`, `vercel.json` CSP, POS `config/shop.ts`, `BrandLogo.tsx`, `index.css` — 2–6 h
5. Build + upload POS to Hostinger with env — 30 min
6. Deploy site to Vercel (root dir, env, domain/DNS); add origins to `CORS_ORIGIN` — 30–60 min
7. Enter kitchens, categories, menu, sizes, add-ons, deals, tables, employees, staff, inventory by hand — 3 h to 2 days
8. Online store: settings, delivery areas, payment accounts + QR, photos, Urdu names — 2–6 h
9. Print agent on cashier PC: Node, `.env`, `npm run test-print`, startup shortcut — 1 h
10. Start business day, test an order end to end — 30 min

Q19: Scriptable: 1–3 (Railway CLI + script), 4 (client config file → generated branding), 5–6 (CI deploy), 7 (menu import), 9 (agent installer). One setup script: L (branding must move out of code first).

Q20: No — `exceljs` is export-only; no import code. Effort M (S for flat items; M with sizes/add-ons/deals).

Q21: No — no CHANGELOG, no version endpoint; versions unused (`backend` 1.0.0, POS/site 0.0.0, agent 1.0.0); repo has no commits yet. Which client runs what: UNKNOWN (no mechanism).

Q22: Applied migrations are safe to re-run (`migrate deploy` only applies pending ones). Risks:
- `scripts/create-admin.js` upsert resets an existing username's password and role (default `ChangeMe123!`)
- `npm run demo:reset` wipes every table (refuses unless DEMO_RESET_ALLOWED=true, --yes, and no orders or isDemo)
- `20261026033721_...` reported "modified after applied" by `migrate dev`; effect on `migrate deploy` for existing DBs: UNKNOWN
- `20261111120000_cutout_...` hand-written SQL

Q23: Backend: yes (migrations run on `start`). Manual steps: rebuild/redeploy POS and site per client (env baked at build, per-client brand files), `vercel.json` CSP edit per client, print-agent `npm run build` + restart on every cashier PC when agent code changes.

## D. Paid extras without forking

Q24: No general plugin/event system. Partial hooks: `guard(tx)` in `createOrder` (`backend/src/modules/order/order.service.ts`), Socket.io `order:*` events (`backend/src/config/socket.ts`), print protocol blocks (`docs/PRINT_PROTOCOL.md` types), `createCrudHooks` (`pos-frontend/src/hooks/createCrudHooks.ts`).

Q25:
- backend: logic in services; controllers carry heavy hand-rolled validation (`order.controller.ts` 1433 lines)
- pos-frontend: mixed — pure helpers (`newOrder/cart.ts`, `dealCart.ts`, `print/kitchenSlip.ts`) but large logic-heavy pages (`OrderDetailPage.tsx` 1001 lines)
- online-frontend: cart/pricing in `src/cart/`, API in `src/api/`; `CheckoutSheet.tsx` (681 lines) mixes UI and logic
- print-agent: small, separated (`layout.ts`, `render.ts`)

Q26:
- Painful: `backend/src/modules/order/order.service.ts` (2476 lines, one `createOrder` for every source/status); `backend/src/modules/order/order.controller.ts` (inline validation); `pos-frontend/src/pages/OrderDetailPage.tsx` (1001 lines)
- Clean: `backend/src/modules/siteContent/` (crud router + pure validators); `backend/src/modules/guestOrder/` (pure validators/mappers, tested); `print-agent/` + print protocol

Q27:

| App | Lines | File |
|---|---|---|
| backend | 2476 | `src/modules/order/order.service.ts` |
| backend | 1433 | `src/modules/order/order.controller.ts` |
| backend | 582 | `src/modules/reports/analytics.service.ts` |
| backend | 556 | `src/modules/menu/menu.controller.ts` |
| backend | 356 | `src/modules/inventory/inventory.controller.ts` |
| pos-frontend | 1001 | `src/pages/OrderDetailPage.tsx` |
| pos-frontend | 660 | `src/pages/menu/MenuItemsTab.tsx` |
| pos-frontend | 621 | `src/pages/dashboard/DashboardCharts.tsx` |
| pos-frontend | 541 | `src/pages/NewOrderPage.tsx` |
| pos-frontend | 464 | `src/pages/TakeOrderPage.tsx` |
| online-frontend | 681 | `src/components/checkout/CheckoutSheet.tsx` |
| online-frontend | 318 | `src/i18n/ur.ts` |
| online-frontend | 316 | `src/i18n/en.ts` |
| online-frontend | 287 | `src/components/home/Sections.tsx` |
| online-frontend | 286 | `src/routes/More.tsx` |
| print-agent | 139 | `src/render.ts` |
| print-agent | 130 | `src/layout.ts` |
| print-agent | 102 | `src/index.ts` |
| print-agent | 34 | `src/testPrint.ts` |
| print-agent | 33 | `src/windowsRawPrinter.ts` |

## E. Demo readiness

Q28: Partial.
- Exists (phase 2): full demo dataset `backend/prisma/demo/` (`npm run demo:reset`): kitchens, tables, staff per role, employees, inventory/links, vendors, site content with placeholder photos, 60 days of orders, a live day; one account per run `scripts/create-admin.js`; one fake online order `scripts/dev-fake-online-order.ts`

Q29: No.

Q30:
1. POS orders can't be completed in the UI (Mark delivered is online-only) → End Day always needs "end anyway" — `OrderDetailPage.tsx:186`
2. Cancelled orders/removed items stay on the Kitchen Display (no kitchen event on cancel/remove) — `order.service.ts` `cancelOrder`
3. KDS loses live updates after a drop and asks for a reload — `KitchenDisplayPage.tsx:88`
4. Empty dashboard/reports with no history seed
5. Admin can't open the KDS; a separate KITCHEN login per kitchen is needed — `App.tsx`
6. Two roles in one browser share one `localStorage` session — `pos-frontend/src/auth/session.ts:21`
7. 30 native `window.alert/confirm` calls across 13 files look unpolished
8. Order-level status stays "Pending" for POS orders (IN_KITCHEN/READY never set)
9. Placeholder hero/"why us" copy on the customer site — `online-frontend/src/i18n/en.ts:16,64`
10. POS first load: 211 KB gzip single main chunk + Google Fonts

Q31:
- Native `window.alert/confirm`: AddOnsTab, AttendanceGrid, BusinessDayBar, CategoriesPage, DealsTab, DiningAreasPage, InventoryLinksSection, KitchensPage, MenuItemsTab, OrderDetailPage, PayrollTable, StaffPage
- Dead page: `pos-frontend/src/pages/PagePlaceholder.tsx` (0 references)
- KDS error is a text banner with "reload" instruction
- Empty/loading/mobile states of the other screens: UNKNOWN (not rendered in this audit)

Q32: Yes, with workarounds: KDS needs a second browser profile/incognito (shared session key); phone must reach the backend (hosted, or LAN + `CORS_ORIGIN`); business day must be started and online ordering on. No printer needed (agent preview or browser print).

Q33: Yes — `PRINTER_INTERFACE=preview` / `DRY_RUN=1` renders to the agent console and `out/last-job.bin`; browser print pages also work. `print-agent/.env.example`, `print-agent/src/render.ts`.

Q34:
- POS: main JS 763 KB (211 KB gzip), DashboardCharts 436 KB (122 KB gzip), CSS 43 KB (7.8 KB gzip); no route splitting besides charts; Google Fonts external
- Site: main JS 251 KB (78 KB gzip), Icon chunk 81 KB (28 KB gzip), CSS 74 KB (14 KB gzip), routes lazy
- Slow first requests: backend cold start UNKNOWN; `/store`, `/menu`, `/deals` cached 60s

## F. Likely client requests

| Q | Feature | Status | Effort | Evidence |
|---|---|---|---|---|
| Q35 | Sales tax/GST | Missing | M | no tax field in schema |
| Q36 | Service charge | Missing | M | `backend/src/common/orderTotals.ts` |
| Q37 | Refunds after payment | Missing (cancel only, no refund record) | M | `order.service.ts` `cancelOrder` |
| Q38 | Split bill / split payment | Missing (one `paymentMethod` per order) | L | `schema.prisma` Order |
| Q39 | Shift closing / cash count | Missing | M | `BusinessDay` has no cash fields |
| Q40 | Expenses + profit | Partial (vendor PURCHASE entries shown as expenses/net on dashboard) | M | `analytics.service.ts:321` |
| Q41 | Customer khata | Missing (vendor ledger pattern reusable) | M | `backend/src/modules/vendor/` |
| Q42 | POS customer database | Missing (POS create takes no name/phone; `Customer` is for disabled accounts) | M | `order.controller.ts` createOrder |
| Q43 | Recipe inventory + wastage | Partial (many links per item; no wastage type; links per item, not per size/add-on) | M | `MenuItemInventoryLink`, `InventoryTxnType` |
| Q44 | Android printing, no PC | Missing (agent is Node on PC; browser print untested on Android) | L | `print-agent/` |
| Q45 | WhatsApp/SMS notifications | Partial (wa.me click-to-chat links only) | M | `online-frontend/src/lib/config.ts` |
| Q46 | Owner dashboard <400px | Partial (mobile shell exists; charts at 400px UNKNOWN) | S | `pos-frontend/src/components/shell/` |
| Q47 | Audit log | Partial (placedBy/acceptedBy/paymentVerifiedBy, `OrderChange`; cancel/discount/edits have no actor) | M | `schema.prisma` Order, OrderChange |
| Q48 | Multi-branch | Missing | XL | no branch/tenant field |

## G. Hosting and maintenance

Q49: UNKNOWN (not measured); probably fine at idle. Heavy: `sharp` accepts up to 50 MP inputs in memory (`backend/src/common/media/processImage.ts:26`), multer memory uploads up to 8 MB, `exceljs` builds workbooks in memory, in-memory rate limiters; 2 light timers.

Q50: Estimate ~0.3 GB without proofs (≈36.5k orders, ≈110k items, ≈20 MB images); payment proofs dominate at an assumed 150–300 KB each → +0.5–2 GB/yr depending on online-paid volume. Proof size per file UNKNOWN.

Q51: Proofs deleted only when the customer uploads a replacement; otherwise kept forever. The 6h purge deletes assets older than 24h referenced by no menu item, deal, category, gallery row, payment account or order proof (unattached uploads).
`backend/src/modules/media/media.service.ts` `purgeOrphanMedia`, `orphanPurge.job.ts`.

Q52: No.

Q53: No — `console.log/error` only.

Q54: No offline support — order POST fails with an error; cart is in-memory React state (only the area filter uses `sessionStorage`); direct and browser printing both need the cloud API. Waiter shell disables Send when offline.
`pos-frontend/src/context/TakerOrdersContext.tsx`, `pos-frontend/src/pages/newOrder/diningAreaFilter.ts:69`.

Q55: Yes, no code blocker. Friction: Postgres + Node install on Windows, POS Google Fonts (falls back to system fonts), customer site unusable offline, `sharp` native binary on that PC UNKNOWN.

## H. Quality and safety

Q56: 30 test files, 296 tests; 278 pass, 18 fail (`routes/orderStaffRoutesRoles.test.ts` 13, `routes/siteContentRoles.test.ts` 5 — 401 because `requireAuth` now queries the DB and the tests don't mock it). No tests: inventory, vendor, employee/payroll, businessDay, menu/category/addon/deal/kitchen CRUD, staff, auth, print, payment, sockets; frontends have 0 tests.
`backend/src/common/middlewares/auth.ts:51`.

Q57:
- backend: strict on (+`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `any` 1; `@ts-ignore` 0
- pos-frontend: strict **off** (`tsconfig.app.json` has no `strict`); `any` 0; `@ts-ignore` 0
- online-frontend: strict on; `any` 0; `@ts-ignore` 0
- print-agent: strict on (+ both extras); `any` 2; `@ts-ignore` 0

Q58: 6 TODO, 0 FIXME/HACK — all `TODO(owner)` placeholder marketing copy: `online-frontend/src/components/home/Hero.tsx:56`, `Sections.tsx:23`, `src/i18n/en.ts:16,64`, `src/i18n/ur.ts:16,64`.

Q59:
- Customer accounts: `backend/src/modules/customer/`, `customerAddress/`, `payment` `onlineOrderRouter`, `Customer`/`CustomerAddress` models
- `OrderSource.PHONE`: 0 creators
- `IN_KITCHEN`/`READY` order statuses: 0 writers
- `DealComponent`: 0 writes in `src` (seed only); legacy `DealItem` still the live path
- `/api/online/payment/*` admin endpoints: no POS caller
- `pos-frontend/src/pages/PagePlaceholder.tsx`: unreferenced
- `/uploads` static + `Order.paymentScreenshotUrl`: legacy (`backend/src/app.ts`)

Q60: Yes — numbering (advisory lock per business day + `MAX+1`), order, lines and stock deduction run in one `prisma.$transaction`; `@@unique([businessDayId, orderNumber])` backstop. Same number only across different business days (by design).
`backend/src/modules/order/order.service.ts:867-990`.

Q61:
1. No backup mechanism; all data and images in one Postgres
2. `cancelOrder` has no status check, no actor, no restock — a paid/completed order can be cancelled silently and leaves sales (`order.service.ts` `cancelOrder`)
3. Sales count orders regardless of `paymentStatus` — unpaid PENDING orders count as revenue (`backend/src/modules/reports/salesDefinitions.ts:17`)
4. Discounts uncapped and not attributed to a user (`updatePaymentStatus`, `acceptOrder`)
5. Payroll month uses UTC, not Karachi (`backend/src/modules/employee/payroll.service.ts:61`)

Q62:
1. `scripts/create-admin.js` defaults `admin` / `ChangeMe123!`, and re-running resets an existing account's password and role
2. Socket handshake verifies JWT only, not `isActive` — deactivated staff keep live feeds up to 12h (`backend/src/config/socket.ts:112`)
3. Staff JWT in `localStorage` — exposed to any XSS (`pos-frontend/src/auth/session.ts`)
4. `/uploads` served without auth (legacy payment screenshots) (`backend/src/app.ts`)
5. Rate limits in-memory per process; none on `/api/pos` beyond login; no minimum length check on `JWT_SECRET` (`backend/src/common/middlewares/rateLimit.ts`, `backend/src/config/env.ts`)

Q63: All behind `requireAuth` except `POST /auth/login` and `GET /health` (public by design). Auth but no role check (any staff incl. KITCHEN/ORDER_TAKER): `GET /kitchens`, `/kitchens/:id`, `/categories`, `/categories/:id`, `/menu`, `/menu/:id`, `/addons`, `/addons/:id`, `/deals`, `/deals/:id`.
`backend/src/modules/{kitchen,category,menu,addon,deal}/*.routes.ts`.

## I. Verdict

Q64:
1. Fix the 18 failing tests; turn on strict mode in pos-frontend — S
2. Add module flags to config (`SiteSettings` or a client-config table) plus `GET /api/pos/config` read at POS start — M
3. Gate backend routers by flag, same pattern as `customerAccountsGate` — S
4. Gate `NAV_ITEMS`, routes and New Order controls by flag — M
5. Move branding (name, logo, colours, receipt header/footer, currency, timezone) from code into config; one theme source for both frontends — M/L
6. Make order-flow rules configurable: reception gate, POS order completion, business day mode — M
7. Fix money/audit gaps: guarded cancel with restock and actor, discount attribution, paid-vs-unpaid in sales — M
8. Demo seed for all roles, tables, inventory and ~60 days of history, plus a one-command reset — M
9. Provisioning script, version endpoint and changelog — M/L
10. Scheduled backups and error monitoring — S/M
