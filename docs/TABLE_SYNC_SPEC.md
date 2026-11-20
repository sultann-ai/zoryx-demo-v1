# Table sync — one table system (build spec)

Status: **backend steps 1–3, POS UI step 4, and customer UI step 5 built** on 2026-11-20 (AS_BUILT_FRONTEND §7.3 "Table sync" and §8 customer table pages; manual test script `docs/TABLE_SYNC_POS_TEST.md`). The customer poll shows staff-added rounds, moved/merged table names, paid receipts and friendly conflict messages.

**Deviations in step 4 (POS UI):**
- **Not built:** Unmerge and Split off. The floor map gives a merged table its parent's session id, and unmerge needs the merged table's own session id, which no endpoint returns yet; split-off needs a guest/order chooser. Both endpoints exist.
- **"Force close" (admins)** is Void (only when nothing was accepted) — the backend has no close that leaves money owed, by design (R4/R5). With accepted orders the dialog points to Settle, or to cancelling each order from its page.
- **Incoming's** `TABLE_DECISION_NEEDED` offers "Add to <table>'s bill" only; to put the order on another table, staff open it and use Move to table, then send it.
- **Dining areas / QR sheet:** no new UI; their refusals (`TABLE_IN_USE`) show the server's sentence. Written 2026-11-20 from `main` at `cf4dfc0`. Every later "table sync" session builds from this file. If the code and this spec disagree, fix whichever is wrong in the same task and say so. As built: AS_BUILT_BACKEND §3.21.

**Deviations in what's built (steps 1–3):**
- **Answer field name:** `POST /orders` and `/orders/submit` answer `tableOpened: { sessionId, pin } | null`, not `tableSession: { id, opened, pin }` — the order shape already has a `tableSession` (`{ id, diningAreaId, status }`). `move-table` answers the same `tableOpened`.
- **Backfill scope (owner's instruction):** only the **active** business day's open dine-in orders are attached (§3.2 said each table's latest day). Earlier days' stragglers are left alone and listed by `scripts/check-table-sync.ts`.
- **Race safety:** the table row lock plus an `INSERT … ON CONFLICT … DO NOTHING` on the partial unique index, re-read and retried up to 3 times, so a lost race never aborts the order's transaction. `seatTable` uses the same lock and insert.
- **Scheduled release** attaches the order in its own transaction right after the release commits (not inside it), to keep the R10 lock order (table before order). A release never fails because of its table.
- **Internal callers** (demo seed, scripts) may leave `expectedTableSessionId` out: the order then joins whatever is open. HTTP routes always require it.
- **New codes not in §4.3:** `NOT_MERGED` (unmerge of a table that isn't merged), `NO_SPLIT` (collect-cash on a bill with no split: use Settle), `FORBIDDEN` (an order taker settling online or with a discount), `ORDER_CHANGED` (internal only: a released order accepted before it could be seated).
- **Merge:** the source's own bill (no money on it, checked) goes `UNLOCKED` with its shares `VOID`; tables already merged into the source follow it into the target.
- **Move the party:** only the session's open orders that sat at the old table change table; finished ones keep theirs as history.
- **"table:updated to the session's guests":** guests have no socket (TABLE_QR_SPEC D2); every change bumps the session's `version`, so their next poll (≤ 5 s) sees it.
- **Settle** also takes `expectedBillVersion` (optional): a stale one answers 409 `BILL_CHANGED`.
- **`GET /tables/floor`** lists a switched-off table that still has an open session, with `inactive: true` (R1's "can only exist from before R8").
- **Voiding** a session also voids the tables merged into it; voiding a merged table answers `SESSION_IS_MERGED` (unmerge it instead).
- **Changes to existing flows:** see AS_BUILT_BACKEND §3.9 and §3.21 — dine-in creates/submits now require `expectedTableSessionId`; per-order payment/complete/delivered refuse every table order; assign no longer moves tables; accept/reject are conditional; close refuses unpaid tables; a forced day end closes idle tables. **The current POS screens don't send `expectedTableSessionId` and still offer per-order payment on table orders, so deploy this backend together with step 4.**

Read with: `CLAUDE.md`, `docs/TABLE_QR_SPEC.md` (this spec replaces some of its rules; §8 lists which), `docs/AS_BUILT_BACKEND.md` §3.9, §3.15, §3.20, §4.1–§4.4, §5, and `docs/AS_BUILT_FRONTEND.md` §7.3, §7.6, §8.

Abbreviations: SA = SUPER_ADMIN, PA = POS_ADMIN, OT = ORDER_TAKER. "Table" = a `DiningArea` row. "Session" = a `TableSession` row. "Open session" = `status = OPEN`.

---

## 0. The problem

Who sits at a table is recorded in one place: an open `TableSession`. The database allows one per table (partial unique index `TableSession_one_open_per_table`). Only two things create or use a session:
- `tableSession.service.seatTable`, which creates one;
- `tableGuest.service.createTableOrder`, a QR round, which attaches its order to one.

The other two ways of ordering for a table store only `Order.diningAreaId`:
- the POS: `POST /api/pos/orders` → `order.service.createOrder`;
- the order taker: `POST /api/pos/orders/submit` → `submitOrderTakerOrder` → `createOrder`.

The floor map's `deriveTableState` reads only the open session. So with three POS orders on Family Hall table 2:
- the table reads **EMPTY**;
- a QR guest can't join it ("not seated");
- staff can seat a second party on top of it;
- if guests do get a session, their bill never contains the POS orders, and the cashier can take payment for the same food twice: once per order, once through the bill.

**The fix in one sentence:** every dine-in order with a table belongs to that table's open session, which is opened on demand by whatever puts the first order there. The session is the only thing anyone reads to know whether a table is occupied, and the session's bill is the only way its orders are paid.

---

## 1. Audit

### 1.1 Backend: every path that creates, edits, moves, cancels, completes or pays an order that has a table

| # | Path | File → function | What it does with the table today | Problem |
|---|---|---|---|---|
| A1 | `POST /api/pos/orders` (SA, PA) | `order.controller.createOrder` → `order.service.createOrder` | `DINE_IN` must have `diningAreaId` (controller). Writes `Order.diningAreaId` only. With `scheduledFor` it creates a `SCHEDULED` order | **No session.** This is the reported bug |
| A2 | `POST /orders/submit` (OT) | `order.controller.submitOrder` → `submitOrderTakerOrder` → `createOrder` | `AWAITING_RECEPTION`, `diningAreaId` only | **No session** |
| A3 | `POST /api/online/table/orders` (guest) | `tableGuest.controller` → `tableGuest.service.createTableOrder` → `createOrder` | Passes `tableSessionId`. Its `guard` locks the session row after `createOrder`'s per-day advisory lock | Correct. Today the only path that attaches |
| A4 | `POST /api/online/guest-orders`, `POST /api/online/orders` | `guestOrder.service` / `payment.controller` → `createOrder` | `TAKEAWAY`/`DELIVERY`, no table | Correct, but `createOrder` itself doesn't refuse a table on a non-dine-in order (R9) |
| A5 | `PUT /orders/:id/submission` | `updateSubmission` → `replaceOrderContents` | Keeps the table; re-stamps `tableGuestId`; `syncTableBillForOrder`; `tableOrderChanged` | Fine |
| A6 | `PUT /orders/:id/scheduled-items` | `updateScheduledItems` → `replaceOrderContents` | `SCHEDULED` only | Fine |
| A7 | Release of a scheduled order | `scheduledRelease.job` → `releaseDueScheduledOrders`; `POST /:id/release` → `releaseScheduledOrderNow`; both → `transitionScheduledOrder` | `SCHEDULED` → `AWAITING_RECEPTION` | No session, before or after accept |
| A8 | `POST /orders/:id/accept` | `acceptOrder` | → `PENDING`/`CONFIRMED`, deducts stock, `syncTableBillForOrder`, `tableOrderChanged` | The write is a plain `update`, not conditional on the status it checked. Two accepts at once both deduct stock (D7) |
| A9 | `POST /orders/:id/reject` | `rejectOrder` | → `CANCELLED` | Same unconditional `update`. Nothing frees a session left empty |
| A10 | Cancels | `PATCH /:id/cancel` → `cancelOrder` → `cancelInTransaction`; OT branch `cancelOwnAwaitingOrder`; guest `cancelOwnRound` → `cancelTableGuestRound`; `reviewOrderChange` (CANCEL); `cancelScheduledOrder`; `markOrderNotCollected` (online pickup only) | `cancelInTransaction` syncs the bill; most paths call `tableOrderChanged` | `cancelOwnAwaitingOrder` never calls `tableOrderChanged`. The order row is locked before the bill row, the reverse of every bill write, so they can deadlock (D5). Nothing frees a session whose last order went |
| A11 | `PATCH /orders/:id/assign` (SA, PA) | `assignOrder` | Sets `diningAreaId` directly, for any type and any status | Moves an order to another table with no session change, no bill sync, no event, no kitchen notice; also gives a `TAKEAWAY` a table (D2) |
| A12 | Items | `POST /:id/items` → `addOrderItems`; `DELETE /:id/items/:itemId` → `removeOrderItem` | Bill sync + `tableOrderChanged` | Fine once the order is attached |
| A13 | Notes | `updateOrderItemNote`, `updateOrderDealLineNote` | No `tableOrderChanged` | The guest poll shows notes but its version isn't bumped (minor) |
| A14 | Kitchen progress | `PATCH /:id/items/:itemId/status` → `updateOrderItemStatus` | `tableOrderChanged` | Fine |
| A15 | Approved order-taker EDIT | `reviewOrderChange` (EDIT) | Rebuilds lines, `syncTableBillForOrder` | No `tableOrderChanged`, so the map and phones aren't refreshed (D8) |
| A16 | Cash payment | `PATCH /:id/payment-status` → `updatePaymentStatus` (+ takeaway auto-complete) | `assertNotPaidThroughTableBill` **before** the transaction; no bill sync; no `tableOrderChanged` | Races with a bill request (D4). A table order can be paid outside the bill while the bill is unlocked or not requested yet |
| A17 | Complete | `POST /:id/complete` → `completeOrder`; `POST /:id/delivered` → `markOrderDelivered`; both → `completeInTransaction` | Same out-of-transaction guard | `/delivered` completes an **unpaid** table order, and the no-bill close rule then lets the table close with money owed (D6) |
| A18 | Table bill | `tableBill.service`: `setBillDiscount` (writes `Order.discount`/`totalAmount`), `markSharePaid`, `verifyShare`, `markPaidIfComplete`, `closeTable` → `order.service.settleTableOrdersInTransaction` → `completeInTransaction` | Lock order: session → bill → orders | Correct for attached orders |
| A19 | Void | `tableSession.service.voidSession` → `rejectOrder` per waiting round, then the void | Rejects outside the void's transaction, then re-counts inside it | Fine |
| A20 | End day | `businessDay.controller.end` | Blocks on `openTableSessions` without `force`; `force` leaves sessions open | After this change, tomorrow's staff order would join yesterday's session (D9) |
| A21 | Demo seed | `prisma/demo/today.ts` `pos()` → `createOrder` (`DINE_IN`), then `updatePaymentStatus` / `completeOrder` per order; `submitOrderTakerOrder` | Unattached dine-in orders paid one by one | Must follow the new rules (build step 1) |
| A22 | Scripts | `scripts/verify-guest-orders.ts`, `scripts/dev-fake-online-order.ts` | Online only | None |

### 1.2 Backend: every place that reads a table's status or occupancy

| # | File → function | Reads |
|---|---|---|
| B1 | `table/tableState.ts` → `deriveTableState` (pure), fed by `table/tableNotify.ts` → `loadTableState`, `summariseOrders`, `callCounts`, `billStateInputs`; used by `emitTableUpdated` and `tableSession.service.getFloor` | The open session's orders, calls and bill. **Ignores every order not attached to a session** |
| B2 | `tableSession.service.seatTable` | "Already open" pre-check + the partial unique index |
| B3 | `tableGuest/tableStatus.ts` → `computeTableOrdering`, used by `tableGuest.service.getTableByQrKey`, `joinTable`, `createTableOrder`, `getSessionPoll` | QR on, table active, open session, session's day = active day |
| B4 | `tableGuest.service.authenticateGuest` (`requireTableGuest`) | Token valid only while the session is `OPEN` and the guest not removed |
| B5 | `table/tableBillGuard.ts` → `billableOrderWhere`, `computeBillTotals`, `isBillLocked`, `assertNotPaidThroughTableBill` | Orders **by `tableSessionId`** |
| B6 | `businessDay.service.getOpenTableSessions`, `getBlockingOrders`, `getUnpaidOrders` | Sessions of the day; orders with their table name |
| B7 | `table/tableCall.service.resolveCallTarget` | `session.waiterStaffId` |
| B8 | `order.service.getIncomingOrders`, `listOrders` (`diningAreaId` filter), `buildSubmittedPayload` (`tableSessionId`) | Order fields |
| B9 | `tableSession.service.getFloor` | Filters `isActive: true`, so an open session on a deactivated table vanishes from the map (D10) |

### 1.3 POS frontend (`pos-frontend/src`)

| # | Screen → file | Today |
|---|---|---|
| C1 | New Order → `pages/NewOrderPage.tsx`, `newOrder/OrderMetaBar.tsx`, `newOrder/DiningAreaPicker.tsx`, `newOrder/DiningAreaGrid.tsx` (`DiningAreaTile`) | Tables from `useDiningAreas`. No occupancy shown; out-of-service tables can be picked |
| C2 | Take Order (OT) → `pages/TakeOrderPage.tsx`, `takeOrder/GroupedDiningAreaGrid.tsx` | Same |
| C3 | Order Detail → `pages/OrderDetailPage.tsx` | The Assign form has a "Dining area" select (`useAssignOrder`). `ConfirmPaymentForm` and `CompleteOrderDialog` show for table orders until the bill is requested. `TableBillPanel` shows only when `order.tableSession` is set. "Print table receipt" / "Print final receipt" print **this order only** (`print/buildReceiptDoc.ts`) |
| C4 | Orders list → `pages/OrdersPage.tsx` | Quick Complete (`CompleteOrderDialog`), cash toggle (`useUpdateOrderPaymentStatus`), table filter |
| C5 | Floor map → `pages/TablesPage.tsx`, `tables/FloorTile.tsx`, `tables/tableStates.ts`, `tables/TablePanel.tsx`, `tables/TableBillPanel.tsx` | Renders the server's `state` (no client derivation, which is right). The panel offers Seat, PIN, guests, orders, Close and the bill. No "new order for this table", no move, merge or split |
| C6 | `context/TableCallsContext.tsx` | Invalidates `["tables","floor"]`, `["table-sessions"]`, `["table-calls","open"]` on table events and on every (re)connect |
| C7 | End Day → `components/BusinessDayBar.tsx` | Handles the 400 only when `openOrders` or `unpaidOrders` is non-empty. `openTableSessions` / `OPEN_TABLE_SESSIONS` is ignored: when only seated tables block, staff get a generic "Couldn't end the day" with no list and no "End anyway" (D11) |
| C8 | Incoming → `pages/incoming/IncomingOrderCard.tsx` | Table + "Round n" (`useTableRoundNumber`) |
| C9 | Kitchen Display → `pages/KitchenDisplayPage.tsx` | Table name copied from the `order-item:new` payload; never updated afterwards |
| C10 | Printing → `print/buildReceiptDoc.ts`, `print/kitchenSlip.ts`, `pages/PrintReceiptPage.tsx`, `print/buildTableReceiptDoc.ts` | Per-order docs carry one table name; the table receipt prints the session snapshot |
| C11 | Dining areas → `pages/DiningAreasPage.tsx` | `isActive` / out of service editable whether or not the table is in use |
| C12 | QR sheet → `pages/QrSheetPage.tsx` | Regenerate warns about the printed card only |

### 1.4 Customer (`online-frontend/src/routes/table/`)

`TableApp.tsx` (landing `GET /:qrKey`, join), `JoinSheet.tsx`, `TableHome.tsx` + `RoundCard.tsx` (poll rounds), `TableOrders.tsx` ("Table (shared)" for a line with no guest), `TableCart.tsx`, `CallWaiter.tsx`, `bill/TableBillPage.tsx`, `bill/SplitPicker.tsx`, `bill/Shares.tsx`, `roundStatus.ts`, `tableErrors.ts`. All of them read the poll or the lookup; none computes occupancy. Once staff orders carry `tableSessionId`, the poll already lists them as rounds with `guestName: null`.

### 1.5 Defects found on the way

| # | Defect | Fixed by |
|---|---|---|
| D1 | POS and order-taker table orders never mark the table occupied (the reported bug) | R2 |
| D2 | `assignOrder` moves an order between tables behind the session's back, and can put a table on a takeaway | R7, R9 |
| D3 | **Trap for this change:** `createOrder` never calls `syncTableBill`. Harmless today, because only QR rounds attach and they wait at reception. Once a POS order attaches straight to `PENDING` on a session whose split has a paid share, every later bill write answers `SPLIT_HAS_PAYMENTS` (the bill is stuck), and `markPaidIfComplete`'s invariant throws a 500 | R2 step 6 |
| D4 | `assertNotPaidThroughTableBill` runs outside the transaction in `updatePaymentStatus`, `completeOrder` and `markOrderDelivered`, so a payment and a bill request can both win | R4 |
| D5 | Order mutations lock the order row and then the bill (`cancelInTransaction` → `syncTableBill`), while bill writes lock the bill and then update orders (`setBillDiscount`). Two at once can deadlock; Postgres aborts one with a 500 | R10 |
| D6 | `/delivered` completes an unpaid table order; the no-bill close then succeeds with money owed | R4 |
| D7 | `acceptOrder` / `rejectOrder` write unconditionally after a status pre-check: a double accept deducts stock twice | R10 (checklist step 1) |
| D8 | `reviewOrderChange` (EDIT) and `cancelOwnAwaitingOrder` don't call `tableOrderChanged` | R11 |
| D9 | A forced day end leaves sessions open forever. Harmless today; after R2 the next day's orders would join yesterday's session | R6 |
| D10 | A seated table can be deactivated or put out of service; the session disappears from the map but stays open | R8 |
| D11 | End Day ignores `openTableSessions` in the UI | R6 |
| D12 | A deactivated staff member stays the waiter of open sessions; the order-taker cash rule (`NOT_YOUR_TABLE`) and the "for you" labels point at nobody | R12 |
| D13 | "Print table receipt" on Order Detail prints one order of a table as if it were the table's bill | R13 |

---

## 2. Rules

Each rule says how it differs from your starting draft, then the backend change, the POS screens, the customer screens and the conflict codes. All codes are collected in §4.3.

### R1. A table's state comes from one server function (your rule a): kept, with one addition

The code already does this: `deriveTableState` is the only derivation, and the POS renders its result without computing anything. The hole is that orders outside a session are invisible to it, which R2 closes. Two additions make the rule hold under every later change:
- **Merged tables** (R7): a table joined to another reads its parent session's state, with `joinedTo`.
- **Database checks** (§3.3), so a later code path can't create an accepted dine-in order without a session, or a takeaway with a table.

**Backend.**
- `deriveTableState` gains two inputs:
  - `fromPreviousDay` (the session's day isn't the active day): a new state `PREVIOUS_DAY`, priority 2, after `UNAVAILABLE`;
  - `joinedTo` (passed through).
- `getFloor` and `loadTableState` resolve a child session to its parent's orders, calls and bill.
- `GET /tables/floor` gains, per session:
  - `openedVia`;
  - `orderCount`;
  - `total` (string, Σ non-cancelled orders' `totalAmount`);
  - `fromPreviousDay`;
  - `joinedTo: { tableId, name } | null`;
  - `joined: [{ tableId, name }]`.
- `getFloor` also returns inactive tables that still have an open session, flagged `inactive: true`. That can only exist from before R8.

**POS.**
- `tableStates.ts` gains `PREVIOUS_DAY` (danger tone, "From yesterday").
- A child tile reads "with Table 2".

**Customer.** None.

### R2. Every dine-in order with a table goes through `ensureOpenSession` (your rule b): kept, with four changes

**Change 1: the caller states what it expects.** A blind "find or create" makes two bad merges look normal:
- a new party's first order joins the previous party's session that nobody closed;
- two staff seating two parties at once end up on one bill.

So every staff request that puts an order on a table sends `expectedTableSessionId`:
- `null` means "I believe the table is free";
- an id means "add to this session".

A mismatch is a 409 the screen turns into a one-tap question.

**Change 2: when an order takes its table.**

| Order | Takes the table | Why |
|---|---|---|
| POS order | at creation | The party is there |
| Order-taker order | at creation, while it still waits at reception | Same; the waiter is at the table |
| QR round | already attached | Unchanged |
| Scheduled order | at release if the table is free, otherwise at accept | Not "at release" blindly, as your rule says: release is a background job with nobody to ask, and joining whoever sits there at 8 pm would put a pre-order on a stranger's bill. Details in R2a |

**Change 3: the race guard is a row lock on the table, not only the unique index.** A unique violation inside `createOrder`'s transaction aborts the whole order with a 500. Locking the `DiningArea` row first makes the second caller wait and then see the first one's session.

**Change 4: a session from a previous business day is never joined.** The order is refused with `TABLE_FROM_PREVIOUS_DAY`; see R6.

**Backend.** New file `modules/table/tableOccupancy.ts`, with no import from `order.service` (same rule as `tableNotify.ts`):

```
ensureOpenSession(tx, {
  diningAreaId, expectedTableSessionId: string | null, businessDayId,
  opener: { staffId, role }, via: "STAFF_ORDER" | "SCHEDULED_ORDER", orderId?: string
}) → { sessionId, opened: boolean, pin: string | null, diningAreaId }
```

1. `SELECT … FROM "DiningArea" WHERE id = $1 FOR UPDATE`. Unknown → 404 `NOT_FOUND`. Not `isActive`, or `outOfService` → 409 `TABLE_UNAVAILABLE`.
2. Find the table's open session. If it has `mergedIntoSessionId`, follow it to the parent and lock that row (`FOR UPDATE`).
3. **If one is open:**
   - if `expectedTableSessionId` is neither that session's id nor its parent's id:
     - when the expectation was `null` → 409 `TABLE_OCCUPIED` with `session` (§4.3 summary);
     - otherwise → 409 `TABLE_STATE_CHANGED` with `session`;
   - its `businessDayId` ≠ the order's → 409 `TABLE_FROM_PREVIOUS_DAY`;
   - otherwise return the parent session.
4. **If none is open:**
   - an expectation other than `null` → 409 `TABLE_STATE_CHANGED`, `session: null` ("closed meanwhile");
   - otherwise insert a session:
     - `openedVia` = `via`, `openedByOrderId` = `orderId`;
     - `seatedById` = `opener.staffId`;
     - `waiterStaffId`: the opener when an OT; otherwise the table's default waiter if still usable (`assertWaiter`); else null;
     - `joinPin` per `tableQrRequirePin`, exactly as `seatTable` does;
   - write the `OPENED_BY_ORDER` event and return `opened: true`.

`seatTable` takes the same `DiningArea` row lock before its check (it stays `openedVia: SEAT`). The partial unique index stays as the backstop.

**Where it's called.** In `createOrder`'s transaction, right after the advisory lock and before the `guard`, when the new input `table: { expectedTableSessionId, via, opener }` is present:
5. The created order gets `tableSessionId`.
6. Still inside that transaction: if the session has a bill, `syncTableBill`. That cancels an unpaid split, or refuses the order with 409 `SPLIT_HAS_PAYMENTS`. This fixes D3. It also covers QR rounds, at no cost.
7. After the commit, `tableOrderChanged` (already there), plus `table-session:updated` when `opened`.

Callers:
- the POS create (`order.controller.createOrder`, `DINE_IN`) — the request needs `expectedTableSessionId` (string or null); absent → 400 `TABLE_EXPECTATION_REQUIRED`;
- `submitOrderTakerOrder` — same field, same 400;
- `transitionScheduledOrder` and `acceptOrder` (R2a).

The response of `POST /orders` and `/orders/submit` gains `tableSession: { id, opened, pin }`. The PIN is only sent when `opened` is true.

**POS.**
- `DiningAreaPicker` / `DiningAreaGrid` / `GroupedDiningAreaGrid` take their tiles from `useFloorPlan()` (the same `["tables","floor"]` query the map uses, already kept live by `TableCallsProvider` in both shells). Each tile shows:
  - Free;
  - Occupied: "2 orders · Rs 2,300 · 45 min", plus guest count;
  - Paying;
  - Out of service, disabled;
  - From yesterday, disabled.
- Picking an occupied table shows one line under the grid: "Add to Table 2's open bill (2 orders, Rs 2,300)". The order is then sent with that session id.
- A 409 `TABLE_OCCUPIED` / `TABLE_STATE_CHANGED` opens a small dialog with the server's summary: "Add to this table" (resend with the id) or "Pick another table".
- After placing, the confirmation says "Table 2 is now open" and shows the PIN when one was made.
- `TablePanel` gains **New order for this table**:
  - SA/PA → `/orders/new?table=<id>`;
  - OT → `/take-order?table=<id>`;
  - both pre-select the table and its session.

**Customer.**
- The landing of a staff-opened table is `OPEN`, so guests can join (with the PIN when set) and see the staff orders as rounds.
- `RoundCard` / `TableOrders` label a round with no guest **"Added by staff"** instead of a guest name (new string in `table.*`).

#### R2a. Scheduled dine-in orders

- **Release** (`transitionScheduledOrder`, inside its transaction): for a `DINE_IN` order with a table, call `ensureOpenSession` with `expectedTableSessionId: null`, `via: SCHEDULED_ORDER`, `opener` = `placedByStaffId`.
  - On success the order is attached.
  - On `TABLE_OCCUPIED`, `TABLE_UNAVAILABLE` or `TABLE_FROM_PREVIOUS_DAY` the release still happens, unattached. A release must never fail because of a table.
- **Accept** of an unattached dine-in order with a table: the body must carry `expectedTableSessionId` (join that session, or `null` to open a fresh one), or `diningAreaId` + `expectedTableSessionId` to put it on another table. Otherwise 409 `TABLE_DECISION_NEEDED` with the table's `session` summary.
- **POS:** the Incoming card of such an order shows "Table 2 is busy (open since 7:40 PM)" with **Add to Table 2's bill** / **Choose another table**, instead of the plain accept buttons.
- **Customer:** none (scheduled orders come from the POS).

### R3. One session = one bill (your rule c): kept as is

`billableOrderWhere` already selects by `tableSessionId`, so once R2 attaches every order, the bill, the guest poll, the receipt and the floor map all see the same set. What this means in practice:
- **Staff lines** (`tableGuestId = null`) are "Table (shared)". BY_ITEMS gives them to whoever ticks them, else to every active guest; EQUAL and CUSTOM ignore owners.
- **A table with no guests** (POS only) can't EQUAL-split by guests (`NOBODY_TO_SHARE`). It pays through **Settle** (R4).
- **A party that wants two bills at the same table** is a bill split (CUSTOM or BY_ITEMS), not two sessions. One table holds one open session.

**Backend.** Nothing beyond R2 and R4.

**POS.** `TablePanel`'s order list labels each order:
- the guest's name, for a QR round;
- "Order taker · <name>", for an order taker's order;
- "Counter · <name>", for a POS order.

**Customer.** "Added by staff" (R2).

### R4. One way to pay a table (your rule d): changed from "one path at a time" to "one path"

The code shows the per-order path and the bill path interleaving in four places:
- an order paid one by one drops out of the bill (`billableOrderWhere` excludes `VERIFIED`);
- the guard against per-order payment runs outside the transaction (D4);
- `/delivered` completes unpaid (D6);
- the no-bill close rule trusts per-order completion.

Switching between paths is where the double payments live. The rule is therefore:

**An order attached to a session is paid only through that session's bill.**
- `PATCH /orders/:id/payment-status`, `POST /:id/complete` and `POST /:id/delivered` answer 409 `USE_TABLE_BILL` for **any** order with a `tableSessionId`, not only once a bill is requested.
- The check moves **inside** each transaction, after `lockTableForOrder` (R10).

To keep the counter fast, staff get two shortcuts. Both are bill writes under the session lock (`openBillForWrite`), so a guest's share payment and a staff settlement are serialised and can never both settle the same orders.

**`POST /table-sessions/:id/settle`** (SA, PA; OT only at their own tables, cash, no discount — decision 6). Body:

```
{ method: CASH | ONLINE, paidAmount?, discount?, discountReason?, expectedBillVersion? }
```

One transaction:
1. `openBillForWrite`. Refused when:
   - an order waits at reception → `ORDERS_AWAITING`;
   - a share has money → `SPLIT_HAS_PAYMENTS` ("Check the guests' payments first, or collect the rest");
   - nothing is billable → `NOTHING_TO_SETTLE`.
2. Request the bill if needed.
3. Apply the discount through `setBillDiscount`'s rules (cap, reason, allocation).
4. Replace the split with one CUSTOM share for the total, labelled "Paid at the counter", `VERIFIED` with the method; `paidAmount ≥ total` or 400 `PAID_AMOUNT_TOO_LOW`.
5. `markPaidIfComplete` (bill `PAID`, receipt).
6. Then the `closeTable` settlement and close (orders `VERIFIED` + `COMPLETED`, session `CLOSED`).
7. Write the `SETTLED` session event.

Answer: `{ session, receiptKey, change }`.

**`POST /table-sessions/:id/bill/collect-cash`** (same roles). Body: `{ expectedVersion }`. Every live `UNPAID`/`REJECTED` share → `VERIFIED` cash in one transaction. Refused with 409 `PROOFS_TO_CHECK` while any share is `PROOF_SUBMITTED`. For a split where some guests paid online and the rest pay the cashier.

**Orders paid one by one before this change** stay paid. Settle and close complete them, as `settleTableOrdersInTransaction` already does for every open order.

**POS.**
- **Order Detail** for a table order hides Confirm Payment, Mark unpaid and Complete. In their place: "Paid through Table 2's bill — Open table", plus the `TableBillPanel` (already mounted).
- **Orders list:** the Complete quick action and the cash toggle are hidden for table orders.
- **`CompleteOrderDialog`:** a table order links to the table instead.
- **`TableBillPanel`:**
  - **Settle & close**: amount, discount with reason (cap hint), method, cash received, change;
  - **Collect the rest in cash**, when a split exists.

**Customer.** A table settled at the counter closes. The next poll gets 401 `SESSION_ENDED` with `receiptKey` (existing behaviour), and the phone shows "Your table is closed — view receipt".

### R5. Closing (your rule e): kept; auto-release only for sessions an order opened

- **Explicit close** stays `POST /table-sessions/:id/close` and keeps its guards (`BILL_NOT_PAID`, `SESSION_HAS_OPEN_ORDERS`). The no-bill path also refuses while any non-cancelled order isn't `VERIFIED` — 409 `SESSION_HAS_UNPAID_ORDERS` with `orderIds` — which closes D6 for orders completed unpaid before this change (S30). Closing a parent also closes its merged children in the same transaction.
- **Auto-release** — `releaseIfIdle(tx, sessionId, actorId)` in `tableOccupancy.ts`.
  - Called inside the transaction of:
    - `cancelInTransaction`;
    - `rejectOrder`;
    - `cancelTableGuestRound`;
    - an order move (source session);
    - a split-off (source session).
  - It voids the session only when all of these hold:
    - `openedVia` ∈ {`STAFF_ORDER`, `SCHEDULED_ORDER`, `MIGRATION`, `SPLIT_OFF`};
    - no non-cancelled order;
    - no active guest;
    - no open call;
    - no merged child.
  - The void: status `VOIDED`, `voidReason` "All orders cancelled", event `AUTO_RELEASED`, version +1.
  - After the commit: `table-session:updated`, `table:updated`.
  - A session opened by **Seat** is never auto-released. Someone seated a party on purpose, so someone closes it (decision 3).
- **Void** (`POST …/void`) is unchanged.

**POS.** The panel shows "Opened by order #12" for an order-opened session. After a cancel that freed the table, the toast says "Table 2 is free again".

**Customer.** Nothing new. An auto-released session has no guests by definition.

### R6. Business day

- A session belongs to its day (`TableSession.businessDayId`). R2 never joins a session from another day.
- **End without `force`:** unchanged on the server. The **End Day dialog** (D11) lists `openTableSessions` with, per table:
  - **Settle & close** (R4);
  - **Close** (when nothing is open);
  - **Void** (SA/PA, no accepted orders);
  - **Open table** (the map).

  "End anyway" is offered while any table blocks.
- **End with `force`**, in the same transaction as the day end:
  - every session of the day with no open order, no unpaid non-cancelled order and no share with money is closed (event `DAY_END_CLOSED`; a receipt when anything was paid);
  - the rest stay open and become `PREVIOUS_DAY` on the map;
  - guests there can't order (existing rule, C15);
  - staff can't add orders (`TABLE_FROM_PREVIOUS_DAY`), but can Settle, Close, Void or Move them;
  - the body of the answer lists what was closed and what was left.
- **Start of day:** `BusinessDayBar` shows "2 tables are still open from the previous day" with a link to the map, when `GET /tables/floor` has any `fromPreviousDay`.

**Customer.** An open previous-day session already shows `closedReason: "no_business_day"` (read-only). Unchanged.

### R7. Table changes: move an order, move the party, merge, split off

These four are the only ways an order or a party changes table. `PATCH /orders/:id/assign` stops taking `diningAreaId` (400 `USE_MOVE_TABLE`); waiter and rider stay.

**Move one order** — `POST /orders/:id/move-table` (SA, PA). Body: `{ diningAreaId, expectedTableSessionId }`.

Guards:
- `DINE_IN` only → otherwise 409 `NOT_DINE_IN`;
- not `COMPLETED`/`CANCELLED` → otherwise 409 `ORDER_NOT_MOVABLE`;
- a `SCHEDULED` order just changes `diningAreaId`;
- a QR guest's own round → 409 `GUEST_ROUND_NOT_MOVABLE` (the round belongs to a person; move the party or split the table);
- source or target bill with money → `SPLIT_HAS_PAYMENTS`;
- the same table → 400 `SAME_TABLE`.

One transaction:
1. Lock both `DiningArea` rows in id order, then the source session.
2. `ensureOpenSession(target, expected)`.
3. Update `diningAreaId` and `tableSessionId`.
4. `syncTableBill` on both sessions.
5. `releaseIfIdle(source)`.
6. Write the `TABLE_CHANGED` `OrderEvent` (`before`/`after` table names) and the `ORDER_MOVED_OUT` / `ORDER_MOVED_IN` session events.

After the commit:
- `order:table-changed { orderId, orderNumber, diningArea: { id, name, area }, fromDiningArea }` to every kitchen room with unserved items, `pos-admin`, `order-takers` and `user:<placedByStaffId>`;
- `tableOrderChanged` for both sessions.

**Move the party** — `POST /table-sessions/:id/move` (SA, PA, OT). Body: `{ diningAreaId }`.
- The target must have no open session → 409 `TARGET_OCCUPIED` with `sessionId` (the dialog offers Merge).
- The target must be available (`TABLE_UNAVAILABLE`).
- A merged child can't move on its own → `SESSION_IS_MERGED`.
- One transaction: lock both tables in id order, then the session; update `session.diningAreaId`, every order of the session that sat at the old table, and its open calls; event `TABLE_MOVED`; version +1.
- Guests keep their tokens. Money doesn't change, so it's allowed at any bill state.
- `order:table-changed` per open order.

**Merge** — `POST /table-sessions/:id/merge` (SA, PA, OT). Body: `{ intoSessionId }`.
- Guards:
  - both `OPEN`;
  - the same business day → otherwise `MERGE_DIFFERENT_DAY`;
  - neither already a child → `SESSION_IS_MERGED`;
  - no share with money on either bill → `SPLIT_HAS_PAYMENTS`.
- One transaction (both sessions locked in id order):
  - the source's orders, guests and open calls move to the target. Orders keep their own table. Guests get new `joinOrder`s after the target's and a " 2" suffix on a name clash, and keep their tokens;
  - the source's bill, if any, goes `UNLOCKED` with its shares `VOID`;
  - the source keeps its row, still `OPEN`, so the partial index keeps its table taken, with `mergedIntoSessionId` set;
  - `syncTableBill(target)`; events `MERGED` on both; versions +1.
- The source table's tile reads the parent's state "with Table 2". A guest scanning the source table's QR joins the parent: `joinTable` follows the pointer.

**Unmerge** — `POST /table-sessions/:id/unmerge` (child id). The party gives the table back: the child goes `VOIDED` ("Unmerged"), its table is free, and the orders stay on the parent's bill. No money effect, no guard beyond `OPEN`.

**Split off** — `POST /table-sessions/:id/split-off` (SA, PA). Body: `{ diningAreaId, orderIds, guestIds }`. Part of the party moves to a free table with its own bill.
- The target must be free (`TARGET_OCCUPIED`).
- A guest moves with all their rounds, and a round only with its guest → otherwise 400 `GUEST_ROUNDS_MUST_MOVE_TOGETHER`.
- No money on the source bill (`SPLIT_HAS_PAYMENTS`).
- A new session: `openedVia: SPLIT_OFF`, same day, a new PIN per setting. Orders and guests move; both bills are synced; `releaseIfIdle(source)`.

**POS.**
- `TablePanel` gains **Move party**, **Merge with…**, **Split off…** and (child) **Unmerge**. Each uses a table picker built on the same floor tiles; free tables are enabled for move and split, occupied ones for merge.
- **Order Detail** replaces the Assign form's table select with **Move to table…** (same picker, R2's occupied-table line).
- **Kitchen Display** listens for `order:table-changed` and patches the table name on those cards. A refetch shows the same, because the queue reads the order.
- **Print:** kitchen slips reprinted after a move show the new table.

**Customer.**
- The poll's `table` is the current table. A new `movedFrom: { name } | null` comes from the latest `TABLE_MOVED` event, and the phone shows a one-time banner "Your table moved to Table 7".
- After a merge, the guest list grows and the table line reads "Table 2 + Table 3" (a new `joinedTables` in the poll).
- A guest moved by a split-off sees their new table name and only their new bill.

### R8. Table admin while a session is open

| Action | Rule | Code |
|---|---|---|
| `PUT /dining-areas/:id` with `isActive: false` or `outOfService: true`, table (or its merged child) has an open session | Refused | 409 `TABLE_IN_USE` "Table 2 has guests (open since 7:40 PM). Close or move them first." |
| `DELETE /dining-areas/:id` | Refused first with the same check; otherwise the existing FK 409 ("has history — deactivate instead") | 409 `TABLE_IN_USE` |
| `POST /dining-areas/:id/qr-key/regenerate` | Allowed. The answer gains `openSession: boolean`; joined guests keep their tokens | — |

**POS.**
- `DiningAreasPage` shows the server's message.
- `QrSheetPage` / `TablePanel`'s regenerate dialog adds, when seated: "Guests already at this table stay joined; anyone new needs the new card."

### R9. Takeaway, delivery and online orders never touch tables (your rule f): kept and enforced

- `createOrder` throws (400 `TABLE_NOT_ALLOWED`) when `type ≠ DINE_IN` and `diningAreaId` or `tableSessionId` is set. Today only the POS controller checks this, and only for TAKEAWAY.
- `assignOrder` loses `diningAreaId` (R7).
- A database CHECK backs both (§3.3).

**POS / customer.** No change; the pickers already show only for dine-in.

### R10. Locks and transactions

One lock order for everything that touches tables:

> per-day advisory lock (only order creation takes it) → `DiningArea` rows (by id) → `TableSession` rows (by id) → `Order` rows → `TableBill` → `TableBillShare`

- **New helper `lockTableForOrder(tx, orderId)`** in `tableOccupancy.ts`: reads the order's `tableSessionId` (and the parent's, for a child) and locks the session row `FOR UPDATE`. It is the first statement of every order transaction that can change a table's money or membership:
  - `cancelInTransaction`;
  - `rejectOrder`;
  - `acceptOrder`;
  - `addOrderItems`;
  - `removeOrderItem`;
  - `replaceOrderContents`;
  - `reviewOrderChange`;
  - `updatePaymentStatus`;
  - `completeOrder`;
  - `markOrderDelivered`;
  - move and split.

  The order → bill vs bill → order inversion (D5) disappears, because both sides now start at the session.
- **`USE_TABLE_BILL`** is checked after that lock, inside the transaction (D4).
- **`acceptOrder` / `rejectOrder`** become conditional (`updateMany … where status = AWAITING_RECEPTION`, 409 when the count is 0), like `cancelInTransaction` (D7).

### R11. Real-time and reconnects

- Every change that adds, removes or moves an order on a session, or opens, closes, moves, merges or splits a session, emits `table:updated` for **every table it touched** and bumps every touched session's `version` (guest ETag).
- `tableOrderChanged` gains the missing callers (D8): `reviewOrderChange` EDIT, `cancelOwnAwaitingOrder`, note edits.
- `table-session:updated` gains `openedVia` and `mergedIntoSessionId`.
- New: `order:table-changed` (R7).
- **Staff screens keep the existing rule:** an event only invalidates queries, and every `connect` refetches. The pickers read `["tables","floor"]`, which `TableCallsProvider` already refreshes on every connect in both shells. A picker opened from a stale screen is still safe, because the server compares `expectedTableSessionId`.
- **Kitchen Display** already refetches its queue on reconnect; `order:table-changed` is a convenience on top.
- **Phones** poll (5 s / 30 s) and are unaffected by socket drops.

### R12. Staff accounts

- When `PUT /staff/:id` deactivates an account, changes its role away from SA/PA/OT, or `DELETE` deactivates it, `staff.controller` clears `waiterStaffId` on every open session that had it, with a `WAITER_CHANGED` event (actor = the admin) and `table-session:updated`. Calls then go to everyone (existing fallback), and the OT cash rule falls to SA/PA.
- `seatedById` / `openedByOrderId` stay as history.
- Logging out changes nothing on the server.

### R13. Printing

- **Kitchen slips:** unchanged, per order. After a move they print the new table.
- **Running bill (before payment):** new `POST /table-sessions/:id/bill/print` (FLOOR roles; OT at their own tables, the `printReceipt` rule). The server builds the document from the session's billable orders (header "Bill — not a receipt", table, orders with lines, subtotal, discount, total, "Pay at the counter or from your phone"). Same no-caller-blocks rule as the receipt print fix in `TABLE_QR_REVIEW.md`.
- **Final receipt:** the existing `TableReceipt` print (`POST …/receipt/print`), made when the bill becomes `PAID`.

**POS.**
- On Order Detail for a table order, "Print table receipt" becomes **Print table bill** (whole table), and "Print final receipt" becomes **Print table receipt**, enabled once the bill is paid.
- The single-order receipt stays available as **Print this order only**, for kitchen or audit.
- The browser fallback: a new `/table-sessions/:id/print/bill` page rendering the same server document.

**Customer.** Unchanged: the receipt link after payment.

---

## 3. Data model and migrations

All additive: new enum values, a new enum, new nullable columns or columns with a default, an index, and CHECKs added at the end.

### 3.1 Migration 1 — `…_table_sync` (build step 1)

```prisma
enum TableSessionOpenedVia {
  SEAT             // staff pressed Seat (explicit open, explicit close)
  STAFF_ORDER      // the first POS / order-taker order opened it
  SCHEDULED_ORDER  // a released scheduled order opened it
  SPLIT_OFF        // part of a party moved here
  MIGRATION        // created by the backfill (§3.2)
}

model TableSession {
  // … existing
  openedVia           TableSessionOpenedVia @default(SEAT)
  // The order that opened it (STAFF_ORDER / SCHEDULED_ORDER): "Opened by order #12". No FK, history only.
  openedByOrderId     String?
  // Merged into another session (R7): this row stays OPEN so its table stays taken; orders, guests and
  // calls live on the parent. Restrict: a parent can't be deleted under its children.
  mergedIntoSessionId String?
  mergedInto          TableSession?  @relation("SessionMerge", fields: [mergedIntoSessionId], references: [id], onDelete: Restrict)
  mergedChildren      TableSession[] @relation("SessionMerge")
  @@index([mergedIntoSessionId])
}

enum TableSessionEventType {
  // … existing, plus:
  OPENED_BY_ORDER AUTO_RELEASED ORDER_MOVED_IN ORDER_MOVED_OUT TABLE_MOVED
  MERGED UNMERGED SPLIT_OFF SETTLED MIGRATED DAY_END_CLOSED
}

enum OrderEventType {
  // … existing, plus:
  TABLE_CHANGED
}
```

No backfill in this file: `ALTER TYPE … ADD VALUE` can't be used later in the same migration (TABLE_QR_SPEC §2.5). Apply it the documented way:
1. try `prisma migrate dev`;
2. on the known checksum or shadow-database refusal, write the SQL with `migrate diff`;
3. apply it with `migrate deploy`;
4. confirm with `migrate diff` that nothing drifted.

Never reset.

### 3.2 Migration 2 — `…_table_sync_backfill` (build step 1): existing open orders

**Before it runs, everywhere:** a read-only script `backend/scripts/check-table-sync.ts` prints what it will do: per table, the orders it will attach or leave, and why. Run it against the deploy target and read it before deploying.

The migration is plain SQL, so local, the demo Railway database and production all get the same result from `migrate deploy`.

**Which orders.** "Candidates": `type = 'DINE_IN'`, `diningAreaId` not null, `tableSessionId` null, and `status` in `AWAITING_RECEPTION`, `PENDING`, `CONFIRMED`, `IN_KITCHEN`, `READY` — whatever their payment status, since a paid but open order still occupies the table.

1. **Attach to an existing open session** of the same table and the same business day:

   ```sql
   UPDATE "Order" o SET "tableSessionId" = s.id
   FROM "TableSession" s
   WHERE o."tableSessionId" IS NULL AND o.type = 'DINE_IN' AND o."diningAreaId" IS NOT NULL
     AND o.status IN ('AWAITING_RECEPTION','PENDING','CONFIRMED','IN_KITCHEN','READY')
     AND s."diningAreaId" = o."diningAreaId" AND s.status = 'OPEN'
     AND s."businessDayId" = o."businessDayId";
   ```

2. **Create sessions for the rest.** For each table that still has candidates and **no** open session, insert one `TableSession` for the table's **latest** business day among them:
   - `id`: `gen_random_uuid()` (built into Postgres 13+);
   - `openedVia`: `'MIGRATION'`;
   - `seatedById`: the earliest candidate's `placedByStaffId`, else that day's `BusinessDay.openedById`;
   - `seatedAt`: the earliest candidate's `createdAt`;
   - `waiterStaffId`: the earliest candidate's placer when that is an active ORDER_TAKER, else null;
   - `joinPin`: null (staff can't rotate a PIN on it: `PIN_NOT_ENABLED`, which is acceptable).

   Attach that day's candidates to it.

3. **Record it:** one `MIGRATED` `TableSessionEvent` per created session, `after: { orderCount }`.

**Left alone** (the check script lists them):
- candidates on an older day than the table's latest;
- candidates on a table that already has an open session on another day.

These are stragglers from earlier forced day ends. Complete or cancel them before deploying (the End Day dialog does that). Until they're gone, the CHECKs in §3.3 aren't added.

### 3.3 Migration 3 — `…_table_sync_checks` (build step 6, after the consistency review)

Only once `check-table-sync.ts` reports zero of each:

```sql
-- R9: only dine-in orders have a table or a session.
ALTER TABLE "Order" ADD CONSTRAINT "Order_table_needs_dine_in"
  CHECK ("type" = 'DINE_IN' OR ("diningAreaId" IS NULL AND "tableSessionId" IS NULL));
-- R1/R2: an accepted, open dine-in order with a table always has a session.
ALTER TABLE "Order" ADD CONSTRAINT "Order_open_dine_in_has_session"
  CHECK (NOT ("type" = 'DINE_IN' AND "diningAreaId" IS NOT NULL AND "tableSessionId" IS NULL
              AND "status" IN ('PENDING','CONFIRMED','IN_KITCHEN','READY')));
```

`AWAITING_RECEPTION` is left out on purpose: a scheduled order released onto a busy table waits unattached until accept (R2a).

`order.diningAreaId` must also equal the session's table, or one of its merged children's. That can't be a CHECK (it spans tables), so the check script tests it too.

---

## 4. API, events and conflict codes

### 4.1 Endpoints (staff unless noted; errors `{ error, code, …extra }`)

| Method + path | Roles | Change |
|---|---|---|
| `POST /api/pos/orders` | SA, PA | `DINE_IN` needs `expectedTableSessionId: string \| null` (400 `TABLE_EXPECTATION_REQUIRED`). Answer gains `tableSession: { id, opened, pin } \| null`. Non-dine-in with a table → 400 `TABLE_NOT_ALLOWED` |
| `POST /api/pos/orders/submit` | OT | Same field and answer |
| `POST /api/pos/orders/:id/accept` | SA, PA | Optional `expectedTableSessionId`, `diningAreaId` (only for an unattached dine-in order, R2a); 409 `TABLE_DECISION_NEEDED` |
| `PATCH /api/pos/orders/:id/assign` | SA, PA | `diningAreaId` → 400 `USE_MOVE_TABLE` |
| `POST /api/pos/orders/:id/move-table` | SA, PA | New (R7) |
| `PATCH /orders/:id/payment-status`, `POST /:id/complete`, `POST /:id/delivered` | SA, PA | 409 `USE_TABLE_BILL` for any order with a session (was: only with a requested/paid bill) |
| `GET /api/pos/tables/floor` | SA, PA, OT | Session gains `openedVia`, `orderCount`, `total`, `fromPreviousDay`, `joinedTo`, `joined`; state `PREVIOUS_DAY`; inactive tables with an open session flagged |
| `POST /api/pos/table-sessions/:id/move` | SA, PA, OT | New (R7) |
| `POST /api/pos/table-sessions/:id/merge`, `/unmerge` | SA, PA, OT | New (R7) |
| `POST /api/pos/table-sessions/:id/split-off` | SA, PA | New (R7) |
| `POST /api/pos/table-sessions/:id/settle` | SA, PA; OT own tables, cash, no discount | New (R4) |
| `POST /api/pos/table-sessions/:id/bill/collect-cash` | SA, PA; OT own tables | New (R4) |
| `POST /api/pos/table-sessions/:id/bill/print` | SA, PA; OT own tables | New (R13) |
| `POST /api/pos/business-day/end` | SA, PA | `force: true` closes idle sessions (R6); the answer gains `closedTableSessions`, `leftOpenTableSessions` |
| `PUT /api/pos/dining-areas/:id`, `DELETE` | SA, PA | 409 `TABLE_IN_USE` (R8) |
| `POST /api/pos/dining-areas/:id/qr-key/regenerate` | SA, PA | Answer gains `openSession` |
| `GET /api/online/table/session` (guest) | guest | Gains `table.movedFrom`, `joinedTables`; staff rounds already present (`guestName: null`) |
| `POST /api/online/table/:qrKey/join` (guest) | public | Follows `mergedIntoSessionId` to the parent |

### 4.2 Socket events

| Event | To | Payload | When |
|---|---|---|---|
| `table:updated` (existing) | `pos-admin`, `order-takers` | unchanged | for **every** table a change touched (R11) |
| `table-session:updated` (existing) | same | gains `openedVia`, `mergedIntoSessionId` | open by order, auto-release, move, merge, unmerge, split-off, settle, day-end close |
| `order:table-changed` (new) | kitchen rooms with unserved items, `pos-admin`, `order-takers`, `user:<placedByStaffId>` | `{ orderId, orderNumber, diningArea: { id, name, area }, fromDiningArea: { id, name } }` | order move, party move |
| `table-bill:updated` (existing) | same as today | unchanged | settle, collect-cash, merge, split-off |

### 4.3 Conflict codes

The `session` summary in 409s is `{ id, tableName, openedAt, openedVia, orderCount, total, guestCount, fromPreviousDay }`. It never holds the PIN.

| Code | HTTP | Message (shown as is) | Raised by |
|---|---|---|---|
| `TABLE_EXPECTATION_REQUIRED` | 400 | "Pick the table again — this screen is out of date. Reload the page." | create/submit without the field |
| `TABLE_OCCUPIED` | 409 | "Table 2 is already open (since 7:40 PM · 2 orders · Rs 2,300). Add this order to it?" | `ensureOpenSession`, `seatTable` (existing code) |
| `TABLE_STATE_CHANGED` | 409 | "Table 2 changed while you were ordering. Check it and send again." | `ensureOpenSession` |
| `TABLE_FROM_PREVIOUS_DAY` | 409 | "Table 2 is still open from the previous business day. Settle or close it first." | `ensureOpenSession`, merge |
| `TABLE_UNAVAILABLE` | 409 | "Table 2 is out of service." (existing) | `ensureOpenSession`, moves |
| `TABLE_DECISION_NEEDED` | 409 | "Table 2 is busy. Add this order to its bill, or choose another table." | accept (R2a) |
| `TABLE_NOT_ALLOWED` | 400 | "Only dine-in orders can have a table." | `createOrder` |
| `USE_MOVE_TABLE` | 400 | "Use Move to table to change an order's table." | assign |
| `USE_TABLE_BILL` | 409 | "This order is paid through Table 2's bill. Open the table to take payment." | payment-status, complete, delivered |
| `SPLIT_HAS_PAYMENTS` | 409 | "Table 2's bill already has payments on its shares. Check or unmark them before changing the bill." (existing) | order create/move/merge/split-off/settle, every order change |
| `ORDERS_AWAITING` | 409 | existing | settle |
| `SESSION_HAS_UNPAID_ORDERS` | 409 | "Table 2 still owes Rs 1,200 (order 9). Settle the table to close it." | close without a paid bill |
| `NOTHING_TO_SETTLE` | 409 | "There's nothing left to pay at this table." | settle |
| `PAID_AMOUNT_TOO_LOW` | 400 | "Cash received must be at least Rs 2,300." | settle |
| `PROOFS_TO_CHECK` | 409 | "Some guests uploaded payment proofs. Check them before collecting the rest." | collect-cash |
| `NOT_DINE_IN` | 409 | "Only dine-in orders sit at a table." | move-table |
| `ORDER_NOT_MOVABLE` | 409 | "Finished or cancelled orders can't change table." | move-table |
| `GUEST_ROUND_NOT_MOVABLE` | 409 | "This round belongs to a guest at the table. Move the whole party, or split the table." | move-table |
| `SAME_TABLE` | 400 | "The order is already at Table 2." | move-table, move |
| `TARGET_OCCUPIED` | 409 | "Table 7 is taken. Merge the two tables instead?" | move, split-off |
| `SESSION_IS_MERGED` | 409 | "Table 3 is joined to Table 2. Open Table 2, or unmerge first." | move, merge, split-off, settle, close on a child |
| `MERGE_DIFFERENT_DAY` | 409 | "These tables were opened on different business days." | merge |
| `GUEST_ROUNDS_MUST_MOVE_TOGETHER` | 400 | "A guest moves with all of their rounds." | split-off |
| `TABLE_IN_USE` | 409 | "Table 2 has guests (open since 7:40 PM). Close or move them first." | dining-area update/delete |
| `NOT_YOUR_TABLE` | 403 | existing | OT settle / collect-cash / print at another waiter's table |

---

## 5. Scenarios

Each scenario lists the expected result in four places — **POS**, **Kitchen**, **Phone** (the guest's) and **Reports** — then the code that makes it so and the conflicts. "Reports" means sales, unpaid and cancelled as `reports/salesDefinitions.ts` defines them. All of them read `Order` only, so no report query changes anywhere in this spec.

**S1. POS order on a free table.**
- POS: the picker shows Table 2 "Free". The order goes in with `expectedTableSessionId: null`; the session opens (`STAFF_ORDER`); the confirmation says "Table 2 is now open" + PIN; the map tile turns IN_KITCHEN at once.
- Kitchen: the usual `order-item:new` and slips.
- Phone: a guest scanning Table 2 can join (PIN when set) and sees the order as "Added by staff".
- Reports: unchanged; unpaid until settled.
- Backend: R2.

**S2. POS order where guests are already ordering from their phones.**
- POS: the tile reads "Occupied · 3 guests · 2 rounds"; the cashier taps "Add to Table 2's open bill". The order joins the session and the bill. If the guests had split the bill without paying, the split is cancelled and they see "The bill changed — please split again".
- Kitchen: normal.
- Phone: a new round "Added by staff" appears at the next poll.
- Reports: unchanged.
- Conflicts: a share with money → 409 `SPLIT_HAS_PAYMENTS` ("check payments first"); the cashier unmarks or rejects, or rings it up as a separate takeaway. The bill isn't left inconsistent (D3).

**S3. QR order on a table the waiter opened by POS.**
- POS: the round lands in Incoming as today ("QR · Table 2 · Round 2"), and the panel lists it under the same session.
- Kitchen: after accept, as today.
- Phone: the guest joined the staff-opened session; rounds and bill include the staff orders.
- Reports: unchanged.
- Backend: nothing new; the landing already reports `OPEN`.

**S4. A guest who can't or won't use the phone** (no wifi, expired or regenerated QR, refuses).
- POS: staff order for them from the POS or the order taker's phone into the same session.
- Phone: the other guests see those lines as "Table (shared)". BY_ITEMS shares them across active guests unless someone ticks them. So the cashier either uses CUSTOM with a share for the phone-less guest ("Pays at the counter", no guest id, marked paid by staff), or settles the whole table.
- An old card after a QR regenerate answers "We could not find this table". Staff seat them by ordering; the new card works for joining.
- Reports: unchanged.

**S5. Order taker and cashier order for the same table at the same moment.**
- Both send `expectedTableSessionId: null`. The per-day advisory lock and the table row lock serialise them: the first opens the session; the second gets 409 `TABLE_OCCUPIED` with the summary.
- POS / OT phone: "Table 2 was just opened by Ali (order 14). Add your order to it?" — one tap resends with the id.
- Kitchen: both orders, normally.
- Reports: unchanged.

**S6. Two staff seat the same table at once.**
- The table row lock makes the second Seat wait; it then sees the open session → 409 `TABLE_OCCUPIED` + `sessionId`.
- POS: the panel shows that session instead of an error.
- Phone and reports: nothing.

**S7. Order rejected or cancelled at reception.**
- POS: the round leaves Incoming as today. If it was the session's only order and the session was opened by that order, `releaseIfIdle` frees the table in the same transaction: the tile turns EMPTY, toast "Table 2 is free again".
- Kitchen: nothing reached it.
- Phone: QR rounds show "Cancelled" + reason, as today.
- Reports: a rejected order is never in sales.

**S8. The last order on a table is cancelled.**
- Order-opened session, no guests → auto-released (S7).
- Seated session, or guests joined → stays open as SEATED; staff close it or the guests order again.
- Kitchen: `order:cancelled` drops the cards; stock returns as today.
- Reports: cancelled (after payment, if paid).

**S9. Items added or removed after the bill was requested or the split started.**
- No money on shares: `syncTableBill` cancels the split. POS shows "Split cancelled — the bill changed"; phones show "The bill changed — please split again". Kitchen gets the new items.
- Money on a share: the change is refused with 409 `SPLIT_HAS_PAYMENTS` before anything is written.
- New guest rounds stay blocked by `BILL_LOCKED`. Staff orders are allowed (S2's rule).
- An order-taker order sent to a table whose bill is requested waits at reception and blocks splitting (`ORDERS_AWAITING`) until reviewed. Its card says "Table 2 has asked for the bill".
- Reports: unchanged.

**S10. POS discount vs the guests' split.**
- A discount given at create or accept is part of that order's total and flows into the bill.
- Once the table pays through the bill, a discount is only a bill discount (`PUT …/bill/discount` or Settle's field). It is allocated onto the orders, with the same cap and reason rules, and cancels an unpaid split. Refused with `SPLIT_HAS_PAYMENTS` once a share has money.
- The per-order Confirm Payment discount is gone for table orders (R4).
- Phone: new total, "split again".
- Reports: each order's own `discount` and `DISCOUNT_SET` event (`via: "table_bill"`), so the Discounts table is right.

**S11. A guest paid online while the cashier takes cash.**
- Settle refuses with `SPLIT_HAS_PAYMENTS` while a share is `PROOF_SUBMITTED`/`VERIFIED`; collect-cash refuses with `PROOFS_TO_CHECK`. The cashier verifies or rejects the proof first, then collects the rest.
- If the cashier settles first, the guest's proof upload answers 409 (bill `PAID`) or 401 (closed): the phone shows the receipt, so the guest knows not to pay.
- If both really happened outside the system, it's a manual refund; the proof and the cash share are both on the session's history.
- Reports: sales = Σ order totals once, never twice.

**S12. Moving an order to another table.**
- POS: Order Detail → Move to table… → the target follows S1/S2 (open or join).
- A guest's own QR round can't move alone (`GUEST_ROUND_NOT_MOVABLE`).
- Kitchen: `order:table-changed` updates the cards; reprinted slips show the new table.
- Phone: the source table's guests lose the round from their bill; the target's guests gain it (staff order) or, for a staff order, see it as "Added by staff".
- Reports: the order's table is the new one; a `TABLE_CHANGED` event keeps the old one.

**S13. Moving the whole party.**
- POS: panel → Move party → a free table. The tile moves; the old table is EMPTY.
- Kitchen: `order:table-changed` for each open order.
- Phone: tokens keep working; banner "Your table moved to Table 7"; poll and bill unchanged. Their old card now opens the old table's landing (free); they keep using the open tab.
- Reports: unchanged.
- Conflicts: target taken → `TARGET_OCCUPIED` (offer Merge).

**S14. Merging two tables.**
- POS: panel → Merge with… Both tiles show one state ("Table 3 with Table 2"); one bill.
- Kitchen: unchanged; orders keep their own table on slips.
- Phone: both tables' guests now share one guest list and bill. Their tokens keep working: the guests moved. A new guest scanning either table joins the parent.
- Reports: unchanged.
- Conflicts: `SPLIT_HAS_PAYMENTS`, `MERGE_DIFFERENT_DAY`, `SESSION_IS_MERGED`.

**S15. Splitting a table.**
- POS: panel → Split off… → pick a free table, then the guests and staff orders that go. Two sessions, two bills.
- Kitchen: `order:table-changed` for moved orders.
- Phone: moved guests see their new table and a bill with only their rounds and the moved staff orders. The others see the rest.
- Two bills **at the same table** are a bill split, not a table split (R3).
- Conflicts: `TARGET_OCCUPIED`, `GUEST_ROUNDS_MUST_MOVE_TOGETHER`, `SPLIT_HAS_PAYMENTS`.

**S16. Table deleted, made unavailable, or its QR regenerated while a session is open.**
- Delete, deactivate or out of service → 409 `TABLE_IN_USE`.
- Regenerate is allowed: joined guests unaffected; new guests need the new card; the dialog says so.
- Kitchen and reports: nothing.

**S17. Scheduled orders with a table.**
- While scheduled: no session; the table looks free; changing its table is just a field change (`move-table`).
- At release, table free → the session opens (`SCHEDULED_ORDER`) and the order waits in Incoming, attached.
- At release, table busy → released unattached. The Incoming card asks "Add to Table 2's bill / Choose another table" (`TABLE_DECISION_NEEDED` if accepted blindly).
- Kitchen: after accept, as today.
- Phone: guests at that table see the order once it is attached.
- Reports: unchanged.

**S18. Business day ended with open sessions.**
- Without force: the dialog lists tables with Settle, Close and Void.
- With force: idle sessions close; the rest show "From yesterday" on the map; nobody can add orders there until they're settled or closed; guests read "not taking orders".
- Reports: a later settle marks those orders paid on **their own** day, so that day's sales grow after the fact. The dialog warns about this before "End anyway".

**S19. Staff deactivated or logged out.**
- Deactivated: sessions where they were the waiter lose the waiter (calls to everyone; cash at the table SA/PA). Their sockets are cut (existing). Sessions they opened stay.
- Logged out: nothing changes.
- Phone and reports: nothing.

**S20. Socket drops and reconnects** (any screen).
- Map, panel, pickers, Incoming and calls refetch on connect.
- Kitchen Display refetches its queue.
- Any action from a stale screen is checked by the server (`expectedTableSessionId`, `expectedVersion`, conditional writes) and answers a 409 with the current state.
- Phones poll, so they're unaffected.

**S21. A guest's phone left open after the table is closed.**
- The next poll → 401 `SESSION_ENDED` with `receiptKey` when paid → "Your table is closed — view receipt" (existing).
- Auto-released sessions have no guests.
- Merged or moved: the token still works (S13, S14).

**S22. Open orders on tables at the time of migration.**
- §3.2 attaches them to the open session of the same table and day, or creates a `MIGRATION` session.
- POS: tiles that read EMPTY now read correctly; the panel says "Opened before table sync".
- Kitchen and reports: nothing.
- Orders already paid one by one stay paid; Settle or Close completes them.

**S23. Receipt printing: per order vs whole table.**
- Before payment: **Print table bill** (whole session, "not a receipt").
- After payment: **Print table receipt** (the `TableReceipt`).
- **Print this order only** stays for one order.
- Kitchen slips stay per order.
- Phone: the receipt link, as today.

**S24. Waiter assignment and call routing for sessions an order opened.**
- The waiter is the order taker who opened it; else the table's default waiter; else none (calls go to all order takers and admins).
- The panel's waiter picker (TABLE_QR_SPEC step 5, still to build) changes it.
- Order taker's orders still set `Order.waiterId` from their employee link, as QR rounds do.

**S25. The PIN for sessions an order opened.**
- Made exactly as Seat makes it, from `tableQrRequirePin`. Returned once in the create answer (shown on the confirmation) and always in the panel.
- `MIGRATION` sessions have no PIN.

**S26. Previous party never closed** (staff forgot).
- POS: the picker shows "Occupied · since 3h 10m · all served". Adding an order there needs the explicit "Add to Table 2's open bill" tap, so the new party isn't merged silently. The right move is Settle or Close for the old party first, then order.
- Server: `TABLE_OCCUPIED` when the cashier expected a free table.

**S27. Takeaway, delivery, online or phone order with a table.**
- Refused: `TABLE_NOT_ALLOWED` on create, `USE_MOVE_TABLE` on assign, then the CHECK.
- Nothing reaches a table, map or phone.

**S28. Two cashiers settle the same table, or a settle races a guest's proof upload.**
- Both are bill writes under the session lock. The second settle gets the replay (`closeTable`'s repeat answer) or 409 `SESSION_NOT_OPEN`.
- The upload after a settle gets 409 / 401.
- Money moves once.

**S29. A table with staff orders only asks for the bill.**
- Requesting works. EQUAL by guests has nobody (`NOBODY_TO_SHARE`), so the panel offers Settle as the main action, with CUSTOM still possible.

**S30. A legacy unpaid order marked delivered before this change.**
- After the backfill it belongs to a session (`COMPLETED` but unpaid, so billable).
- Settle includes it; Close without a bill refuses with `SESSION_HAS_UNPAID_ORDERS` (R5).

---

## 6. Build checklist

Each step ends as `CLAUDE.md` says:
- `cd backend && npm run build` (+ the tests of the touched modules);
- `cd pos-frontend && npm run build && npm run lint`;
- `cd online-frontend && npm run build && npm run lint`;
- report the results;
- update the AS_BUILT sections named in the step and list them.

No new dependencies anywhere in this spec.

**1. Backend core — session unification, state function, backfill**
- Migration 1 (§3.1).
- `tableOccupancy.ts`: `ensureOpenSession`, `releaseIfIdle`, `lockTableForOrder`, plus pure helpers with unit tests (expectation matching, release eligibility).
- `createOrder`:
  - the `table` input;
  - `syncTableBill` for every created order with a session (D3);
  - `TABLE_NOT_ALLOWED` (R9).
- POS create and `submitOrderTakerOrder` require `expectedTableSessionId` and return `tableSession`.
- `seatTable` takes the table row lock.
- `deriveTableState` gets `PREVIOUS_DAY` and `joinedTo`; `getFloor` / `loadTableState` gain the new fields and parent resolution; inactive-with-session flag.
- `acceptOrder` / `rejectOrder` made conditional (D7).
- `tableOrderChanged` added where missing (D8).
- `releaseIfIdle` called from the cancel and reject paths.
- `scripts/check-table-sync.ts`.
- Migration 2 (§3.2), tried locally on a copy of the demo data first.
- Demo seed (`prisma/demo/today.ts`): dine-in orders pass `table`; the paid ones are settled through `settle` (step 2 provides it — until then mark the seed step pending).
- Tests:
  - two concurrent creates on a free table (one opens, the other 409);
  - create vs seat race;
  - a create on a session with a paid share (409, nothing written);
  - auto-release after reject and after cancel;
  - backfill on fixtures (attach / create / leave).
- Docs: AS_BUILT_BACKEND §2.1, §2.2, §3.9, §3.20, §4.1, §4.1a, §4.3, §5.

**2. Payment rules**
- `USE_TABLE_BILL` for any session order, checked inside the transaction after `lockTableForOrder` (D4, D6).
- `lockTableForOrder` in every order transaction listed in R10 (D5).
- `settle` and `bill/collect-cash`.
- Demo seed step finished.
- Tests:
  - payment-status vs bill request race;
  - cancel vs discount at once (no deadlock, one 409);
  - settle with a proof pending (409);
  - settle then a guest upload (409/401);
  - reports after settle (sales = Σ orders once).
- Docs: AS_BUILT_BACKEND §3.9, §3.20, §4.2a, §4.7.

**3. Move, merge, close and end day**
- Migration-free (uses step 1's columns).
- `move-table`, session `move`, `merge`, `unmerge`, `split-off`.
- `joinTable` follows the merge pointer; `closeTable` closes children.
- `assign` without `diningAreaId`; R8 guards on dining areas; R12 waiter clearing.
- `order:table-changed`.
- End Day `force` closes idle sessions; previous-day refusal in `ensureOpenSession`.
- `bill/print`.
- Tests:
  - every guard in §4.3 for these routes;
  - the lock order with two opposite moves at once;
  - merge then a guest join from the child table;
  - a forced end then a next-day order (409);
  - poll payloads after move and merge.
- Docs: AS_BUILT_BACKEND §3.6, §3.15, §3.20, §4.4, §5.

**4. POS UI**
- Pickers on the floor query, with the occupied line and the 409 dialog (C1, C2).
- `?table=` pre-select from the panel.
- Placed-order confirmation with the PIN.
- `TablePanel`: New order, Move party, Merge, Split off, Unmerge, Settle & close, Print table bill, "Opened by" labels.
- Order Detail:
  - Move to table;
  - payment and Complete hidden for table orders;
  - print buttons (R13).
- Orders list quick actions hidden for table orders.
- Incoming's table-decision card (R2a).
- End Day open-tables list + start-of-day notice (D11).
- Kitchen Display: `order:table-changed`.
- Dining-areas and QR-sheet messages.
- `tableStates.ts`: `PREVIOUS_DAY`.
- Docs: AS_BUILT_FRONTEND §7.1, §7.3, §7.6, §7.7.

**5. Customer UI**
- "Placed by your waiter" / "Placed at the counter" on staff-added rounds and in TableOrders (with a safe "Placed by staff" fallback).
- The moved-table banner (`movedFrom`); "Table 2 + Table 3" (`joinedTables`) in the app bar/title and home.
- The closed-by-counter path verified (401 with `receiptKey` → paid/closed screen → public receipt). An old closed QR or removed session without a receipt key says "Ask your waiter".
- Every table conflict code has a friendly English/Urdu message; reconnect and window focus invalidate/refetch the live poll so totals cannot stay stale.
- New En/Ur strings in `i18n` and `docs/ONLINE_SITE_STRINGS.md`.
- Docs: AS_BUILT_FRONTEND §8.

**6. Consistency review**
- `/code-review` on the branch.
- Run `check-table-sync.ts` on every database: zero unattached open dine-in orders, zero non-dine-in orders with a table, zero order/session table mismatches.
- Then migration 3 (§3.3 CHECKs).
- Walk every row of §5 by hand on two browsers and two phones.
- An end-to-end script `backend/scripts/verify-table-sync.ts` (localhost-only guard, the `verify-guest-orders.ts` style): POS order on a free table → guest joins → QR round → order taker adds → move one order → merge → split off → settle → receipt → reports show each order once.
- Update `docs/BACKEND_API.md` (new endpoints, codes, events) and mark this spec built, with deviations listed.

---

## 7. What this changes in `TABLE_QR_SPEC.md`

- **D7** (phase 1 pays per order) and **Conflict C5:** replaced by R4. A table order pays only through the bill, from its first order.
- **§0 "out of scope: table transfer and merge":** now in scope (R7).
- **§3.1 seat:** the session can also be opened by an order (`openedVia`). Auto-release is new.
- **§3.7 states:** `PREVIOUS_DAY` added; merged children read their parent.
- **§4.2 close:** closes merged children. The no-bill path can no longer meet unpaid orders.
- **§4.2 End Day `force`:** closes idle sessions instead of leaving all open.

Update that spec's status block when step 1 lands.

---

## 8. Decisions for you

Each has the default this spec already assumes, so building can start before you answer.

1. **Should every order at a table be paid through the table's bill, never one by one?** It removes the double-payment risk, and the cashier gets a one-step "Settle & close". *Default: yes.*
2. **When does an order taker's order take the table — when the waiter sends it, or when reception accepts it?** *Default: when sent; the guests are already sitting there. A rejected order frees the table again.*
3. **Should a table that staff seated (pressed Seat) but that has no orders and no guests free itself?** If yes, after how long? *Default: no. Only tables opened by an order free themselves when their orders are all cancelled; a seated table waits for someone to close it.*
4. **A scheduled dine-in order: should its table count as taken from the release time, even if the guests haven't arrived?** *Default: yes, from release; if another party is still there, reception chooses at accept.*
5. **Ending the day by force:** close every table that owes nothing automatically, and keep the others "from yesterday" until settled? *Default: yes.*
6. **May an order taker settle a table themselves?** *Default: only their own tables, cash only, no discount. Discounts and online payments stay with POS and Super Admins.*
7. **Moving a guest's own QR round to another table on its own:** allow it, or only move or split the whole party? *Default: not allowed; move the party or split the table.*
8. **Print a running "bill — not a receipt" for the table before payment?** *Default: yes.*
