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
