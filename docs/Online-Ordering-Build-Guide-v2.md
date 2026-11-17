# Online ordering — build guide v2 (matched to the as-built POS)

This replaces Prompts A–H in `Online-Ordering-Site-Plan.md`. The requirements, decisions and the Cheezious patterns (delivery areas, structured address) in that file still apply; **the prompts to run are the ones here**, because they are written against what the AS_BUILT docs say your code actually does today.

---

## 1. Where the code lives: same repository, new folder

```
zoryx-demo/
├── backend/           Express + Prisma API  → Railway (unchanged)
├── pos-frontend/          POS app               → Hostinger, pos.zoryx.dev
├── online-frontend/   NEW customer website  → Hostinger, zoryx.dev
└── docs/              AS_BUILT_BACKEND.md, AS_BUILT_FRONTEND.md, ONLINE_SITE_BRIEF.md
```

**Why the same repo:** the website talks only to `backend/`, and half the modules below change the backend and the website together. In one repo, Claude Code can read the real API code while building the website, and one commit keeps both sides in step. In a separate repo it would be guessing at API shapes.

**Rules**
- Keep it as it is today: no root `package.json`, no workspaces. Each folder builds on its own.
- `online-frontend/` never imports from `pos-frontend/`. Copy a small helper if you need one. The two apps have different brands and users.
- All API changes go in `backend/`.
- Work on a branch per module (for example `online/m3-guest-checkout`), merge to `main`, and deploy by merging to `release`.

**Hosting**
- Hostinger: create a second **Web App** from the same GitHub repo, with root directory `online-frontend`, branch `release`, and env `VITE_API_URL` and `VITE_SITE_URL`. Connect it to `zoryx.dev` and `www.zoryx.dev`.
- Railway: add `https://zoryx.dev,https://www.zoryx.dev` to `CORS_ORIGIN`.
- Optional: in the Railway service settings, set watch paths to `backend/**` so website-only commits don't redeploy the backend.

---

## 2. What your as-built docs changed in the plan

| Finding in the docs | What it means |
|---|---|
| The Incoming Orders inbox already exists, and online orders already land `AWAITING_RECEPTION` with accept/reject and a payment-screenshot thumbnail. | The POS side of "online orders come to reception for approval" is mostly done. Module 4 only adds small things. |
| Online ordering today requires a customer **password account** and a saved free-text address, and uploads the screenshot with the order. | We add a new **guest checkout** endpoint (Module 3). Accounts come later with WhatsApp login (Module 11). |
| Uploaded payment screenshots are saved to the server's **local disk**, which Railway wipes on every redeploy (backend doc §9). | Screenshots move into Postgres, the same way as menu photos (Modules 2 and 3). |
| `Order` has no customer name/phone, delivery fee, area or public code. | Added in Module 3. |
| **No rate limiting and no security headers** anywhere (backend doc §6). | Module 1 fixes this before anything public goes live. |
| `Order.status` never reaches READY or COMPLETED. | The customer's status page derives "preparing / ready / on the way" from item statuses and rider assignment, and reception gets a "Mark delivered" button (Modules 3 and 4). |
| `MenuItem.imageUrl` exists but nothing uploads images. | Module 2 adds photo upload, stored in Postgres. |
| Choice-slot deals (`DealComponent`) have no API for editing. | The website shows those deals only if the order API can already take them; Module 7 checks. |
| `ONLINE_ADMIN` has no home page in the POS. | Module 4 gives it one. |

---

## 3. Before you start
1. Save `ONLINE_SITE_BRIEF.md` as `docs/ONLINE_SITE_BRIEF.md`.
2. Put the logo at `online-frontend/src/assets/logo.png`.
3. Decide and write down:
   - the WhatsApp business number;
   - payment accounts (title, number, QR image);
   - opening hours;
   - **delivery areas**, each with a fee and minimum order.
4. Start collecting in parallel: food photos, drone video, gallery photos, real testimonials, Urdu names for items and categories. The site works with placeholders until you have them.

---

## 4. Modules, in order

| # | Module | Where |
|---|---|---|
| 1 | Public-safety baseline | backend |
| 2 | Photos, store content, delivery areas | backend |
| 3 | Guest checkout, order code, status page API | backend (+ small POS display changes) |
| 4 | "Online store" admin section and inbox additions | POS frontend |
| 5 | Website foundation | online-frontend |
| 6 | Home page | online-frontend |
| 7 | Menu and cart | online-frontend |
| 8 | Checkout, payment, order status | online-frontend |
| 9 | Polish and launch | online-frontend + deploy |
| — | **Launch here** | |
| 10 | Fake-order defences | backend + POS |
| 11 | Customer accounts with WhatsApp login | backend + online-frontend |
| 12 | Later: pickup, online pre-orders | both |

Run one module at a time, test it, commit, then move on. Use **Plan mode** for 1, 2, 3, 5 and 11.

---

### Module 1 — Backend: public-safety baseline · Plan mode

```text
Plan mode first. The customer website will soon call this backend from the public internet. Read the auth/security section of docs/AS_BUILT_BACKEND.md and the relevant code, then harden the public surface. Don't change unrelated behaviour.
1. Real client IPs: the backend runs behind Railway's proxy. Configure Express trust proxy correctly (check which header Railway sets, e.g. X-Real-IP / X-Forwarded-For) so per-IP limits see real visitors, not the proxy. Add a tiny debug log or test proving it.
2. Rate limiting: staff login and customer auth endpoints (about 10 attempts per 15 minutes per IP), plus a general per-IP limit for /api/online/*. Respond 429 with { code: "TOO_MANY", error }. In-memory is fine for these; order-placement limits will live in Postgres in a later module.
3. Security headers with helmet, configured so the two websites on other origins keep working. JSON body limits (about 100 KB generally, 50 KB for /api/online).
4. A rejected upload file type must return a clean 400, not the generic 500.
5. Put the existing password-based customer routes (signup, login, addresses, and the JWT-based POST /api/online/orders) behind an env flag ENABLE_CUSTOMER_ACCOUNTS, default false (404 when off). The website starts with guest checkout; accounts come in a later module.
6. Enforce a minimum password length of 8 for staff passwords created or reset from now on.
Unit-test what's pure; verify the rest with a script against the local dev DB as usual. Update the AS_BUILT backend doc and list new env variables.
```

**Check:** hammer the login endpoint 11 times and get 429. POS login and every POS screen still work. `/api/online/auth/login` returns 404.

### Module 2 — Backend: photos, store content, delivery areas · Plan mode

```text
Plan mode first. Read docs/AS_BUILT_BACKEND.md (menu, deal, category, online routes, upload setup) and the code before planning; tell me what already exists that overlaps (for example MenuItem.imageUrl).

Goal: everything the customer website needs that isn't ordering: staff-uploaded photos stored in our own Postgres (not on disk; Railway wipes local files on redeploy), Urdu names, store content and delivery areas.

Schema (additive only, one migration):
- MediaAsset (id uuid, kind enum: MENU_ITEM, DEAL, GALLERY, PAYMENT_QR, PAYMENT_PROOF; mimeType, width, height, sizeBytes, createdAt, createdById nullable) and MediaBlob (1:1, same id: full Bytes, thumb Bytes nullable). Bytes live only in MediaBlob, selected only by the serving route.
- MenuItem: imageId (nullable FK, onDelete SetNull), nameUr, descriptionUr, isFeatured (default false), sortOrder if missing. Leave the existing imageUrl untouched. Category: nameUr, sortOrder if missing. Deal: imageId, nameUr, descriptionUr.
- SiteSettings (single row, id 1): shop names and taglines (En/Ur), phone, whatsappNumber (digits, international format e.g. 923001234567), addresses (En/Ur), mapUrl, opening hours text (En/Ur), announcement (En/Ur, nullable), onlineOrderingEnabled (default true), social URLs. Create the row on first boot with placeholders (shop name "Zoryx").
- DeliveryArea: nameEn, nameUr, deliveryFee, minOrderAmount (Decimal(10,2), default 0), sortOrder, isActive.
- PaymentAccount: label (e.g. Easypaisa, JazzCash, Bank), accountTitle, accountNumber, qrMediaId (nullable), sortOrder, isActive.
- GalleryImage (mediaId, captions En/Ur, sortOrder, isActive) and Testimonial (name, area, text, textUr, rating 1-5 nullable, sortOrder, isActive).

Media (add `sharp`):
1. POST /api/pos/media (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN), multipart file + kind, memory storage, jpeg/png/webp up to 8 MB, real format checked by sharp. Photos (MENU_ITEM, DEAL, GALLERY): auto-rotate, strip all metadata, smart-crop 4:3, WebP full 1000x750 (~80) and thumb 480x360 (~75), shrinking quality until roughly under 120 KB / 45 KB. PAYMENT_QR: never crop, PNG, only downscale past 1200 px. Replacing a photo deletes the old asset in the same transaction.
2. Public GET /api/online/media/:id?size=thumb|full: correct Content-Type, Cache-Control public, max-age=31536000, immutable, ETag + 304, 404 if unknown, cross-origin resource policy relaxed for this route only so the website can show the images.

Admin (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN; ONLINE_ADMIN may change only online-facing fields, never prices or kitchens):
3. Set imageId, nameUr, descriptionUr, isFeatured, isAvailableOnline on items; nameUr/sortOrder on categories; imageId/nameUr/descriptionUr on deals.
4. GET/PUT settings, and CRUD for delivery areas (max 30 active; deactivate instead of delete once used), payment accounts (max 4 active), gallery (24) and testimonials (12).

Public (no auth, rate limited, Cache-Control public max-age=60):
5. GET /api/online/store: settings, active delivery areas (id, names, fee, minimum, in order), active payment accounts with QR URLs, gallery with image URLs, testimonials, plus computed orderingOpen (true only when onlineOrderingEnabled AND a business day is active) and closedReason ("switched_off" | "no_business_day" | null).
6. Extend GET /api/online/menu and /api/online/deals (keep existing fields): Urdu names/descriptions, image thumb/full URLs (null if none), isFeatured, categories with Urdu names in sortOrder, variants with prices and add-ons per variant, and an `orderable` flag. Never return costs, staff data or unavailable items.
Tests for media processing, roles, and the public endpoints not leaking anything. Update the AS_BUILT backend doc and list new dependencies.
```

**Check:** upload a photo as admin and open its thumb URL in a browser; a reload answers 304. `/api/online/store` shows `orderingOpen: false` before Start Day and `true` after.

### Module 3 — Backend: guest checkout, order code, status page API · Plan mode

```text
Plan mode first. Read the online order route, the shared item/deal parsing and pricing, createOrder, the reception review flow (AWAITING_RECEPTION, accept, reject), the payment routes and the socket emits before planning. Reuse them; don't duplicate pricing.

Goal: a customer orders WITHOUT an account. The order lands in the existing Incoming Orders inbox as AWAITING_RECEPTION, exactly like today's online orders; nothing reaches a kitchen or touches stock until reception accepts.

Schema (additive): Order.customerName, Order.customerPhone, Order.deliveryAreaId (nullable FK), Order.deliveryFee (Decimal, default 0), Order.publicId (nullable, unique, random URL-safe ≥22 chars, for the customer's status link), Order.publicCode (nullable, unique, 5 chars from 23456789ABCDEFGHJKMNPQRSTUVWXYZ, collision retry), Order.paymentProofMediaId (nullable FK to MediaAsset).

1. POST /api/online/guest-orders (public, JSON, strict validation, unknown fields rejected): { clientRequestId (uuid), items, deals, customer: { name, phone, deliveryAreaId, house, street, landmark? }, notes?, paymentMethod: "CASH" | "ONLINE", website (honeypot) }.
   - orderingOpen must be true, else 409 { code: "ORDERING_CLOSED" }.
   - name 2-60; phone accepts 03XXXXXXXXX / +923XXXXXXXXX / 923XXXXXXXXX (spaces/dashes ignored), stored as 03XXXXXXXXX, else 400 BAD_PHONE; area must be active, else 400 BAD_AREA; house 1-60, street 2-120, landmark ≤100. deliveryAddress = "House <house>, <street>, <area>" plus "Landmark: ..." on a new line.
   - Items/deals through the same shared parsing and server pricing as the existing online route (no open-price items, no deal customization, only online-available things). Max 40 lines, quantity 1-50, total cap 200,000. Below the area's minimum → 400 { code: "BELOW_MINIMUM", minOrderAmount }. Add the area's fee as deliveryFee into totalAmount.
   - Create via createOrder: source ONLINE, type DELIVERY, status AWAITING_RECEPTION, customerId null, paymentStatus PENDING for CASH and AWAITING_VERIFICATION for ONLINE, with publicId and publicCode. Same order:submitted emit as today.
   - Idempotent on clientRequestId. Per-IP limits (about 5 per 10 minutes, 30 per day) and per-phone limits (3 still awaiting, 10 per 24 h), counted in Postgres so they survive deploys; 429 { code: "TOO_MANY" }. A filled honeypot returns a normal-looking success and creates nothing. No CAPTCHA.
   - Response: { publicId, publicCode, orderNumber, total, deliveryFee, paymentMethod, status }.
2. POST /api/online/orders/:publicId/payment-proof (public, multipart, one image ≤5 MB): only for ONLINE orders still awaiting verification; stored through the media system as PAYMENT_PROOF (replacing an earlier one); rate limited. The Incoming Orders thumbnail must read it. Also move the existing screenshot handling off local disk onto this storage.
3. GET /api/online/orders/:publicId (public, Cache-Control no-store, rate limited): publicCode; a customer-facing status derived from the order and its items: AWAITING_RECEPTION → RECEIVED; accepted → CONFIRMED; any item PREPARING → PREPARING; every item READY or SERVED → READY; READY with a rider assigned → ON_THE_WAY; COMPLETED → DELIVERED; CANCELLED → CANCELLED with the staff reason. Payment state: NOT_REQUIRED (cash), WAITING_FOR_PAYMENT, PROOF_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_PROBLEM. Lines (name, size, add-ons, quantity, line total; deals with contents), subtotal, deliveryFee, total, createdAt. NEVER return phone, address, staff names, internal ids or notes.
4. POST /api/pos/orders/:id/delivered (POS_ADMIN, SUPER_ADMIN): sets COMPLETED for an accepted order (409 otherwise, never for CANCELLED). Check that dashboards, reports, End Day and filters treat COMPLETED as a finished, counted order, and fix anything that doesn't.
5. Guest orders must display properly everywhere staff see orders: Incoming card, Order detail, Orders list, receipts, kitchen tickets and print-agent documents show name, phone, address, area, delivery fee and the publicCode, reading from the Order fields when there's no Customer row. Add GET /api/pos/orders/incoming?code=K7P2M (find by code).
6. Document that CORS_ORIGIN must include the website's origins.
Tests for validation, pricing with delivery fee, limits, honeypot, idempotency, status derivation and privacy of the status endpoint; verify the DB-bound flow with a script (guest order → inbox → accept → kitchen) as usual. Update the AS_BUILT docs.
```

**Check (local, business day started):** post a guest order. It appears in Incoming with its code and the kitchen sees nothing; the status endpoint says RECEIVED with no phone or address. Accept it: the kitchen gets it and the status becomes CONFIRMED.

### Module 4 — POS: "Online store" section and inbox additions

```text
Frontend (pos-frontend/). Read the shell/nav, Menu screens, Incoming Orders, Order detail, shared components and API hooks first; reuse them and the existing design tokens. Backend endpoints from the previous modules exist.

1. New nav group "Online store" (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN):
   a) "Menu photos and names": grid of items and deals with photo/placeholder, Urdu name and description fields, "Show online" and "Popular" switches, Upload/Replace photo (phone camera or gallery; downscale to 1600 px in the browser before upload; progress; clear errors). Filter "Missing photo", a progress line ("37 of 52 have photos"), Urdu category names at the top, per-row saving with a "Saved" tick, and a photo-tips box.
   b) "Store settings": sections for shop info (En/Ur), phone, WhatsApp number (format hint), address, map link, hours, announcement, social links; a big "Accept online orders" switch with a live line from /api/online/store ("Customers can order now" / "Cannot order: switched off / business day not started").
   c) "Delivery areas": add/edit/hide/reorder (up/down buttons) with Urdu and English names, fee and minimum order.
   d) "Payment accounts": up to 4, with QR image upload and preview.
   e) "Gallery" (multi-upload, captions, reorder, hide, delete) and "Testimonials" (with "Only real reviews, with permission").
   f) "Open customer website" button using VITE_ONLINE_SITE_URL (add to .env.example).
2. ONLINE_ADMIN: give it a home route (the Online store section) and Incoming Orders; hide everything else.
3. Incoming Orders and Order detail for online orders: the publicCode large; name, tap-to-call phone, area and address; delivery fee; payment line ("Cash on delivery" / "Waiting for payment" amber / "Proof received" with the screenshot thumbnail). A "Find by code" box at the top of Incoming. The Reject modal for online orders offers quick reasons in Urdu and English ("Outside our delivery area", "Item not available", "Payment not received", "Cannot reach you by phone") and says "The customer will see this reason".
4. Order detail for accepted online delivery orders: a "Mark delivered" button (confirm dialog) calling the delivered endpoint.
Mobile-friendly, no dropdowns, existing components. Update the AS_BUILT frontend doc.
```

**Check:** upload three photos from your phone, add two delivery areas and a payment account, and see them in `/api/online/store`. Place a guest order and find it with "Find by code".

### Module 5 — Website foundation · Plan mode

```text
Plan mode first. Create the customer website in a new folder online-frontend/ at the repo root (a sibling of backend/ and pos-frontend/; independent package.json, no workspaces, never import from pos-frontend/). Read docs/ONLINE_SITE_BRIEF.md completely and follow it exactly. Look at backend/ for the real API shapes.

1. Stack: Vite + React + TypeScript, react-router-dom, @tanstack/react-query, Tailwind with the brief's palette as tokens. No UI kit. A tiny typed translation helper (ur.ts and en.ts with the same keys, a t(key) hook, a LanguageProvider) instead of an i18n library. Tell me every dependency.
2. Urdu by default (lang="ur", dir="rtl"); a large English/اردو toggle in the header on every page, remembered in localStorage; switching updates lang/dir on <html>; logical CSS properties; directional icons mirror; Western digits ("Rs 1,450").
3. Fonts self-hosted with Fontsource (Noto Nastaliq Urdu plus the Latin families in the brief), subset, swap, Urdu at ≥18 px with line-height about 2, nothing clipped.
4. Logo from src/assets/logo.png: trim its uneven transparent padding (the badge is roughly (65,31)-(493,465) of 530x471); with a one-off sharp script (devDependency) produce logo.webp 512/256, favicon, 192/512 icons and a 1200x630 og-image on the forest green. Never show it larger than about 220 CSS px.
5. Shell: sticky top bar (small logo, shop name, language toggle, "Order now" on home / "Home" on menu), footer placeholder, floating WhatsApp button (number from /api/online/store), skip link. Routes "/", "/menu", "/order/:publicId", 404, each lazy-loaded.
6. API client on VITE_API_URL; react-query tuned for slow connections (staleTime 60 s, retry 2, no refetch on focus except the order page); an offline banner; friendly errors; skeletons.
7. index.html: title/description (Urdu and English), Open Graph tags, theme-color, canonical from VITE_SITE_URL, a <noscript> message with the phone; robots.txt and sitemap.xml in public/.
8. Hosting is a Hostinger Web App, which builds the app itself and generates the routing file: do NOT add vercel.json or a hand-written .htaccess. Output stays in dist/.
9. online-frontend/CLAUDE.md with the stack, the brief's rules in short, the commands, and "localStorage only for language, cart, saved details and last order".
10. .env.example (VITE_API_URL, VITE_SITE_URL); scripts dev, build, preview, lint, typecheck. Finish with build, lint and typecheck, and report gzip size per route.
```

**Check:** `npm run dev` inside `online-frontend`. Urdu is the default, the toggle flips the whole layout, and `/menu` loads as its own chunk.

### Module 6 — Home page

Use **Prompt E** from `Online-Ordering-Site-Plan.md` unchanged, with one edit: in the "Find us" section, list the delivery areas with their fees from the store data. (Prompt E is already written against the same `/api/online/store` and `/api/online/menu` endpoints.)

**Check:** on Wi-Fi the video plays under the text. On "Slow 3G" in DevTools, only the poster shows.

### Module 7 — Menu and cart

Use **Prompt F** from `Online-Ordering-Site-Plan.md`, adding this sentence at the end: "Choice-slot deals (DealComponent) exist only through the seed and may not be orderable through POST /api/online/guest-orders; check the backend, show them with the guided chooser if they work, otherwise hide them and tell me."

**Check:** add a plain item, a sized pizza with an add-on and a deal; reload and the cart is still there.

### Module 8 — Checkout, payment and order status

Use **Prompt G** from `Online-Ordering-Site-Plan.md` with these changes:
- In "Your details", use the area chips plus house/street/landmark version (the delivery-areas edit made in that file).
- Replace payment Step 2 with: "Step 2, send us the payment screenshot: a big 'Upload screenshot' button (opens the gallery; posts to /api/online/orders/:publicId/payment-proof, shows the uploaded image and 'Received - we will check it') and, as an alternative, the green WhatsApp button with the prefilled code and amount."
- Use the status list from the backend: Received, Confirmed, Being prepared, Ready, On the way, Delivered (and Cancelled with reason), plus the payment states including PROOF_RECEIVED.

**Check:** place a cash order and an online order; upload a screenshot and see it in Incoming. Accept, mark preparing in the kitchen, assign a rider, mark delivered, and watch the customer page follow each step.

### Module 9 — Polish and launch

Use **Prompt H** from `Online-Ordering-Site-Plan.md` with these changes:
- Item 4 becomes: "Hostinger generates the server routing file, so set the Content-Security-Policy with a <meta http-equiv> tag in index.html (frame-ancestors can't be set that way; note it), allowing the API origin for connect-src and img-src."
- Item 7's deploy section becomes Hostinger: a Web App from this repo, root directory `online-frontend`, branch `release`, env `VITE_API_URL` and `VITE_SITE_URL`, domains `zoryx.dev` and `www`, and the backend `CORS_ORIGIN` update.

Then follow the launch checklist in section 7 of that file.

---

### Module 10 — Fake-order defences (after launch, once real orders flow)

```text
Add fake-order defences to online ordering using Postgres only (no new services). Additive migrations only.
1. Customer trust record per normalised phone: delivered orders, rejections, "Fake/prank" rejections, and a new delivery outcome "Customer refused / not found" (add it to the reject/cancel flows). Configurable strike counts flag, then block, a phone. Blocked phones get a neutral stable error code from the guest-order endpoint (the website shows "Please call us to order"), never the reason. A POS admin page to view, flag, block and unblock numbers.
2. A Low/Medium/High risk badge with reasons on every online order in Incoming and Order detail (new phone, first order, cash, high value, short address, odd hour, several orders from one device or IP, previous rejections), with a suggested action ("Call before accepting", "Ask for advance payment").
3. Rules in Online store settings: a COD cap for new customers, an optional "new customers must pay online", a high-value threshold, and auto-expiry of unpaid online-payment orders after N minutes (default 30) via a database-driven recurring job that rejects with "Payment not received". Enforce the COD cap server-side with stable error codes.
4. Bot checks: a minimum form fill time and a random device id from the website, limited server-side; store only a salted hash of IPs, kept 90 days.
Tests for strikes, blocking, risk reasons, COD cap and expiry; update docs and the website's Urdu strings.
```

### Module 11 — Customer accounts with WhatsApp login (after launch)

Needs a **new dedicated WhatsApp number** registered on the official WhatsApp Cloud API (Meta developer app, permanent token, webhook pointing at your Railway backend). Never automate the cafe's own WhatsApp app.

```text
Plan mode first. Replace the old password-based customer accounts with optional login through "message us on WhatsApp to log in" via the official WhatsApp Cloud API (no SMS, no unofficial WhatsApp libraries). Guest checkout keeps working unchanged. Reuse the existing Customer and CustomerAddress models (make passwordHash optional; extend addresses with deliveryAreaId, house, street, landmark, optional latitude/longitude, label HOME/WORK/OTHER).
1. Login: POST login/start creates a random code (like LOGIN 7K2P-9QX4), 5-minute expiry, single use, stored hashed, tied to a browser request id; returns the code and a wa.me link to WHATSAPP_LOGIN_NUMBER with the message prefilled. GET login/status polled by the browser. Webhook: verify Meta's handshake and the X-Hub-Signature-256 HMAC on every POST; match the code to the sender's WhatsApp number (normalised to 03XXXXXXXXX), find or create the customer, mark verified; idempotent by message id; optional one-line reply including "This logs you in on the device showing this code. If you didn't ask for it, ignore it."
2. Sessions: database-backed, token stored hashed, 180 days extended on use, httpOnly Secure SameSite=Lax cookie usable by the website on the main domain with the API on its subdomain (fall back to a bearer token only if the domains make cookies impossible; tell me which and why). me, logout, logout everywhere; CORS with credentials only for the website's origins.
3. Profile: my orders (including earlier guest orders with the same phone), reorder (re-validated against the current menu), addresses CRUD (max 5, default), delete my account (anonymise linked orders).
4. Guest-order endpoint: with a valid session, link the order, take the phone from the session, accept a saved addressId. Show any location pin as a Google Maps link in Incoming, Order detail and delivery slips.
5. Website: "Login with WhatsApp" (button plus a QR code on desktop, a waiting state with countdown, polling), name for new customers, a profile with My orders / My addresses (area chips, house, street, landmark, "Use my current location") / Me, saved-address cards at checkout, and expired sessions handled without losing the cart.
6. Env: WHATSAPP_LOGIN_NUMBER, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN. Remove ENABLE_CUSTOMER_ACCOUNTS once the old password routes are gone. Tests for signatures, codes, expiry, reuse, sessions, scoping and reorder. Additive migrations only.
```

### Module 12 — Later
- **Pickup:** an order type choice at checkout (no area, no fee), shown on the Incoming card.
- **Online pre-orders:** reuse the POS scheduled-orders backend so a customer can pick a later time today.
