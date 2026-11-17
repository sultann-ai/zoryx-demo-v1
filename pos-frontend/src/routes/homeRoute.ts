import type { StaffRole } from "../auth/session";
import { NAV_ITEMS } from "./navItems";

// Shared by Login (post-login redirect) and RootRedirect ("/") so a role's
// landing page is defined in exactly one place.
//
// Picks the role's first accessible entry in NAV_ITEMS rather than hardcoding
// "/dashboard" — a role without Dashboard access would otherwise be sent somewhere
// ProtectedRoute immediately bounces it from, looping between "/" and that route forever.
export function getHomeRoute(role: StaffRole): string {
  if (role === "KITCHEN") {
    return "/kitchen-display";
  }
  // The online admin's job is the customer website, so that's where they land (Incoming Orders is
  // one tap away in the same nav).
  if (role === "ONLINE_ADMIN") {
    return "/online-store/menu";
  }
  if (role === "ORDER_TAKER") {
    return "/take-order";
  }
  const firstAccessible = NAV_ITEMS.find((item) => item.allowedRoles.includes(role));
  return firstAccessible?.to ?? "/login";
}
