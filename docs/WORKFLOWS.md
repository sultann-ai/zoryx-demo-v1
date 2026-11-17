# Zoryx POS — Workflows and Use Cases

This document describes the implemented workflows in the Zoryx platform.
It is based on the current frontend, backend, database schema, Socket.io flow,
and print-agent integration.

## 1. Overall platform architecture

```mermaid
flowchart LR
    Staff["Staff user"]
    Customer["Online customer<br/>(API only)"]
    Frontend["React POS frontend"]
    API["Express API"]
    DB[("PostgreSQL / Prisma")]
    Socket["Socket.io"]
    Agent["Print agent<br/>cashier computer"]
    Printer["ESC/POS printers"]

    Staff --> Frontend
    Customer --> API
    Frontend --> API
    API --> DB
    API <--> Socket
    Frontend <--> Socket
    API --> Agent
    Agent --> Printer
```

The application has two API surfaces:

- `/api/pos` — staff POS application.
- `/api/online` — customer/order/payment API. There is no customer-facing web
  frontend in this repository.

## 2. Staff role use cases

```mermaid
flowchart TB
    SA["SUPER_ADMIN"]
    PA["POS_ADMIN"]
    OA["ONLINE_ADMIN"]
    OT["ORDER_TAKER"]
    K["KITCHEN"]

    Login((Log in))
    Staff((Manage staff))
    Setup((Manage kitchens, categories,<br/>menu, deals, add-ons))
    Employee((Manage employees,<br/>attendance, payroll))
    POS((Create and manage POS orders))
    Orders((View and manage orders))
    Inventory((Manage inventory))
    Reports((View reports and exports))
    Vendors((Manage vendors and ledger))
    Online((Review online orders/payments<br/>and online availability))
    Taker((Submit and track reception orders))
    KitchenQueue((View own kitchen queue))
    ItemStatus((Update item preparation status))
    Print((Print receipts and kitchen tickets))

    SA --> Login
    SA --> Staff
    SA --> Setup
    SA --> Employee
    SA --> POS
    SA --> Orders
    SA --> Inventory
    SA --> Reports
    SA --> Vendors
    SA --> Online
    SA --> Print

    PA --> Login
    PA --> Setup
    PA --> Employee
    PA --> POS
    PA --> Orders
    PA --> Inventory
    PA --> Reports
    PA --> Vendors
    PA --> Print

    OA --> Login
    OA --> Online
    OA --> Setup

    OT --> Login
    OT --> Taker

    K --> Login
    K --> KitchenQueue
    K --> ItemStatus
    K --> Print
```

### Role behavior

- `SUPER_ADMIN` manages staff accounts and all POS administration.
- `POS_ADMIN` manages normal POS operations.
- `ONLINE_ADMIN` handles online availability and online payment/reception
  functions.
- `ORDER_TAKER` uses only the Taker shell: `/take-order` and `/my-orders`.
- `KITCHEN` uses only `/kitchen-display`.
- Kitchen users do not receive the normal sidebar or POS shell.
- Order takers do not receive the normal admin shell.

## 3. Empty-database setup workflow

```mermaid
flowchart TD
    Start([Empty database])

    Migrate["Run Prisma migrations"]
    Admin["Create first SUPER_ADMIN account"]
    Login["SUPER_ADMIN logs in"]

    Kitchen["Create kitchens"]
    Category["Create categories"]
    Employee["Create employees"]
    Staff["Create staff accounts"]
    Dining["Create dining areas"]

    Menu["Create menu items"]
    Variants["Add menu variants/sizes"]
    Addons["Create add-ons and size prices"]
    Deals["Create deals and deal components"]

    Inventory["Create inventory items"]
    Links["Link menu items to inventory"]
    Vendors["Create vendors and ledger entries"]

    BusinessDay["Start business day"]
    Ready([System ready for operations])

    Start --> Migrate --> Admin --> Login

    Login --> Kitchen
    Login --> Category
    Login --> Employee
    Login --> Dining
    Login --> Vendors

    Kitchen --> Menu
    Category --> Menu
    Menu --> Variants
    Category --> Addons
    Variants --> Addons

    Menu --> Deals
    Variants --> Deals
    Category --> Deals

    Menu --> Inventory
    Inventory --> Links
    Menu --> Links

    Employee --> Staff
    Kitchen --> Staff

    Login --> BusinessDay
    Menu --> BusinessDay
    Dining --> BusinessDay

    Staff --> Ready
    Deals --> Ready
    Addons --> Ready
    Links --> Ready
    BusinessDay --> Ready
```

### Recommended setup order

1. Run migrations.
2. Create the first `SUPER_ADMIN`.
3. Log in.
4. Create kitchens.
5. Create categories.
6. Create employees.
7. Create staff users and assign roles.
8. Create dining areas.
9. Create menu items and assign each item to a kitchen.
10. Add variants and sizes.
11. Add add-ons and prices.
12. Create deals.
13. Create inventory items and link them to menu items.
14. Create vendors if purchasing is needed.
15. Start a business day.

## 4. Data relationships

```mermaid
erDiagram
    KITCHEN ||--o{ MENU_ITEM : routes
    KITCHEN ||--o{ STAFF_USER : scopes
    CATEGORY ||--o{ MENU_ITEM : groups
    CATEGORY ||--o{ ADD_ON : scopes
    MENU_ITEM ||--o{ MENU_ITEM_VARIANT : has
    MENU_ITEM_VARIANT ||--o{ ADD_ON_PRICE : matches_size
    DEAL ||--o{ DEAL_COMPONENT : contains
    DEAL_COMPONENT }o--|| MENU_ITEM : fixed_item
    DEAL_COMPONENT }o--|| MENU_ITEM_VARIANT : fixed_variant
    DEAL_COMPONENT }o--|| CATEGORY : choice_category
    EMPLOYEE ||--o{ STAFF_USER : optionally_links
    MENU_ITEM ||--o{ MENU_ITEM_INVENTORY_LINK : consumes
    INVENTORY_ITEM ||--o{ MENU_ITEM_INVENTORY_LINK : consumed_by
    VENDOR ||--o{ VENDOR_LEDGER_ENTRY : records
```

## 5. POS order workflow

```mermaid
sequenceDiagram
    actor Staff as POS Admin / Super Admin
    participant UI as POS Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Kitchen as Kitchen Display

    Staff->>UI: Select dining type
    Staff->>UI: Select menu items/deals
    UI->>API: POST /api/pos/orders
    API->>API: Validate prices, variants, add-ons and deals
    API->>DB: Create order and order items
    API->>DB: Deduct inventory
    API-->>Kitchen: order-item:new via Socket.io
    API-->>UI: Return order
    Staff->>UI: Confirm cash payment if applicable
    UI->>API: Update payment status
    Kitchen->>API: Update item status
    API-->>UI: order-item:updated
    Staff->>UI: Complete/cancel/manage order
```

POS orders support dine-in, takeaway, deals, sized items, add-ons, customized
deals, and POS-only open-price items. The backend validates prices and totals.

## 6. Order-taker workflow

```mermaid
sequenceDiagram
    actor Taker as ORDER_TAKER
    participant UI as Taker Shell
    participant API as Express API
    participant DB as PostgreSQL
    participant Reception as POS Admin / Super Admin
    participant Kitchen as Kitchen Display

    Taker->>UI: Build order
    UI->>API: Submit order with clientRequestId
    API->>DB: Create AWAITING_RECEPTION order
    API-->>Reception: order:submitted
    API-->>Taker: Order submitted

    Reception->>API: Accept order
    API->>DB: Change order to PENDING
    API-->>Taker: order:accepted
    API-->>Kitchen: order-item:new

    Reception->>API: Reject order
    API->>DB: Change order to CANCELLED
    API-->>Taker: order:rejected

    Taker->>UI: View my orders
    UI->>API: Refresh order list/details
```

Order-taker orders wait for reception review before reaching the kitchen.

## 7. Kitchen workflow

```mermaid
sequenceDiagram
    actor KitchenUser as KITCHEN user
    participant UI as Kitchen Display
    participant Socket as Socket.io
    participant API as Express API
    participant DB as PostgreSQL
    participant POS as POS Admin

    KitchenUser->>UI: Log in
    UI->>Socket: Connect with staff JWT
    UI->>Socket: Join kitchen:<kitchenId>
    UI->>API: Fetch current kitchen queue

    POS->>API: Create or accept order
    API->>DB: Save order items
    API-->>Socket: order-item:new
    Socket-->>UI: Add item to queue

    KitchenUser->>UI: Start preparation
    UI->>API: PATCH item status
    API->>DB: Save item status
    API-->>Socket: order-item:updated
    Socket-->>POS: Update order display

    KitchenUser->>UI: Mark item ready/completed
    UI->>API: PATCH item status
    API->>DB: Save final item status
```

A kitchen user can join only the room for their assigned kitchen.

## 8. Online order and reception workflow

```mermaid
flowchart TD
    Customer["Online customer API client"]
    CustomerAuth["Customer signup/login"]
    Menu["Public online menu"]
    Create["Create online order"]
    Pending["AWAITING_RECEPTION"]
    Reception["POS Admin / Super Admin"]
    Accept["Accept"]
    Reject["Reject"]
    Payment["ONLINE_ADMIN / POS_ADMIN / SUPER_ADMIN"]
    Verify["Verify payment"]
    Confirmed["CONFIRMED"]
    Kitchen["Kitchen queue"]

    Customer --> CustomerAuth
    CustomerAuth --> Menu
    Menu --> Create
    Create --> Pending
    Pending --> Reception
    Reception --> Accept
    Reception --> Reject
    Accept --> Confirmed
    Reject --> Cancelled["CANCELLED"]
    Confirmed --> Kitchen
    Payment --> Verify
    Verify --> Confirmed
```

There is no customer-facing online-ordering frontend in this repository.

## 9. Printing workflow

```mermaid
sequenceDiagram
    actor User as POS Admin / Super Admin / Kitchen
    participant UI as React Frontend
    participant API as Print API
    participant Socket as Socket.io
    participant Agent as Print Agent on cashier PC
    participant Printer as Thermal Printer

    User->>UI: Click print receipt/tickets
    UI->>UI: Build ESC/POS document
    UI->>API: POST /api/pos/print
    API->>API: Validate printerId and document blocks
    API->>Socket: Send job to printer agent
    Socket->>Agent: Print job
    Agent->>Agent: Deduplicate jobId
    Agent->>Printer: Render ESC/POS commands
    Printer-->>Agent: Print result
    Agent-->>Socket: Acknowledge job
    Socket-->>API: Job completed
    API-->>UI: Printing successful
```

### Printing fallback

```mermaid
flowchart TD
    Click["User clicks print"]
    Build["Build receipt or kitchen ticket document"]
    Send["Send to backend print endpoint"]
    Online{"Print agent online?"}
    Success["Print directly to ESC/POS printer"]
    Failure["Show print error"]
    Browser["User clicks Open browser print view"]
    Receipt["Browser receipt route"]
    Tickets["Browser kitchen-ticket route"]
    Window["window.print()"]

    Click --> Build --> Send --> Online
    Online -->|Yes| Success
    Online -->|No| Failure
    Failure --> Browser
    Browser --> Receipt
    Browser --> Tickets
    Receipt --> Window
    Tickets --> Window
```

The print agent runs separately on the cashier's computer and is not deployed
with Railway.

## 10. Business-day workflow

```mermaid
stateDiagram-v2
    [*] --> NoActiveDay
    NoActiveDay --> Open: Start business day
    Open --> Open: Create/manage orders
    Open --> EndRequested: Request end
    EndRequested --> Open: Open orders and force=false
    EndRequested --> Closed: No open orders
    EndRequested --> Closed: force=true
    Closed --> Open: Start next business day
```

Orders cannot be created unless a business day is active.

## 11. Inventory workflow

```mermaid
flowchart LR
    Menu["Menu item"]
    Link["Menu item inventory link<br/>consumption quantity"]
    Inventory["Inventory item"]
    Order["Accepted order"]
    Deduct["Deduct stock"]
    Transaction["Inventory transaction"]
    Adjustment["Manual stock adjustment"]
    Reports["Inventory/report screens"]

    Menu --> Link
    Inventory --> Link
    Order --> Deduct
    Link --> Deduct
    Deduct --> Transaction
    Adjustment --> Transaction
    Transaction --> Reports
```

Cancelled orders do not automatically restock inventory in the current
implementation.

## 12. Employee, attendance and payroll workflow

```mermaid
flowchart TD
    Admin["SUPER_ADMIN / POS_ADMIN"]
    Employee["Create employee"]
    Attendance["Record daily attendance"]
    Payroll["Create monthly payroll entry"]
    View["View employee, attendance and payroll data"]

    Admin --> Employee
    Employee --> Attendance
    Employee --> Payroll
    Attendance --> View
    Payroll --> View
```

`Employee` is a payroll/workforce record. `StaffUser` is a login account. A
staff user may optionally be linked to an employee.

## 13. Vendor ledger workflow

```mermaid
flowchart LR
    Admin["SUPER_ADMIN / POS_ADMIN"]
    Vendor["Create vendor"]
    Purchase["Record purchase"]
    Payment["Record vendor payment"]
    Balance["Calculate vendor balance"]
    Ledger["Vendor ledger"]

    Admin --> Vendor
    Vendor --> Purchase
    Vendor --> Payment
    Purchase --> Ledger
    Payment --> Ledger
    Ledger --> Balance
```

## 14. Complete operational workflow

```mermaid
flowchart TD
    Login["Staff login"]
    Role{"Which role?"}

    Admin["Admin/POS shell"]
    Taker["Order-taker shell"]
    Kitchen["Kitchen display"]

    Setup["Configure master data"]
    Day["Start business day"]
    Order["Create or receive order"]
    Reception{"Reception review required?"}
    Accept["Accept order"]
    Reject["Reject order"]
    Route["Route items to kitchens"]
    Prepare["Kitchen prepares items"]
    Status["Update item statuses"]
    Payment["Confirm/verify payment"]
    Print["Print receipt/tickets"]
    Complete["Complete order"]
    Reports["Review reports/inventory"]

    Login --> Role
    Role -->|SUPER_ADMIN/POS_ADMIN| Admin
    Role -->|ORDER_TAKER| Taker
    Role -->|KITCHEN| Kitchen

    Admin --> Setup
    Setup --> Day
    Day --> Order

    Taker --> Order
    Order --> Reception
    Reception -->|Yes| Accept
    Reception -->|No| Route
    Reception -->|Reject| Reject
    Accept --> Route
    Route --> Prepare
    Prepare --> Status
    Status --> Payment
    Payment --> Print
    Print --> Complete
    Complete --> Reports
```

## 15. Current implementation notes

- The first admin account must be created separately; migrations do not create
  staff, kitchens, menu data, or a business day.
- Staff management is restricted to `SUPER_ADMIN`.
- Kitchens must exist before menu items can be assigned.
- Menu items must exist before inventory links and deal components can refer to
  them.
- An active business day is required before creating orders.
- The backend calculates and validates money values; client-supplied totals
  are not trusted.
- Kitchen displays use Socket.io for live order-item events.
- Order-taker orders require reception acceptance.
- Browser print routes are the fallback when the print agent is unavailable.
- The print agent is a separate process running on the cashier's computer.
## Order-taker change approval

```mermaid
sequenceDiagram
    participant T as Order taker
    participant API as Backend
    participant R as Reception
    participant K as Kitchen
    T->>API: Request cancellation or item addition
    API->>API: Snapshot order and create PENDING OrderChange
    API-->>R: order:change-requested socket event
    R->>API: Approve or reject request
    API->>API: Verify order snapshot is still current
    API->>API: Reprice, validate, and apply approved change
    API-->>K: Revised kitchen event when applicable
    API-->>T: order:change-reviewed status event
```
