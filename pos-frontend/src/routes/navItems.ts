import type { ComponentType } from "react";
import type { StaffRole } from "../auth/session";
import type { IconName } from "../components/shell/icons";
import { CategoriesPage } from "../pages/CategoriesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DeliveryAreasPage } from "../pages/onlineStore/DeliveryAreasPage";
import { DiningAreasPage } from "../pages/DiningAreasPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { IncomingOrdersPage } from "../pages/IncomingOrdersPage";
import { GalleryPage } from "../pages/onlineStore/GalleryPage";
import { InventoryPage } from "../pages/InventoryPage";
import { KitchensPage } from "../pages/KitchensPage";
import { MenuPage } from "../pages/MenuPage";
import { MenuPhotosPage } from "../pages/onlineStore/MenuPhotosPage";
import { OrdersPage } from "../pages/OrdersPage";
import { PaymentAccountsPage } from "../pages/onlineStore/PaymentAccountsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { ScheduledOrdersPage } from "../pages/ScheduledOrdersPage";
import { StaffPage } from "../pages/StaffPage";
import { TableLayoutPage } from "../pages/TableLayoutPage";
import { TablesPage } from "../pages/TablesPage";
import { StoreSettingsPage } from "../pages/onlineStore/StoreSettingsPage";
import { TestimonialsPage } from "../pages/onlineStore/TestimonialsPage";
import { VendorsPage } from "../pages/VendorsPage";

// Sidebar section labels, sentence case, in the order they're stacked —
// day-to-day operations first, then the customer website's content, then setup/configuration,
// then people, then reporting. GROUP_ORDER is the single source of truth for that order; a
// group not listed here would render after every listed one (Array.indexOf
// returns -1, which sorts first, but nothing is expected to be omitted).
export const GROUP_ORDER = ["Operations", "Online store", "Setup", "Team", "Insights"] as const;
export type NavGroup = (typeof GROUP_ORDER)[number];

// A sidebar link to a full-screen page outside the shell, opened in a new tab (the Kitchen Display
// runs on its own, often on another screen). Not part of the route tree: App.tsx declares the route.
export interface NewTabNavItem {
  to: string;
  label: string;
  allowedRoles: StaffRole[];
  icon: IconName;
  group: NavGroup;
}

export const NEW_TAB_NAV_ITEMS: NewTabNavItem[] = [
  {
    to: "/kitchen-display",
    label: "Kitchen Display",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    icon: "kitchens",
    group: "Operations",
  },
];

export interface NavItem {
  to: string;
  label: string;
  allowedRoles: StaffRole[];
  page: ComponentType;
  icon: IconName;
  group: NavGroup;
}

// Single source of truth for both the route tree (App.tsx) and the sidebar
// (Sidebar.tsx) — a page's allowed roles can't drift between the two this way.
// KITCHEN is never listed here: that role gets no shared shell at all, and its
// one route (Kitchen Display) is wired up separately in App.tsx.
export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: DashboardPage,
    icon: "dashboard",
    group: "Insights",
  },
  // The live floor map (Table QR). ORDER_TAKER reaches the same page from TakerShell's "Tables" tab
  // (/taker-tables, App.tsx) — that role has no sidebar.
  {
    to: "/tables",
    label: "Tables",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: TablesPage,
    icon: "tables",
    group: "Operations",
  },
  {
    to: "/incoming-orders",
    label: "Incoming Orders",
    // ONLINE_ADMIN sees (and may accept/reject) the online orders only — the backend scopes it.
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: IncomingOrdersPage,
    icon: "incoming",
    group: "Operations",
  },
  {
    to: "/scheduled",
    label: "Scheduled",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: ScheduledOrdersPage,
    icon: "scheduled",
    group: "Operations",
  },
  {
    to: "/orders",
    label: "Orders",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: OrdersPage,
    icon: "orders",
    group: "Operations",
  },
  // The customer website's content. ONLINE_ADMIN's home is this section (see homeRoute.ts); the
  // backend only lets these roles change website fields, never a price or a kitchen.
  {
    to: "/online-store/menu",
    label: "Menu photos and names",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: MenuPhotosPage,
    icon: "photo",
    group: "Online store",
  },
  {
    to: "/online-store/settings",
    label: "Store settings",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: StoreSettingsPage,
    icon: "settings",
    group: "Online store",
  },
  {
    to: "/online-store/delivery-areas",
    label: "Delivery areas",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: DeliveryAreasPage,
    icon: "truck",
    group: "Online store",
  },
  {
    to: "/online-store/payment-accounts",
    label: "Payment accounts",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: PaymentAccountsPage,
    icon: "wallet",
    group: "Online store",
  },
  {
    to: "/online-store/gallery",
    label: "Gallery",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: GalleryPage,
    icon: "gallery",
    group: "Online store",
  },
  {
    to: "/online-store/testimonials",
    label: "Testimonials",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"],
    page: TestimonialsPage,
    icon: "reviews",
    group: "Online store",
  },
  {
    to: "/menu",
    label: "Menu",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: MenuPage,
    icon: "food",
    group: "Setup",
  },
  {
    to: "/categories",
    label: "Categories",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: CategoriesPage,
    icon: "categories",
    group: "Setup",
  },
  {
    to: "/kitchens",
    label: "Kitchens",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: KitchensPage,
    icon: "kitchens",
    group: "Setup",
  },
  {
    to: "/dining-areas",
    label: "Dining areas",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: DiningAreasPage,
    icon: "diningAreas",
    group: "Setup",
  },
  {
    to: "/tables/layout",
    label: "Table layout",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: TableLayoutPage,
    icon: "layout",
    group: "Setup",
  },
  {
    to: "/employees",
    label: "Employees",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: EmployeesPage,
    icon: "employees",
    group: "Team",
  },
  {
    to: "/inventory",
    label: "Inventory",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: InventoryPage,
    icon: "inventory",
    group: "Operations",
  },
  {
    to: "/reports",
    label: "Reports",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: ReportsPage,
    icon: "reports",
    group: "Insights",
  },
  {
    to: "/vendors",
    label: "Vendor Ledger",
    allowedRoles: ["SUPER_ADMIN", "POS_ADMIN"],
    page: VendorsPage,
    icon: "vendors",
    group: "Operations",
  },
  {
    to: "/staff",
    label: "Staff",
    allowedRoles: ["SUPER_ADMIN"],
    page: StaffPage,
    icon: "staff",
    group: "Team",
  },
];
