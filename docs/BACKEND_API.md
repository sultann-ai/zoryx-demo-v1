Backend reference for a frontend builder
System shape
Two separate apps share one backend:

POS app (internal staff tool) — hits /api/pos/*, staff JWT auth
Online Ordering app (customer-facing storefront) — hits /api/online/*, customer JWT auth (except payment verification, which is staff-only and lives oddly under /api/online/payment/*)
Base URL: http://localhost:5000 in dev.

Auth — two independent JWT realms, do not mix them
Staff	Customer
Login	POST /api/pos/auth/login {username, password}	POST /api/online/auth/login {phone, password} (or /signup)
Token payload	{id, role, kitchenId}	{id, type:"customer"}
Roles	SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN, KITCHEN	n/a
Header	Authorization: Bearer <token> on every protected request	same
Customer routes (/api/online/auth/*, /api/online/addresses/*, POST /api/online/orders) are off by default and answer 404 unless the server sets ENABLE_CUSTOMER_ACCOUNTS=true — the public website starts with guest checkout. Every rate-limited endpoint answers 429 with {code:"TOO_MANY", error}: staff login and customer auth allow 10 attempts per 15 minutes per IP, /api/online/* about 300. JSON bodies are capped at 100 KB (50 KB under /api/online); staff passwords must be at least 8 characters.

A staff token is rejected on customer routes and vice versa — the frontend should keep two separate stored tokens/session states, never assume one covers both.

Conventions
All responses are JSON except: file upload (multipart/form-data) on order creation, and .xlsx binary downloads on export endpoints.
Errors are always { "error": "message" } with a proper HTTP status — render that message directly, no generic fallback text needed for most cases.
Money fields (price, totalAmount, discount, etc.) come back as strings (e.g. "550.00") — parse for display, never assume a JS number.
404 on a resource you don't own (e.g. another customer's address) is intentional — don't distinguish it from "doesn't exist" in the UI.
Critical UI-affecting business rules
No order can be created without an active BusinessDay. POS app needs a visible "Start Business Day" action gating the order screen when GET /api/pos/business-day/current returns null.
Never let the frontend compute or send a total. POST /orders only takes items: [{menuItemId, quantity}] — price/kitchen/total are all server-derived.
KITCHEN-role accounts are scoped to their own kitchen on the kitchen queue and item-status update — don't build a kitchen picker for that role, just use their token's kitchen.
Online orders: paymentMethod: "CASH" → order is CONFIRMED immediately. paymentMethod: "ONLINE" → requires a screenshot file upload, order sits PENDING / AWAITING_VERIFICATION until a staff member (ONLINE_ADMIN/SUPER_ADMIN) approves it via PATCH /api/online/payment/:orderId/verify or /reject.
Live kitchen tickets use Socket.io, not polling: connect with auth: { token: <staffJWT> } (refused with error.data.code "AUTH" if the account is inactive or its role/kitchen changed — log out on it; the server sends "auth:revoked" and disconnects when an account is deactivated, re-roled or has its password reset), then emit join with "kitchen:<kitchenId>" (kitchen role) or "pos-admin" (admins), and listen for order-item:new / order-item:updated.
DINE_IN orders only exist on the POS side — the online endpoint only accepts TAKEAWAY/DELIVERY, and DELIVERY requires a saved customerAddressId.
Endpoint reference
Staff Auth (/api/pos/auth) — public

POST /login — {username, password} → {token, staff}
Business Day (/api/pos/business-day) — POS_ADMIN, SUPER_ADMIN

GET /current · POST /start {label?} · POST /end {force?} — without force, 400 {code: UNPAID_ORDERS|OPEN_ORDERS, orderIds, openOrders:[{id,orderNumber,status,type,source,paymentMethod,paymentStatus,totalAmount,diningArea}], unpaidOrders:[{orderNumber,totalAmount}], unpaidTotal} while orders are open or unpaid
Kitchens (/api/pos/kitchens) — read: any staff · write: SUPER_ADMIN

GET / GET /:id POST / {name, isActive?} PUT /:id DELETE /:id
Staff (/api/pos/staff) — SUPER_ADMIN only

GET / GET /:id POST / {name, username, password, role, kitchenId?, employeeId?} PUT /:id DELETE /:id (deactivates, doesn't hard-delete)
Categories (/api/pos/categories) — read: any staff · write: POS_ADMIN/SUPER_ADMIN

GET / GET /:id POST / {name} PUT /:id DELETE /:id
Menu — POS: /api/pos/menu (read: any staff, write: POS_ADMIN/SUPER_ADMIN) · Online: /api/online/menu (public)

GET /?kitchenId= GET /:id POST / {name, description?, price, kitchenId, categoryId?, isAvailableInPOS?, isAvailableOnline?} PUT /:id PATCH /:id/online-availability {isAvailableOnline} (POS_ADMIN/SUPER_ADMIN/ONLINE_ADMIN) DELETE /:id
Online: GET / — only isAvailableOnline: true items, no auth
Dining Areas (/api/pos/dining-areas) — POS_ADMIN/SUPER_ADMIN (reads also ORDER_TAKER)

GET / GET /:id POST / {name, type: TABLE|FAMILY_HALL|GENTS_HALL, area?, capacity?} PUT /:id DELETE /:id
area: free-text room/section ("Family Hall") — trimmed, max 50, ""/null = none ("Other" on New Order); omit on PUT to leave unchanged
Employees (/api/pos/employees) — POS_ADMIN/SUPER_ADMIN

GET / POST / {name, designation, baseSalary, joiningDate, phone?} GET /:id PUT /:id DELETE /:id
POST /attendance {employeeId, date, status: PRESENT|ABSENT|LEAVE|HALF_DAY} · GET /attendance?startDate=&endDate=&employeeId=
POST /payroll {employeeId, month, year, allowance?, deduction?, advanceTaken?, paidAmount?} · GET /payroll/current-month
Orders (POS) (/api/pos/orders) — POS_ADMIN/SUPER_ADMIN (item-status also KITCHEN)

GET /?businessDayId=&status=&source=&diningAreaId=&export=xlsx
POST / {type, paymentMethod, diningAreaId?, items: [{menuItemId, quantity, notes?}], deals?: [{dealId, quantity, notes?}], discount?, discountReason?}
Discounts (create, accept, submission edit, payment-status): discountReason (1-200) required when the discount changes to above 0; non-SUPER_ADMIN capped at maxDiscountPercentPosAdmin % of items → 403 "Discount above X% needs a Super Admin"
notes: per-line kitchen note — trimmed, max 100 chars, blank = none (400 if longer)
GET /:id · GET /:id/events (audit trail: [{type, reason, before, after, createdAt, actorName}]) · PATCH /:id/cancel {cancelledReason (1-200)} — only PENDING/CONFIRMED/AWAITING_RECEPTION (409 NOT_CANCELLABLE otherwise), paid orders SA/PA only; returns stock once and emits order:cancelled {orderId, itemIds} to each kitchen · PATCH /:id/items/:itemId/status {status: PENDING|PREPARING|READY|SERVED}
PATCH /:id/items/:itemId/notes {notes: string|null} · PATCH /:id/deal-lines/:dealLineId/notes {notes: string|null} — order not cancelled/completed/awaiting reception/scheduled; pushes order-item:note-updated to the kitchen(s)
Scheduled orders: POST / with scheduledFor (ISO with zone, future, ≤ 24h) → status SCHEDULED, on hold (no Incoming, kitchen, stock, emit); released to AWAITING_RECEPTION automatically (job every 30s + on startup), exactly once
GET /scheduled · POST /:id/release · PATCH /:id/schedule {scheduledFor} · PUT /:id/scheduled-items {items, deals?} · POST /:id/cancel-scheduled {reason?} — 409 once no longer SCHEDULED
Business day end: 409 {code: "SCHEDULED_ORDERS_PENDING", scheduledOrders} while any are on hold (even with force)
Kitchen Queue — GET /api/pos/kitchen-queue?kitchenId= (POS_ADMIN/SUPER_ADMIN/KITCHEN)

Inventory (/api/pos/inventory) — POS_ADMIN/SUPER_ADMIN

GET /?lowStock=true POST / {name, unit, currentStock, minThreshold?, trackingType: AUTO|MANUAL} GET /:id PUT /:id DELETE /:id
POST /:id/adjust {type: STOCK_IN|STOCK_OUT|ADJUSTMENT, quantity, note?} (MANUAL items only)
GET/POST /links GET/PUT/DELETE /links/:id {menuItemId, inventoryItemId, quantityPerOrder}
Reports (/api/pos/reports) — POS_ADMIN/SUPER_ADMIN

Sales everywhere = orders not CANCELLED/AWAITING_RECEPTION/SCHEDULED AND paymentStatus VERIFIED (cash marked paid or online verified); unpaid accepted orders are reported separately, never in sales.
GET /dashboard — today's active business day only (adds unpaidCount/unpaidAmount, cancelledAfterPaymentCount/Amount)
GET /sales?from=&to=&groupBy=day|month
GET /export?type=daily|monthly&businessDayId= — binary xlsx
Customer Auth (/api/online/auth) — public

POST /signup {name, phone, password, email?} · POST /login {phone, password}
Customer Addresses (/api/online/addresses) — customer JWT, self-scoped

GET / POST / {label?, addressText, isDefault?} GET /:id PUT /:id DELETE /:id
Online Orders — POST /api/online/orders (customer JWT)

JSON body for CASH: {type: TAKEAWAY|DELIVERY, paymentMethod: CASH, customerAddressId?, items}
multipart/form-data for ONLINE: fields type, paymentMethod=ONLINE, items (JSON-stringified), file field screenshot
Payment Admin (/api/online/payment) — staff JWT, ONLINE_ADMIN/SUPER_ADMIN

GET /pending · PATCH /:orderId/verify · PATCH /:orderId/reject
Suggested screens
POS app: Login → Dashboard (today's sales/orders/cancelled/top items) → Business Day bar (start/end) → Orders (list, create, detail w/ item statuses) → Kitchen Display (KITCHEN role) → Menu/Categories/Kitchens/Dining Areas management → Staff management → Employees + attendance grid + payroll → Inventory + low-stock alerts + adjust modal → Payment verification queue (ONLINE_ADMIN) → Reports + xlsx export buttons.

Online app: Signup/Login → Menu browse (public, no login needed) → Cart → Checkout (address picker for delivery, payment method toggle, screenshot upload if online payment) → Order status/history → Saved addresses.

Customer-website content (all public, no auth, rate limited; money fields are strings; image URLs are relative to the API origin — prefix your API base URL)
GET /api/online/store — settings, active deliveryAreas [{id,nameEn,nameUr,deliveryFee,minOrderAmount}], paymentAccounts [{id,label,accountTitle,accountNumber,qrUrl}], gallery [{id,captionEn,captionUr,image:{thumb,full}}], testimonials, plus orderingOpen and closedReason ("switched_off" | "no_business_day" | null). Cached 60s.
GET /api/online/menu — {categories:[{id,name,nameUr,sortOrder}], items:[{id,name,nameUr,description,descriptionUr,price,slug,categoryId,imageUrl,image:{thumb,full}|null,isFeatured,sortOrder,orderable,variants:[{id,label,price,sortOrder,addOns}]}]}. Only online-available items; no costs or staff fields. Cached 60s.
GET /api/online/deals — active, online-available deals with nameUr, image and orderable. Cached 60s.
GET /api/online/media/:id?size=thumb|full — the image itself (immutable, cached for a year, ETag/304). 404 for unknown ids.

Staff admin (SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN)
POST /api/pos/media (multipart: file + kind MENU_ITEM|DEAL|GALLERY|PAYMENT_QR) — JPEG/PNG/WEBP up to 8 MB; returns {id, urls}. Then attach it: PATCH /api/pos/menu/:id/online-content {imageId,nameUr,descriptionUr,isFeatured,isAvailableOnline,sortOrder}, PATCH /api/pos/categories/:id/online-content {nameUr,sortOrder}, PATCH /api/pos/deals/:id/online-content {imageId,nameUr,descriptionUr}. Replacing a photo deletes the old one. Any other field in those bodies (a price, kitchenId) is a 400.
GET/PUT /api/pos/site-settings (includes maxDiscountPercentPosAdmin, default 20 — only SUPER_ADMIN may change it); CRUD on /api/pos/delivery-areas (30 active), /payment-accounts (4), /gallery (24), /testimonials (12) — 409 when the active cap is exceeded.

Guest checkout — order without an account (public; errors are always {code, error}; money fields are strings)
POST /api/online/guest-orders — JSON {clientRequestId (uuid), items:[{menuItemId,quantity,variantId?,addOnIds?,notes?}], deals:[{dealId,quantity,notes?}], customer:{name,phone,deliveryAreaId,house,street,landmark?}, notes?, paymentMethod:"CASH"|"ONLINE", website:""}. Unknown fields are rejected. "website" is a honeypot: leave it empty. Prices are computed on the server. 201 {publicId, publicCode, orderNumber, total, deliveryFee, paymentMethod, status:"RECEIVED"}; a repeat of the same clientRequestId returns 200 with the same answer. Errors: 400 BAD_PHONE | BAD_AREA | BELOW_MINIMUM (+minOrderAmount) | ITEM_UNAVAILABLE | ORDER_TOO_LARGE | BAD_REQUEST, 409 ORDERING_CLOSED | REQUEST_ID_REUSED, 429 TOO_MANY. Phone: 03XXXXXXXXX, +923XXXXXXXXX or 923XXXXXXXXX. Max 40 lines, quantity 1-50, total 200,000. For delivery, send **either** `deliveryAreaId` (listed area: sets the fee and minimum) **or** `otherArea` (2-60 chars, the customer's own text when their area isn't listed: no fee, no minimum, no `deliveryAreaId` on the order; the address is stored as `"House .., Street, <otherArea> (area not listed)"` and staff confirm the fee by phone); both or neither is a 400.
GET /api/online/orders/:publicId — the customer's status page (never cached): {publicCode, status: RECEIVED|CONFIRMED|PREPARING|READY|ON_THE_WAY|DELIVERED|CANCELLED, cancelReason, payment:{method, state: NOT_REQUIRED|WAITING_FOR_PAYMENT|PROOF_RECEIVED|PAYMENT_CONFIRMED|PAYMENT_PROBLEM}, lines, subtotal, discount, deliveryFee, total, createdAt}. No phone, address or notes. 404 {code:"NOT_FOUND"} for an unknown link. Poll it while the customer watches.
POST /api/online/orders/:publicId/payment-proof — multipart, one image in field "file" (JPEG/PNG/WEBP, up to 5 MB), only for an ONLINE order still waiting for its payment to be verified (409 NOT_AWAITING_PAYMENT otherwise). A new upload replaces the earlier one. Returns {paymentState:"PROOF_RECEIVED"}.
CORS: the website's origin must be listed in the server's CORS_ORIGIN, or browsers block the POST.

Staff (POS app)
POST /api/pos/orders/:id/complete (POS_ADMIN, SUPER_ADMIN) — a paid PENDING/CONFIRMED order of any source/type -> COMPLETED, remaining items SERVED, kitchens get order:completed {orderId, itemIds}; 409 UNPAID until payment is confirmed, 409 NOT_COMPLETABLE otherwise. A POS TAKEAWAY marked paid completes automatically while SiteSettings.autoCompleteTakeawayOnPayment is true (default; SA/PA may change it).
POST /api/pos/orders/:id/delivered (POS_ADMIN, SUPER_ADMIN) — an accepted order is handed over -> COMPLETED; 409 NOT_DELIVERABLE otherwise.
GET /api/pos/orders/incoming?code=K7P2M — find a waiting guest order by its code.
GET /api/pos/orders/:id/payment-proof?size=thumb|full (POS_ADMIN, SUPER_ADMIN, ONLINE_ADMIN) — the guest's payment proof image (send the Bearer token; fetch as a blob).
