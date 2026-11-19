# Table QR — build spec

Status: **backend build steps 1–3 built, POS steps 4–5 built, customer step 6 built, QR print sheet step 7 built, bill backend step 8 built, customer bill UI step 9 built** (2026-11-19; step 5 partly, see below); steps 10–12 not started. Written 2026-11-19 from the code as it stands on `demo` (`e5316f2`). Every later Table QR session builds from this file. If the code and this spec disagree, read §11 (Conflicts) first, then fix whichever one is wrong in the same task and say so.

**Deviations in what's built** (steps 1–3):
- The session `version` bump after an order change (§5.2) runs right after the order's own commit, not inside it (`table/tableNotify.ts`'s `tableOrderChanged`). A poll landing in those milliseconds may get one last 304; the next poll sees the change.
- The round guard and close/void also lock the session row (`SELECT … FOR UPDATE` / the conditional update), so a round and a close can't both win. The spec didn't say how.
- Seating checks for an open session before inserting. The partial unique index is the race backstop only.
- `POST /orders/:orderId/cancel` (a guest's own waiting round) is built, as in §3.3; Q10's default.
- Calls (step 3) are refused like rounds when QR is off or the table is unavailable (409 `QR_DISABLED`/`TABLE_UNAVAILABLE`), not only when the day ended (`ORDERING_CLOSED`).
- The escalation job doesn't run one `UPDATE … RETURNING`: it lists due calls, then escalates each with its own conditional update and emits only for the ones it won. Same exactly-once result, same as the scheduled-release job.
- `table-call:escalated` carries the same fields as `table-call:raised` (a superset of §6.2's list); calls cancelled by a close/void also emit `table-call:updated`.
- **Spec changed:** joining now also needs an active business day that is the session's own (409 `ORDERING_CLOSED`), the same rule as ordering. Before, the spec left the day check to ordering only (§4.1 join row, §5.5).

**Deviations in step 4** (POS map, see AS_BUILT_FRONTEND §7.3 "Table QR"):
- **Pulled forward from step 5:** the panel already seats (optimistic), shows/rotates the PIN, closes the table, and (SA/PA) regenerates the QR key; the TakerShell "Tables" tab (`/taker-tables`) exists. Still step 5: void, remove guest, waiter picker, call acknowledge/resolve, out-of-service switch, `TableCallsProvider`.
- **Not built in step 4, moved to step 5:** the Dining-areas fields (out of service, default waiter), the Store-settings "Table QR" card, and the "Show on QR menu" switches.
- The editor offers three shapes, Round / Square / Rectangle; the server keeps two (`ROUND`, `RECT`), and a square is a `RECT` with `w = h` that keeps equal sides when resized.
- The live map opens its own socket while it is open (`useFloorLiveUpdates`), next to `IncomingOrdersContext`/`TakerOrdersContext`'s. Step 5's `TableCallsProvider` should absorb it (§8.2).
- `GET /table-sessions/:id` doesn't return `calls` (§4.2 lists them); the panel reads open calls from `GET /table-calls` instead.

**Deviations in step 5** (POS calls/seat, see AS_BUILT_FRONTEND §7.3 "Table QR" and §7.6 consumer 4):
- **Built:** `TableCallsProvider` on the existing sockets (AppLayout and TakerShell; step 4's page-level map socket is gone); the TakerShell **Calls** tab (`/taker-calls`) with Acknowledge / Done, chime + vibration and a count badge; admin call toasts (escalated ones sticky, in danger style), a danger count badge on the Tables nav entry, Acknowledge / Done in the table panel; seating with the PIN from the order taker's Tables tab; Incoming Orders "QR · Table 4 · Round 2", "sent by", the guest on every line, and a "Table QR" filter chip.
- **"Round n"** is computed on the client: the order's position among `GET /table-sessions/:id`'s orders (oldest first). No backend change.
- **Still to build** (from §10 step 5 and the items moved here from step 4): void, remove guest, waiter picker, out-of-service switch in the panel; Order Detail / Orders list labels and the session link; the End Day dialog's open tables; guest names on slips/receipts; the Dining-areas fields; the Store-settings "Table QR" card; the "Show on QR menu" switches.
- Reject reasons for a QR round are the order-taker ones; §8.2's extra "Item not available / Kitchen closed" reasons weren't added.

**Deviations in step 9** (customer bill UI, see AS_BUILT_FRONTEND §8; decided with the owner):
- **Guests may set a CUSTOM split** (§7.4 / Q7 said staff only). The server still requires Σ = total exactly and whole rupees except share 1, and a guest's custom shares carry no guest id (they start unclaimed). The 403 `STAFF_ONLY` is gone.
- **The receipt is made when the bill becomes PAID**, in the transaction that verifies the last share, not at close; the poll's `receiptKey` is filled from then on and the close reuses it. The snapshot's `closedAt` became `issuedAt`.
- **By items "left to assign"** counts the shared (staff-added) items nobody has ticked; each guest's own rounds count as theirs. The server still splits an unticked shared item across everyone if it comes to that; the page keeps Confirm and Pay disabled until it's zero.
- **Save image** of the receipt is drawn on a canvas in the browser (§7.6 said no image export); no dependency was added.

**Deviations in step 8** (bill backend, see AS_BUILT_BACKEND §3.20):
- **Idempotent writes:** a repeated bill write whose result already holds answers 200 unchanged even with a stale `expectedVersion` (not 409 `BILL_CHANGED`); a repeated close of a `CLOSED` session answers the same `{ session, receiptKey }` instead of 409 `SESSION_NOT_OPEN`.
- **Receipt link after close:** the token is dead the moment the session closes, so the link reaches the phone in the 401 `SESSION_ENDED` body (`receiptKey`) and through `GET /receipt` (which checks the token itself), instead of in a last poll payload.
- **Cash pay:** the `BILL_CASH` call is raised once per share (request id `bill-cash:<shareId>`) and skips the guest's 60 s call cooldown and the 3-open-calls cap.
- **Proof re-upload** is also allowed while a share is `PROOF_SUBMITTED` (it replaces the earlier proof), not only from `UNPAID`/`REJECTED`.
- **A PAID bill** reads as PAYING on the floor map (all shares paid) until the table is closed; §3.7 didn't place it.
- **Claims** persist across re-splits (read regardless of `splitVersion`); the column records the split they were made in.
- **Shares of 0** are kept (EQUAL of a tiny total, CUSTOM entries of 0); BY_ITEMS gives no share to a guest owing nothing, as specified.
- `expectedVersion` is required on unlock, discount, split, claims and claim-share; optional (ignored) on mark-paid/verify/reject/unmark, which are conditional on the share's status instead.
- Error codes added: `BILL_PAID`, `NOT_AWAITING_VERIFICATION`, `NOT_VERIFIED`, `DISCOUNT_ABOVE_CAP` (403), `DISCOUNT_EXCEEDS_TOTAL`, `NOBODY_TO_SHARE`.

**Deviations in step 7** (QR print sheet, see AS_BUILT_FRONTEND §7.7):
- Two paper layouts, not just the A4 grid: A4 (6 cards per page) and a 10 × 15 cm table tent (one card per page). The card carries the logo instead of a plain shop name, and the line reads "Scan to order and call your waiter" / "آرڈر دینے اور ویٹر بلانے کے لیے اسکین کریں".
- The area filter works on the client (one fetch); the `?area=` parameter isn't used.
- No auto-print on load (unlike the receipt page): the paper is chosen first.

**Deviations in step 6** (customer QR UI, see AS_BUILT_FRONTEND §8):
- **Token in `sessionStorage`**, not `localStorage` (§8.1 said localStorage): the owner asked for it, so a shared phone forgets the table when the tab closes. The table cart is in `sessionStorage` too (`zoryx:table-cart:<qrKey>`).
- **Table home at `/t/:qrKey`** once joined (table name, guests, Call waiter, every round's timeline); §8.1's `/t/:qrKey/table` is the "Table" tab: everything ordered, grouped by guest. Joining still lands on the menu; re-scanning the QR with a valid token opens the table home, not the menu.
- Calls live on the table home (a fixed "Call waiter" button + an options sheet), not on the `/table` screen.
- Backend: CORS now exposes `ETag` (`app.ts`); without it the cross-origin poll could never send `If-None-Match` (§6.3).
- Item lines carry a kitchen note (≤ 100) from the item sheet; deals are added without one.

Read with: `CLAUDE.md`, `docs/BACKEND_API.md`, `docs/AS_BUILT_BACKEND.md` (§3.19 guest checkout, §4.1/§4.1a orders and reception, §5 sockets, §6 security), `docs/AS_BUILT_FRONTEND.md`, `docs/DESIGN_SYSTEM.md`, and `docs/design-reference/Foodly-Design-Language.md` (customer side).

---

## 0. Summary and scope

A guest scans the QR on a dining table with a phone.
- **The table is not seated:** the guest sees the menu read-only.
- **Staff have seated it:** the guest joins the table's *session* with a display name (plus a 4-digit PIN if the restaurant turned that on). The guest can then send order *rounds* and call a waiter.

Every round lands in reception's existing **Incoming Orders** inbox as `AWAITING_RECEPTION`, exactly like an order-taker or online order. Nothing reaches a kitchen until reception accepts it. Staff see every table live on a floor map.

**Phase 2** adds the table bill: request, lock, staff discount, split (equal / by items / custom), per-share payment (cash, or online with proof upload and reception verification), and one receipt for the whole table.

**Out of scope, not designed here:** games, any payment gateway, email/SMS receipts, customer accounts, table transfer and merge, reservations, tips, service charge, tax calculation (only a placeholder field for a future PRA/FBR invoice number).

---

## 1. Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Extend `DiningArea`. No new `Table` model.** | `DiningArea` already *is* the table: `Order.diningAreaId`, the POS/order-taker pickers (`DiningAreaPicker`), kitchen slips and receipts all use it. `area` is already the room/section, and `capacity` is the seat count. A second model would need syncing with it forever. |
| D2 | **Guests get updates by polling, not a socket room.** | The customer app (`online-frontend/`) has no `socket.io-client` and already polls the guest order status (`api/orders.ts`). The socket handshake (`config/socket.ts`) has only two auth realms (staff JWT, print agent); a third, anonymous one would widen the most sensitive code path. Guests act every few seconds at most, and a 5 s poll answered by a `304` costs one indexed read. |
| D3 | **One order = one guest's round.** Each phone has its own cart. The order records its submitter (`Order.tableGuestId`), and every line copies it (`OrderItem.tableGuestId`, `OrderDealLine.tableGuestId`). Lines added by staff carry `null`, shown as "Table (shared)". | It fits `createOrder` with no change to its shape, keeps the per-guest limits simple, and gives BY_ITEMS splitting its tags. A shared server-side table cart is open question Q6. |
| D4 | **Guest token**: 32 random bytes, base64url. Only its SHA-256 is stored (`TableGuest.tokenHash`, unique). It is sent in the header **`X-Table-Token`**, never in `Authorization` and never in a URL. | High-entropy, so a plain hash is enough (no HMAC needed). A separate header keeps it out of `requireAuth` and away from the staff realm. It lives only as long as the session (see §3.1). |
| D5 | **`qrKey`**: 16 random bytes, base64url, 22 characters (`guestOrder/publicIds.ts`'s `generatePublicId`), unique, **stored in plain text** and regenerable. | Staff must be able to reprint a QR, so the key can't be a hash. On its own it grants nothing: ordering also needs a seated session (and the PIN when enabled). It never appears in `GET /dining-areas` (ORDER_TAKER reads that). |
| D6 | **PIN**: 4 digits from `crypto.randomInt`, new for every session, stored in plain text on the session and returned only to staff. After 10 wrong attempts in one session it rotates automatically and staff are alerted. | Staff must be able to read it out again later in the meal. Ten tries against 10,000 values is a 0.1 % guess chance per rotation. |
| D7 | **Phase 1 payment = today's per-order flow.** An accepted QR order is an ordinary `DINE_IN` order and is paid with the existing Confirm Payment / Complete. **In phase 2**, once a session has a bill, those per-order endpoints refuse that session's orders (409 `USE_TABLE_BILL`). | Phase 1 ships without a bill and stays correct in reports. Phase 2 then has one source of truth. |
| D8 | **Money stays on `Order`.** The bill is a view over the session's orders: its discount is allocated *onto* the orders, and settling marks the orders `VERIFIED`. | Every report reads `Order.totalAmount` + `paymentStatus = VERIFIED` (`reports/salesDefinitions.ts`). Keeping that true means no report changes. |
| D9 | **Server prices everything**, through the same `buildOrderLines`/`priceOrderLines` as every other order, with a new `qrOnly` filter (mirroring `onlineOnly`). Split amounts are computed only on the server, in `Prisma.Decimal`. | Rule from `CLAUDE.md`: never trust a price or total from the client. |

---

## 2. Data model (Prisma) and migration plan

All changes are additive: new enums, new enum values, new tables, and new nullable columns or columns with defaults. Nothing existing is renamed, retyped or dropped.

### 2.1 Enums

```prisma
enum OrderSource { POS ONLINE PHONE ORDER_TAKER TABLE_QR }   // + TABLE_QR

enum TableShape { RECT ROUND }

enum TableSessionStatus {
  OPEN     // seated; guests may join; ordering subject to §5.1
  CLOSED   // finished normally; every guest token dead
  VOIDED   // closed without a sale (seated by mistake, guests left) — see §3.1
}

enum TableCallType   { WATER NAPKINS BILL_CASH OTHER }
enum TableCallStatus { RAISED ACKNOWLEDGED RESOLVED CANCELLED }

// Phase 2
enum TableBillStatus { REQUESTED UNLOCKED PAID }
enum SplitMode       { EQUAL BY_ITEMS CUSTOM }
enum TableShareStatus { UNPAID PROOF_SUBMITTED VERIFIED REJECTED VOID }
enum TableBillLineKind { ITEM DEAL }

enum TableSessionEventType {
  SEATED GUEST_JOINED GUEST_REMOVED PIN_ROTATED PIN_LOCKED WAITER_CHANGED CLOSED VOIDED
  // phase 2
  BILL_REQUESTED BILL_UNLOCKED BILL_DISCOUNT_SET SPLIT_SET SPLIT_CANCELLED
  SHARE_PAID SHARE_PROOF SHARE_VERIFIED SHARE_REJECTED SHARE_UNMARKED BILL_PAID
}
```

### 2.2 Changed models

```prisma
model DiningArea {
  // … existing: id, name, type, area, capacity, isActive, orders
  // Table QR. Random, regenerable, never the id; null until first generated (qr-sheet or regenerate).
  qrKey                String?     @unique
  // Floor-map geometry in abstract units on a 1000 × 1000 canvas per `area`. Null = not placed yet
  // (the map lists it in an "Unplaced" tray).
  layoutX              Int?
  layoutY              Int?
  layoutW              Int?
  layoutH              Int?
  shape                TableShape  @default(RECT)
  rotation             Int         @default(0)      // degrees, 0–359
  // Temporarily out of service (broken, reserved block): stays on the map as UNAVAILABLE, can't be
  // seated, QR shows read-only. Different from isActive=false, which removes it everywhere.
  outOfService         Boolean     @default(false)
  // Who gets this table's waiter calls by default (copied onto each new session).
  defaultWaiterStaffId String?
  defaultWaiterStaff   StaffUser?  @relation("TableDefaultWaiter", fields: [defaultWaiterStaffId], references: [id], onDelete: SetNull)
  tableSessions        TableSession[]
  tableCalls           TableCall[]
}
```
Seats = existing `capacity`. Floor/section = existing `area` (the map shows one tab per `area`, plus "Other" for null). See Q9.

```prisma
model Order {
  // … existing
  tableSessionId String?
  tableSession   TableSession? @relation(fields: [tableSessionId], references: [id], onDelete: Restrict)
  // The guest who sent this round (null for staff-placed orders).
  tableGuestId   String?
  tableGuest     TableGuest?   @relation("OrderTableGuest", fields: [tableGuestId], references: [id], onDelete: SetNull)
  @@index([tableSessionId])
}

model OrderItem     { /* … */ tableGuestId String?  tableGuest TableGuest? @relation("OrderItemTableGuest", fields: [tableGuestId], references: [id], onDelete: SetNull) }
model OrderDealLine { /* … */ tableGuestId String?  tableGuest TableGuest? @relation("DealLineTableGuest", fields: [tableGuestId], references: [id], onDelete: SetNull) }

model MenuItem { /* … */ isAvailableOnQr Boolean @default(false) }   // independent of isAvailableOnline
model Deal     { /* … */ isAvailableOnQr Boolean @default(false) }

model SiteSettings {
  // … existing
  tableQrEnabled    Boolean @default(false)   // master switch: off = every QR shows read-only menu
  tableQrRequirePin Boolean @default(false)   // new sessions get a PIN; read at seat time
}

model StaffUser {
  // … existing; relation fields only (no columns): tablesDefaultWaiter, tableSessionsWaiter,
  // tableSessionsSeated, tableSessionsClosed, tableCallsRouted/Acknowledged/Resolved,
  // tableSessionEvents, tableBillsDiscounted, tableSharesVerified
}

model MediaAsset { /* … */ tableBillShareProofs TableBillShare[] }   // relation only (phase 2)
```

### 2.3 New models — phase 1

```prisma
model TableSession {
  id             String             @id @default(uuid())
  diningAreaId   String
  diningArea     DiningArea         @relation(fields: [diningAreaId], references: [id], onDelete: Restrict)
  businessDayId  String
  businessDay    BusinessDay        @relation(fields: [businessDayId], references: [id], onDelete: Restrict)
  status         TableSessionStatus @default(OPEN)
  joinPin        String?            @db.VarChar(4)   // null when the PIN setting was off at seat time
  pinFailures    Int                @default(0)       // reset on every rotation
  waiterStaffId  String?            // calls go here first (§5.4)
  waiterStaff    StaffUser?         @relation("TableSessionWaiter", fields: [waiterStaffId], references: [id], onDelete: SetNull)
  seatedById     String
  seatedBy       StaffUser          @relation("TableSessionSeatedBy", fields: [seatedById], references: [id])
  seatedAt       DateTime           @default(now())
  closedAt       DateTime?
  closedById     String?
  closedBy       StaffUser?         @relation("TableSessionClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
  voidReason     String?            @db.VarChar(200)
  // Bumped in the same transaction as anything a guest's poll shows (§6.3). Drives the ETag.
  version        Int                @default(0)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  guests  TableGuest[]
  orders  Order[]
  calls   TableCall[]
  events  TableSessionEvent[]
  bill    TableBill?
  receipt TableReceipt?

  @@index([diningAreaId, status])
  @@index([businessDayId, status])
}
// Hand-appended to the migration SQL (Prisma can't express a partial unique index; precedent: the
// CHECK constraints in 20261110120000_public_site_content):
//   CREATE UNIQUE INDEX "TableSession_one_open_per_table"
//     ON "TableSession" ("diningAreaId") WHERE "status" = 'OPEN';

model TableGuest {
  id            String       @id @default(uuid())
  sessionId     String
  session       TableSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  displayName   String       @db.VarChar(30)
  tokenHash     String       @unique              // sha256(token) hex; the token itself is never stored
  joinRequestId String?      @unique              // client uuid: a double-tapped Join returns the same guest
  joinOrder     Int                                // 1, 2, 3… within the session ("first share" order)
  joinIpHash    String                             // hashClientIp(), for the per-IP join count
  lastSeenAt    DateTime     @default(now())       // updated at most once a minute by the poll
  revokedAt     DateTime?                          // staff removed this guest
  revokedById   String?
  createdAt     DateTime     @default(now())

  orders     Order[]         @relation("OrderTableGuest")
  orderItems OrderItem[]     @relation("OrderItemTableGuest")
  dealLines  OrderDealLine[] @relation("DealLineTableGuest")
  calls      TableCall[]
  // phase 2: shares, claims

  @@unique([sessionId, joinOrder])
  @@index([sessionId])
  @@index([joinIpHash, createdAt])
}

// Append-only audit for the session, same rules as OrderEvent (order/orderEvents.ts): written in the
// same transaction as the change, never updated or deleted. Money as strings in before/after.
model TableSessionEvent {
  id        String                @id @default(uuid())
  sessionId String
  session   TableSession          @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      TableSessionEventType
  actorId   String?               // staff; null for a guest or the system
  actor     StaffUser?            @relation(fields: [actorId], references: [id], onDelete: SetNull)
  guestId   String?               // the guest who did it, when a guest did
  reason    String?               @db.VarChar(200)
  before    Json?
  after     Json?
  createdAt DateTime              @default(now())

  @@index([sessionId, createdAt])
}

model TableCall {
  id                String          @id @default(uuid())
  sessionId         String
  session           TableSession    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  diningAreaId      String
  diningArea        DiningArea      @relation(fields: [diningAreaId], references: [id], onDelete: Restrict)
  guestId           String?         // null when staff raise one on a guest's behalf (not in v1)
  guest             TableGuest?     @relation(fields: [guestId], references: [id], onDelete: SetNull)
  type              TableCallType
  note              String?         @db.VarChar(80)
  status            TableCallStatus @default(RAISED)
  clientRequestId   String?         @unique
  routedToStaffId   String?         // the waiter it was sent to; null = broadcast (§5.4)
  acknowledgedById  String?
  acknowledgedAt    DateTime?
  resolvedById      String?
  resolvedAt        DateTime?
  escalatedAt       DateTime?       // set once by the escalation job (§5.4)
  createdAt         DateTime        @default(now())

  @@index([sessionId, status])
  @@index([status, createdAt])      // escalation job + open-calls list
  @@index([guestId, createdAt])     // per-guest cooldown
}
```
(The relation fields for `acknowledgedBy`/`resolvedBy`/`routedTo` → `StaffUser`, all `onDelete: SetNull`, are written out in the build session.)

### 2.4 New models — phase 2

```prisma
model TableBill {
  id                   String          @id @default(uuid())
  sessionId            String          @unique                 // one bill row per session, reused
  session              TableSession    @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  status               TableBillStatus @default(REQUESTED)
  requestedByGuestId   String?
  requestedByStaffId   String?
  requestedAt          DateTime        @default(now())
  // Snapshot at the last (re)compute (§7.2); the orders stay the source of truth.
  subtotal             Decimal         @db.Decimal(10, 2)       // items + deals of billable orders
  discount             Decimal         @default(0) @db.Decimal(10, 2)
  total                Decimal         @db.Decimal(10, 2)       // = sum of billable orders' totalAmount
  discountById         String?
  discountAt           DateTime?
  discountReason       String?         @db.VarChar(200)
  splitMode            SplitMode?
  splitVersion         Int             @default(0)              // bumped whenever shares are rebuilt or voided
  version              Int             @default(0)              // optimistic concurrency (expectedVersion)
  paidAt               DateTime?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  shares TableBillShare[]
  claims TableBillClaim[]
}

model TableBillShare {
  id                  String           @id @default(uuid())
  billId              String
  bill                TableBill        @relation(fields: [billId], references: [id], onDelete: Cascade)
  splitVersion        Int
  position            Int                                      // 1-based; share 1 takes the remainder
  guestId             String?                                  // owner (BY_ITEMS) or claimer (EQUAL/CUSTOM)
  label               String           @db.VarChar(40)         // "Ali", "Share 2 of 4"
  amount              Decimal          @db.Decimal(10, 2)       // whole rupees except share 1 may carry paisa
  status              TableShareStatus @default(UNPAID)
  method              PaymentMethod?
  paymentProofMediaId String?
  paymentProofMedia   MediaAsset?      @relation(fields: [paymentProofMediaId], references: [id], onDelete: SetNull)
  paidAmount          Decimal?         @db.Decimal(10, 2)       // cash handed over (change = paidAmount − amount)
  verifiedById        String?
  verifiedAt          DateTime?
  rejectedReason      String?          @db.VarChar(200)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  @@unique([billId, splitVersion, position])
  @@index([billId, splitVersion])
  @@index([status])
}

// BY_ITEMS only: "I had some of this shared line". One row per guest per line per split version.
model TableBillClaim {
  id           String            @id @default(uuid())
  billId       String
  bill         TableBill         @relation(fields: [billId], references: [id], onDelete: Cascade)
  splitVersion Int
  lineKind     TableBillLineKind
  lineId       String            // OrderItem.id (direct, priced lines only) or OrderDealLine.id
  guestId      String
  guest        TableGuest        @relation(fields: [guestId], references: [id], onDelete: Cascade)
  createdAt    DateTime          @default(now())

  @@unique([billId, splitVersion, lineKind, lineId, guestId])
}

model TableReceipt {
  id                String       @id @default(uuid())
  sessionId         String       @unique
  session           TableSession @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  receiptKey        String       @unique      // 32 random bytes base64url (43 chars) — the long receipt link
  snapshot          Json                       // §7.6; built once at close, never recomputed
  total             Decimal      @db.Decimal(10, 2)
  // Future PRA/FBR fiscal invoice. Null in this phase; nothing writes them yet.
  taxInvoiceNumber  String?
  taxAuthority      String?                    // "PRA" | "FBR"
  createdAt         DateTime     @default(now())
}
```

### 2.5 Migration plan

| Build step | Migration name | Contents |
|---|---|---|
| 1 | `…_table_qr_sessions` | `TableShape`, `TableSessionStatus`, `TableSessionEventType` (all values, phase-2 ones included, so the enum isn't altered twice); `DiningArea` columns; `SiteSettings.tableQrEnabled/RequirePin`; `TableSession`, `TableGuest`, `TableSessionEvent`; the partial unique index (hand-appended) |
| 2 | `…_table_qr_orders` | `OrderSource` value `TABLE_QR`; `Order.tableSessionId/tableGuestId` + index; `OrderItem.tableGuestId`; `OrderDealLine.tableGuestId`; `MenuItem.isAvailableOnQr`; `Deal.isAvailableOnQr`. **No backfill** (Q1) |
| 3 | `…_table_calls` | `TableCallType`, `TableCallStatus`, `TableCall` |
| 8 | `…_table_bill` | `TableBillStatus`, `SplitMode`, `TableShareStatus`, `TableBillLineKind`, `TableBill`, `TableBillShare`, `TableBillClaim`, `TableReceipt`; CHECK `amount >= 0` on shares and `discount >= 0` on bills (hand-appended) |

**How to apply** (see Conflict C1): run `npx prisma migrate dev --name <name>` first. If it refuses with the known checksum drift or the shadow-database error, do not reset. Instead:
1. Write the schema change.
2. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` → `prisma/migrations/<timestamp>_<name>/migration.sql`
3. Hand-append the extra SQL.
4. `npx prisma migrate deploy`
5. Confirm `migrate diff` reports no drift.

Every earlier migration since `20261109120000` was applied this way, and the AS_BUILT migration table says so per row; do the same. Never edit an applied migration. `ALTER TYPE … ADD VALUE` must not be used by later statements in the same migration file, so put no backfill that mentions `TABLE_QR` in it.

`qrKey` is **not** backfilled. Every table starts `null`, and `GET /tables/qr-sheet` generates missing keys (§4.2).

---

## 3. State machines

Every transition is a conditional write (`updateMany … where status = <expected>`, then check `count`), the pattern `cancelInTransaction`/`transitionScheduledOrder` already use. A lost race answers 409 rather than overwriting.

### 3.1 Table session

| From | To | Trigger | Who | Guard (409 code if it fails) |
|---|---|---|---|---|
| — | `OPEN` | seat | SA, PA, ORDER_TAKER | table active and not `outOfService` (`TABLE_UNAVAILABLE`); no `OPEN` session on it (`TABLE_OCCUPIED`, also enforced by the partial unique index); an active business day (`NO_BUSINESS_DAY`) |
| `OPEN` | `CLOSED` | close | SA, PA, ORDER_TAKER | **phase 1:** no session order in `AWAITING_RECEPTION`, `PENDING`, `CONFIRMED` (`SESSION_HAS_OPEN_ORDERS`), i.e. every non-cancelled order `COMPLETED`. **phase 2:** additionally, if a bill exists it must be `PAID` (`BILL_NOT_PAID`); close then completes the orders (§7.5) |
| `OPEN` | `VOIDED` | void | SA, PA | no session order that was ever accepted and isn't `CANCELLED` (`SESSION_HAS_ORDERS`); reason 1–200 required. Any `AWAITING_RECEPTION` orders are rejected in the same transaction with reason "Table closed" |

On `CLOSED`/`VOIDED`, in the same transaction:
- set `closedAt`/`closedById`;
- every open call → `CANCELLED`;
- every guest token is dead from that moment, because tokens are checked against `session.status = OPEN` and nothing else is needed. Leave `revokedAt` null to keep "removed by staff" distinguishable.

### 3.2 Guest

`active` → `revoked` (staff "Remove guest", `revokedAt` set). A revoked guest's token answers 401 `SESSION_ENDED`. The guest's past orders and tags remain. There is no un-revoke; the person can join again as a new guest, subject to the guest cap.

### 3.3 QR order (an `Order` with `source = TABLE_QR`)

| From | To | Trigger | Notes |
|---|---|---|---|
| — | `AWAITING_RECEPTION` | guest sends a round | `type DINE_IN`, `paymentMethod CASH` (placeholder, D7), `paymentStatus PENDING` |
| `AWAITING_RECEPTION` | `PENDING` | reception accepts (existing `acceptOrder`) | non-ONLINE source → `PENDING`; stock deducted; kitchens notified. Unchanged code |
| `AWAITING_RECEPTION` | `CANCELLED` | reception rejects / the guest's own cancel (below) / session voided | the guest sees the reason |
| `PENDING` | `COMPLETED` | phase 1: existing Complete (paid first); phase 2: session close | |
| `PENDING` | `CANCELLED` | existing staff cancel | phase 2: may cancel the split (§7.3) |

A guest may cancel **their own** round while it is still `AWAITING_RECEPTION`: `POST /api/online/table/orders/:orderId/cancel`. It goes through `cancelInTransaction` with actor null and reason "Cancelled by the guest", the same shape as `cancelOwnAwaitingOrder`.

### 3.4 Waiter call

| From | To | Trigger | Who |
|---|---|---|---|
| — | `RAISED` | guest call | guest (limits §5.3) |
| `RAISED` | `ACKNOWLEDGED` | "On my way" | SA, PA, ORDER_TAKER |
| `RAISED`/`ACKNOWLEDGED` | `RESOLVED` | "Done" | SA, PA, ORDER_TAKER |
| `RAISED`/`ACKNOWLEDGED` | `CANCELLED` | guest withdraws it, or the session closes/voids | guest / system |

`escalatedAt` is separate from status: the job sets it once on a call still `RAISED` 120 s after `createdAt` (§5.4).

### 3.5 Bill (phase 2)

| From | To | Trigger | Who | Guard |
|---|---|---|---|---|
| none / `UNLOCKED` | `REQUESTED` | request bill | any active guest, SA, PA, ORDER_TAKER | session `OPEN`; at least one billable order (`NOTHING_TO_BILL`) |
| `REQUESTED` | `UNLOCKED` | unlock (allow more ordering) | SA, PA | no share `PROOF_SUBMITTED`/`VERIFIED` (`SPLIT_HAS_PAYMENTS`); unpaid shares → `VOID`, `splitMode` cleared |
| `REQUESTED` | `PAID` | automatic, in the transaction that verifies the last share | system | every share of the current `splitVersion` `VERIFIED` and their sum = `bill.total` |

`REQUESTED` blocks new guest rounds (`BILL_LOCKED`). Staff may still add items from Order Detail; that cancels the split (§7.3).

### 3.6 Share (phase 2)

| From | To | Trigger | Who |
|---|---|---|---|
| — | `UNPAID` | split set | guest (EQUAL/BY_ITEMS) or staff |
| `UNPAID`/`REJECTED` | `PROOF_SUBMITTED` | proof uploaded, `method ONLINE` | the share's guest |
| `UNPAID`/`PROOF_SUBMITTED`/`REJECTED` | `VERIFIED` | cash collected (`method CASH`, optional `paidAmount ≥ amount`) **or** proof verified | SA, PA (Q2, Q3) |
| `PROOF_SUBMITTED` | `REJECTED` | proof rejected, reason required | SA, PA |
| `VERIFIED` | `UNPAID` | unmark, reason required | SA, PA (bill not yet `PAID`) |
| `UNPAID`/`REJECTED` | `VOID` | split rebuilt or cancelled | system |

### 3.7 Derived table state (floor map)

A pure function `deriveTableState(input)` in `modules/table/tableState.ts`, unit-tested, used by `GET /tables/floor` and in every `table:updated` emit. The first row that matches wins:

| Priority | State | Condition |
|---|---|---|
| 1 | `UNAVAILABLE` | `outOfService` |
| 2 | `EMPTY` | no `OPEN` session |
| 3 | `PAYING` (+ `paid`/`of`) | bill `REQUESTED` and at least one share of the current split `VERIFIED` or `PROOF_SUBMITTED`; `paid` = VERIFIED count, `of` = share count |
| 4 | `BILL_REQUESTED` | bill `REQUESTED` (phase 2), **or** an open `BILL_CASH` call (phase 1 and 2) |
| 5 | `ORDER_AWAITING` | any session order `AWAITING_RECEPTION` |
| 6 | `IN_KITCHEN` (+ `readyCount`) | any item of an accepted, non-cancelled session order is `PENDING`/`PREPARING`/`READY` |
| 7 | `SERVED` | at least one accepted order, and every item of every non-cancelled one `SERVED` |
| 8 | `SEATED` | open session, no non-cancelled orders |

The `NEEDS_ATTENTION` overlay (independent flag) is on when there is any `RAISED`/`ACKNOWLEDGED` call; `attention: "ESCALATED"` when any open call has `escalatedAt`.

---

## 4. Endpoints

Conventions are those of the existing modules:
- Hand-written validators; unknown keys → 400.
- Money as strings.
- Public routes answer `{ code, error }` (like guest checkout). Staff routes answer `{ error }`, plus `code` wherever a screen branches on it (like `/business-day/end`).
- Staff auth is `requireAuth` + `requireRole`.
- Role abbreviations: SA = SUPER_ADMIN, PA = POS_ADMIN, OT = ORDER_TAKER.

### 4.1 Public guest routes — `/api/online/table` (new module `modules/tableGuest/`)

Mounted in `routes/online.routes.ts` **before** the customer-accounts gate, like `/guest-orders`. Inside the router, register the literal paths (`/menu`, `/session`, `/orders`, `/calls`, `/bill/*`, `/receipt`) **before** `/:qrKey`, the same ordering rule as `order.routes.ts`'s `/submit` vs `/:id`. `onlineGeneralLimiter` must skip `/table` and `/receipts`, which get their own limiters (§5.3).

**Guest auth:** the middleware `requireTableGuest`:
- reads `X-Table-Token`;
- `sha256` → `TableGuest` by `tokenHash`, joined to its session;
- 401 `SESSION_ENDED` if missing/unknown, revoked, or session not `OPEN`;
- sets `req.tableGuest = { id, sessionId, diningAreaId, displayName }`;
- throttles `lastSeenAt` writes to once per 60 s.

Every guest response sends `Cache-Control: no-store`, except the menu.

| Method | Path | Auth | Request | Response | Errors | Limits |
|---|---|---|---|---|---|---|
| GET | `/:qrKey` | none | — | `200 { table: {name, area}, state: "OPEN"\|"CLOSED"\|"UNAVAILABLE", requiresPin: bool, orderingOpen: bool, closedReason: "qr_disabled"\|"no_business_day"\|"not_seated"\|"unavailable"\|"bill_requested"\|null }`. Never returns a session id, PIN, guest list or staff names | 404 `NOT_FOUND` (malformed or unknown key, same answer; shape checked first with `isPlausiblePublicId`) | `tableLookupLimiter` 300/15 min/IP |
| GET | `/menu` | none | — | `200 { categories, items }` and `deals`, the shapes of `GET /api/online/menu` + `/deals` (built with `toPublicMenu`/`toPublicDeals`), filtered to `isAvailableOnQr` and `isOpenPrice = false`; deals `isActive && isAvailableOnQr` | — | `Cache-Control: public, max-age=60`; `qrMenuLimiter` 1000/15 min/IP |
| POST | `/:qrKey/join` | none | `{ displayName (1–30 after trim, control chars stripped), pin?: "dddd", joinRequestId: uuid }` | `201 { token, guest: {id, displayName, joinOrder}, session: {table: {name, area}} }`. A repeat `joinRequestId` for this session → `200` with the same guest and a **new** token (old hash replaced), so a lost response doesn't lock the phone out | 404 `NOT_FOUND`; 409 `TABLE_CLOSED` (not seated) / `TABLE_UNAVAILABLE` / `QR_DISABLED` / `ORDERING_CLOSED` (no active business day, or it isn't the session's — same rule as ordering, §5.1); 400 `BAD_PIN` (+`attemptsLeft`); 423 `PIN_LOCKED` (just rotated — ask staff); 409 `SESSION_FULL`; 409 `REQUEST_ID_REUSED` (id used for another session); 400 `BAD_REQUEST` | `tableJoinLimiter` 60/15 min/IP; Postgres: 20 active guests/session, 10 PIN failures/session, 40 joins/IP-hash/hour |
| GET | `/session` | guest | — | `200` the poll payload (§6.3), with `ETag`. `304` when `If-None-Match` matches (read only `session.version`) | 401 `SESSION_ENDED` | `tablePollLimiter` 600/15 min **per token hash** |
| POST | `/orders` | guest | `{ clientRequestId: uuid, items: [{menuItemId, quantity, variantId?, addOnIds?, notes?}], deals: [{dealId, quantity, notes?}], notes? (≤ 200) }`. Same strict validators as guest checkout (`guestOrder.validators.ts` item/deal parsers: ≤ 40 lines, quantity 1–50, no `unitPrice`, no customization) | `201 { orderId, orderNumber, status: "RECEIVED", total }`; replay of the same `clientRequestId` by the same guest → `200`, same body | 401 `SESSION_ENDED`; 409 `ORDERING_CLOSED` (QR off, no active day, or day ≠ session's day); 409 `BILL_LOCKED`; 400 `ITEM_UNAVAILABLE`; 400 `ORDER_TOO_LARGE`; 429 `TOO_MANY`; 429 `COOLDOWN` (+`retryAfterSeconds`); 409 `REQUEST_ID_REUSED`; 400 `BAD_REQUEST` | `tableActionLimiter` 120/15 min/token; Postgres limits §5.3 in `createOrder`'s `guard` |
| POST | `/orders/:orderId/cancel` | guest | — | `200 { status: "CANCELLED" }` | 404 `NOT_FOUND` (not this guest's, or not this session's); 409 `NOT_CANCELLABLE` (already reviewed) | `tableActionLimiter` |
| POST | `/calls` | guest | `{ clientRequestId: uuid, type: WATER\|NAPKINS\|BILL_CASH\|OTHER, note? (≤ 80, required for OTHER) }` | `201 { id, type, status: "RAISED", createdAt }`; replay → `200` | 401; 409 `ORDERING_CLOSED` if the business day ended; 429 `COOLDOWN` (+`retryAfterSeconds`); 429 `TOO_MANY` (3 open/session); 409 `REQUEST_ID_REUSED`; 400 `BAD_REQUEST` | `tableActionLimiter`; Postgres limits §5.3 |
| POST | `/calls/:id/cancel` | guest | — | `200 { status: "CANCELLED" }` | 404 `NOT_FOUND` (not this guest's); 409 `NOT_OPEN` | `tableActionLimiter` |

**Phase 2 additions** (same module, guest auth, `tableActionLimiter`; every call that changes the bill takes `expectedVersion` and answers 409 `BILL_CHANGED` with the current bill when it's stale):

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | `/bill/request` | `{}` | `200 { bill }` (§6.3 shape); idempotent: an already-`REQUESTED` bill answers 200 unchanged | 409 `NOTHING_TO_BILL`; 409 `ORDERS_AWAITING` is **not** raised here (requesting is allowed, splitting is not) |
| PUT | `/bill/split` | `{ mode: "EQUAL"\|"BY_ITEMS", parts?: 1–20 (EQUAL; default = active guests), expectedVersion }` | `200 { bill }` | 403 `STAFF_ONLY` for CUSTOM; 409 `ORDERS_AWAITING`; 409 `SPLIT_HAS_PAYMENTS`; 409 `BILL_CHANGED`; 409 `BILL_NOT_REQUESTED` |
| PUT | `/bill/claims` | `{ lineKind: "ITEM"\|"DEAL", lineId, claimed: bool, expectedVersion }`: only for **the calling guest**, only on a *shared* line (owner null or owner ≠ caller) of this session's billable orders, only in BY_ITEMS | `200 { bill }` (shares recomputed, `splitVersion` bumped) | 404 `NOT_FOUND` (line not in this session); 409 `SPLIT_HAS_PAYMENTS`; 409 `BILL_CHANGED`; 409 `NOT_BY_ITEMS` |
| POST | `/bill/shares/:shareId/claim` | `{ expectedVersion }`: EQUAL/CUSTOM share with no guest yet → the caller | `200 { bill }` | 404; 409 `SHARE_TAKEN`; 409 `BILL_CHANGED` |
| POST | `/bill/shares/:shareId/pay` | `{ method: "CASH"\|"ONLINE" }`: only the share's own guest. CASH → raises a `BILL_CASH` call (routing §5.4) and marks the share "cash requested" in the poll; ONLINE → returns the active payment accounts | `200 { share, paymentAccounts? }` (accounts as in `GET /api/online/store`) | 403 `NOT_YOUR_SHARE`; 409 `NOT_AWAITING_PAYMENT` (VERIFIED/VOID) |
| POST | `/bill/shares/:shareId/payment-proof` | multipart, one image in `file` (`proofUpload`, 5 MB, `processProof`) | `200 { status: "PROOF_SUBMITTED" }`; replacing an earlier proof deletes it (`releaseMediaIfUnreferenced`) | 403 `NOT_YOUR_SHARE`; 409 `NOT_AWAITING_PAYMENT` (not UNPAID/REJECTED, bill not REQUESTED, session not OPEN); 400 bad image; 413 |
| GET | `/receipt` | — | `200 { receiptKey }` once the session is closed with a receipt; while open, `404 NOT_READY` | the token is dead after close, so the poll carries `receiptKey` in its last payload (§6.3) and the phone keeps it |

**Receipt link** — `GET /api/online/receipts/:receiptKey`, no auth:
- `200` the snapshot (§7.6);
- `Cache-Control: private, no-store`;
- `404 NOT_FOUND` for a malformed or unknown key (shape `^[A-Za-z0-9_-]{43}$` checked first);
- limited by `receiptLimiter`, 300/15 min/IP.

### 4.2 Staff routes — `/api/pos` (new module `modules/table/`)

| Method | Path | Roles | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/tables/floor` | SA, PA, OT | `?area=` optional | `200 { areas: string[], tables: [{ id, name, area, type, capacity, layout: {x,y,w,h,shape,rotation} \| null, outOfService, state, attention: null\|"OPEN"\|"ESCALATED", session: null \| { id, seatedAt, waiter: {id,name}\|null, guestCount, awaitingCount, openCalls: [{id,type,status,createdAt,escalated}], bill: null\|{status, paid, of} } }] }`. No PIN, no `qrKey` | — |
| PUT | `/tables/layout` | SA, PA | `{ tables: [{ id, x, y, w, h, shape, rotation }] }` (≤ 200; ints, `0 ≤ x,y ≤ 1000`, `20 ≤ w,h ≤ 400`, rotation 0–359; `x`/`y`/`w`/`h` all `null` to unplace) | `200 { updated }`, one transaction | 400 field errors; 404 unknown id (nothing written) |
| POST/PUT | `/dining-areas`, `/dining-areas/:id` (existing) | SA, PA | gains optional `outOfService: bool`, `defaultWaiterStaffId: string\|null` (must be an active SA/PA/OT) | unchanged | 400 bad waiter |
| POST | `/dining-areas/:id/qr-key/regenerate` | SA, PA | — | `200 { id, qrKey }` (old printed QR stops working at once) | 404 |
| GET | `/tables/qr-sheet` | SA, PA | `?area=` | `200 { tables: [{ id, name, area, qrKey }] }`; generates and saves `qrKey` for any active table that has none | — |
| POST | `/tables/:diningAreaId/seat` | SA, PA, OT | `{ waiterStaffId?: string }` (default: `defaultWaiterStaffId`, else the caller when OT, else null) | `201 { session: {id, seatedAt, waiter}, pin: "4831"\|null }` | 404; 409 `TABLE_OCCUPIED` (+`sessionId`), `TABLE_UNAVAILABLE`, `NO_BUSINESS_DAY`; 400 bad waiter |
| GET | `/table-sessions/:id` | SA, PA, OT | — | `200 { session: {…, pin, status}, table, guests: [{id, displayName, joinOrder, joinedAt, lastSeenAt, revoked}], orders: [full order shape, `orderInclude` + `tableGuest {displayName}` on order/items/deal lines], calls, bill (phase 2), events }` | 404 |
| PATCH | `/table-sessions/:id` | SA, PA, OT | `{ waiterStaffId: string\|null }` | `200 { session }` (event `WAITER_CHANGED`) | 404; 409 `SESSION_NOT_OPEN`; 400 bad waiter |
| POST | `/table-sessions/:id/pin/rotate` | SA, PA, OT | — | `200 { pin }` (resets `pinFailures`; existing guests unaffected) | 404; 409 `SESSION_NOT_OPEN`; 409 `PIN_NOT_ENABLED` |
| POST | `/table-sessions/:id/guests/:guestId/remove` | SA, PA, OT | `{ reason?: ≤ 200 }` | `200 { guest }` | 404; 409 `SESSION_NOT_OPEN` |
| POST | `/table-sessions/:id/close` | SA, PA, OT | — | `200 { session, receiptKey? }` (phase 2) | 404; 409 `SESSION_NOT_OPEN`, `SESSION_HAS_OPEN_ORDERS` (+`orderIds`), `BILL_NOT_PAID` |
| POST | `/table-sessions/:id/void` | SA, PA | `{ reason: 1–200 }` | `200 { session }` | 404; 409 `SESSION_NOT_OPEN`, `SESSION_HAS_ORDERS` |
| GET | `/table-calls` | SA, PA, OT | `?status=open` (default) \| `all&since=` | `200 [{ id, type, note, status, createdAt, escalatedAt, table: {id, name, area}, guestName, routedTo: {id,name}\|null, acknowledgedBy }]` oldest first | — |
| POST | `/table-calls/:id/acknowledge` | SA, PA, OT | — | `200 { call }` | 404; 409 `NOT_OPEN` (conditional on `RAISED`) |
| POST | `/table-calls/:id/resolve` | SA, PA, OT | — | `200 { call }` | 404; 409 `NOT_OPEN` |
| PATCH | `/menu/:id/qr-availability` | SA, PA, ONLINE_ADMIN | `{ isAvailableOnQr: bool }` | `200 { item }` | 400 `"Open-price items can't be on the QR menu"`; 404 |
| PATCH | `/deals/:id/qr-availability` | SA, PA, ONLINE_ADMIN | `{ isAvailableOnQr: bool }` | `200 { deal }` | 404 |
| PUT | `/site-settings` (existing) | SA, PA | gains `tableQrEnabled`, `tableQrRequirePin` (booleans; ONLINE_ADMIN → 403 for these two keys, the `autoCompleteTakeawayOnPayment` precedent) | unchanged | — |

`isAvailableOnQr` is also accepted by the existing menu `POST`/`PUT` (400 when combined with `isOpenPrice: true`, and turning an item open-price clears it).

**Phase 2 staff routes** (all SA, PA; `expectedVersion` on every bill write; 409 `BILL_CHANGED` on mismatch):

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | `/table-sessions/:id/bill` | `{}` (request on the table's behalf; OT allowed too) | `200 { bill }` | 409 `NOTHING_TO_BILL`, `SESSION_NOT_OPEN` |
| POST | `/table-sessions/:id/bill/unlock` | `{ expectedVersion }` | `200 { bill }` | 409 `SPLIT_HAS_PAYMENTS`, `BILL_NOT_REQUESTED` |
| PUT | `/table-sessions/:id/bill/discount` | `{ discount: string\|number ≥ 0, discountReason?: 1–200 (required when > 0), expectedVersion }` | `200 { bill }` (§7.2) | 400 reason; 403 cap ("Discount above X% needs a Super Admin", from `checkDiscountChange`); 400 `DiscountExceedsTotal`; 409 `SPLIT_HAS_PAYMENTS`, `ORDERS_AWAITING` |
| PUT | `/table-sessions/:id/bill/split` | `{ mode, parts? (EQUAL), shares?: [{ amount, guestId? }] (CUSTOM, 1–20, whole rupees except share 1), expectedVersion }` | `200 { bill }` | 400 `SPLIT_SUM_MISMATCH` (+`total`, `sum`); 409 `ORDERS_AWAITING`, `SPLIT_HAS_PAYMENTS` |
| POST | `/table-sessions/:id/bill/shares/:shareId/mark-paid` | `{ paidAmount?: ≥ amount }` (cash) | `200 { bill }` (may move it to `PAID`) | 409 `NOT_AWAITING_PAYMENT`; 400 paidAmount |
| POST | `…/shares/:shareId/verify` | — | `200 { bill }` | 409 unless `PROOF_SUBMITTED` |
| POST | `…/shares/:shareId/reject` | `{ reason: 1–200 }` | `200 { bill }` | 409 unless `PROOF_SUBMITTED` |
| POST | `…/shares/:shareId/unmark` | `{ reason: 1–200 }` | `200 { bill }` | 409 unless `VERIFIED` and bill not `PAID` |
| GET | `…/shares/:shareId/payment-proof?size=thumb\|full` | — | the image (same headers as `GET /orders/:id/payment-proof`; fetched as a blob) | 404 |
| GET | `/table-sessions/:id/receipt` | — | `200` snapshot + `receiptKey` | 404 `NOT_READY` |

**Changes to existing endpoints:**
- **`PATCH /orders/:id/payment-status`, `POST /orders/:id/complete`, `POST /orders/:id/delivered`** — phase 2: 409 `{ code: "USE_TABLE_BILL" }` for an order whose `tableSessionId`'s session has a bill in `REQUESTED`/`PAID`.
- **`POST /orders/:id/items`, `DELETE /orders/:id/items/:itemId`, `PATCH /orders/:id/cancel`, `POST /orders/:id/accept`** on a session order — phase 2: cancel the split per §7.3 (409 `SPLIT_HAS_PAYMENTS` when that's refused).
- **`POST /business-day/end`** — the 400 body gains `openTableSessions: [{ id, table: {name, area}, seatedAt, orderCount }]`, and code `OPEN_TABLE_SESSIONS` when only sessions block. `force: true` still ends the day; sessions stay open and are then closed or voided by staff (guests can no longer order, §5.1).
- **`GET /orders/incoming`, `GET /orders/:id`, the `order:submitted` payload** — include `tableSession: { id } | null` and `tableGuest: { displayName } | null` (order and each item/deal line).

---

## 5. Business rules

### 5.1 When a guest may order
All of these must hold. They are checked in the service, inside the order transaction where they could race.
1. `SiteSettings.tableQrEnabled`.
2. The guest's token is valid (session `OPEN`, guest not revoked).
3. An active business day exists **and** equals `session.businessDayId`. A session seated before a forced day-end can't order into the next day (Conflict C15).
4. No bill in `REQUESTED` (phase 2).
5. Limits (§5.3).

`GET /:qrKey` reports the same conditions as `orderingOpen` + `closedReason`, so the page can show the read-only menu with the right message.

### 5.2 Creating the order
`tableGuest.service.createTableOrder` → the existing `createOrder` with:
```
source TABLE_QR, type DINE_IN, status AWAITING_RECEPTION, paymentMethod CASH,
diningAreaId: session.diningAreaId,
waiterId: session.waiterStaff?.employeeId ?? undefined   // keeps existing waiter reports meaningful
tableSessionId, tableGuestId: guest.id,                 // NEW inputs; createOrder stamps tableGuestId
                                                        // on the order and on every item / deal line / exploded item
clientRequestId, qrOnly: true,                          // NEW option in buildOrderLines (below)
maxTotal: TABLE_QR_LIMITS.orderMaxTotal, guard          // §5.3
```
- **`qrOnly`** in `buildOrderLines` mirrors `onlineOnly`. A direct item must be `isAvailableOnQr`, `sellableAlone` and not open-price. A deal must be `isActive`, `isAvailableOnQr` and have fixed `DealItem`s. Otherwise it throws `ItemNotOrderableOnlineError`, which maps to `ITEM_UNAVAILABLE`. A client `unitPrice` or deal `customization` is already refused by the parsers' defaults.
- **Replay** (`clientRequestId` already on an order): the same `tableGuestId` gets 200 with that order; anything else gets 409 `REQUEST_ID_REUSED`. A P2002 race is resolved the same way (`guestOrder.service.ts` pattern).
- **Notifications:** `order:submitted` goes to `pos-admin` as today, plus `table:updated`. `session.version` is bumped in the same transaction.
- **`updateSubmission` / `replaceOrderContents`** (reception edits quantities): rebuilt lines get `tableGuestId = order.tableGuestId` (Conflict C7).
- **Staff `addOrderItems`** on a session order: the new lines get `tableGuestId = null` ("Table (shared)").
- **Session version bumps:** `updateOrderItemStatus`, `acceptOrder`, `rejectOrder`, `cancelOrder`, `completeOrder` and `addOrderItems`/`removeOrderItem` bump `session.version` when the order has a `tableSessionId`, and emit `table:updated`. Implement one helper, `touchTableSession(tx, sessionId)`, in `modules/table/`.

### 5.3 Abuse limits

These live in one file, `modules/tableGuest/tableQrLimits.ts` (the `guestOrderLimits.ts` pattern: numbers plus a pure `exceeds…` function, unit-tested). They are counted **in Postgres** inside the write transaction:
- for orders: `createOrder`'s `guard`, after the advisory lock;
- for calls, joins and PINs: after `SELECT … FOR UPDATE` on the `TableSession` row.

| Limit | Value | Counted from | Answer |
|---|---|---|---|
| Orders awaiting reception, per guest | 2 | `Order` where `tableGuestId`, `status AWAITING_RECEPTION` | 429 `TOO_MANY` |
| Orders awaiting reception, per session | 4 | `Order` where `tableSessionId` | 429 `TOO_MANY` |
| Cooldown between orders, per guest | 30 s | latest `Order.createdAt` for the guest | 429 `COOLDOWN` + `retryAfterSeconds` |
| Orders per session (all statuses) | 30 | `Order` count | 429 `TOO_MANY` |
| Lines per order / quantity per line | 40 / 1–50 | validator (shared with guest checkout) | 400 `BAD_REQUEST` |
| Order total | 50,000 (Q4) | `maxTotal` in `createOrder` | 400 `ORDER_TOO_LARGE` |
| Waiter call cooldown, per guest | 60 s | latest `TableCall.createdAt` for the guest | 429 `COOLDOWN` |
| Open calls, per session | 3 | `TableCall` `RAISED`/`ACKNOWLEDGED` | 429 `TOO_MANY` |
| Active guests, per session | 20 | `TableGuest` with `revokedAt` null | 409 `SESSION_FULL` |
| Wrong PINs, per session | 10 → rotate PIN, emit `table-session:pin-locked`, 423 `PIN_LOCKED` | `TableSession.pinFailures` | 400 `BAD_PIN` until then |
| Joins per IP hash | 40 / hour | `TableGuest.joinIpHash` | 429 `TOO_MANY` |
| Proof uploads | `proofUploadLimiter` settings, keyed by token | in-memory | 429 |

**In-memory limiters** (`createLimiter` in `common/middlewares/rateLimit.ts`): `tableLookupLimiter`, `qrMenuLimiter` and `tableJoinLimiter` are keyed by IP. `tablePollLimiter` and `tableActionLimiter` use `keyGenerator` = sha256 of `X-Table-Token`, falling back to IP. This matters because a whole restaurant's guests share one Wi-Fi IP (Conflict C6).

### 5.4 Waiter call routing and escalation
On raise, inside the transaction:
1. Find the target: `session.waiterStaffId` if that `StaffUser` is still `isActive`.
2. Store it as `routedToStaffId`, or null.
3. After commit, emit `table-call:raised`:
   - **with a target:** to `user:<routedToStaffId>` and to `pos-admin`;
   - **without one:** to `order-takers` and `pos-admin`.

ack/resolve/cancel emit `table-call:updated` to the same rooms, plus `table:updated`.

**Escalation job** — `modules/table/callEscalation.job.ts`, a copy of `scheduledRelease.job.ts`'s shape: started from `server.ts`, first pass at startup, then every 30 s, no overlap, never throws. Each pass:
```
UPDATE "TableCall" SET "escalatedAt" = now()
WHERE status = 'RAISED' AND "escalatedAt" IS NULL AND "createdAt" <= now() - interval '120 seconds'
RETURNING …
```
For each returned row it emits `table-call:escalated` to `pos-admin`, plus `table:updated`. The update is conditional, so it is safe with several instances.

### 5.5 Seating, PIN, guests
- **Seat:** create the session (unique index backstop → `TABLE_OCCUPIED`). Set `joinPin` when `tableQrRequirePin`. Write event `SEATED`. Emit `table:updated`.
- **Join:** refused unless every §5.1 condition except the bill holds (QR on, table available and seated, the active business day is the session's). Then, inside the session row lock:
  - check status, the guest cap and the PIN;
  - a wrong PIN increments `pinFailures`, and the 10th rotates the PIN and emits `table-session:pin-locked`;
  - then create the guest with `joinOrder = max+1`;
  - write `GUEST_JOINED`, bump `version`, emit `table-guest:joined` + `table:updated`.
- **Display names** are trimmed, control characters become spaces, and whitespace collapses (`guestOrder.validators.ts` normalisation). Duplicate names in a session get a suffix (" 2") on the server.

### 5.6 Kitchen, printing, reports
- **Kitchen and printing:** no change. Slips and receipts already print the table name. `buildReceiptDoc` / `kitchenSlip.ts` may add the guest name per line, which is optional and done in build step 5.
- **Reports:** no change in phase 1. A QR order is unpaid until marked paid, like any other.
- **Source labels:** `OrderSource` labels in both frontends gain `TABLE_QR` → "Table QR". This touches the Orders filter, `StatusBadge`/source chips and the Excel export column (it prints the enum string; acceptable).

---

## 6. Real-time

### 6.1 Rooms (changes to `config/socket.ts`)
- **Every staff socket** is joined server-side to `user:<staffId>` on connect. Today that happens for ORDER_TAKER only; extending it is harmless because the room only ever receives server emits.
- **ORDER_TAKER sockets** are also joined server-side to **`order-takers`**.
- `canJoinRoom` is unchanged: no client-requested join of these rooms for anyone.
- **Deactivated staff:** the existing handshake check + `disconnectStaffSockets` already cover every new room. Call routing re-checks `isActive` at raise time.

### 6.2 New server → client events (all through `emitSafely`)

| Event | To | Payload | Emitted after |
|---|---|---|---|
| `table:updated` | `pos-admin`, `order-takers` | `{ diningAreaId, sessionId \| null, state, attention }` | any change that can move §3.7's state: seat, close, void, guest join/remove, order create/accept/reject/cancel/complete, item status, call raise/ack/resolve/cancel/escalate, bill/share changes, layout save, outOfService change |
| `table-session:updated` | `pos-admin`, `order-takers` | `{ sessionId, diningAreaId, status }` | seat, close, void, waiter change, PIN rotate |
| `table-guest:joined` | `pos-admin`, `order-takers` | `{ sessionId, diningAreaId, tableName, displayName, guestCount }` | join |
| `table-session:pin-locked` | `pos-admin`, `order-takers` | `{ sessionId, diningAreaId, tableName }` | 10th wrong PIN |
| `table-call:raised` | §5.4 rooms | `{ callId, sessionId, diningAreaId, tableName, area, type, note, guestName, createdAt, routedToStaffId }` | call created |
| `table-call:updated` | same rooms as raised | `{ callId, diningAreaId, status, byName }` | ack, resolve, cancel |
| `table-call:escalated` | `pos-admin` | `{ callId, diningAreaId, tableName, type, createdAt }` | escalation job |
| `table-bill:updated` | `pos-admin`, `order-takers` | `{ sessionId, diningAreaId, status, paid, of }` | any bill/share change (phase 2) |

Existing events used unchanged: `order:submitted` (payload gains `tableSessionId`, `tableGuestName`), `order:accepted`, `order:rejected`, `order:updated`, `order-item:*`.

Every staff consumer (§8.2) follows the `IncomingOrdersContext` rule: on **every** `connect` it re-joins (where it joins) and **refetches** its queries. A live event only invalidates queries; it never patches local state. So a reconnect can't leave a stale map.

### 6.3 Guest polling
- **Cadence:** `GET /api/online/table/session` every **5 s** while the page is visible, **30 s** while hidden. Immediately after any mutation, on `online`, and on `visibilitychange` → visible. Implemented with React Query `refetchInterval` (the `api/orders.ts` pattern), with retry/backoff on network errors.
- **ETag:** `"ts-<sessionId>-<version>-<guestId>"`, using `common/http/etag.ts`. A matching `If-None-Match` answers `304` after reading only `version`.
- **401 `SESSION_ENDED`:** the phone drops the token. If the last payload had a `receiptKey`, it shows "Your table is closed — view receipt"; otherwise the read-only landing.

Payload:
```json
{
  "version": 17,
  "table": { "name": "Table 5", "area": "Family Hall" },
  "session": { "status": "OPEN", "seatedAt": "…", "orderingOpen": true, "closedReason": null },
  "me": { "guestId": "…", "displayName": "Ali", "joinOrder": 1 },
  "guests": [{ "id": "…", "displayName": "Ali", "isMe": true }],
  "rounds": [{
    "orderId": "…", "orderNumber": 14, "guestName": "Ali", "isMine": true,
    "status": "RECEIVED | SENT_TO_KITCHEN | PREPARING | READY | SERVED | CANCELLED",
    "cancelReason": null, "createdAt": "…", "total": "1200.00",
    "lines": [{ "kind": "item|deal", "lineId": "…", "name": "…", "nameUr": "…", "size": null,
                "addOns": [], "quantity": 2, "lineTotal": "800.00", "note": "no onion",
                "ownerGuestId": "…|null" }]
  }],
  "myCalls": [{ "id": "…", "type": "WATER", "status": "ACKNOWLEDGED", "createdAt": "…" }],
  "cooldowns": { "orderSeconds": 0, "callSeconds": 42 },
  "bill": null,
  "receiptKey": null
}
```
- **Round `status`** comes from a pure `deriveTableOrderStatus`, modelled on `customerStatus.ts`:
  - `AWAITING_RECEPTION` → `RECEIVED`;
  - accepted with every item `PENDING` → `SENT_TO_KITCHEN`;
  - any `PREPARING` → `PREPARING`;
  - all `READY`/`SERVED` with some `READY` → `READY`;
  - all `SERVED`, or `COMPLETED` → `SERVED`;
  - `CANCELLED` → `CANCELLED` + reason.
- **Never in the payload:** PIN, `qrKey`, tokens, staff names or ids, the order's internal notes, phone numbers.
- **`bill`** (phase 2):
```json
{ "version": 3, "status": "REQUESTED", "subtotal": "…", "discount": "…", "total": "…",
  "splitMode": "BY_ITEMS", "splitVersion": 2, "canSplit": true, "blockedReason": null,
  "shares": [{ "id": "…", "position": 1, "label": "Ali", "guestId": "…", "isMine": true,
               "amount": "1250.00", "status": "UNPAID", "method": null, "cashRequested": false }],
  "myClaims": [{ "lineKind": "ITEM", "lineId": "…" }],
  "sharedLines": [{ "lineKind": "DEAL", "lineId": "…", "name": "…", "lineTotal": "…",
                    "claimedBy": ["Ali", "Sara"] }] }
```

---

## 7. Phase 2 — bill rules

### 7.1 Billable orders
The session's orders with `status ∉ {CANCELLED}` and `paymentStatus ≠ VERIFIED`. Orders already paid one by one in phase-1 style, before the bill existed, stay out.
- **While any session order is `AWAITING_RECEPTION`:** split, discount and settle answer 409 `ORDERS_AWAITING`. Reception must accept or reject it first. Requesting the bill is still allowed.
- **A `SCHEDULED` order** can't belong to a session; QR orders never schedule.

### 7.2 Bill totals and the discount
- **Recompute:** `subtotal` = Σ (items + deal lines) of billable orders; `total` = Σ `totalAmount` of billable orders. This runs, and the result is saved, whenever the bill is read for a write.
- **Discount** (staff only; guests never; `PUT …/bill/discount`). One transaction, holding a row lock on the bill:
  1. `checkDiscountChange({ next, current: bill.discount, subtotal, actor, capPercent })` (`order/discountPolicy.ts`). Same reason and cap rules as everywhere.
  2. **Allocate** the new discount onto the billable orders pro-rata to each order's items + deals subtotal: floor each part to whole rupees, then add the remainder to the order with the largest subtotal (ties → lowest `orderNumber`). For each order:
     - set `discount`, recompute `totalAmount` with `computeOrderTotal`;
     - set `discountById/At/Reason`;
     - write a `DISCOUNT_SET` `OrderEvent`.
     
     Reports therefore stay correct with no change (Conflict C4).
  3. Write the `BILL_DISCOUNT_SET` session event and bump `bill.version`.
  4. **Voids the split** (§7.3).
- A per-order discount given on Order Detail before the bill counts as part of that order's `totalAmount`. The bill discount *replaces* the allocated part: re-allocating overwrites each billable order's `discount`. The UI says so.

### 7.3 Split and when it is cancelled
**Setting a split** (`PUT …/bill/split`, guest or staff) in one transaction:
1. Refuse if any current share is `PROOF_SUBMITTED`/`VERIFIED` (`SPLIT_HAS_PAYMENTS`).
2. Mark the current shares `VOID` and bump `splitVersion`.
3. Compute new shares (§7.4), insert them, bump `version`.
4. Write `SPLIT_SET`.

**What cancels the split** (shares → `VOID`, `splitMode` kept, guests re-confirm): anything that changes `bill.total`:
- staff add/remove item;
- cancel of a billable order;
- reception accepting a round that was awaiting (only possible after an unlock);
- a discount change.

Each of these first checks `SPLIT_HAS_PAYMENTS` and refuses with 409 if any share has money attached. Staff unmark/reject that share first. The guest UI shows "The bill changed — please split again". (Requirement: "adding items after a split cancels the split.")

### 7.4 Share computation
A pure `computeShares()` in `modules/table/splitMath.ts`, all `Prisma.Decimal`, unit-tested with the vectors below.

**EQUAL(N):**
- `base = floor(total / N)` whole rupees;
- shares 2..N = `base`;
- share 1 = `total − base × (N−1)` (takes the rupee remainder and any paisa);
- labels "Share k of N", `guestId` null until claimed.

**BY_ITEMS:** each billable line `L` (direct priced `OrderItem` with `subtotal > 0`, or `OrderDealLine`) has a gross value `L.subtotal`.
1. **Owner:** an owned line (`tableGuestId` set, guest active or not) goes to its owner unless other guests claimed it, in which case it is shared among owner + claimers. A shared line (`tableGuestId` null) goes equally to its claimers, or to **all active guests** when nobody claimed it.
2. Per guest: `gross_g` = Σ of their portions, exact Decimal.
3. Discount: `net_g = gross_g − bill.discount × gross_g / subtotal` (exact), plus the delivery fee — always 0 for DINE_IN.
4. Rounding: `amount_g = floor(net_g)` for every guest except the first in `joinOrder` (among guests with `gross_g > 0`), who gets `total − Σ others`.
5. Guests with `gross_g = 0` get no share.
6. Labels = display names; `guestId` set.

**CUSTOM (staff only):** 1–20 amounts, each ≥ 0 with at most 2 decimals; every share except share 1 must be whole rupees; Σ must equal `total` exactly (`SPLIT_SUM_MISMATCH` otherwise). Optional `guestId` per share.

**Invariant, asserted on the server after every computation:** `Σ amount = bill.total` with `Decimal.equals`, and every amount ≥ 0. A failure throws (500 + log), never a silent fix.

Test vectors (to copy into `splitMath.test.ts`):

| Case | Input | Expected |
|---|---|---|
| E1 | total 1000, N 3 | 334, 333, 333 |
| E2 | total 1000.50, N 4 | 250.50, 250, 250, 250 |
| E3 | total 99, N 1 | 99 |
| B1 | Ali owns 600, Sara owns 400, no shared, discount 0 | Ali 600, Sara 400 |
| B2 | Ali 600, Sara 300, shared fries 150 unclaimed (2 guests), discount 0 | Ali 675, Sara 375 |
| B3 | Ali 600, Sara 300, shared 150 claimed by Sara only, discount 105 (subtotal 1050, total 945) | Sara gross 450 → net 405; Ali gross 600 → net 540 → Ali (first) = 945 − 405 = 540 |
| B4 | three guests gross 333.33 each, total 1000 (rounding) | first = 1000 − 333 − 333 = 334 |
| C1 | total 1000, CUSTOM [500, 300, 150] | 400 `SPLIT_SUM_MISMATCH` |

### 7.5 Paying, settling, closing
- **CASH share:** the guest taps "Pay cash" → a `BILL_CASH` call is raised (routing §5.4) so the waiter comes. Staff record the cash with `mark-paid` (`paidAmount` optional; change = `paidAmount − amount`, computed, never stored).
- **ONLINE share:** the guest sees the active `PaymentAccount`s (with QR), pays outside the system, and uploads a proof → `PROOF_SUBMITTED`. Reception verifies or rejects on the POS bill page, with the proof fetched as a blob via `PaymentProof`. A reject reason is shown to the guest, who may re-upload.
- **Paid:** when the last share is verified, the bill becomes `PAID` in the same transaction. `table-bill:updated` is emitted.
- **Close** (`POST …/close`) on a `PAID` bill, one transaction. For each billable order:
  - set `paymentStatus VERIFIED`, `paymentVerifiedById` = closer, `paidAmount = totalAmount`;
  - set `paymentMethod`: `ONLINE` if every share is ONLINE, else `CASH` (Conflict C3);
  - write a `PAYMENT_MARKED` event with `after.via = "table_bill"`;
  - then call `completeInTransaction` (`COMPLETED`, items `SERVED`, `COMPLETED` event, kitchens told after commit).

  Then:
  - session `CLOSED`, open calls `CANCELLED`;
  - build the `TableReceipt` with a new `receiptKey`;
  - the last guest-visible `version` bump carries `receiptKey`, so phones that poll before their token dies get it. The response also returns it for staff.
- **Close with nothing billable** (every order cancelled or paid one by one): allowed without a bill; a receipt is created only if there is at least one paid order.

### 7.6 Receipt snapshot
Built once at close and never recomputed. It is the shape `GET /api/online/receipts/:key` returns:
```json
{ "shop": { "nameEn": "…", "nameUr": "…", "addressEn": "…", "phone": "…" },
  "table": { "name": "Table 5", "area": "Family Hall" },
  "seatedAt": "…", "closedAt": "…", "businessDayLabel": "2026-11-19",
  "orders": [{ "orderNumber": 14, "guestName": "Ali", "lines": [ /* name, nameUr, size, addOns, quantity, lineTotal */ ] }],
  "subtotal": "…", "discount": "…", "total": "…",
  "shares": [{ "label": "Ali", "amount": "…", "method": "CASH|ONLINE" }],
  "taxInvoiceNumber": null, "taxAuthority": null, "isDemo": false }
```
- **Never in the snapshot:** staff names, phone numbers, payment proofs, account numbers, discount reason.
- **Every guest of the session** sees it: in the poll before close, and through the link afterwards.
- **Download** = the browser's print dialog ("Save as PDF") from a print stylesheet on `/r/:receiptKey`. No image export and no new dependency.
- **Staff print** it on the thermal printer through the existing print agent (`buildReceiptDoc` variant `buildTableReceiptDoc`).

---

## 8. Screens and routes

### 8.1 Customer — `online-frontend/` (Foodly design language, En/Ur strings in the existing i18n files and `docs/ONLINE_SITE_STRINGS.md`)
A slim **`TableShell`** (shop name, table name, language toggle; no delivery header, footer or WhatsApp button) wraps every `/t/*` route. The QR cart is separate from the delivery cart: storage key `zoryx:table-cart:<qrKey>`. The token is in `localStorage` key `zoryx:table-token:<qrKey>`, every access in try/catch. Hosting needs the SPA fallback for `/t/*` and `/r/*`, the same as `/order/*`.

| Route | Screen | Behaviour |
|---|---|---|
| `/t/:qrKey` | **TableLanding** | `GET /:qrKey`. **Not seated / QR off / no day / unavailable:** the read-only QR menu with a plain message ("Ask a staff member to seat your table") and no add buttons. **Open:** a join form (display name, PIN field when `requiresPin`, one `joinRequestId` per attempt) → token saved → `/t/:qrKey/menu`. A phone with a valid token skips straight to the menu |
| `/t/:qrKey/menu` | **TableMenu** | The QR menu (reuse the website's menu components with QR data). Cart sheet → "Send to kitchen": one `clientRequestId` per cart, resent unchanged on retry (the order-taker rule). Cooldown countdown, "Bill requested — ask staff to reopen ordering" banner, all error codes mapped to plain En/Ur sentences |
| `/t/:qrKey/table` | **TableSession** | Rounds grouped by guest (mine first), each with the §6.3 status timeline; "Cancel" on my own `RECEIVED` rounds; call buttons (Water, Napkins, Pay cash / Bring bill, Other + 80-char note) showing the cooldown and my open calls with their status; guest list |
| `/t/:qrKey/bill` | **TableBill** (phase 2) | Request bill; split chooser (Equal with a parts stepper / By items); BY_ITEMS: my lines, shared lines with "I had some" toggles; share cards with "This is mine" (claim), "Pay cash" / "Pay online" → payment accounts (QR, copy number) + proof upload with progress (reuse `PaymentBlock` pieces); my share's status; "Bill changed — split again" when voided |
| `/r/:receiptKey` | **Receipt** | Public receipt with a print stylesheet and a "Save as PDF" button (`window.print()`); works after the session ends |

### 8.2 Staff — `pos-frontend/` (DESIGN_SYSTEM tokens, `components/ui`, no ad-hoc colours)
Table states map onto the five status tones, **always with a text label**:
- EMPTY → neutral outline;
- SEATED, IN_KITCHEN, PAYING → active;
- SERVED → success;
- ORDER_AWAITING, BILL_REQUESTED → warning;
- UNAVAILABLE → neutral, hatched, "Out of service".

NEEDS_ATTENTION is a danger-coloured ring + a "Call" chip with type and age, with a `motion-safe` pulse when escalated.

| Route / place | Roles | Screen |
|---|---|---|
| `/tables` | SA, PA | **FloorMapPage** (nav "Tables", Operations group, first on mobile tabs for these roles after Dashboard):<br>• area tabs (remembered in `sessionStorage`); canvas scaled to width; tiles show name, seats, state label, guest count, waiting time; "Unplaced" tray<br>• tap a tile → side panel (bottom sheet on mobile): Seat (waiter picker), PIN (large, Rotate), guests (Remove), rounds with status and links to Order Detail / Incoming, open calls (Acknowledge / Resolve), Close table / Void, "Out of service" switch<br>• keyboard and screen-reader friendly: the canvas is a grid of buttons in reading order |
| `/tables/layout` | SA, PA | **FloorLayoutEditor**: pick an area; drag/resize tiles (pointer events, 44px handles), shape and rotation controls, "Save layout" → `PUT /tables/layout`; numeric x/y/w/h fields as the accessible alternative |
| `/tables/qr-sheet` | SA, PA | **QrSheetPage**, standalone like the print pages: area filter, A4 grid of cards (shop name, table name + area, QR, "Scan to order / آرڈر کے لیے اسکین کریں"), `window.print()`; per-table "Regenerate QR" with a `ConfirmDialog` warning that the printed card stops working |
| `/table-sessions/:id` | SA, PA | **TableBillPage** (phase 2): bill summary, Discount (cap hint `DiscountCapHint`, reason required), split editor (Equal / By items / Custom amounts with a live "Σ = total" check), shares table with Mark cash paid (amount + change), proof thumbnail (`PaymentProof`) with Verify / Reject (reason), Unmark (reason), Unlock bill, Close table → print receipt (print agent, browser fallback) and show the receipt link |
| TakerShell third tab **"Tables"** (`/taker-tables`) | OT | The same floor map, read and act: Seat, show PIN / rotate, remove guest, acknowledge/resolve calls, request bill, close (when allowed); no layout, QR, void or money actions |
| `TableCallsProvider` | SA, PA (in `AppLayout`), OT (in `TakerShell`) | Connects one socket (OT already has one in `TakerOrdersContext`; extend it rather than opening a second); listens for `table-call:*`, `table-guest:joined`, `table-session:pin-locked`, `table:updated`; `useChime` + toast + a "Calls" badge on the Tables nav item; refetches `["tables","floor"]` and `["table-calls"]` on every `connect` and event |
| Incoming Orders | SA, PA | "Table QR" source chip; card shows "Table 5 · Ali" and per-line guest; reject reasons gain "Item not available / Kitchen closed" |
| Order Detail, Orders list | SA, PA | "Table QR · Table 5 · Ali" line; link to the session; phase 2: payment actions hidden with "Paid through the table bill" |
| Menu → Menu items / Deals tabs | SA, PA | "Show on QR menu" `Switch` per row (disabled for open-price items, with a reason) |
| Online store → Store settings | SA, PA (ONLINE_ADMIN read-only) | "Table QR" card: Enable table QR ordering, Require a PIN for new tables |
| Dining areas page | SA, PA | Out of service switch, default waiter picker |
| BusinessDayBar End Day dialog | SA, PA | "Open tables" section listing sessions with a link to the map |

**New frontend dependency:** `qrcode-generator` (pos-frontend only, MIT, no dependencies, about 20 KB) to draw the QR as SVG on the print sheet. Why: no QR encoder exists in the repo, and writing one is error-prone. The QR content is `${VITE_ONLINE_SITE_URL}/t/${qrKey}`, and the sheet refuses to render, with a message, when `VITE_ONLINE_SITE_URL` is unset. No other new dependencies anywhere.

---

## 9. Threats and controls

| Threat | Controls |
|---|---|
| **QR screenshot used at home** | The QR alone grants nothing: ordering needs a session staff opened (§3.1), and the table is closed between parties. Session close/void kills every token at once. The optional per-session PIN is shown only to staff at the table. Every round still waits at reception (`AWAITING_RECEPTION`), where staff see "Table 5 · <name>" for a table they can look at. Joins appear live on the map (`table-guest:joined`), with Remove guest. `qrKey` can be regenerated if a card is photographed. Ordering also needs the session's own business day (§5.1). |
| **Guest token stolen or shared** | 256-bit random, only its hash stored, sent in a header (not in URLs, logs, history or referrers), responses `no-store`. Bound to one session; dies at close/void or when staff remove the guest. Every request re-checks session status. A shared token only lets someone act *as that guest at that open table*: same limits, still behind reception. Token-keyed limiters cap what one token can do. |
| **Joining a table you're not at** | Staff must have seated it. Optional PIN with 10 tries per session, then auto-rotation + staff alert. 20-guest cap. Per-IP join limits (in-memory + Postgres). Every join is visible on the map with Remove guest. Removed guests can't act. |
| **Spam waiter calls** | 60 s cooldown per guest and max 3 open per session, counted in Postgres under the session row lock; token-keyed `tableActionLimiter`; `clientRequestId` dedupe; staff resolve/acknowledge, and a closed session cancels all of them. |
| **Spam orders** | Postgres-counted limits inside `createOrder`'s guard (2 awaiting per guest, 4 per session, 30 s cooldown, 30 per session, line/quantity/total caps), the reception gate (nothing reaches a kitchen or stock until accepted), the bill lock, `qrOnly` item filtering. |
| **Tampering with prices, split amounts or another guest's share** | The client never sends a price or total: `createOrder` prices from the database, and `unitPrice`/`customization` are rejected for guests. `qrOnly` rejects hidden, open-price and deal-only items. Shares are computed only on the server in Decimal with the Σ = total assertion. CUSTOM is staff-only. A guest can claim lines only for themselves, pay or upload only for a share whose `guestId` is theirs (`NOT_YOUR_SHARE`), and claim only unclaimed EQUAL/CUSTOM shares. Every lookup is scoped to the token's session (another session's ids → 404). `expectedVersion` rejects stale writes. Unknown body keys → 400. Discounts are staff-only with the existing cap and reason rules. |
| **Replayed requests** | `clientRequestId` (unique) on QR orders (reuses `Order.clientRequestId`) and calls (`TableCall.clientRequestId`); `joinRequestId` on joins; replay by the same guest → the original answer (200), by anyone else → 409 `REQUEST_ID_REUSED`; P2002 races resolve to the replay (the `guestOrder.service.ts` pattern). State changes are conditional updates, so a replayed verify/mark-paid/ack is a 409, never a second effect. |
| **Paying into a closed or wrong session** | Share routes resolve the share through the token's session (`share.bill.sessionId = req.tableGuest.sessionId`, else 404). Inside the transaction they check: session `OPEN`, bill `REQUESTED`, share in the current `splitVersion` and `UNPAID`/`REJECTED`, else 409 `NOT_AWAITING_PAYMENT`. Closed sessions have dead tokens. Staff verify a share from the session's own page, and proofs are stored per share (never mixed with order proofs). |
| **Deactivated staff whose sockets stay connected** | Already handled: the handshake runs `checkStaffSession`, and `disconnectStaffSockets` emits `auth:revoked` + disconnects on deactivate, role/kitchen change or password reset (`staff.controller`). The new rooms (`user:*`, `order-takers`) are joined only server-side at connect, so they inherit this. Call routing re-checks `StaffUser.isActive` at raise time and falls back to broadcast. `defaultWaiterStaffId`/`waiterStaffId` are `SetNull` on delete. Escalation catches any call nobody acknowledged. |

Also covered:
- `GET /:qrKey` never reveals whether a table is seated beyond `state`, and never reveals the PIN or names.
- Receipt links are 256-bit and `no-store`.
- Proofs are never served by the public media route (`PAYMENT_PROOF` is already excluded).

---

## 10. Build checklist

Each step ends the same way (`CLAUDE.md`):
- `cd backend && npm run build`
- `cd pos-frontend && npm run build && npm run lint`
- `cd online-frontend && npm run build && npm run lint`
- run the backend unit tests that exist for the touched modules;
- report the results;
- update the AS_BUILT sections named in the step and list them.

New dependencies only where this spec names them.

1. **Tables/sessions/join** — Backend only.
   - Migration `…_table_qr_sessions`.
   - Extend `diningArea` with layout fields, `outOfService`, `defaultWaiterStaffId`, regenerate and `qr-sheet`; strip `qrKey` from list/get.
   - New `modules/table/`: seat, session get/patch, PIN rotate, remove guest, close (phase-1 rule), void, `PUT /tables/layout`, `GET /tables/floor` with `deriveTableState` (phase-1 inputs; calls/bill treated as empty until steps 3/8), `touchTableSession`.
   - New `modules/tableGuest/`: `GET /:qrKey`, join, `requireTableGuest`, `GET /session` with ETag (rounds empty until step 2).
   - Limiters + `onlineGeneralLimiter` skip.
   - Site-settings fields.
   - Socket: `user:<id>` for all staff, `order-takers`, the `table:updated`/`table-session:updated`/`table-guest:joined`/`pin-locked` emits.
   - End Day `OPEN_TABLE_SESSIONS`.
   - Tests: `tableState.test.ts`, `tableQrLimits.test.ts`, join/PIN service tests, route-role tests (pattern `routes/orderStaffRoutesRoles.test.ts`), unique-index race test.
   - Docs: AS_BUILT_BACKEND §2.1, §2.2, §3.6, §3.15, new §3.20 "Table QR", §5, §6.
2. **QR orders** — Migration `…_table_qr_orders`.
   - `qrOnly` in `buildOrderLines`; `tableSessionId`/`tableGuestId` in `createOrder` (and stamped on deal-exploded items); guard with §5.3 order limits.
   - `POST /orders`, `POST /orders/:id/cancel` (guest); `replaceOrderContents` keeps the tag; `order:submitted`/order payloads include table info; version bumps from every order path.
   - `qr-availability` endpoints + menu create/update field; `GET /menu` (QR).
   - `deriveTableOrderStatus` + the poll's `rounds`.
   - Tests: priced-by-server, `qrOnly` rejections, limits, replay/race, tag survives reception edit.
   - Docs: AS_BUILT_BACKEND §3.4, §3.8, §3.9, §4.1, §4.1a, §5.
3. **Waiter calls** — Migration `…_table_calls`.
   - Guest `POST /calls`, `/calls/:id/cancel`; staff `GET /table-calls`, acknowledge, resolve; routing (§5.4); escalation job started from `server.ts`.
   - Calls in `deriveTableState` and the poll; session close cancels calls.
   - Tests: cooldown/open-cap, routing fallback for an inactive waiter, escalation exactly once, role tests.
   - Docs: AS_BUILT_BACKEND §3.20, §5, §9 (background job).
4. **POS map** — pos-frontend:
   - `/tables` FloorMapPage (read + side panel, no actions beyond navigation yet), `/tables/layout` editor, Dining-areas fields, Store-settings "Table QR" card, "Show on QR menu" switches.
   - Socket listener refetching on `connect`/events; nav item.
   - Docs: AS_BUILT_FRONTEND §7.1, §7.2, §7.3, §7.3a, §7.6.
5. **POS calls/seat** — pos-frontend:
   - Seat, PIN, remove guest, close/void, out-of-service actions in the panel.
   - `TableCallsProvider` (AppLayout + TakerShell, extending `TakerOrdersContext`'s socket for OT); TakerShell "Tables" tab.
   - Incoming Orders "Table QR" chip and table/guest lines; Order Detail / Orders list labels; End Day dialog open tables; optional guest name on slips/receipts.
   - Docs: AS_BUILT_FRONTEND §7.1, §7.3, §7.6, §7.7.
6. **Customer QR UI** — online-frontend:
   - `TableShell`, `/t/:qrKey`, `/t/:qrKey/menu`, `/t/:qrKey/table`; token/cart storage; polling (§6.3); En/Ur strings; error-code copy; hosting fallback for `/t/*`.
   - Docs: add an online-frontend section to AS_BUILT_FRONTEND (Conflict C13), strings in `ONLINE_SITE_STRINGS.md`.
7. **QR print sheet** — pos-frontend:
   - `qrcode-generator` dependency (state why in the report), `/tables/qr-sheet`, regenerate with confirm, `VITE_ONLINE_SITE_URL` check.
   - Docs: AS_BUILT_FRONTEND §7.1, §7.7, Appendix B.
8. **Bill backend** — Migration `…_table_bill`.
   - `splitMath.ts` + vectors; bill request/unlock/discount (allocation)/split/claims/claim share/pay/proof/mark-paid/verify/reject/unmark; auto-`PAID`; close-with-settlement + `TableReceipt`; `USE_TABLE_BILL` guards; split cancellation hooks on add/remove/cancel/accept; `releaseMediaIfUnreferenced` + `purgeOrphanMedia` count share proofs; public receipt route; `table-bill:updated`; bill in `deriveTableState` and the poll.
   - Tests: split vectors, Σ invariant, discount allocation sums, `SPLIT_HAS_PAYMENTS`, ownership checks (`NOT_YOUR_SHARE`, cross-session 404), reports unchanged after close (sales = Σ shares).
   - Docs: AS_BUILT_BACKEND §2, §3.9, §3.18, §3.20, §4.1e, §4.2a, §4.7, §5.
9. **Customer bill UI** — online-frontend:
   - `/t/:qrKey/bill`, `/r/:receiptKey` with print stylesheet, receipt link kept after close.
   - Docs: AS_BUILT_FRONTEND online section, strings.
10. **POS bill UI** — pos-frontend:
    - `/table-sessions/:id` TableBillPage, payment-hidden states on Order Detail, `buildTableReceiptDoc` for the print agent + browser fallback.
    - Docs: AS_BUILT_FRONTEND §7.3, §7.7, §7.7a.
11. **Review**:
    - `/code-review` on the branch;
    - walk every row of §9 against the code;
    - run the §7.4 vectors;
    - an end-to-end script in the style of `backend/scripts/verify-guest-orders.ts` (`verify-table-qr.ts`, localhost-only guard): seat → join ×2 → order ×2 → accept → items served → bill → BY_ITEMS → one cash + one online share → verify → close → receipt link → token 401 → reports show the table once;
    - fix what it finds.
12. **Docs**:
    - `docs/BACKEND_API.md` (new endpoints, socket events, conventions);
    - AS_BUILT_BACKEND/FRONTEND final pass (feature matrix §8, migrations table, env vars if any);
    - mark this spec "Built" with deviations listed;
    - `README`/`DEPLOYMENT.md` notes for the `/t/*` and `/r/*` SPA fallback.

---

## 11. Conflicts between the requirements and the code

| # | Requirement or rule | What the code does | Smallest fix (adopted above) |
|---|---|---|---|
| C1 | `CLAUDE.md`: schema changes go "through `prisma migrate dev`" | AS_BUILT §2.1 records that `migrate dev` can't run here (checksum drift on `20261026033721…`, no shadow DB); every migration since November was made with `migrate diff` + `migrate deploy` | Try `migrate dev`; on that known refusal use the documented `diff` + `deploy` path (§2.5). Never reset. Worth fixing the drift separately |
| C2 | ORDER_TAKER seats tables "from the POS" and receives waiter calls | ORDER_TAKER's UI is `TakerShell` with two tabs; its socket can't join any room except the auto-joined `user:<id>` | A "Tables" tab in TakerShell; server-side auto-join to `order-takers` (and `user:<id>` for every staff role) |
| C3 | Each share pays CASH or ONLINE | `Order.paymentMethod` is required, one per order; reports split cash/online on it | QR orders are created with `CASH` as a placeholder; at close each order becomes `ONLINE` only if every share was ONLINE, else `CASH`. For mixed tables the dashboard's cash/online split is approximate (sales totals stay exact). Q5 |
| C4 | One bill discount, given before splitting | Discounts live per order (`Order.discount`, cap + reason in `discountPolicy.ts`); reports sum `Order.totalAmount` | Check the bill discount with `checkDiscountChange` on the bill subtotal, then allocate it onto the orders (§7.2) with per-order `DISCOUNT_SET` events |
| C5 | Session pays through the bill | `PATCH /:id/payment-status`, `/complete`, `/delivered` can pay or complete any order | Phase 2: those return 409 `USE_TABLE_BILL` for orders of a session with a bill |
| C6 | Per-guest / per-session limits | Rate limits are in-memory **per IP**; `/api/online` allows 300/15 min/IP; a restaurant's guests share one Wi-Fi IP | Postgres counts per guest/session (§5.3); in-memory limiters keyed by token hash; `onlineGeneralLimiter` skips `/table` and `/receipts` |
| C7 | Every order item records which guest added it | `updateSubmission` → `replaceOrderContents` deletes and recreates every line when reception edits | Keep the submitter on `Order.tableGuestId` and stamp it on rebuilt lines |
| C8 | "Route to the waiter assigned to the table" | `Order.waiterId` is an `Employee`, not a login; sockets target `StaffUser`s | `TableSession.waiterStaffId` (StaffUser) with `DiningArea.defaultWaiterStaffId`; QR orders also set `waiterId` to that staff member's `employeeId` when linked |
| C9 | Ordering requires an active business day | End Day knows only orders; a forced end would leave sessions open | End Day's 400 lists `openTableSessions`; QR orders need the session's own business day (C15) |
| C10 | `BILL_REQUESTED` is a phase-1 map state | The bill is phase 2 | Phase 1 derives it from an open `BILL_CASH` call |
| C11 | Calls go RAISED → ACKNOWLEDGED → RESOLVED | No way to model a guest withdrawing a call or a session closing over it | Additive `CANCELLED` status |
| C12 | "Waiter collects cash at the table" | Only SA/PA may mark a cash payment (`PATCH /:id/payment-status`); ORDER_TAKER can't touch money | Default: the waiter is called to the table (BILL_CASH), and SA/PA mark the share paid. Q2 |
| C13 | Customer QR UI | AS_BUILT_FRONTEND says pos-frontend is "the only frontend", but `online-frontend/` exists and is the customer website | Build the guest UI in `online-frontend/`; step 12 documents that app |
| C14 | One open session per table | Prisma can't declare a partial unique index | Hand-appended `CREATE UNIQUE INDEX … WHERE status = 'OPEN'` (precedent: CHECK constraints) |
| C15 | Ordering requires an active business day | `createOrder` stamps whatever day is active, so a session seated yesterday could order into today | QR order requires `activeDay.id = session.businessDayId`, else `ORDERING_CLOSED`; staff close and reseat |
| C16 | Online shares reuse the proof flow | Proofs hang off `Order.paymentProofMediaId`; `releaseMediaIfUnreferenced`/`purgeOrphanMedia` count references table by table | `TableBillShare.paymentProofMediaId` + add it to both functions |
| C17 | Table states read item statuses | `updateOrderItemStatus` accepts any → any (AS_BUILT §4.2) | Not fixed here (out of scope); `deriveTableState` just reads what's stored |
| C18 | QR menu "independent of the online flag" | `/api/online/menu` is filtered on `isAvailableOnline` and cached | A separate `GET /api/online/table/menu` filtered on `isAvailableOnQr`, the same mapper |

---

## 12. Open questions

Each has the default this spec already assumes, so building can start before you answer.

1. **Backfill `isAvailableOnQr`?** Should every current POS item (sellable, fixed-price) start on the QR menu? *Default: no, nothing shows until switched on.*
2. **Cash at the table:** may an ORDER_TAKER mark a cash share paid, or only SA/PA (today's rule for cash)? *Default: SA/PA only.*
3. **Should ONLINE_ADMIN verify online table shares?** Today it verifies online-order payments only. *Default: no, SA/PA.*
4. **Limit numbers:** 50,000 max per round; 2 awaiting rounds per guest and 4 per session; 30 s order cooldown; 30 rounds and 20 guests per session; 10 PIN tries. *Default: as listed.*
5. **Reports:** for a table that paid partly cash and partly online, is an exact cash/online split needed on the dashboard? That would mean reading `TableBillShare` in `salesDefinitions`. *Default: no, the totals are exact and the split is approximate.*
6. **Shared table cart** (everyone sees one cart and one person sends it) instead of one cart per phone? *Default: per phone.*
7. **Who may choose the split?** *Default: any guest may pick Equal or By items; Custom is staff only.*
8. **QR menu prices:** always the same as the POS? *Default: yes.*
9. **Floors:** is the existing `area` ("Family Hall", "Rooftop") enough, or do you need a separate floor level above areas? *Default: `area` only.*
10. **Should a guest be able to cancel their own round** while it's still waiting at reception? *Default: yes.*
