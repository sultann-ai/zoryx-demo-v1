// Shared by AuthContext (React state) and the axios client (plain module, no
// React tree access), so both read/write the exact same localStorage record.
//
// One session per role group, not one for the whole browser, so a single Chrome window can run the
// owner's screens, a waiter's phone view and a kitchen screen side by side, each in its own tab:
//   admin   — SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN
//   taker   — ORDER_TAKER
//   kitchen — KITCHEN
// Each tab works in ONE slot, picked once when the page loads (from the URL, see slotForUrl). Login
// writes the slot of the role that logged in and switches this tab to it; logout and a 401 clear only
// this tab's slot; the axios client and this tab's sockets use this tab's slot's token.

export type StaffRole = "SUPER_ADMIN" | "POS_ADMIN" | "ONLINE_ADMIN" | "KITCHEN" | "ORDER_TAKER";

export const STAFF_ROLES: StaffRole[] = ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN", "KITCHEN", "ORDER_TAKER"];

export interface AuthStaff {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  kitchenId: string | null;
}

export interface AuthSession {
  staff: AuthStaff;
  token: string;
}

export type SessionSlot = "admin" | "taker" | "kitchen";

const SESSION_SLOTS: SessionSlot[] = ["admin", "taker", "kitchen"];
const KEY_PREFIX = "zoryx:staff-session:";
// The single shared key used before slots existed — moved into its role's slot on first load.
const LEGACY_KEY = "zoryx:staff-session";

export function storageKeyForSlot(slot: SessionSlot): string {
  return `${KEY_PREFIX}${slot}`;
}

export function slotForRole(role: StaffRole): SessionSlot {
  if (role === "KITCHEN") {
    return "kitchen";
  }
  if (role === "ORDER_TAKER") {
    return "taker";
  }
  return "admin";
}

function isSessionSlot(value: string | null): value is SessionSlot {
  return value !== null && (SESSION_SLOTS as string[]).includes(value);
}

function readSlot(slot: SessionSlot): AuthSession | null {
  try {
    const raw = localStorage.getItem(storageKeyForSlot(slot));
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

// /kitchen-display → kitchen (or admin, when no kitchen session exists: an owner opening the kitchen
// screen from the sidebar), /take-order and /my-orders → taker, anything else → admin. /login?slot=…
// keeps the slot a tab was in across the full reload a forced logout does, and is how the admin's
// Kitchen Display offers "Kitchen staff login" in the same tab.
export function slotForUrl(pathname: string, search: string): SessionSlot {
  if (pathname.startsWith("/kitchen-display")) {
    return readSlot("kitchen") ? "kitchen" : "admin";
  }
  if (pathname.startsWith("/take-order") || pathname.startsWith("/my-orders") || pathname.startsWith("/taker-tables") || pathname.startsWith("/taker-calls")) {
    return "taker";
  }
  if (pathname.startsWith("/login")) {
    const requested = new URLSearchParams(search).get("slot");
    if (isSessionSlot(requested)) {
      return requested;
    }
  }
  return "admin";
}

function migrateLegacySession(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      return;
    }
    const session = JSON.parse(raw) as AuthSession;
    const key = storageKeyForSlot(slotForRole(session.staff.role));
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, raw);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Unreadable or blocked storage: nothing to carry over.
  }
}

migrateLegacySession();

// Module state is per tab (each tab loads its own copy), which is exactly what a tab's slot is.
let activeSlot: SessionSlot = slotForUrl(window.location.pathname, window.location.search);

export function getActiveSlot(): SessionSlot {
  return activeSlot;
}

export function getStoredSession(): AuthSession | null {
  return readSlot(activeSlot);
}

export function getStoredToken(): string | null {
  return getStoredSession()?.token ?? null;
}

// Login: the session goes into its role's slot, and this tab switches to that slot.
export function setStoredSession(session: AuthSession): void {
  activeSlot = slotForRole(session.staff.role);
  try {
    localStorage.setItem(storageKeyForSlot(activeSlot), JSON.stringify(session));
  } catch {
    // Storage blocked: the session still lives in React state for this tab.
  }
}

// Logout (or a 401): this tab's slot only — other roles signed in elsewhere in the browser stay.
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(storageKeyForSlot(activeSlot));
  } catch {
    // Nothing stored to clear.
  }
}

// The one "session is over" path, for an HTTP 401 on a request that carried a token (the axios
// interceptor) and for a socket the server refused or revoked for auth reasons (socket/client.ts):
// clear this tab's slot, tell AuthContext, and go to /login (in the same slot).
export function forceLogout(): void {
  clearStoredSession();
  window.dispatchEvent(new Event("auth:logout"));
  if (window.location.pathname !== "/login") {
    window.location.assign(`/login?slot=${activeSlot}`);
  }
}
