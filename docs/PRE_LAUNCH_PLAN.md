# Zoryx — Pre-launch plan

Built from your two as-built documents (backend + frontend, dated 2026-10-27). Goal: a version the cafe can test for real, then printer, then deploy, then hand to the client.

**How to use this file**
- Run every prompt from the **repo root** (`zoryx-demo/`), not from inside a subfolder. Some steps touch both `backend/` and `pos-frontend/`.
- The POS app lives in `pos-frontend/` and the customer site in `online-frontend/`; every path below uses those folder names.
- Do the steps **in order**. Later steps assume earlier ones are done.
- Use **Plan mode** where the step says so. Read the plan before approving it. These are the steps that touch order creation and pricing.
- After each step: do the 2-minute "Check", then `git commit` on your working branch. One commit per step means you can always go back.
- Each prompt is written to be pasted as-is. Where a line is optional, it is in [square brackets] and says when to delete it.

**Effort:** Steps 1, 3 and 4 are the big ones. The rest are small to medium.

---

## Step 0 — One-time setup (5 minutes, no prompt)

Add this block to the **root** `CLAUDE.md` (create it if it doesn't exist). Claude Code reads it at the start of every session, so you never repeat these rules in a prompt.

```markdown
## Working rules for this repo
- Folders: backend/ (Express + Prisma + Postgres), pos-frontend/ (React POS). Reference docs: docs/AS_BUILT_BACKEND.md and docs/AS_BUILT_FRONTEND.md (adjust path if they live elsewhere).
- Every schema change is additive (new tables, new nullable columns) through `prisma migrate dev`. Never edit an already-applied migration.
- Never run `prisma migrate reset`, `db push --force-reset`, or anything destructive unless DATABASE_URL clearly points at localhost. If it doesn't, stop and tell me.
- Money is Prisma.Decimal on the server. Never trust a price or total sent by the client.
- Never run git push, never change git remotes, never touch deployment settings. I commit and push myself.
- When you change behavior described in docs/AS_BUILT_*.md, update the matching section in the same task and tell me which sections you touched.
- Finish every task by running the backend build and the frontend build and lint, and report the result.
- Don't add a dependency without telling me why.
```

Then create your working branch for all of this: `git checkout -b prelaunch-fixes`. (See "Before you hand over the link" for why this matters.)

---

## Part 1 — Make the real menu sellable

The seeded menu has sized pizzas and choice-slot deals. Today the POS can't order a sized item at all, and the docs can't confirm that deals reach the kitchen. Nothing else matters if the cafe can't sell its own menu.

### Step 1 — Sized items (pizza sizes, half/full portions)  · Plan mode

```text
Plan mode first: read before editing and show me the plan.

Goal: make sized menu items orderable and editable. Today a sized MenuItem has price = null with the real prices on MenuItemVariant rows (see backend/prisma/seed-data/), createOrder rejects null-price items, there is no way to choose a size when ordering, and no way to edit a size's price in the UI.

Backend
1. Additive migration only: OrderItem.variantId (nullable FK to MenuItemVariant, onDelete SetNull) and OrderItem.variantLabel (nullable string snapshot, so history survives a variant being renamed or deleted).
2. Ordering rules, shared by POST /api/pos/orders, POST /api/pos/orders/:id/items and the online order route. Put the rule in the one shared parser/service, not three copies:
   - If the menu item has any variant with a non-null price, every requested line must include a variantId that belongs to that item and has a non-null price. unitPrice = that variant's price.
   - If the item has no priced variants, variantId must be absent and the existing MenuItem.price rule applies.
   - Items with sellableAlone = false, and variants with a null price, can never be ordered directly (they exist only inside deals).
   - Store variantId and variantLabel on the OrderItem. Totals stay server-side Decimal.
3. The menu GET endpoints (POS and online) return each item's variants (id, label, price, sortOrder), ordered by sortOrder.
4. New endpoints under /api/pos/menu/:id/variants (POS_ADMIN/SUPER_ADMIN): create, update (label, price, sortOrder), delete. Label unique per item. Deleting a variant still referenced by a DealComponent returns 409 with a clear message.
5. Inventory auto-deduction is unchanged (it keys on the menu item). Do not try to make it size-aware.

Frontend (pos-frontend/src/pages/NewOrderPage.tsx, pos-frontend/src/pages/newOrder/*, the menu items tab, order detail, print pages, Kitchen Display)
6. Menu grid: a sized item's tile shows "from Rs {lowest price}". Tapping it opens a compact size picker with one big button per size (label + price). Tapping a size adds that line immediately and closes the picker: no confirm step. Items without sizes stay one tap. Never show items that can't be ordered directly.
7. Cart lines are keyed by (menuItemId, variantId). The same item in two sizes is two lines. The line reads "Name · Large".
8. Show the size label everywhere an item name appears: cart, order detail, receipt, kitchen tickets, Kitchen Display, and any export that lists items.
9. Menu management: in the menu item form add a "Sold in sizes" switch. On: hide the single price field and show an editable list of sizes (label, price, order). Off: the single price field as today. Saving uses the new variant endpoints. No dropdowns.
10. Use the existing design tokens and shared components. No new colors.

Don't change deals, add-ons, or order status logic in this step.
```

**Check (2 min):** In the POS, tap a sized pizza, add a Large and a Small of the same pizza. You should see two lines with the right prices. Place the order. The kitchen screen, the receipt and the order detail should all show the sizes. In Menu, change one size's price. The old order's receipt must not change; a new order uses the new price.

### Step 2 — Add-ons (extra cheese, extra chicken)  · **only if the cafe sells extras at the counter**

Ask the owner first. If he doesn't sell extras, skip this step. (If he does and you skip it, staff will type "extra cheese" into notes and it won't be charged.)

```text
Context: AddOn / AddOnPrice exist (a price per size label, matching MenuItemVariant.label) and are seeded, but nothing lets staff add them to an order or edit their prices.

Backend
1. Additive migration: OrderItem.addOns, a nullable Json snapshot: an array of { addOnId, name, price }.
2. Order lines (all three order routes, through the shared parser) accept optional addOnIds: string[]. Each must be an AddOn that has an AddOnPrice whose size equals the line's chosen variant label, otherwise 400. Reject duplicates.
3. unitPrice = variant price + sum of the add-on prices, snapshotted at order time. subtotal = unitPrice × quantity. Say in a code comment that unitPrice includes add-ons.
4. The menu responses include, for each variant, the add-ons available at that size with their price. If the size-matching rule would offer an add-on on an item where it obviously doesn't belong (for example a pizza add-on on a pasta that happens to have a "Large" size), tell me instead of guessing.
5. CRUD endpoints for AddOn and its per-size prices (POS_ADMIN/SUPER_ADMIN).

Frontend
6. In the cart, a line whose item has applicable add-ons shows a small "Add-ons" control that expands toggle chips (price shown). Toggling updates the line price live. Tapping a size still adds the line immediately. Add-ons are an optional edit, so the common order stays fast.
7. Lines with identical item + size + add-ons + notes merge into one line with a higher quantity. Any difference makes a separate line.
8. Show add-ons ("+ Extra Cheese") on the cart, order detail, receipt, kitchen tickets and Kitchen Display.
9. Menu section: an "Add-ons" tab to create/rename add-ons and edit their price per size.

Use existing design tokens and shared components. No dropdowns. Don't touch deals or order status logic.
```

**Check:** Add Extra Cheese on a Large pizza and on a Small pizza. The two prices differ. The kitchen ticket shows "+ Extra Cheese".

### Step 3 — Deals from the real menu  · Plan mode

The doc only describes the deal explosion for the old fixed-item style (`DealItem`). Your seeded deals use `DealComponent` (fixed items, fixed sizes, choice slots like "any 2 small pizzas"), and the doc can't say whether those reach a kitchen. So this prompt starts by finding out.

```text
Plan mode first. Part of this step is finding out what is true today, so put the findings in the plan before changing any code.

Goal: every deal in the seeded menu can be ordered at the POS, produces the right items for the right kitchens, and charges the deal price exactly once.

Part A — verify and report (read-only)
- For every Deal in the seed data, say how it is composed: DealItem rows only, DealComponent rows only, both, or neither.
- Trace createOrder's deal handling. For each deal, say which order items it would create and whether every component (fixed item, fixed variant, choice slot) would reach a kitchen. List any deal that would charge the price but send nothing, send the wrong items, or double up because it has both DealItem and DealComponent rows.

Part B — implement
Backend
1. Deal explosion in createOrder handles all three DealComponent kinds plus legacy DealItem:
   - fixed menuItemId component: one OrderItem
   - fixed variantId component: one OrderItem with that variant (variantId + variantLabel snapshot)
   - choice slot (choiceCategoryId + choiceSize, optionally narrowed by allowedItemIds): built from the picks in the request
   All exploded items get unitPrice and subtotal 0, dealOrderLineId set, kitchenId copied from the menu item. Inventory deduction applies to them like any other item.
2. Request shape: deals: [{ dealId, quantity, choices?: [{ componentId, picks: [{ menuItemId, quantity }] }] }]. For each choice component, the pick quantities must add up to component.quantity × deal quantity. Each picked item must be in the slot's category, in allowedItemIds when that list is non-empty, and have a variant labelled choiceSize (use that variant). Anything missing or invalid returns 400 with a message a cashier could read. Deals with no choice slots need no choices field.
3. GET deals (POS and online) include the components: kind, quantity, item/variant names, and for choice slots the category name, size and the list of eligible items (with names), so the UI can render the chooser without extra calls.
4. PUT /deals/:id: when a deal has DealComponent rows, allow editing name, description, price, isActive and availability WITHOUT requiring `items`, and never rewrite its composition. Legacy-only deals keep today's behavior.

Frontend
5. Tapping a deal tile: no choice slots means straight to the cart as today. With choice slots, open a chooser dialog: one section per slot ("Choose 2 × Small pizza"), eligible items as large tiles, tap to add/remove picks, a clear counter ("1 of 2"), and the Add button disabled until every slot is complete.
6. The cart shows a deal as one line at the deal price with its chosen items listed under it, read-only. The same deal with different choices is a separate line.
7. Receipt: the deal is one priced line. Kitchen tickets: the exploded items with sizes and a "part of {deal}" tag.
8. Deals tab in Menu: for a deal with components, show the composition read-only (label it "Managed in seed data for now") and let the admin edit only name, description, price and availability.

Don't touch order status or cancellation logic in this step.
```

**Check:** On a test business day, order **every** seeded deal once. For each one, count the kitchen tickets against what the deal contains. The order total must equal the deal price once, not more.

---

## Part 2 — Make the kitchen and the end of the day trustworthy

### Step 4 — Order lifecycle and cancellation  · Plan mode

```text
Plan mode first.

Problem (see docs/AS_BUILT_BACKEND.md §4.2, 4.3, 11): Order.status never reaches IN_KITCHEN, READY or COMPLETED, so every POS order stays PENDING forever and End Business Day treats every one of them as open. Cancelling doesn't restock inventory, doesn't tell the kitchen, and works on orders that are already cancelled or completed. Removing an item doesn't tell the kitchen either.

Backend (order.service.ts, businessDay.service.ts, config/socket.ts)
1. One function that derives Order.status from its items. Call it inside the same transaction whenever an item's status changes or items are added or removed. It never touches a CANCELLED order. Over all items on the order, including deal-exploded ones: all SERVED means COMPLETED; otherwise all READY or SERVED means READY; otherwise any PREPARING/READY/SERVED means IN_KITCHEN; otherwise leave as is (PENDING, or CONFIRMED for online orders).
2. Item status changes: allow one step forward (PENDING→PREPARING→READY→SERVED) or one step back (to undo a mis-tap). Anything else returns 400. Reject changes on items of CANCELLED orders (409).
3. New PATCH /api/pos/orders/:id/complete (POS_ADMIN/SUPER_ADMIN): marks every item not yet SERVED as SERVED and the order COMPLETED, and emits the usual order-item:updated events. For takeaway handover, and for a cashier closing an order the kitchen didn't tap through.
4. cancelOrder: 409 if the order is already CANCELLED or COMPLETED. In one transaction: set CANCELLED + reason AND restock inventory for all the order's items (reuse the existing restock logic; include deal-exploded items). After commit, emit `order:cancelled` { orderId, orderNumber } to every kitchen room that had items on the order and to pos-admin.
5. removeOrderItem: after commit, emit `order-item:removed` { orderId, orderItemId, kitchenId } to that kitchen's room and to pos-admin.
6. GET /api/pos/kitchen-queue must not return items that belong to CANCELLED orders. First tell me what it returns today for each order status.
7. End Business Day logic stays as it is. With real statuses it now blocks only on genuinely unfinished orders. Keep the force option.

Frontend
8. OrderDetailPage: add a "Complete order" button (hidden for COMPLETED and CANCELLED orders) and hide Cancel for COMPLETED/CANCELLED orders. Check that the Orders list and StatusBadge render the new statuses properly.
9. Don't build the Kitchen Display side here. The next step consumes order:cancelled and order-item:removed.
```

**Check:** Place an order. Tap PREPARING on the kitchen screen and the order becomes IN_KITCHEN. All items READY gives READY. All SERVED gives COMPLETED. With every order completed or cancelled, End Day closes with **no** warning. Cancel an order after the kitchen started it: stock comes back. Try to cancel it again: refused.

### Step 5 — Kitchen Display that survives real life  · frontend only

```text
Work in pos-frontend/src/pages/KitchenDisplayPage.tsx, pos-frontend/src/hooks/useKitchenQueue.ts and pos-frontend/src/socket/client.ts.

Problem: a dropped connection silently leaves the kitchen screen behind (no re-fetch, and the banner tells people to reload the page), cancelled and removed items never disappear, and there is no sound.

1. Reconnect that heals itself. On every socket `connect` event (the first connect and every reconnect), re-emit the room join and re-fetch the kitchen queue, replacing local state with the server's list. Network drops reconnect on their own, but socket.io does NOT retry when the server's auth middleware rejects a connection. Handle that case explicitly: if the token is invalid or expired, show "Session expired — log in again" with a button. Don't loop.
2. A visible connection indicator in the header: green "Live", amber "Reconnecting…", red "Offline — orders may be missing". No "reload the page" instructions.
3. Safety net: also re-fetch the queue every 30 seconds and whenever the tab becomes visible again. The server's list always wins over local state.
4. Handle the new events. `order:cancelled`: that order's tickets turn into a bold "CANCELLED — stop" state that stays until someone taps OK (don't silently remove them; it's easy to miss mid-rush). `order-item:removed`: remove the item with a brief highlight.
5. Sound. A short two-tone chime on order-item:new and a different, harsher one on order:cancelled. Synthesize them with the Web Audio API so no audio file is needed. Browsers block audio until the user interacts, so show a prominent "Tap to enable sound" bar until audio is unlocked, then remember the choice on this device. Include a mute toggle.
6. Keep the screen awake with the Screen Wake Lock API while the page is open. Re-request it when the tab becomes visible again. Do nothing if it's unsupported.
7. Keep Kitchen Display's own large-text design. No new colors. Don't touch other screens.
```

**Check:** Open Kitchen Display on a phone. Turn its wifi off for 30 seconds, place an order from the laptop, turn wifi back on. The order should appear **without** reloading. Cancel an order: the kitchen shows CANCELLED. Tap "enable sound", place an order, and you hear the chime.

---

## Part 3 — Match how the cafe actually sells

### Step 6 — Phone and delivery orders from the POS  · Plan mode

Before running this, ask the owner whether he charges for delivery. Keep or delete the bracketed line accordingly.

```text
Plan mode first (this changes the order create route and the New Order screen).

Problem: the POS can't take a phone order or a delivery order. NewOrderPage only offers DINE_IN and TAKEAWAY, nothing ever sets source = PHONE, and an order has nowhere to store who the customer is when there's no customer account.

Backend
1. Additive migration: Order.customerName and Order.customerPhone (nullable strings). [Delete this bracket if the owner doesn't charge for delivery: also add Order.deliveryFee, Decimal(10,2), default 0. totalAmount = items + deals + deliveryFee − discount. Show it as its own receipt line, and let staff set it per order on the New Order screen.]
2. POST /api/pos/orders accepts source ("POS" by default, or "PHONE"), customerName and customerPhone. Validation by type: DINE_IN requires diningAreaId; TAKEAWAY requires no address and no dining area; DELIVERY requires deliveryAddress and customerPhone (customerAddressId isn't used on the POS side). Trim values, cap lengths, and reject clearly.

Frontend
3. New Order: add DELIVERY to the order-type buttons, and a "Phone order" toggle chip available for every type (it sets source PHONE). For DELIVERY show name, phone and address fields and the rider chips. For TAKEAWAY show an optional name field. No dropdowns.
4. Orders list shows source and customer phone. Order detail shows the customer name/phone/address, with the phone as a tap-to-call link on mobile. Rider assignment works as it does today.
5. Receipt and kitchen ticket show the delivery details (name, phone, address) where relevant. Don't redesign the print layout here; the next step does.
```

**Check:** Place a phone delivery order with a name, phone and address. The Orders list shows it as a phone order, and the receipt carries the delivery details.

### Step 7 — Receipts and kitchen tickets ready for a real printer  · frontend only

```text
Work in pos-frontend/src/components/PrintStyles.tsx, PrintReceiptPage.tsx, PrintKitchenTicketsPage.tsx, plus a new pos-frontend/src/config/shop.ts.

Problem: the receipt says only "Receipt" — no shop name, address, phone or footer. Prices have no currency. Times may not show in Pakistan time.

1. pos-frontend/src/config/shop.ts exports one object: name, address, phone, receiptFooter, currencyLabel ("Rs"), timeZone ("Asia/Karachi"). Fill name/address/phone/footer with clearly marked placeholders (for example "SHOP NAME — set in src/config/shop.ts"). Do not invent real details.
2. A formatMoney helper (Rs 1,850: drop the decimals when they're .00, keep them otherwise) and a formatDateTime helper that always uses shop.timeZone. Use them on the receipt, kitchen tickets, cart, order total, orders list, order detail and dashboard. Display only: never change the values that are sent or stored.
3. Receipt layout (80mm, the existing PrintStyles): shop block at the top; order number large; date/time; type and table, or delivery name/phone/address; items with size and add-ons; deals as one priced line with their contents listed smaller underneath; discount and delivery fee lines when present; total large; payment method and status; footer line. No tax line yet.
4. Kitchen ticket, one per kitchen: order number very large; type and table, or a "DELIVERY"/"TAKEAWAY" tag; time; each item with size, add-ons and notes in the biggest readable text; deal items tagged "part of {deal}"; only that kitchen's items.
5. Long item names and notes must wrap and never get cut off. One ticket per physical page, no blank trailing page.
6. Printing behavior stays: auto-print once on load, a visible Print button, controls hidden when printing. Check the layout in Chrome's print preview at 80mm and tell me what you verified. You can't see a paper receipt, so say plainly what you could not verify.
```

**Check:** Print a receipt and a two-kitchen order's tickets to PDF at 80mm. The result should be a narrow strip, with your shop block at the top and nothing cut off.

---

## Part 4 — Protect it

### Step 8 — Security and small safety fixes  · backend

```text
Backend hardening before real people use it. Work in backend/src (app.ts, the auth middleware, the auth and customer services, config/upload.ts, the vendor module, server.ts) and backend/scripts/create-admin.js.

1. Add helmet. Make sure the /uploads static route still works when an image is shown from a different origin (the frontend lives on another domain).
2. Rate-limit both login endpoints (staff and customer): about 10 failed attempts per 15 minutes per IP, with a clear 429 message. The app runs behind Railway's proxy, so set Express's trust proxy for it (typically 1 hop) or every user shares one limit. Say what you set and how I can verify it after deploying.
3. Passwords: minimum 8 characters on staff create/update and customer signup, with a clear 400 message. Existing passwords are untouched.
4. requireAuth, and the Socket.io handshake, must confirm the staff account still exists and isActive. One lookup by id per request is fine at this scale. A deactivated staff member is rejected with 401 immediately instead of working for up to 12 hours.
5. File upload: a wrong file type or a too-large file returns a clean 400 (or 413) with a readable message instead of a generic 500.
6. create-admin.js: remove the hardcoded fallback username and password. It must refuse to run unless ADMIN_USERNAME, ADMIN_PASSWORD (8+ characters) and ADMIN_NAME are set, and it must never print the password.
7. Vendor delete: refuse with 409 when the vendor has ledger entries. The schema cascade-deletes them, which would silently erase purchase and payment history. If the Vendors screen can't set isActive, add that switch so "deactivate" is the way to retire a vendor.
8. Graceful shutdown: on SIGTERM close the HTTP server and Socket.io, disconnect Prisma, then exit.

Don't add dependencies other than helmet and an express rate-limit package. Report what you changed.
```

**Check:** Fail a login 11 times in a row and you get a 429. Deactivate a staff account while it is logged in elsewhere: its next click fails.

### Step 9 — Tests for the money and order logic  · backend

This is the safety net for everything above and everything the client asks for later.

```text
Set up automated tests for the money and order logic, which is the code every other change touches. Backend only.

1. Use vitest (or jest if the repo is already set up for it). Tests run against a separate Postgres database from DATABASE_URL_TEST. Safety rule: the test setup must refuse to run unless that database's name contains "test" and it is not the same URL as DATABASE_URL. Apply migrations to it with `prisma migrate deploy` before the run and clean the tables between tests.
2. Add `npm test` to backend/package.json.
3. Cover, at the service level (and at HTTP level where permission checks matter). Skip any case for a feature that doesn't exist in the code:
   - Order totals: plain items, sized items, add-ons, discount, fixed deal, deal with a choice slot, delivery fee. Assert exact Decimal strings.
   - Order numbering: 20 simultaneous createOrder calls on one business day produce numbers 1..20 with no duplicates. A new business day restarts at 1. No active business day is rejected.
   - Deal explosion: the right items, the right kitchens, zero-priced, price charged once. Invalid choices are rejected.
   - Inventory: AUTO deduction on a POS order; restock on item removal and on cancel; MANUAL items untouched.
   - Lifecycle: status derivation across item changes; item step validation; cancelling twice and cancelling after completion are rejected; End Day blocks on unfinished orders and passes when all are completed or cancelled.
   - Permissions: KITCHEN cannot update another kitchen's item; a deactivated staff token is rejected; the login rate limit returns 429.
   - Vendor balance (purchases minus payments) and payroll remainingAmount.
4. Run the suite and report. If a test exposes a real bug, don't silently change app behavior: list it, and fix it only if the correct behavior is unambiguous (and say so).
5. Document how to run the tests in docs/AS_BUILT_BACKEND.md §12.
```

**Check:** `npm test` in `backend/` is all green.

---

## Part 5 — Final pre-flight

### Step 10 — Pre-flight and smoke script

```text
Final pre-flight. Do not change features.

1. Delete dead code: frontend PagePlaceholder.tsx, and anything else you can prove is unused.
2. Run: backend build and tests; frontend type-check, build and lint. Fix only what they report as errors, and list the warnings.
3. Write backend/scripts/smoke.ts (npm run smoke). It runs against the TEST database only (abort unless DATABASE_URL_TEST is set and its name contains "test"). It resets and seeds the menu, creates a super admin and a kitchen user, then walks through: start business day, dine-in order with a sized pizza and an add-on, takeaway order with a choice deal, phone delivery order, kitchen item status changes, complete one order, cancel another, End Day (must succeed without force once everything is completed or cancelled), then the dashboard and the daily report. It compares the totals it gets with totals it computes independently from the seed prices, and prints PASS or FAIL for each check.
4. Run it and report every line.
```

**Check:** Every line says PASS.

---

## Your dress rehearsal (30 minutes, no prompt)

Two devices: laptop as the cashier, phone as the kitchen. Ideally a second person plays the kitchen.

1. Start a business day.
2. Place five orders: dine-in, takeaway, a sized pizza with an add-on, a choice deal, and a phone delivery.
3. On the kitchen phone, orders arrive with a chime. Move items through PREPARING, READY and SERVED.
4. Cancel one order after the kitchen has started it. The kitchen must show CANCELLED, and the inventory must come back.
5. Turn the kitchen phone's wifi off for 30 seconds, place an order, turn it back on. The order must appear on its own.
6. Complete the rest. End Day must close **without** a warning.
7. Compare the dashboard total with a hand count. Export the Excel files and open them.
8. Print a receipt and the kitchen tickets to PDF at 80mm.
9. Log in as each role. KITCHEN must not be able to open any admin page. Run the cashier flow on a phone too.
10. Leave the kitchen screen untouched for 15 minutes. It must still be live.

**On printer day** (after this passes): set the thermal printer as the default printer, print a receipt, then a two-kitchen order, then a very long item name. On the cashier PC, Chrome can skip the print dialog and print straight to the default printer when launched with the `--kiosk-printing` flag. Try it on your machine; without it, each print needs one extra click. The app can't detect an out-of-paper printer, so tell staff to check the roll at opening.

---

## Before you hand over the link (checklist)

1. **Separate "live" from "work in progress".** Your plan was that every push to GitHub updates the deployment. That means that while the cafe is serving, any push could redeploy the backend (and run `prisma migrate deploy` against the live database on boot). Fix it now:
   - Do your development on `main` / feature branches.
   - Create a `release` branch. In Vercel (project → Settings → Git) set the Production Branch to `release`. In Railway, set the service's deploy branch to `release`.
   - Merge into `release` only when a version is tested and the cafe is closed.
2. **Keep the live database URL out of your laptop.** Your local `.env` must point at a local database. Claude Code runs migrations from your machine, and a stray reset against the live database would wipe the cafe's data.
3. **Admin passwords.** Check that the production SUPER_ADMIN wasn't created with the old hardcoded fallback credentials. Change it and any seeded staff passwords. Use a different password per person.
4. **Backups.** Before real orders go in, turn on or verify database backups on Railway. I haven't checked what your plan includes, so look at your plan's backup options and do one test restore.
5. **Shop details.** Fill in `pos-frontend/src/config/shop.ts`.
6. **Accounts.** One login per kitchen and one per cashier. Don't share the SUPER_ADMIN account for daily use.
7. **Kitchen devices.** Staff tokens expire after 12 hours, so a kitchen tablet will need a login each shift. Tell the staff that, or ask me about a longer session for the KITCHEN role only.

---

## Questions for the owner (they change what you build)

- **Does he sell extras** (extra cheese etc.) at the counter? Decides Step 2.
- **Does he charge for delivery?** Decides the bracketed line in Step 6.
- **Tax and invoicing.** The app has no tax field at all. Ask him or his accountant whether receipts need a tax line, or whether he must use a government-approved invoicing system. I haven't verified the current rules, so don't guess; get it from him before the printer step.
- **Discounts.** The API supports an order discount. The docs don't say whether the POS screen lets staff enter one. Ask whether he gives discounts, and who is allowed to.
- **Paper width.** 80mm (what the receipt is built for) or 58mm? Which printer model?
- **Is the seeded menu his real menu**, with current prices?

---

## Left out on purpose (and why)

These are real, but none of them blocks a shop test. Expect the first four as requests from the owner within a week.

- **Cash-drawer summary:** sales split by payment method (cash vs card/wallet), and a way to mark counter digital payments as paid. Today the dashboard has one total.
- **Per-size inventory:** pizza boxes by size. Stock links are per menu item, so a Small and a Large pizza consume the same box. Fixing it means extending the link table.
- **Editing choice-slot deals in the UI.** Step 3 makes them read-only and orderable; for now, composition changes mean editing the seed file and re-running it.
- **A "who did what" log** (who cancelled, who gave a discount).
- **Online ordering UI.** Not built yet. When it is, you also need: kitchens must not see online orders until payment is verified (today they see them instantly), payment verification should notify the POS, and uploaded screenshots need a persistent disk or cloud storage because Railway containers lose local files on redeploy.
- **PWA / installable app.** Nice to have, not needed for the shop test.
- **Timezone cleanup.** The reports use UTC for month grouping. Pakistan has no daylight saving, and your evening business days start on the same UTC date, so in practice the numbers come out right. Only the day label could show the wrong date for a shift opened after midnight. Low risk.
- **Refresh tokens, error tracking (Sentry), full end-to-end browser tests.**

---

## Notes on the as-built documents

- Where the doc and the code disagree, trust the code. One I spotted: the doc says deleting a vendor with ledger entries would return a 500, but the schema marks ledger entries as cascade-delete with their vendor, so I expect it would silently erase the history. Step 8 guards it either way.
- Where the doc is silent, the prompts say "verify first" (deals, the kitchen queue's handling of cancelled orders). Those steps start in Plan mode so you see the findings before anything changes.
- Keep the docs current: the Step 0 rule makes Claude Code update them as it goes. Bring the updated `docs/AS_BUILT_*.md` back to me after Part 3 and after Part 5 and I'll re-check the plan.
