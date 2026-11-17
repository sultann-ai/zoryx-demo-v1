# Online ordering site — requirements, decisions and Claude Code prompts

Brand on the logo: **Zoryx — Demo restaurant — Zoryx.**
Companion file: `ONLINE_SITE_BRIEF.md` (palette from your logo, typography, UX rules). Save it as `docs/ONLINE_SITE_BRIEF.md` before you run any prompt.

---

## 1. Requirements, organised

### 1.1 Audience and principles
- Ordinary, low-literacy customers, on cheap Android phones and slow mobile data.
- **Urdu first** (right-to-left) with an English toggle. Pictures and icons before words.
- No customer login, no passwords, no captchas, no dropdowns.
- A phone number to call is always visible.

### 1.2 Customer website (two pages, plus an order status link)
**Page 1 — Home (`/`)**
- Hero with a looping drone video of the city, logo, tagline, open/closed pill, big "Order now" and "Call us" buttons.
- Why Zoryx (4 icon cards), popular items, how to order (3 steps), gallery, testimonials, find us (address, map button, hours, delivery areas, call and WhatsApp), footer with social links.
- Floating WhatsApp button and a sticky "Order now" bar on phones.

**Page 2 — Menu (`/menu`)**
- Categories, item cards with photos and prices, size picker, add-ons, deals (including "choose your pizzas" deals), cart bar, checkout, payment instructions.
- Open-price items such as cakes show "Ask price on WhatsApp" instead of Add.

**Order status link (`/order/:publicId`)** — where the customer lands after ordering and can come back to from WhatsApp. It is part of ordering, not a third content page.

### 1.3 Order flow (no account)
1. Choose items. 2. Enter name and phone, tap your delivery area, then house and street (remembered on that phone for next time). 3. Choose cash on delivery or online payment. 4. Place order and receive a short order code (for example `K7P2M`).
5. The order appears in the **reception inbox** in the POS. Reception reviews it and accepts it (kitchens get it, stock is deducted, receipts print) or rejects it with a reason the customer can see.

### 1.4 Payment (my simple rule)
- **Cash on delivery:** nothing to do online.
- **Online:** the order is placed first, then the order page shows: Step 1, send the exact amount to the shop's Easypaisa / JazzCash / bank account (title and number with a big Copy button, and the QR image); Step 2, a green WhatsApp button that opens a chat with a message already typed (order code and amount) for the customer to attach the payment screenshot to.
- The shop WhatsApp is a **business number, not a group**.
- Reception matches the screenshot to the order by the code, then confirms the money in the real wallet or bank app before pressing "Verify payment and send to kitchen".

### 1.5 Store admin (inside the POS, existing login)
- Menu photos, Urdu names/descriptions, "Show online" and "Popular" switches.
- Store settings (shop info, WhatsApp, hours, announcement, accept-orders switch).
- Delivery areas, each with its own delivery fee and minimum order.
- Payment accounts (with QR images), gallery, testimonials.
- Reception inbox additions: order code, "find by code", Urdu reject reasons.

### 1.6 Backend additions
- Media: staff upload photos, the server optimises them and stores them in your own Postgres, served with long caching.
- Public read endpoints: store content and an enriched menu.
- Public guest order endpoint, with abuse protection, and a public order status endpoint.
- Customer-account routes switched off.

### 1.7 Non-functional
- Fast on slow data (small JS, small images, conditional video).
- Accessible, RTL-correct, large tap targets.
- No third-party CMS, no analytics, no third-party scripts.
- Hosting: the website on Vercel, the backend and database on Railway.

### 1.8 Not in version 1
Customer accounts, order history by login, card or wallet payment gateway, discount codes, live delivery tracking, pickup option (planned as the first addition after launch), search box, push notifications, an installable app (PWA).

---

## 2. Decisions I made for you, and why

| Question | Decision | Why |
|---|---|---|
| Customer accounts | None. Guest checkout. Details remembered on the phone. | Matches your goal. Accounts are what lose low-literacy customers. |
| Payment | Order first, pay after. COD or online; online shows account number (Copy) + QR, then WhatsApp for the screenshot. | A phone can't scan a QR shown on its own screen, so the number with a Copy button must come first. Placing the order first means the shop sees it immediately. |
| WhatsApp group vs number | A **business number**. | A `wa.me` link opens a chat with a pre-typed message to one number; a group invite link only lets people join a group. A group can't carry the order code message, and members of a WhatsApp group can see each other's phone numbers, which you don't want between customers. Staff can still forward screenshots into an internal group. |
| Photos without a CMS | Staff upload from the POS; the server resizes to WebP (about 120 KB full, 45 KB thumbnail) and stores them **in your own Postgres**. | No extra service, backed up with your database dumps, survives redeploys. Railway containers lose local files on redeploy, and Hobby has no self-serve volume backups. 150 photos is about 10 MB. |
| Where admin lives | A new "Online store" section in the POS you already use. | The public site has no login code at all (smaller attack surface), and staff learn one system. |
| Hero video and brand files | Files in the repo (Vercel serves them). You swap them when needed. | They change rarely. Video plays only on good connections, poster otherwise. |
| Language | Urdu first, English toggle, Urdu names for menu items and categories. | Photos help, but many customers can only read Urdu. Needs a native proofread (the plan includes a strings file). |
| Abuse | Rate limits, a hidden honeypot field, per-phone limits, and reception approving every order. No captcha. | A captcha would block your customers; the reception gate means a fake order never reaches a kitchen. |
| Deals and cakes | Choice-slot deals supported with a guided chooser. Open-price cakes link to WhatsApp for the price. | Deals are usually the best sellers online; open prices can't be set by customers. |
| Delivery fee, minimum order | **Per delivery area**, edited by the owner in the POS. The customer taps their area at checkout. | Fairer than one flat fee, and the customer sees the right fee before ordering. |
| Address | Structured: area (tap), house/flat number, street/mohalla, nearby landmark. | Riders find houses faster in a town without clear addresses. |

### 2.1 Patterns borrowed from Cheezious

Cheezious runs on Blink, a white-label ordering platform. These are the patterns from it that are worth taking, and what happens to each in this plan.

| Their pattern | For you | Verdict |
|---|---|---|
| Fee and minimum order per delivery area | Area chips at checkout, each with its own fee | **Adopt.** Fairer than one flat fee, and fewer "too far" rejections. Built into Prompts A, B, C, F and G. |
| Structured address (house, street, area) | Replace your single address box | **Adopt.** Riders find houses faster in a town without clear addresses. Built into Prompts B and G. |
| Pickup as an order type | Already on your "later" list | **Adopt soon.** Cheap to add. First item in section 8. |
| Pre-orders | Your POS scheduled orders | **Already planned.** Expose it online later (section 8). |
| Real-time status updates | Your order status page | **Already planned** (Prompt G). |
| Auto-accept | Reception approves every order | **Skip.** Manual approval is your fake-order defence. |

---

## 3. Before you start (Step 0, no prompt)

**Dependencies on the POS (important):**
- The **reception inbox** must exist (the "order takers and reception inbox" plan). Prompt B stops if it doesn't, because without it a guest order would go straight to a kitchen.
- The sizes, add-ons and deals work from the pre-launch plan should be in place. The prompts adapt to what exists and tell you what's missing.

**Do now:**
1. Save `ONLINE_SITE_BRIEF.md` as `docs/ONLINE_SITE_BRIEF.md`.
2. Put your logo at `online-frontend/src/assets/logo.png` (create the folder if needed).
3. Confirm the brand spelling with the owner (Zoryx / Zoryx) and get a higher-resolution or vector logo if the designer has one.
4. Decide the **shop WhatsApp business number** (WhatsApp Business is free) and make sure reception can see that chat on a phone or WhatsApp Web.
5. Get the payment details: Easypaisa / JazzCash / bank account title and number, and the QR images from the apps.
6. Decide delivery fee, minimum order, areas served, opening hours.

**Collect in parallel (the site works with placeholders until you have them; see section 5):** item photos, drone footage, gallery photos, real testimonials, Urdu names.

---

## 4. The prompts

Run from the repo root, in order, one at a time: **A, B, C (backend and POS admin), then D to H (the website)**. Test after each, and commit after each. Use **Plan mode** for A, B and D.

### Prompt A — Backend: photos and store content  · Plan mode

```text
Plan mode first. Run from the repo root. Read the current menu, category, deal, order-parsing, public online routes (GET /api/online/menu and /deals), upload/static-file setup, auth middleware, and Prisma schema before planning. Tell me what already exists that overlaps with this (for example Urdu name fields, sortOrder, an existing settings table).

Goal: give the public customer website everything it needs from the backend apart from ordering: menu photos managed by staff (no third-party CMS, no files on disk), Urdu names, and store content (settings, payment accounts, gallery, testimonials). Photos live in our own Postgres so they are backed up with it and survive redeploys.

Schema (additive only, one migration, consistent with the existing schema):
- MediaAsset: id (uuid), kind (enum MediaKind: MENU_ITEM, DEAL, GALLERY, PAYMENT_QR), mimeType, width, height, sizeBytes, createdAt, createdById (nullable FK StaffUser). MediaBlob (1:1 with MediaAsset, keyed by the same id): full (Bytes), thumb (Bytes, nullable). Keep the bytes in the separate MediaBlob table so metadata queries can never accidentally load image data. Select MediaBlob only in the media-serving route.
- MenuItem: imageId (nullable FK MediaAsset, onDelete SetNull), nameUr (nullable), descriptionUr (nullable), isFeatured (Boolean, default false). Add sortOrder if it doesn't exist. Category: nameUr (nullable), sortOrder if missing. Deal: imageId (nullable FK), nameUr, descriptionUr (nullable).
- SiteSettings: a single row (id fixed to 1) with: shopNameEn, shopNameUr, taglineEn, taglineUr, phone, whatsappNumber (digits only, international format, e.g. 923001234567), addressEn, addressUr, mapUrl, openingHoursEn, openingHoursUr (free text), announcementEn, announcementUr (nullable banner text), onlineOrderingEnabled (Boolean, default true), facebookUrl, instagramUrl, tiktokUrl (nullable), updatedAt, updatedById. Create the row with sensible placeholder values on first boot or in the migration if it doesn't exist (for example shop name "Zoryx").
- DeliveryArea: id, nameEn, nameUr, deliveryFee (Decimal(10,2), default 0), minOrderAmount (Decimal(10,2), default 0), sortOrder, isActive. Each area has its own fee and minimum order.
- PaymentAccount: id, label (for example "Easypaisa", "JazzCash", "Bank"), accountTitle, accountNumber, qrMediaId (nullable FK MediaAsset), sortOrder, isActive.
- GalleryImage: id, mediaId (FK), captionEn, captionUr (nullable), sortOrder, isActive.
- Testimonial: id, name, area (nullable), text, textUr (nullable), rating (nullable Int 1-5), sortOrder, isActive.

Image processing (add the `sharp` dependency and tell me about it):
1. POST /api/pos/media (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN), multipart with fields `file` and `kind`. Memory storage only (no disk). Accept jpeg, png and webp, max 8 MB; anything else is a 400 with a readable message. Never trust the client's mime type: let sharp read the real format.
2. For MENU_ITEM, DEAL and GALLERY: auto-rotate from EXIF, strip all metadata (including GPS), centre-crop to 4:3 with sharp's "attention" smart crop, and output WebP: full 1000x750 (quality about 80) and thumb 480x360 (quality about 75). Results should typically be under 120 KB (full) and 45 KB (thumb); if larger, lower the quality until they fit.
3. For PAYMENT_QR: never crop and never use lossy compression. Output PNG, scaled down only if the longest side is over 1200 px, no thumb.
4. Returns { id }. DELETE /api/pos/media/:id (same roles). When a photo is replaced (for example a menu item gets a new photo), delete the old asset in the same transaction so storage doesn't grow.
5. Public GET /api/online/media/:id?size=thumb|full (no auth): stream the bytes with the right Content-Type, Cache-Control: public, max-age=31536000, immutable, and an ETag (answer If-None-Match with 304). 404 for unknown ids. Ids are random uuids and replaced photos get new ids, so immutable caching is safe. Make sure another domain (the website on Vercel) can display these images: relax helmet's crossOriginResourcePolicy for this route only.

Admin endpoints (roles SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN; KITCHEN and ORDER_TAKER get nothing):
6. Menu: extend the existing menu update (or add PATCH /api/pos/menu/:id/online-info) to accept imageId, nameUr, descriptionUr, isFeatured and the existing isAvailableOnline; the same for categories (nameUr, sortOrder) and deals (imageId, nameUr, descriptionUr). Validate that imageId points to an asset of the right kind. ONLINE_ADMIN may edit only these online-facing fields, never prices or kitchens.
7. GET/PUT /api/pos/online-store/settings for the SiteSettings row. Validate: whatsappNumber digits only and 11-15 long, URLs start with https://, fee and minimum non-negative.
8. CRUD under /api/pos/online-store/delivery-areas, /payment-accounts, /gallery and /testimonials (with simple sortOrder updates). Limits: at most 30 active delivery areas, 4 active payment accounts, 24 gallery images, 12 testimonials (400 beyond that). Fees and minimums are non-negative. Deactivate rather than delete an area that past orders used.

Public endpoints (no auth, rate limited per IP at a sane level; Cache-Control: public, max-age=60 for the store and menu responses):
9. GET /api/online/store: shop details, tagline, address, mapUrl, hours, active delivery areas (id, nameEn, nameUr, deliveryFee, minOrderAmount, in sortOrder), announcement, phone, whatsappNumber, social links, active payment accounts (label, accountTitle, accountNumber, QR image URL), active gallery images (thumb and full URLs, captions), active testimonials, plus computed orderingOpen (true only when onlineOrderingEnabled AND a business day is currently active) and closedReason ("switched_off" | "no_business_day" | null).
10. GET /api/online/menu: extend the existing response and keep the existing fields. Categories ordered by sortOrder with nameEn/nameUr. Items with: name, nameUr, description, descriptionUr, imageThumbUrl, imageFullUrl (null when no photo), isFeatured, a fixed price or variants (id, label, price), add-ons available per variant, isOpenPrice (the website shows "ask on WhatsApp"), and orderable (false for anything that can't be ordered online). Deals with: name, nameUr, description, descriptionUr, price, image URLs and their components in the same shape the POS deal chooser uses (fixed items, choice slots with the eligible items), only deals that are online-available and orderable. Never return unavailable items, costs, staff data, or anything not meant for customers.

Tests (if a backend test suite exists): upload rejects non-images and oversized files; EXIF rotation and metadata stripping work; a QR stays PNG and uncropped; replacing a photo deletes the old asset; the public media route sends cache headers and answers 304; ONLINE_ADMIN can't change prices; KITCHEN and ORDER_TAKER can't upload; /store computes orderingOpen correctly; the public menu never includes unavailable items.
Update the AS_BUILT docs sections you touched. Tell me every new dependency and env var.
```

**Check (curl/Postman):** upload a photo as admin and note the id. Open `/api/online/media/<id>?size=thumb` in a browser: you see the image, and a reload answers 304. `GET /api/online/store` shows `orderingOpen: false` before you start a business day and `true` after. After linking the photo to a menu item, `/api/online/menu` shows its image URLs.

### Prompt B — Backend: guest checkout and order status  · Plan mode

```text
Plan mode first. Run from the repo root. Read the current online order route (POST /api/online/orders and the payment routes), the shared item/deal parser and pricing code, the order creation service, the Socket.io emit helpers, the reception inbox code (AWAITING_RECEPTION, accept/reject, GET /api/pos/orders/incoming), the settings from the previous prompt, and the rate-limit/helmet setup before planning.

HARD DEPENDENCY: this needs the reception inbox (an AWAITING_RECEPTION status, accept and reject endpoints, and online orders gated behind accept). If it isn't in the code, STOP and tell me. Do not let a guest order reach a kitchen directly.

Goal: customers order WITHOUT an account. The public website posts an order, it lands in the reception inbox, and payment proof for online payment arrives on WhatsApp (not uploaded to the site), so the public endpoint accepts no files at all. Reception matches the WhatsApp screenshot to the order by a short code.

Schema (additive only):
- Order.publicId (nullable String, unique): a random URL-safe token of at least 22 characters, used only in the customer's status link. Order.publicCode (nullable String, unique): 5 characters from the alphabet 23456789ABCDEFGHJKMNPQRSTUVWXYZ (no look-alike characters), shown to the customer and used in the WhatsApp message; generate with a collision retry. Add Order.customerName, Order.customerPhone, Order.deliveryFee (Decimal(10,2), default 0) and Order.clientRequestId only if they don't already exist.

Endpoints
1. POST /api/online/guest-orders (public, no auth). Body: { clientRequestId (uuid), items: [{ menuItemId, variantId?, quantity, addOnIds? }], deals: [{ dealId, quantity, choices? }], customer: { name, phone, deliveryAreaId, house, street, landmark? }, notes?, paymentMethod: "CASH" | "ONLINE", website } where `website` is a honeypot field real users never fill.
   - Validate strictly with a schema; reject unknown fields; limit the JSON body to 50 KB.
   - Ordering must be open: if orderingOpen is false return 409 { code: "ORDERING_CLOSED", error }.
   - name 2-60 chars. phone: accept 03XXXXXXXXX, +923XXXXXXXXX or 923XXXXXXXXX (ignore spaces and dashes), store it normalised as 03XXXXXXXXX, otherwise 400 { code: "BAD_PHONE" }. deliveryAreaId must be an active delivery area, otherwise 400 { code: "BAD_AREA" }. house 1-60 chars, street 2-120 chars, landmark up to 100 chars. Build deliveryAddress from them as "House <house>, <street>, <area name>" plus a new line "Landmark: ..." when given, and store the area on the order (Order.deliveryAreaId, nullable FK, additive). Every validation failure returns a stable machine-readable `code` plus an English `error`, because the website shows its own Urdu text for each code.
   - Items and deals go through the SAME shared parser and server-side pricing as every other order route (sizes, add-ons, deal rules, choice slots). Only items and deals that are online-available can be ordered. Open-price items and anything not orderable online are rejected. Max 40 lines, quantity 1-50 per line, order total capped at 200,000. If the items total is below the chosen area's minOrderAmount return 400 { code: "BELOW_MINIMUM", minOrderAmount }. Add the chosen area's deliveryFee to the order as Order.deliveryFee and to totalAmount (total = items + deals + deliveryFee).
   - Create the order as source ONLINE, type DELIVERY, status AWAITING_RECEPTION, customerId null, customerName/customerPhone/deliveryAddress from the form, paymentMethod as chosen, paymentStatus PENDING for CASH and AWAITING_VERIFICATION for ONLINE, with a publicId, a publicCode, and the next orderNumber of the active business day (same concurrency safety as other orders). NO kitchen emit and NO inventory deduction (both happen when reception accepts). Emit `order:submitted` to pos-admin exactly like other awaiting orders.
   - Idempotency: the same clientRequestId returns the existing order (200) instead of creating a second one.
   - Abuse protection: rate-limit by IP (for example 5 order attempts per 10 minutes and 30 per day, 429 { code: "TOO_MANY" }). Also refuse a phone number that already has 3 orders still AWAITING_RECEPTION, or more than 10 orders in 24 hours. If `website` (the honeypot) is non-empty, return a normal-looking success response but create nothing. Do NOT add a CAPTCHA: the people using this site must never be asked to solve one. Reception reviewing every order is the main protection.
   - Response: { publicId, publicCode, orderNumber, total, deliveryFee, paymentMethod, status }.
2. GET /api/online/orders/:publicId (public): the customer's status page data. Return publicCode; a customer-facing status (AWAITING_RECEPTION -> RECEIVED; PENDING or CONFIRMED -> CONFIRMED; IN_KITCHEN -> PREPARING; READY -> READY; COMPLETED -> DELIVERED; CANCELLED -> CANCELLED); cancelReason (only when cancelled; it is the reason entered by staff); paymentMethod; a customer-facing payment state (NOT_REQUIRED for cash; WAITING_FOR_PAYMENT while AWAITING_VERIFICATION; PAYMENT_CONFIRMED when VERIFIED; PAYMENT_PROBLEM when REJECTED); the lines (name, variant label, quantity, line total; deals with their contents); subtotal, deliveryFee, total, createdAt. NEVER return the phone, the address, staff names, internal ids or notes. 404 for unknown tokens. Rate-limit lookups (about 60 per minute per IP). Cache-Control: no-store.
3. The website does not use customer accounts. Put the existing customer signup/login/addresses routes and the JWT-based POST /api/online/orders behind an env flag ENABLE_CUSTOMER_ACCOUNTS (default false; they return 404 when off), so there is no unused public signup surface.
4. The reception inbox, order detail, Orders list, receipts and print documents must show guest orders properly: customer name, phone (tap-to-call), address, the publicCode, and "Payment: waiting for WhatsApp screenshot" for ONLINE orders not yet verified. Read customer info from the Order fields (guest orders have no Customer row). Add a "find by code" lookup, for example GET /api/pos/orders/incoming?code=K7P2M (or a filter on the existing list) for POS_ADMIN and SUPER_ADMIN.
5. CORS: the website's origin(s) must be allowed through the existing CORS_ORIGIN setting (comma-separated). Document it.

Tests (if a backend test suite exists): a guest order lands AWAITING_RECEPTION with no kitchen emit or stock change; totals include the chosen area's delivery fee; an inactive or unknown area is rejected; below-minimum and closed-store are rejected with the right codes; phone normalisation; a duplicate clientRequestId returns the same order; phone and IP limits; the honeypot creates nothing; open-price and online-unavailable items are rejected; the status endpoint hides private fields and maps statuses; accepting a guest ONLINE-payment order requires paymentVerified; customer-account routes return 404 when the flag is off.
Update the AS_BUILT docs sections you touched.
```

**Check (curl/Postman, with a business day started):** post a guest order. It shows in the reception inbox with its code, the kitchen sees nothing, and `GET /api/online/orders/<publicId>` returns "RECEIVED" without any phone or address. Accept it in the POS: the kitchen gets it and the status becomes "CONFIRMED". Post the same `clientRequestId` twice: one order. Stop the business day: the next order is refused with `ORDERING_CLOSED`.

### Prompt C — POS app: the "Online store" admin section

```text
Frontend (the POS app in pos-frontend/src). Run from the repo root. Read the app shell/nav, the Menu screens, the Incoming orders inbox, the shared components and tokens, and the API hooks first. Reuse what exists. The backend endpoints from the previous two prompts are in place.

Goal: staff manage everything the customer website shows, from the POS they already use. No new login, no third-party CMS.

1. New nav group "Online store" (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN only) with these pages:
   a) "Menu photos and names": a grid of menu items (and deals) showing photo or placeholder, name, an Urdu name field, an Urdu description field, a "Show online" switch, a "Popular" star switch, and an Upload/Replace photo button (a file input accepting images; on phones it offers camera and gallery). Resize the picked image in the browser to at most 1600 px on the long side before uploading (canvas), so phone uploads are quick on slow data. Show upload progress and clear errors. Add a filter "Missing photo" and a progress line "37 of 52 items have photos". Category Urdu names are editable at the top. Edits save per row (no giant save button) with a visible "Saved" tick. Include a short tip box: "Photo tips: daylight, plain background, shoot from above or slightly angled, same style for every item, food only".
   b) "Store settings": a form in clear sections: shop name and tagline (English and Urdu), phone, WhatsApp number (hint: "92300... digits only, no + and no leading zero"), address (English/Urdu), Google Maps link, opening hours text, announcement banner text, social links. At the top, a big switch "Accept online orders" with a live status line from /api/online/store: "Customers can order now" or "Customers cannot order: switched off / the business day hasn't started". Show a preview of the WhatsApp link it will generate.
   c) "Delivery areas": list/add/edit/hide with English and Urdu names, delivery fee and minimum order for each, and up/down buttons to set the order customers see them in. Hiding an area removes it from the website without touching past orders.
   d) "Payment accounts": list/add/edit/deactivate (label, account title, account number, optional QR image with preview), up to 4. Note: "Use the QR image your bank or wallet app gives you. We store it exactly as uploaded."
   e) "Gallery": upload several photos at once, optional captions, up/down buttons to reorder (no drag-and-drop library), show/hide, delete with confirmation.
   f) "Testimonials": add/edit/hide/delete (name, area, text, Urdu text, stars). Helper text: "Only use real reviews, with the customer's permission."
   g) A button "Open customer website" using VITE_ONLINE_SITE_URL (add it to .env.example).
2. Incoming orders (reception inbox): for online orders show the publicCode large, the customer's name/phone/address, and "Payment: waiting for WhatsApp screenshot" (amber) or "Cash on delivery". Add a "Find by code" box at the top of the inbox (type 5 characters; it shows or focuses the matching order). The Reject modal for online orders offers quick reasons in Urdu and English (for example: "Outside our delivery area", "Item not available", "Payment not received", "Cannot reach you by phone") and states "The customer will see this reason on their order page".
3. Every list and grid must work on a phone (the app's existing mobile conventions). No dropdowns anywhere (use button groups). Use the existing design tokens and shared components.
4. Role rules: ONLINE_ADMIN sees only the Online store group and Incoming orders. Hide everything else for that role.
Update the AS_BUILT frontend doc sections you touched.
```

**Check:** upload photos for three items from your phone, fill the settings, add a payment account with a QR image, and open `/api/online/store` and `/api/online/menu` to see it all there. Place a guest order and find it with "Find by code".

### Prompt D — Website foundation  · Plan mode

```text
Run from the repo root. Plan mode first. Create the customer website in online-frontend/ (if the folder already has code, tell me what's there before touching it). First read docs/ONLINE_SITE_BRIEF.md completely: it defines the audience, the logo-derived palette, typography and the UX rules. Follow it exactly. Read pos-frontend/ (the POS app) only to match conventions for API access; do NOT copy its design system, the customer site has its own brand.

Goal: the technical and visual foundation of the website, with no real content yet.
1. Stack: Vite + React + TypeScript, react-router-dom, @tanstack/react-query, Tailwind with the brand palette as theme tokens/CSS variables from the brief. No UI kit library. No i18n library: write a tiny typed translation helper (one file per language, ur.ts and en.ts, same keys, a t(key) hook and a LanguageProvider). Keep dependencies minimal and tell me about every one you add.
2. Language: Urdu is the default (lang="ur", dir="rtl"). English is one tap away through a large toggle in the header on every page, remembered in localStorage. Switching updates lang and dir on <html>. Use logical CSS properties (margin-inline, padding-inline, text-align: start) so the layout flips correctly. Directional icons (arrows, chevrons) must mirror in RTL. Numbers and prices always use Western digits ("Rs 1,450").
3. Fonts: self-host with Fontsource (no Google Fonts requests at runtime): Noto Nastaliq Urdu for Urdu, plus the Latin families named in the brief, subset to what's needed, font-display: swap, preloading only the one or two critical files. Urdu text needs a generous line-height (about 2) and a minimum body size of 18px; verify nothing is clipped.
4. Logo and icons: I will put logo.png in online-frontend/src/assets/. Trim its transparent padding to the badge (the badge is roughly the box (65,31)-(493,465) of a 530x471 image). With a one-off script using sharp as a devDependency, produce: a square trimmed logo.webp at 512 and 256, a favicon.ico, 192 and 512 PNG icons, and a 1200x630 og-image.jpg (logo centred on the forest-green brand colour). The source is only about 430 px wide, so never display the logo larger than about 220 CSS px.
5. App shell: a sticky top bar (small logo, shop name in the current language, language toggle, a prominent "Order now" button on the landing page and a "Menu / Home" link on the menu page), a footer placeholder, a floating WhatsApp button (whatsappNumber from GET /api/online/store), and a skip-to-content link. Routes: "/" (Home), "/menu" (Menu), "/order/:publicId" (order status page), and a friendly 404, each a placeholder rendering inside the shell for now. Lazy-load each route so the landing page doesn't download the menu code.
6. API layer: a small typed client using VITE_API_URL; react-query defaults suited to slow connections (staleTime 60s, retry 2, no refetch on window focus except for the order status page); a global slim banner "No internet connection / انٹرنیٹ نہیں ہے" when offline; friendly Urdu/English error and empty states; loading skeletons instead of spinners.
7. SEO and sharing: index.html with the shop title and description (Urdu and English), Open Graph and Twitter tags using the og-image, theme-color set to the forest green, canonical URL from VITE_SITE_URL, a <noscript> message in Urdu and English telling people to enable JavaScript or call (read the phone number from one constant I can edit), robots.txt and a two-page sitemap.xml.
8. Vercel: vercel.json with SPA rewrites to index.html, long-cache headers for hashed assets, and basic security headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy). Do not add a Content-Security-Policy yet (a later step does).
9. online-frontend/CLAUDE.md: the stack, the brief's rules in short form (Urdu-first RTL, no login, no dropdowns, big targets, photos and icons first, tiny bundles), the commands, and "never use localStorage for anything except language, cart, saved details and last order code".
10. .env.example: VITE_API_URL, VITE_SITE_URL. Scripts: dev, build, preview, lint, typecheck.
Finish by running build, lint and typecheck, and report bundle sizes per route (gzip).
```

**Check:** `npm run dev`. The shell shows your logo, Urdu is the default, the toggle flips the whole layout to English left-to-right, and `/menu` loads as its own chunk.

### Prompt E — Home page

```text
Frontend in online-frontend/. Read docs/ONLINE_SITE_BRIEF.md and the foundation you built first. Build the "/" Home page. All visible text goes through the translation files (Urdu and English). Data comes from GET /api/online/store and GET /api/online/menu (react-query), with skeletons, and sections that have no data are hidden gracefully.

Hero (full viewport height using svh, readable at 360 px wide):
- Background: a looping drone video of the city, muted, playsInline, no controls, covering the hero, with a forest-green gradient overlay strong enough that the text always meets the brief's contrast numbers. Source files live at online-frontend/public/media/hero.webm, hero.mp4 and hero-poster.jpg. If they don't exist yet, create small placeholder files and tell me exactly what to replace; I'll supply the real footage.
- Smart loading: show the poster first (it is the LCP element: preloaded, explicit dimensions). Start the video only after the page is interactive. Do NOT load or play it when the user has data saver on, prefers reduced motion, or the connection is slow (navigator.connection effectiveType 2g or slow-2g, or saveData). Pause it when it's scrolled out of view or the tab is hidden. If it fails to load, silently keep the poster. Use preload="metadata" and a <source> list with webm first, then mp4. No audio track, ever.
- Content: the logo badge (max about 200 px), the shop name, the tagline, an open/closed pill from the store data ("Open - ordering available" / "Ordering closed - opens at ..." using closedReason and the hours text), and two big buttons: "Order now" (gold, links to /menu) and "Call us" (tel: link with a phone icon). Announcement banner text from the store data, if any, above the hero.

Sections below the hero, in this order, each with a short heading, icons and lots of breathing room:
1. "Why Zoryx": 4 icon cards (for example tea made in the matka, fast food made fresh, home delivery, clean kitchen). Use placeholder wording in the translation files and mark each string with a TODO comment for me to confirm with the owner. Don't invent claims such as awards, years in business, or numbers.
2. "Our popular items": a horizontally scrolling strip (CSS scroll-snap, no carousel library) of items where isFeatured is true: photo, name, price, and a button to /menu. Hide the section if there are none.
3. "How to order": 3 big steps with icons: 1 Choose your food, 2 Enter your name, phone and address, 3 Pay cash on delivery or online. Short Urdu sentences.
4. "Gallery": a grid of the gallery photos (thumbs, lazy-loaded). Tapping a photo opens a simple full-screen viewer (close button, next/previous buttons). Hide if empty.
5. "What our customers say": testimonials in a scroll-snap row with the name, area and stars; use the Urdu text when the language is Urdu and one exists. Hide if empty.
6. "Find us": the address text, a big "Open in Google Maps" button (mapUrl), opening hours, the delivery areas with their fees (from the store data), and big Call and WhatsApp buttons. No embedded map iframe (it's heavy on slow connections).
7. Footer: logo, social icons (only those that have URLs), a copyright line with the brand name as printed on the logo, and a link to /menu.
- A sticky bottom "Order now" bar on phones once the hero has scrolled out of view.
Style: follow the brief's palette and the logo's vintage feel: cream and forest-green sections alternating, thin gold rule lines, a subtle ornamental divider echoing the logo's rope ring (a tiny inline SVG). No stock-template look, no stock illustrations, no gradients on every element.
Performance: initial JS for this route at most about 120 KB gzip; images lazy-loaded with width and height set; no layout shift. Verify and report.
```

**Check:** on your phone on Wi-Fi the video plays under the text. In Chrome DevTools, set Network to "Slow 3G" and reload: the poster shows and the video doesn't start. Switch to English: everything flips.

### Prompt F — Menu page and cart

```text
Frontend in online-frontend/. Read docs/ONLINE_SITE_BRIEF.md first. Build the "/menu" page and the cart. Data comes from GET /api/online/menu and /api/online/store.

Menu page
1. Header strip: shop name, the open/closed state, the announcement. If orderingOpen is false: still show the full menu, but disable the Add buttons and show a calm banner with the reason and the opening hours; the cart stays editable.
2. Category chips: a sticky, horizontally scrollable row of big chips (Urdu names when the language is Urdu, falling back to English). "Deals" first if any exist. Tapping a chip scrolls to that section, and the active chip follows the scroll position. No dropdowns, no search box.
3. Item cards in a 2-column grid on phones (1 column under 340 px): photo (thumb, 4:3, lazy, with a branded placeholder when there is no photo), name in the current language (falling back to English), a short description (2 lines max), the price in maroon, and a big Add button. Fixed-price items: tapping Add puts 1 in the cart and turns the button into a "- 1 +" stepper. Sized items show "from Rs X" and Add opens the item sheet. Open-price items (isOpenPrice, for example cakes) show "Ask price on WhatsApp", which opens a wa.me link to the shop's WhatsApp number with a prefilled message naming the item. Items with orderable = false are not shown.
4. Item sheet (bottom sheet): large photo, name, description, a row of big size buttons (label and price each, one pre-selected), add-on toggles for the chosen size if any (with prices), a quantity stepper, and a full-width "Add to order - Rs X" button. Close by tapping outside or the X; trap focus; Escape closes.
5. Deals: cards with photo, name, description, price. A deal with no choice slots adds directly. A deal with choice slots opens a guided sheet: one section per slot titled in plain words ("Choose 2 pizzas"), the eligible items as photo tiles with + and - counters, a clear "1 of 2 chosen" indicator, and the Add button disabled until every slot is complete.
6. Cart: persisted in localStorage (a versioned key; ignore stored data if its shape is invalid). Lines keyed by item + variant + add-ons (+ deal choices). A sticky bottom bar whenever the cart is not empty: item count, estimated total, and a big "View my order" button. The cart sheet lists each line with its photo, name, size, add-ons, price and a quantity stepper; removing a line (quantity to 0) shows a short "Undo" toast. Show the subtotal and a line "Delivery fee depends on your area (from Rs X)" using the lowest active area fee; the exact fee and the area's minimum order are applied at checkout once the customer taps their area. The "Continue" button hands over to checkout (built in the next prompt; for now it can go to a placeholder).
7. Show a small banner "Your last order: K7P2M - view" if localStorage has a recent order code (the next prompt sets it).
8. Everything through the translation files. Image alt text = item name. 48 px tap targets. Check at 360 px and 320 px widths, in Urdu and English (RTL and LTR). Report the route's bundle size.
```

**Check:** add a plain item, a sized pizza with an add-on, and a choice deal. Reload: the cart is still there. Open the page with ordering closed: Add is disabled and the reason is shown.

### Prompt G — Checkout, payment instructions and order status

```text
Frontend in online-frontend/. Read docs/ONLINE_SITE_BRIEF.md and the cart code first. Build checkout, the payment instructions and the order status page. The backend endpoints POST /api/online/guest-orders, GET /api/online/orders/:publicId and GET /api/online/store exist (read their code to match the exact shapes and error codes).

Checkout (a full-screen sheet opened from the cart; one scrolling screen, not a multi-step wizard):
1. Your order: a compact read-only summary with the total.
2. Your details: Name; Phone (type="tel", inputMode="numeric", placeholder 03XX XXXXXXX); then "Your area" as large tappable chips (Urdu name first, with "Delivery Rs X" under each; required; no dropdown); then House / flat number; Street / mohalla; "Nearby landmark" (optional, with a hint like "near the mosque / school"); "Special instructions" (optional). As soon as an area is tapped, update the delivery fee and total in the summary, and if the subtotal is below that area's minimum, show how much more is needed and disable Place order. Use autocomplete attributes (name, tel, address-line1, address-line2). After a successful order, save the details on this phone in localStorage and prefill them next time, with a small "Clear my saved details" link. Inline validation next to each field in plain Urdu/English with an icon, never colour alone.
3. How will you pay? Two large selectable cards (radio semantics) with icons: "Cash on delivery" and "Online payment (Easypaisa / JazzCash / bank)". Under Online payment, a one-line note: "You will see where to send the money after you place the order".
4. A big "Place order" button (disabled while sending, with progress). Generate one clientRequestId (uuid) per cart and reuse it on retry, so a double tap or a flaky connection can never create two orders. Include the honeypot field `website` as a hidden, non-focusable input. On network failure show "Could not send - try again" with a Retry button and the shop's phone number. Map every backend error `code` to a friendly Urdu/English message with the next step (ORDERING_CLOSED shows the hours; TOO_MANY says to call the shop; BAD_PHONE highlights the phone field; BELOW_MINIMUM shows the area's minimum; BAD_AREA asks them to choose their area again).
5. On success: clear the cart, store { publicId, publicCode } as "last order", and navigate to /order/:publicId.

Order page at /order/:publicId (also where the customer returns to):
6. A big check mark, "We received your order", and the order code in very large letters with the note "Please keep this code". A simple status timeline with icons: Received, Confirmed, Being prepared, Ready, Delivered. Poll the status endpoint every 20 seconds while the page is visible and the order isn't final; stop on Delivered or Cancelled. If CANCELLED, show the staff-entered reason in a calm box with a Call button and "Order again".
7. Cash on delivery: show "Pay Rs X in cash when your order arrives" and "We will call you to confirm".
8. Online payment, while the payment state is WAITING_FOR_PAYMENT, show this block prominently, step by step with numbers:
   - Step 1, "Send Rs X (the exact total)": for each active payment account show the label (Easypaisa, JazzCash ...), the account title, and the account number in large digits with a big "Copy number" button (navigator.clipboard with a fallback; confirm with a "Copied" toast). Below it, the QR image (tap to enlarge) with a note that on the same phone they can save the QR image and scan it from the gallery inside their payment app. The number and its copy button are the primary path, because a phone cannot scan a QR shown on its own screen.
   - Step 2, "Send the payment screenshot on WhatsApp": a big green WhatsApp button opening https://wa.me/<whatsappNumber>?text=<URL-encoded prefilled message in the current language that includes the order code and the amount, for example "Order K7P2M - Rs 1450 - payment screenshot">.
   - A sentence: "Your order will be confirmed after we receive your payment."
   - When the state becomes PAYMENT_CONFIRMED, replace the block with a green "Payment received". On PAYMENT_PROBLEM show "We could not confirm your payment - please call us" with a Call button.
9. Always visible on this page: a Call button, an "Order more" button and the shop's hours. Never show the customer's phone or address back on the page.
10. Edge cases: an unknown or expired link (404) shows a friendly message and a link to the menu; closed shop; a slow-network skeleton; the page must work when opened from a WhatsApp link on a cold start.
11. Everything in Urdu and English through the translation files; 48 px targets; test at 320 and 360 px, RTL and LTR. No third-party scripts, no analytics.
Report the bundle sizes.
```

**Check (local backend, business day started):** place a cash order and an online-payment order. The code shows large; for the online one, Copy works and the WhatsApp button opens a chat with the text typed. Accept the order in the POS: the status timeline moves within about 20 seconds. Reject one: the reason shows on the customer page.

### Prompt H — Polish, security headers, launch readiness

```text
Final hardening pass for online-frontend/ (and its connection to the backend). Do not add features.
1. Performance: run a production build and a Lighthouse mobile audit. If you can run Lighthouse here, do; otherwise give me the exact steps to run it in Chrome DevTools with "Slow 4G" and 4x CPU throttling. Targets for / and /menu: LCP under 2.5 s on Slow 4G, no layout shift, initial JS under about 150 KB gzip per route. Fix what you can (image sizes, preloads, font subsets, lazy sections) and report before and after.
2. Accessibility: do a keyboard-only walkthrough of placing an order; visible focus; labels on every input; error messages tied to their fields (aria-describedby) and announced; modals trap focus and restore it; contrast meets the numbers in the brief; 48 px targets; correct lang/dir switching; RTL mirroring of directional icons. Fix issues and list what remains.
3. Urdu review file: generate docs/ONLINE_SITE_STRINGS.md listing every Urdu string next to its English with its key, marking anything you wrote as machine-translated so a native speaker can proofread it before launch. Keep Urdu plain and spoken-style, as in the brief.
4. Content Security Policy in vercel.json: default-src 'self'; img-src 'self' data: blob: and the API origin; media-src 'self'; connect-src 'self' and the API origin; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' (only if needed); frame-ancestors 'none'; base-uri 'self'; form-action 'self'. Links to wa.me and tel: must still work. Test every page, language and feature (video, API images, the WhatsApp link, QR enlarge) with the policy on and fix violations. Keep the API origin in one place (substituted at build time, or documented clearly).
5. Resilience: what happens if the API is down, slow or returns 500 for /store and /menu? The landing page must still render with its static content, and /menu must show a friendly message with the shop's phone number (keep the phone as a constant fallback).
6. Privacy and safety: confirm the site stores nothing in localStorage except language, cart, saved details and last order; makes no third-party requests (check the network tab); shows no console errors; and ships no source maps in production.
7. Write online-frontend/README.md: how to run, the env vars, how to replace the hero video and poster (with the ffmpeg commands below), how to deploy on Vercel (a project from the monorepo with Root Directory online-frontend, the env vars, and the backend CORS_ORIGIN that must include the site's domain), and the manual QA script from my plan file as a checklist.
   ffmpeg commands to document:
   ffmpeg -i drone.mp4 -t 15 -vf "scale=1280:-2,fps=24" -an -c:v libx264 -crf 29 -preset slow -movflags +faststart hero.mp4
   ffmpeg -i drone.mp4 -t 15 -vf "scale=1280:-2,fps=24" -an -c:v libvpx-vp9 -b:v 0 -crf 40 hero.webm
   ffmpeg -i hero.mp4 -frames:v 1 -vf "scale=1280:-2" -q:v 4 hero-poster.jpg
   Targets: each video under about 3 MB, poster under 100 KB.
8. Report the final state and anything I must do by hand.
```

---

## 5. Content to prepare (start now, in parallel)

**Menu photos** (the site works with placeholders until they exist; do the top 20 sellers first)
- Daylight, plain background (a table or a clean plate on a cloth), shoot from above or slightly angled, same style for every item, food only, no hands, no watermark. Wipe the lens. Phone photos are fine.
- Upload from the POS "Menu photos" page; the server shrinks them.

**Urdu names and descriptions:** the name customers actually say aloud ("زنگر برگر"), and a one-line description. Have the owner or a staff member proofread.

**Drone video:** footage you or the owner shot, or properly licensed. About 15 seconds, steady and slow, ending where it started so the loop is smooth. Compress with the ffmpeg commands in Prompt H (about 3 MB or less each), and make a poster image. Put them in `online-frontend/public/media/` as `hero.mp4`, `hero.webm`, `hero-poster.jpg`.

**Gallery:** 8-12 photos of the food, the shop front and the interior.

**Testimonials:** 3-6 **real** ones (Google reviews, Facebook, or customers who agree), with name and area. Don't invent them.

**Payment:** account title and number for each wallet or bank, plus the QR images from the apps.

**Text decisions:** opening hours, the list of delivery areas (the names customers actually use, in Urdu and English) with a delivery fee and minimum order for each, announcement line if any.

---

## 6. Reception rules for online orders (teach the staff)

1. A new online order makes a chime and shows a card with its **code**.
2. **Cash on delivery:** if the address is unclear, phone the customer, then press Send to kitchen.
3. **Online payment:** wait for the WhatsApp message containing the code. Then **open the Easypaisa / JazzCash / bank app and confirm the money has really arrived with the right amount.** Screenshots can be faked, so never rely on the image alone. Only then press "Verify payment and send to kitchen".
4. If no payment arrives within about 20-30 minutes, reject it with "Payment not received".
5. If the customer is outside your area or an item is finished, reject with a reason. The customer sees it on their order page.

---

## 7. Launch checklist

1. Backend on Railway: all migrations applied; `CORS_ORIGIN` includes the website's domain(s); `ENABLE_CUSTOMER_ACCOUNTS` unset (off).
2. In the POS: settings filled in (shop info, WhatsApp number, hours), delivery areas added with their fees and minimums, at least one payment account with QR, menu photos and Urdu names for the main items, "Show online" on the items you want sold online, gallery and testimonials added.
3. Vercel: a **second** project from the same repo with Root Directory `online-frontend`; env vars `VITE_API_URL` (your Railway backend) and `VITE_SITE_URL`.
4. Domain: the customer website gets the root domain, the POS stays on its subdomain. Add the domain in Vercel and create the DNS records it shows you at your registrar.
5. Start a business day. `orderingOpen` becomes true and the site accepts orders.
6. **Manual QA on a real cheap Android phone on mobile data (not Wi-Fi):**
   - Open the site from a WhatsApp link. Landing loads quickly; the language toggle works.
   - Order one plain item with cash on delivery, and one sized item plus a deal with online payment.
   - Check that Copy works, the QR opens large, and the WhatsApp button opens a chat with the code typed.
   - Accept and reject orders from the POS and watch the customer page update.
   - Switch off "Accept online orders" and confirm the site shows the closed message.
   - Try with the data-saver mode on and confirm the video does not play.
7. Have a native Urdu speaker proofread `docs/ONLINE_SITE_STRINGS.md`.
8. Do a restore test of your database backup once before real customers arrive: photos and store content are in the database now.

---

## 8. Later (when version 1 is running)
Pickup option (first, cheap to add), pre-orders for a later time online (reusing the POS scheduled orders), search, "reorder my last order" by phone number, Foodpanda-style delivery status (rider on the way), a payment gateway once the shop has a merchant account, push or WhatsApp notifications to customers, an installable app, order-volume analytics.
