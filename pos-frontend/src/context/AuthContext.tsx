import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  clearStoredSession,
  getActiveSlot,
  getStoredSession,
  setStoredSession,
  storageKeyForSlot,
} from "../auth/session";
import type { AuthSession, AuthStaff } from "../auth/session";

interface AuthContextValue {
  staff: AuthStaff | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());

  // The axios response interceptor can't reach into React state directly (it lives
  // outside the component tree), so it clears storage and fires this event instead —
  // this keeps the in-memory session in sync when a 401 forces a logout elsewhere.
  useEffect(() => {
    function handleForcedLogout() {
      setSession(null);
    }
    window.addEventListener("auth:logout", handleForcedLogout);
    return () => window.removeEventListener("auth:logout", handleForcedLogout);
  }, []);

  // Another tab in the same slot logged in, out, or was logged out by a 401: follow it, so two tabs
  // of the same role never disagree about who is signed in. Other slots' changes are ignored.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === null || event.key === storageKeyForSlot(getActiveSlot())) {
        setSession(getStoredSession());
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  function login(nextSession: AuthSession) {
    setStoredSession(nextSession);
    setSession(nextSession);
  }

  function logout() {
    clearStoredSession();
    setSession(null);
  }

  const value: AuthContextValue = {
    staff: session?.staff ?? null,
    token: session?.token ?? null,
    isAuthenticated: session !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
