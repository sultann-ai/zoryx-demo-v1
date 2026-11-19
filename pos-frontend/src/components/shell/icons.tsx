import type { ReactNode } from "react";

export type IconName =
  | "dashboard"
  | "orders"
  | "newOrder"
  | "inventory"
  | "list"
  | "more"
  | "back"
  | "close"
  // Sidebar-only, one per remaining nav destination (see routes/navItems.ts).
  | "food"
  | "categories"
  | "kitchens"
  | "diningAreas"
  | "employees"
  | "reports"
  | "vendors"
  | "staff"
  | "incoming"
  | "scheduled"
  // Table QR: the live floor map and its layout editor.
  | "tables"
  | "layout"
  // Waiter calls (the order taker's Calls tab).
  | "bell"
  // Online store section.
  | "photo"
  | "settings"
  | "truck"
  | "wallet"
  | "gallery"
  | "reviews";

// Stroke icons drawn on a 24x24 grid, coloured by the surrounding text colour
// (currentColor). No icon library in this project, and eight glyphs don't
// justify adding one.
const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  orders: (
    <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="14" y2="16" />
    </>
  ),
  newOrder: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  inventory: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  back: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  // Fork + knife, for the Menu page.
  food: (
    <>
      <line x1="4" y1="2" x2="4" y2="9" />
      <line x1="6" y1="2" x2="6" y2="9" />
      <line x1="8" y1="2" x2="8" y2="9" />
      <path d="M4 9c0 1.6.9 2.6 2 3.1V22" />
      <path d="M17 2c1.6.5 3 2.4 3 5s-1.4 4.5-3 5v10" />
      <line x1="17" y1="2" x2="17" y2="22" />
    </>
  ),
  // A price tag, for Categories.
  categories: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9V4z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // A pot with handles, for Kitchens.
  kitchens: (
    <>
      <rect x="4" y="10" width="16" height="9" rx="1" />
      <line x1="2" y1="10" x2="4" y2="10" />
      <line x1="20" y1="10" x2="22" y2="10" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  // Two tables seen from above (one round, one square) with chairs, for the live floor map.
  tables: (
    <>
      <circle cx="7" cy="8" r="3.5" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
      <line x1="7" y1="14.5" x2="7" y2="16.5" />
      <line x1="16.5" y1="8" x2="16.5" y2="10" />
      <line x1="2" y1="20" x2="9" y2="20" />
    </>
  ),
  // A service bell, for waiter calls.
  bell: (
    <>
      <path d="M6 16a6 6 0 0 1 12 0" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <line x1="12" y1="8" x2="12" y2="10" />
      <line x1="10" y1="8" x2="14" y2="8" />
      <line x1="3" y1="19" x2="21" y2="19" />
    </>
  ),
  // A floor plan with a drag handle, for the table layout editor.
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <rect x="6.5" y="6.5" width="5" height="5" />
      <circle cx="16" cy="15.5" r="2.5" />
      <line x1="11.5" y1="11.5" x2="14" y2="14" />
    </>
  ),
  // A tabletop on two legs, for Dining Areas.
  diningAreas: (
    <>
      <rect x="3" y="7" width="18" height="3" rx="1" />
      <line x1="6" y1="10" x2="6" y2="20" />
      <line x1="18" y1="10" x2="18" y2="20" />
    </>
  ),
  // Two overlapping people, for Employees.
  employees: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" />
      <circle cx="17" cy="8.3" r="2.3" />
      <path d="M15.3 20c.2-2.6 1.8-4.4 3.9-5" />
    </>
  ),
  // An ascending bar chart, for Reports.
  reports: (
    <>
      <line x1="5" y1="20" x2="19" y2="20" />
      <rect x="6" y="14" width="3" height="6" />
      <rect x="11" y="9" width="3" height="11" />
      <rect x="16" y="4" width="3" height="16" />
    </>
  ),
  // An open ledger, for Vendor Ledger.
  vendors: (
    <>
      <path d="M12 6c-1.8-1.3-4.2-2-7-2v14c2.8 0 5.2.7 7 2 1.8-1.3 4.2-2 7-2V4c-2.8 0-5.2.7-7 2z" />
      <line x1="12" y1="6" x2="12" y2="20" />
    </>
  ),
  // An ID badge, for Staff (distinct from Employees' people icon — this is
  // about system access, not the person).
  staff: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <line x1="9" y1="16" x2="15" y2="16" />
      <line x1="9" y1="18.5" x2="15" y2="18.5" />
    </>
  ),
  // An inbox tray with a downward arrow, for Incoming Orders.
  incoming: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  // A clock face, for Scheduled orders.
  scheduled: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  // A picture frame with a sun and a hill, for Menu photos and names.
  photo: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  // Two sliders, for Store settings.
  settings: (
    <>
      <line x1="4" y1="8" x2="20" y2="8" />
      <circle cx="9" cy="8" r="2.5" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="15" cy="16" r="2.5" />
    </>
  ),
  // A delivery van, for Delivery areas.
  truck: (
    <>
      <path d="M2 6h12v10H2z" />
      <path d="M14 9h4l3 3.5V16h-7" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  // A wallet, for Payment accounts.
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.1" />
    </>
  ),
  // Two overlapping pictures, for Gallery.
  gallery: (
    <>
      <rect x="7" y="3" width="14" height="12" rx="2" />
      <path d="M3 8v10a2 2 0 0 0 2 2h12" />
      <path d="m21 11-3.5-3.5L11 14" />
    </>
  ),
  // A speech bubble, for Testimonials.
  reviews: (
    <>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.3-4.4A8 8 0 1 1 21 12z" />
      <line x1="9" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="13" y2="14" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 shrink-0"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
