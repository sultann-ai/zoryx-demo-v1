# Zoryx — POS + Online Ordering System
Software Requirements Specification, Architecture, Folder Structure & Database Schema

---

## A. Restructured Requirements (quick reference)

### A.1 Actors
| Role | Belongs to | Can do |
|---|---|---|
| Super Admin | POS | Everything. Only role that can add/remove Admins, add/remove Kitchens, see both platforms. |
| POS Admin | POS | Day-to-day sales: take orders, manage tables/waiters/riders/menu, inventory, run reports, start/end the business day. |
| Kitchen account (x4, expandable) | POS | Sees only its own kitchen's queue (Baking, Drinks, Tea, Ice cream). Marks items as preparing/ready. |
| Online Admin | Online Ordering | Manages the online menu switch, verifies payment screenshots, sees customer accounts. |
| Customer | Online Ordering | Signs up, saves an address, browses menu, places an order (COD or online payment with screenshot). |

### A.2 POS system — modules
1. Order taking (table / family hall / gents hall / takeaway / delivery / phone-in)
2. Menu management (each item assigned to one kitchen)
3. Table, waiter, and rider management
4. Kitchen management (add/remove kitchens, kitchen login accounts)
5. Live kitchen display (auto-updating order queue per kitchen)
6. Thermal receipt printing (1 customer receipt + separate kitchen tickets, split automatically by kitchen)
7. Inventory (auto-deduct for packaging-type items, manual entry for consumables)
8. Employee attendance + salary/advance ledger (spreadsheet-style)
9. Business Day control (Start Day / End Day button)
10. Dashboards & reports (daily/monthly sales, order count, cancellations) + Excel export

### A.3 Online Ordering system — modules
1. Customer signup/login, saved delivery address (plain text, no map)
2. Browse menu (only items marked "available online")
3. Cash on delivery, or online payment with a screenshot upload
4. Online Admin verifies the payment screenshot before the order is confirmed
5. Customer sees a single "Order confirmed" message — no live status tracking
6. Order lands directly in the POS Admin's queue, exactly like a phone order would

### A.4 Rules that apply everywhere
- Every order gets a unique ID, and a short daily number the staff can say out loud ("order 14").
- The cafe's "day" runs from opening (evening) until it closes after midnight — reporting must follow the Business Day, not the calendar date.
- One menu, not two. Each item has two switches: show in POS, show online.

---

## B. Software Requirements Specification

### B.1 Purpose
Build one system that runs the cafe's floor operations (POS) and takes orders from a website (Online Ordering), so every order — no matter where it came from — ends up in one place the kitchens and the Admin can see live.

### B.2 Permission matrix
| Action | Super Admin | POS Admin | Online Admin | Kitchen |
|---|:---:|:---:|:---:|:---:|
| Create/remove Admin or Kitchen accounts | ✅ | ❌ | ❌ | ❌ |
| Take/edit POS orders | ✅ | ✅ | ❌ | ❌ |
| View own kitchen's order queue | ✅ | view all | ❌ | own kitchen only |
| Manage menu, tables, waiters, riders | ✅ | ✅ | ❌ | ❌ |
| Toggle "available online" per item | ✅ | ❌ | ✅ | ❌ |
| Verify online payment screenshots | ✅ | ❌ | ✅ | ❌ |
| Inventory & employee/payroll | ✅ | ✅ | ❌ | ❌ |
| Start / End Business Day | ✅ | ✅ | ❌ | ❌ |
| Reports & Excel export | ✅ | ✅ | ✅ (online orders only) | ❌ |

### B.3 Functional requirements — POS

**FR-1 Order creation**
- FR-1.1 Admin picks order type: Dine-in (Table / Family Hall / Gents Hall), Takeaway, Delivery, or Phone.
- FR-1.2 For dine-in, Admin picks a specific table/hall from the ones added by Super Admin/Admin.
- FR-1.3 Menu picker can be filtered by kitchen (e.g. show only "Ice Cream" items).
- FR-1.4 Admin sets payment method: Cash or Online, before or when closing the order.
- FR-1.5 System assigns a unique order ID + a daily order number that resets to 1 each Business Day.
- FR-1.6 On save, each order line is tagged with its kitchen (copied from the menu item) and pushed live to that kitchen's screen.

**FR-2 Printing**
- FR-2.1 "Print receipt" — one customer-facing receipt on the thermal printer.
- FR-2.2 "Print kitchen tickets" — one button, splits the order by kitchen automatically, and prints one ticket per kitchen involved (skips kitchens with no items in that order).

**FR-3 Kitchen displays**
- FR-3.1 Each kitchen account only sees items assigned to its kitchen, grouped by order/table.
- FR-3.2 Kitchen marks each item Preparing → Ready. Admin/waiter can see this status live.
- FR-3.3 Super Admin can add a new kitchen at any time; it immediately gets its own login and shows up in the menu-item kitchen picker.

**FR-4 Menu, tables, waiters, riders**
- FR-4.1 CRUD for menu items (name, price, kitchen, category, image, available-in-POS switch, available-online switch).
- FR-4.2 CRUD for dining areas (tables, family halls, gents halls).
- FR-4.3 CRUD for waiters and riders (see FR-7 — they are Employees with a designation).

**FR-5 Business Day**
- FR-5.1 "Start Day" button opens a new Business Day record and stamps who opened it and when.
- FR-5.2 "End Day" button closes it. If any order is still not Completed/Cancelled, warn the Admin and require a confirmation before closing anyway.
- FR-5.3 All reports, order numbering, and dashboards are grouped by Business Day, not calendar date.

**FR-6 Inventory**
- FR-6.1 Two item types: Auto (deducted automatically when a linked menu item is ordered, e.g. pizza boxes, bottles) and Manual (staff enters usage by hand, e.g. milk, sugar).
- FR-6.2 A menu item can be linked to one or more inventory items with a "quantity used per order" (e.g. 1 pizza = 1 box).
- FR-6.3 Every stock change is logged (who, when, how much, why).
- FR-6.4 Low-stock warning when current stock drops under a set minimum.

**FR-7 Employees, attendance, payroll**
- FR-7.1 One Employee list covers everyone on payroll (waiters, riders, cooks, cashiers, etc.) — a designation field says which.
- FR-7.2 Daily attendance grid: Present / Absent / Leave / Half-day, editable like a spreadsheet.
- FR-7.3 Monthly payroll entry per employee: base salary, allowance, deduction, advance taken, amount paid, amount remaining.

**FR-8 Reports & dashboard**
- FR-8.1 Dashboard: today's sales, today's order count, cancelled orders, best-selling items.
- FR-8.2 Daily and monthly sales reports, grouped by Business Day.
- FR-8.3 "Export to Excel" on every report and on the order list.

### B.4 Functional requirements — Online Ordering

**FR-9 Customer account**
- FR-9.1 Sign up / log in with phone (and optional email) + password.
- FR-9.2 Save one or more delivery addresses as free text (no map picker).

**FR-10 Ordering**
- FR-10.1 Browse only items marked "available online".
- FR-10.2 Choose Cash on Delivery, or Online Payment (upload a screenshot of the transfer).
- FR-10.3 On submit: if COD, the order is created and immediately visible to the POS Admin. If Online Payment, the order is created as "awaiting verification" and becomes visible to the POS Admin as a normal order only after the Online Admin verifies the screenshot.
- FR-10.4 Customer sees one static "Order confirmed" screen after submitting — no order-status tracking page.

**FR-11 Online Admin**
- FR-11.1 Queue of payment screenshots waiting for verification, with Approve/Reject.
- FR-11.2 Toggle which menu items are visible on the online store (shares the same menu table as POS).

### B.5 Business rules (the ones that will bite you if skipped)
1. **Business Day, not calendar day.** A shift from 7 PM to 1 AM is one day. Every report query groups by `businessDayId`.
2. **Order numbers reset per Business Day**, starting at 1, so receipts stay short and readable.
3. **End Day is blocked** while any order is still Pending/In-Kitchen/Ready, unless the Admin explicitly confirms an override.
4. **One menu table**, two visibility switches — never maintain the online menu separately.
5. **Online orders are real POS orders** the moment they're created (source = ONLINE); there is no separate "online orders" table to keep in sync.
6. **Auto-inventory deduction happens when the order is placed**, not when it's marked complete — so stock reflects what's committed, not just what's finished.

### B.6 Non-functional requirements
- **Real-time**: kitchen screens and the Admin dashboard update live using WebSockets (Socket.io) — not polling or manual refresh.
- **Printing**: thermal printer is treated as a normal system printer; receipts are HTML/CSS sized to the paper width (58mm/80mm) and printed via the browser. Only move to raw ESC/POS commands (`node-thermal-printer`) if browser printing proves unreliable with your exact printer model.
- **File uploads**: payment screenshots stored on disk (or S3-compatible storage later) with a size/type limit (e.g. jpg/png, 5MB).
- **Auth**: JWT-based sessions, role checked on every API route, kitchen accounts scoped to their own kitchen's data only.
- **Currency/decimal**: all money fields use `Decimal(10,2)`, never floating point.
- **Exports**: Excel files generated server-side (e.g. with `exceljs`), not client-side, so large exports don't freeze the browser.

### B.7 Assumptions & out of scope (confirm these — I picked the simplest reasonable option for each)
- A customer's online order shows "Order confirmed" as soon as it's submitted (COD) or as soon as it's verified (online payment) — there's no in-between "waiting" screen with a spinner. If POS later rejects it (out of stock, etc.), that's handled by phone, not in-app, since there's no tracking screen.
- "Family Hall" and "Gents Hall" are each treated as one bookable area (not a group of individual tables inside them). If they actually contain multiple separate tables, say so — it's a small schema change (nest tables under a hall).
- No Google Maps, no payment gateway, no multi-branch support — matches what you asked for.
- Inventory auto-deduction is by simple "1 order = N units" links, not a full recipe/BOM costing system.
- The attendance/salary screen is a normal editable data grid (ag-Grid/Handsontable), not a literal `.xlsx` file editor in the browser.

---

## C. Architecture & strategy

### C.1 Recommended: one backend, two frontends
- **`zoryx-demo-backend`** — one Node/Express + Prisma + PostgreSQL service. Internally split into a `pos` module and an `online` module (separate route files, separate auth guards), both sharing the same Prisma client and the same database.
- **`zoryx-demo-pos-frontend`** — React app for Super Admin / Admin / Kitchen.
- **`zoryx-demo-online-frontend`** — React app for Customer / Online Admin.

This gives you everything you asked for — separate frontends, separate admins, separate concerns in the code — without inventing a second database that has to be kept in sync. An online order is just a row in the same `orders` table with `source = ONLINE`; the POS Admin's screen and the kitchen screens pick it up through the same WebSocket events a phone order would trigger.

**If you still want two fully separate backends** (one repo per platform, each with its own Express + Prisma), the least painful way to do it is: both backends point at the *same* PostgreSQL database, using the *same* `schema.prisma` file (copy it between repos on every change, or pull it from a shared private npm package). You avoid a live integration call between the two servers, but you take on the job of manually keeping two copies of the schema identical — every migration has to be applied and copied in both places, by hand, forever. For a one-location cafe built and maintained by one team, this is added risk for no real gain.

### C.2 Real-time kitchen notifications
- Use Socket.io on the backend. Each kitchen client joins a room named after its kitchen ID (`kitchen:<id>`).
- When an order is created, emit `order-item:new` to the relevant kitchen room(s) with just that kitchen's items.
- When a kitchen marks an item Ready, emit `order-item:updated` so the POS Admin dashboard and any waiter view update live.
- The same socket connection can push `order:new` to a `pos-admin` room whenever an online order is verified — this is what replaces the "redirect to POS admin" step you described. No polling needed.

### C.3 Thermal printing
- Start with browser printing: a print-only CSS template sized to 58mm/80mm, triggered by `window.print()`. Most thermal receipt printers install as a normal system printer (via the manufacturer's driver), so this works without extra software.
- Keep `node-thermal-printer` (ESC/POS over USB/network) as a fallback plan only if a specific printer model doesn't behave well as a generic system printer.

### C.4 Excel export
- Generate `.xlsx` files server-side with `exceljs`, behind an endpoint like `GET /api/reports/export?type=daily&businessDayId=...`. Keeps large exports off the browser's main thread.

### C.5 Suggested build order
1. Auth + roles + Business Day (Start/End Day) — everything else depends on these.
2. Menu, Kitchens, Dining Areas, Employees (waiters/riders) — the setup data.
3. POS order flow end-to-end: create order → print receipt → print kitchen tickets → kitchen display marks ready.
4. Inventory auto/manual deduction.
5. Dashboards, reports, Excel export.
6. Employee attendance/payroll grid.
7. Online Ordering: customer auth, menu browsing, cart, COD flow first (simpler), then online-payment-with-screenshot flow.
8. Online Admin verification queue, wired into the same order pipeline as step 3.

Build POS first and get it running in the real cafe before Online Ordering — POS is the harder, higher-stakes half, and Online Ordering plugs into the same `orders` table once POS is solid.

---

## D. Folder structures

### D.1 Backend — `zoryx-demo-backend`
```
zoryx-demo-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   └── socket.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── staff/              (Super Admin / Admin / Kitchen accounts)
│   │   ├── kitchen/
│   │   ├── menu/
│   │   ├── category/
│   │   ├── diningArea/         (tables / halls)
│   │   ├── employee/           (waiters, riders, attendance, payroll)
│   │   ├── order/
│   │   │   ├── order.controller.ts
│   │   │   ├── order.service.ts
│   │   │   ├── order.routes.ts
│   │   │   └── order.socket.ts
│   │   ├── inventory/
│   │   ├── businessDay/
│   │   ├── customer/            (online auth)
│   │   ├── customerAddress/
│   │   ├── payment/             (screenshot upload + verification)
│   │   └── reports/             (dashboards + Excel export)
│   ├── common/
│   │   ├── middlewares/         (auth guard, role guard, error handler)
│   │   ├── utils/
│   │   └── validators/
│   ├── routes/
│   │   └── index.ts             (mounts /api/pos/* and /api/online/*)
│   ├── app.ts
│   └── server.ts
├── uploads/                     (payment screenshots)
├── .env.example
├── package.json
└── tsconfig.json
```

### D.2 POS frontend — `zoryx-demo-pos-frontend`
```
zoryx-demo-pos-frontend/
├── public/
├── src/
│   ├── api/
│   ├── components/
│   │   ├── common/
│   │   ├── receipt/              (print templates)
│   │   └── dashboard/
│   ├── features/
│   │   ├── auth/
│   │   ├── order/
│   │   ├── menu/
│   │   ├── kitchenDisplay/
│   │   ├── inventory/
│   │   ├── employees/            (attendance + payroll grid)
│   │   ├── diningAreas/
│   │   ├── reports/
│   │   └── settings/             (kitchens, staff accounts — Super Admin only)
│   ├── hooks/
│   ├── layouts/
│   ├── pages/
│   │   ├── super-admin/
│   │   ├── admin/
│   │   └── kitchen/
│   ├── routes/
│   ├── sockets/
│   ├── store/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── .env.example
└── package.json
```

### D.3 Online frontend — `zoryx-demo-online-frontend`
```
zoryx-demo-online-frontend/
├── public/
├── src/
│   ├── api/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── menu/
│   │   ├── cart/
│   │   ├── checkout/            (COD / online payment + screenshot upload)
│   │   ├── orderConfirmation/
│   │   ├── address/
│   │   └── admin/               (menu visibility toggle, payment verification queue)
│   ├── layouts/
│   ├── pages/
│   │   ├── customer/
│   │   └── admin/
│   ├── routes/
│   ├── store/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── .env.example
└── package.json
```

---

## E. Database schema

### E.1 Tables, in plain English
| Table | What it holds |
|---|---|
| `StaffUser` | Login accounts: Super Admin, POS Admin, Online Admin, Kitchen. Optionally linked to an `Employee` record if that person is also on payroll. |
| `Kitchen` | Baking, Drinks, Tea, Ice cream — expandable by Super Admin. |
| `Category`, `MenuItem` | The menu. Each item belongs to one kitchen and has two visibility switches. |
| `DiningArea` | Tables, family halls, gents halls. |
| `Employee` | Everyone on payroll — waiters, riders, cooks, etc. — with a `designation` field. |
| `AttendanceRecord`, `PayrollEntry` | Daily attendance and monthly salary ledger per employee. |
| `Customer`, `CustomerAddress` | Online-ordering customer accounts and saved plain-text addresses. |
| `BusinessDay` | One row per "day" the cafe is open, from Start Day to End Day — independent of the calendar date. |
| `Order`, `OrderItem` | Every order, from any source, with a per-Business-Day order number. |
| `InventoryItem`, `MenuItemInventoryLink`, `InventoryTransaction` | Stock items, what menu item consumes what stock, and a log of every stock change. |

### E.2 Prisma schema
This has been checked line by line for matching relations, valid types, and correct unique/index usage. I could not run it through the actual Prisma compiler in this sandbox (it tries to download its engine binary from a domain this environment blocks), so run `npx prisma format` yourself the first time — it takes seconds and will catch anything a manual read missed.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ================= ENUMS =================

enum StaffRole {
  SUPER_ADMIN
  POS_ADMIN
  ONLINE_ADMIN
  KITCHEN
}

enum DiningAreaType {
  TABLE
  FAMILY_HALL
  GENTS_HALL
}

enum OrderSource {
  POS
  ONLINE
  PHONE
}

enum OrderType {
  DINE_IN
  TAKEAWAY
  DELIVERY
}

enum OrderStatus {
  PENDING
  CONFIRMED
  IN_KITCHEN
  READY
  COMPLETED
  CANCELLED
}

enum OrderItemStatus {
  PENDING
  PREPARING
  READY
  SERVED
}

enum PaymentMethod {
  CASH
  ONLINE
}

enum PaymentStatus {
  PENDING
  AWAITING_VERIFICATION
  VERIFIED
  REJECTED
}

enum InventoryTrackingType {
  AUTO
  MANUAL
}

enum InventoryTxnType {
  STOCK_IN
  STOCK_OUT
  ADJUSTMENT
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LEAVE
  HALF_DAY
}

// ================= STAFF / AUTH (POS side) =================

model StaffUser {
  id           String    @id @default(uuid())
  name         String
  username     String    @unique
  passwordHash String
  role         StaffRole
  kitchenId    String?
  kitchen      Kitchen?  @relation(fields: [kitchenId], references: [id])
  employeeId   String?   @unique
  employee     Employee? @relation(fields: [employeeId], references: [id])
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  ordersPlaced       Order[]                @relation("PlacedByStaff")
  paymentsVerified   Order[]                @relation("PaymentVerifiedBy")
  businessDaysOpened BusinessDay[]          @relation("OpenedBy")
  businessDaysClosed BusinessDay[]          @relation("ClosedBy")
  inventoryTxns      InventoryTransaction[]

  @@index([role])
}

model Kitchen {
  id        String   @id @default(uuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  staff      StaffUser[]
  menuItems  MenuItem[]
  orderItems OrderItem[]
}

// ================= MENU =================

model Category {
  id   String @id @default(uuid())
  name String @unique

  menuItems MenuItem[]
}

model MenuItem {
  id                String    @id @default(uuid())
  name              String
  description       String?
  price             Decimal   @db.Decimal(10, 2)
  kitchenId         String
  kitchen           Kitchen   @relation(fields: [kitchenId], references: [id])
  categoryId        String?
  category          Category? @relation(fields: [categoryId], references: [id])
  imageUrl          String?
  isAvailableInPOS  Boolean   @default(true)
  isAvailableOnline Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  orderItems     OrderItem[]
  inventoryLinks MenuItemInventoryLink[]

  @@index([kitchenId])
}

// ================= DINING AREA =================

model DiningArea {
  id       String         @id @default(uuid())
  name     String
  type     DiningAreaType
  capacity Int?
  isActive Boolean        @default(true)

  orders Order[]
}

// ================= EMPLOYEES (waiters, riders, cooks, everyone on payroll) =================

model Employee {
  id          String   @id @default(uuid())
  name        String
  phone       String?
  designation String
  baseSalary  Decimal  @db.Decimal(10, 2)
  joiningDate DateTime
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  staffAccount   StaffUser?
  ordersAsWaiter Order[]            @relation("WaiterOrders")
  ordersAsRider  Order[]            @relation("RiderOrders")
  attendance     AttendanceRecord[]
  payroll        PayrollEntry[]
}

model AttendanceRecord {
  id         String           @id @default(uuid())
  employeeId String
  employee   Employee         @relation(fields: [employeeId], references: [id])
  date       DateTime         @db.Date
  status     AttendanceStatus
  checkIn    DateTime?
  checkOut   DateTime?
  remarks    String?

  @@unique([employeeId, date])
}

model PayrollEntry {
  id              String    @id @default(uuid())
  employeeId      String
  employee        Employee  @relation(fields: [employeeId], references: [id])
  month           Int
  year            Int
  baseSalary      Decimal   @db.Decimal(10, 2)
  allowance       Decimal   @default(0) @db.Decimal(10, 2)
  deduction       Decimal   @default(0) @db.Decimal(10, 2)
  advanceTaken    Decimal   @default(0) @db.Decimal(10, 2)
  paidAmount      Decimal   @default(0) @db.Decimal(10, 2)
  remainingAmount Decimal   @db.Decimal(10, 2)
  paidAt          DateTime?
  note            String?

  @@unique([employeeId, month, year])
}

// ================= CUSTOMERS (online side) =================

model Customer {
  id           String   @id @default(uuid())
  name         String
  phone        String   @unique
  email        String?  @unique
  passwordHash String
  createdAt    DateTime @default(now())

  addresses CustomerAddress[]
  orders    Order[]
}

model CustomerAddress {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  label       String?
  addressText String
  isDefault   Boolean  @default(false)

  orders Order[]
}

// ================= BUSINESS DAY (handles the past-midnight problem) =================

model BusinessDay {
  id         String     @id @default(uuid())
  label      String
  startedAt  DateTime
  endedAt    DateTime?
  isActive   Boolean    @default(true)
  openedById String
  openedBy   StaffUser  @relation("OpenedBy", fields: [openedById], references: [id])
  closedById String?
  closedBy   StaffUser? @relation("ClosedBy", fields: [closedById], references: [id])

  orders Order[]

  @@index([isActive])
}

// ================= ORDERS =================

model Order {
  id                   String           @id @default(uuid())
  orderNumber          Int
  businessDayId        String
  businessDay          BusinessDay      @relation(fields: [businessDayId], references: [id])
  source               OrderSource
  type                 OrderType
  diningAreaId         String?
  diningArea           DiningArea?      @relation(fields: [diningAreaId], references: [id])
  waiterId             String?
  waiter               Employee?        @relation("WaiterOrders", fields: [waiterId], references: [id])
  riderId              String?
  rider                Employee?        @relation("RiderOrders", fields: [riderId], references: [id])
  customerId           String?
  customer             Customer?        @relation(fields: [customerId], references: [id])
  customerAddressId    String?
  customerAddress      CustomerAddress? @relation(fields: [customerAddressId], references: [id])
  status               OrderStatus      @default(PENDING)
  paymentMethod        PaymentMethod
  paymentStatus        PaymentStatus    @default(PENDING)
  paymentScreenshotUrl String?
  paymentVerifiedById  String?
  paymentVerifiedBy    StaffUser?       @relation("PaymentVerifiedBy", fields: [paymentVerifiedById], references: [id])
  placedByStaffId      String?
  placedByStaff        StaffUser?       @relation("PlacedByStaff", fields: [placedByStaffId], references: [id])
  totalAmount          Decimal          @db.Decimal(10, 2)
  discount             Decimal          @default(0) @db.Decimal(10, 2)
  notes                String?
  cancelledReason      String?
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  items OrderItem[]

  @@unique([businessDayId, orderNumber])
  @@index([status])
  @@index([source])
}

model OrderItem {
  id         String          @id @default(uuid())
  orderId    String
  order      Order           @relation(fields: [orderId], references: [id])
  menuItemId String
  menuItem   MenuItem        @relation(fields: [menuItemId], references: [id])
  kitchenId  String
  kitchen    Kitchen         @relation(fields: [kitchenId], references: [id])
  quantity   Int
  unitPrice  Decimal         @db.Decimal(10, 2)
  subtotal   Decimal         @db.Decimal(10, 2)
  status     OrderItemStatus @default(PENDING)
  notes      String?
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  @@index([kitchenId, status])
}

// ================= INVENTORY =================

model InventoryItem {
  id           String                @id @default(uuid())
  name         String
  unit         String
  currentStock Decimal               @db.Decimal(10, 2)
  minThreshold Decimal?              @db.Decimal(10, 2)
  trackingType InventoryTrackingType
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt

  menuItemLinks MenuItemInventoryLink[]
  transactions  InventoryTransaction[]
}

model MenuItemInventoryLink {
  id               String        @id @default(uuid())
  menuItemId       String
  menuItem         MenuItem      @relation(fields: [menuItemId], references: [id])
  inventoryItemId  String
  inventoryItem    InventoryItem @relation(fields: [inventoryItemId], references: [id])
  quantityPerOrder Decimal       @db.Decimal(10, 2)

  @@unique([menuItemId, inventoryItemId])
}

model InventoryTransaction {
  id              String           @id @default(uuid())
  inventoryItemId String
  inventoryItem   InventoryItem    @relation(fields: [inventoryItemId], references: [id])
  type            InventoryTxnType
  quantity        Decimal          @db.Decimal(10, 2)
  relatedOrderId  String?
  performedById   String
  performedBy     StaffUser        @relation(fields: [performedById], references: [id])
  note            String?
  createdAt       DateTime         @default(now())
}
```

---

## F. Open questions for you
These are the assumptions from B.7, repeated as direct decisions I need from you before build starts — because the wrong guess here changes the schema, not just the UI:

1. Are "Family Hall" and "Gents Hall" single bookable areas, or do they each contain several separate tables?
2. When an online order needs verification and gets rejected — is a phone call to the customer really enough, or do you want a simple SMS/WhatsApp notice later?
3. Do Waiters and Riders need their own login accounts (to update order status themselves), or does the POS Admin do everything on their behalf, as described?
4. Single-location only, correct? (This schema doesn't have a `branch`/`location` concept — adding one later is possible but touches almost every table.)
