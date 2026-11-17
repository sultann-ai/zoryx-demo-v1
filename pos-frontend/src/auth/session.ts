// Shared by AuthContext (React state) and the axios client (plain module, no
// React tree access), so both read/write the exact same localStorage record.

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

const STORAGE_KEY = "zoryx:staff-session";

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return getStoredSession()?.token ?? null;
}

export function setStoredSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// The one "session is over" path, for an HTTP 401 on a request that carried a token (the axios
// interceptor) and for a socket the server refused or revoked for auth reasons (socket/client.ts):
// clear the stored session, tell AuthContext, and go to /login.
export function forceLogout(): void {
  clearStoredSession();
  window.dispatchEvent(new Event("auth:logout"));
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
