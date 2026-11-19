import { matchPath } from "react-router-dom";
import type { StaffRole } from "../auth/session";
import { NAV_ITEMS, NEW_TAB_NAV_ITEMS } from "./navItems";

// Navigation model for the mobile shell (below 768px): a bottom tab bar with
// the few destinations used all day, a "More" menu with the rest, and
// "pushed" full-screen views for list -> detail. The desktop sidebar keeps
// using NAV_ITEMS directly and doesn't read any of this.

export type ShellIconName = "dashboard" | "orders" | "newOrder" | "inventory" | "tables" | "list";

export interface ShellDestination {
  to: string;
  label: string;
  // Opens in a new browser tab (the Kitchen Display), never as a tab-bar entry.
  newTab?: boolean;
}

export interface ShellTab extends ShellDestination {
  icon: ShellIconName;
}

// Most-used first. Dashboard and Orders are checked constantly; Tables (the live floor map) sits
// right after Dashboard, per the Table QR spec, since it's watched all service; "New order" is the
// action a cashier repeats all shift, so it gets its own tab rather than hiding behind Orders.
// Inventory moved to More to make room — stock is checked a few times a shift, the floor constantly.
const PREFERRED_TAB_ORDER = ["/dashboard", "/tables", "/orders", "/orders/new"];
const MAX_TABS = 4;

const TAB_ICONS: Record<string, ShellIconName> = {
  "/dashboard": "dashboard",
  "/orders": "orders",
  "/orders/new": "newOrder",
  "/inventory": "inventory",
  "/tables": "tables",
};

export function getShellNav(role: StaffRole): { tabs: ShellTab[]; more: ShellDestination[] } {
  const accessible: ShellDestination[] = NAV_ITEMS.filter((item) => item.allowedRoles.includes(role)).map(
    ({ to, label }) => ({ to, label }),
  );
  // "New order" isn't a NAV_ITEMS entry (only "Orders" is) but shares its role
  // restriction — see ORDERS_STAFF_ROLES in App.tsx.
  if (accessible.some((destination) => destination.to === "/orders")) {
    accessible.push({ to: "/orders/new", label: "New order" });
  }

  const byPath = new Map(accessible.map((destination) => [destination.to, destination]));
  let tabDestinations = PREFERRED_TAB_ORDER.flatMap((path) => byPath.get(path) ?? []);
  // A role with none of the preferred destinations (ONLINE_ADMIN today) still
  // gets tabs — just its first few accessible ones.
  if (tabDestinations.length === 0) {
    tabDestinations = accessible.slice(0, MAX_TABS);
  }

  const tabPaths = new Set(tabDestinations.map((destination) => destination.to));
  const newTab: ShellDestination[] = NEW_TAB_NAV_ITEMS.filter((item) => item.allowedRoles.includes(role)).map(
    ({ to, label }) => ({ to, label, newTab: true }),
  );
  return {
    tabs: tabDestinations.map((destination) => ({ ...destination, icon: TAB_ICONS[destination.to] ?? "list" })),
    more: [...accessible.filter((destination) => !tabPaths.has(destination.to)), ...newTab],
  };
}

export interface PushedRoute {
  path: string;
  // Exact pathnames that match `path` but are a different screen (e.g. "new"
  // matching the ":id" pattern).
  exclude?: string[];
  // Shown in the app bar beside the back arrow.
  title: string;
  // Where back goes when there's no in-app history to pop (deep link, refresh).
  fallback: string;
}

// Routes shown as a full-screen "pushed" view on mobile: the tab bar goes away
// and the app bar gets a back arrow. On desktop they render exactly as before.
// Any new detail route (an employee detail, say) gets registered here — that
// one line is all the shell needs.
export const PUSHED_ROUTES: PushedRoute[] = [
  { path: "/orders/new", title: "New order", fallback: "/orders" },
  { path: "/orders/:id", exclude: ["/orders/new"], title: "Order", fallback: "/orders" },
  { path: "/vendors/:id", title: "Vendor", fallback: "/vendors" },
  { path: "/scheduled/:id/edit", title: "Edit scheduled order", fallback: "/scheduled" },
];

export function getPushedRoute(pathname: string): PushedRoute | null {
  return (
    PUSHED_ROUTES.find(
      (route) => !route.exclude?.includes(pathname) && matchPath({ path: route.path, end: true }, pathname),
    ) ?? null
  );
}
