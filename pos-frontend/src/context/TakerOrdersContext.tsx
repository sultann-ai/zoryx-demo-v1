import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { connectSocket } from "../socket/client";
import { useChime } from "../hooks/useChime";
import { useAuth } from "./AuthContext";

const MUTED_STORAGE_KEY = "zoryx:take-order-muted";

export type TakerConnectionStatus = "live" | "reconnecting" | "offline";

interface TakerOrdersContextValue {
  connectionStatus: TakerConnectionStatus;
  isMuted: boolean;
  toggleMute: () => void;
}

const TakerOrdersContext = createContext<TakerOrdersContextValue | undefined>(undefined);

interface OrderLifecyclePayload {
  orderId: string;
}

// Mounted once in TakerShell, alive for both /take-order and /my-orders. Owns the one
// socket connection for this role — no "join" emit: the server auto-joins an
// ORDER_TAKER socket to user:<staffId> unconditionally on connect (see the backend's
// socket.ts), so there's nothing to request here, just events to listen for.
export function TakerOrdersProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<TakerConnectionStatus>(
    navigator.onLine ? "reconnecting" : "offline",
  );
  const { chime, isMuted, toggleMute, needsUnlock, unlock } = useChime(MUTED_STORAGE_KEY);

  useEffect(() => {
    function handleOnline() {
      setConnectionStatus((prev) => (prev === "offline" ? "reconnecting" : prev));
    }
    function handleOffline() {
      setConnectionStatus("offline");
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const socket: Socket = connectSocket(token);

    function refetchMine() {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
    }

    function handleLifecycleEvent(payload: OrderLifecyclePayload) {
      refetchMine();
      queryClient.invalidateQueries({ queryKey: ["orders", "detail", payload.orderId] });
      chime();
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    }

    function handleConnect() {
      setConnectionStatus(navigator.onLine ? "live" : "offline");
      refetchMine();
    }
    function handleDisconnect() {
      setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    }
    function handleConnectError() {
      setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("order:accepted", handleLifecycleEvent);
    socket.on("order:rejected", handleLifecycleEvent);
    socket.on("order:status", handleLifecycleEvent);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("order:accepted", handleLifecycleEvent);
      socket.off("order:rejected", handleLifecycleEvent);
      socket.off("order:status", handleLifecycleEvent);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <TakerOrdersContext.Provider value={{ connectionStatus, isMuted, toggleMute }}>
      {children}
      {needsUnlock && (
        <button
          type="button"
          onClick={unlock}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-card border border-border bg-surface-raised px-4 py-2 text-body font-medium text-ink shadow-md"
        >
          Tap to enable sound
        </button>
      )}
    </TakerOrdersContext.Provider>
  );
}

export function useTakerOrdersContext(): TakerOrdersContextValue {
  const context = useContext(TakerOrdersContext);
  if (!context) {
    throw new Error("useTakerOrdersContext must be used within a TakerOrdersProvider");
  }
  return context;
}
