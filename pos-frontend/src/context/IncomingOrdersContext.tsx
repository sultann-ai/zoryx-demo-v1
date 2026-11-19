import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { connectSocket } from "../socket/client";
import { useChime } from "../hooks/useChime";
import { useIncomingOrders as useIncomingOrdersQuery } from "../hooks/useOrders";
import { useAuth } from "./AuthContext";
import { TableCallsProvider } from "./TableCallsContext";
import type { OrderDetail } from "../api/orders";

const MUTED_STORAGE_KEY = "zoryx:incoming-orders-muted";

// Stable reference so a non-reception role (or a not-yet-loaded query) doesn't create a
// new empty array every render, which would otherwise make the context value's own
// useMemo below think `incomingOrders` changed on every render.
const EMPTY_ORDERS: OrderDetail[] = [];

export type ConnectionStatus = "live" | "reconnecting";

export interface IncomingOrderToast {
  id: string;
  orderNumber: number;
  source: string;
  // Table QR rounds: who sent it.
  tableGuestName: string | null;
}

interface IncomingOrdersContextValue {
  // Empty/zero for any role other than POS_ADMIN/SUPER_ADMIN — the provider is still
  // mounted for everyone (AppLayout wraps every non-KITCHEN route), it just no-ops.
  incomingOrders: OrderDetail[];
  count: number;
  connectionStatus: ConnectionStatus;
  isMuted: boolean;
  toggleMute: () => void;
  toasts: IncomingOrderToast[];
  dismissToast: (id: string) => void;
}

const IncomingOrdersContext = createContext<IncomingOrdersContextValue | undefined>(undefined);

interface OrderSubmittedPayload {
  orderId: string;
  orderNumber: number;
  source: string;
  tableGuestName?: string | null;
}

interface OrderLifecyclePayload {
  orderId: string;
  orderNumber: number;
}

// Mounted once in AppLayout, so it's alive for every page POS_ADMIN/SUPER_ADMIN can
// reach — the one place "a badge, a toast and a chime must work on every page" is
// actually true. No-ops entirely for every other role.
export function IncomingOrdersProvider({ children }: { children: ReactNode }) {
  const { staff, token } = useAuth();
  const queryClient = useQueryClient();
  const isReception = staff?.role === "POS_ADMIN" || staff?.role === "SUPER_ADMIN";
  // An online admin reviews the online orders (the server scopes everything it sends them).
  const isOnlineAdmin = staff?.role === "ONLINE_ADMIN";
  const canReview = isReception || isOnlineAdmin;

  const { data } = useIncomingOrdersQuery();
  const incomingOrders = canReview ? data?.orders ?? EMPTY_ORDERS : EMPTY_ORDERS;
  const count = canReview ? data?.count ?? 0 : 0;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("reconnecting");
  const { chime, isMuted, toggleMute, needsUnlock: needsAudioUnlock, unlock: unlockAudio } = useChime(MUTED_STORAGE_KEY);
  const [toasts, setToasts] = useState<IncomingOrderToast[]>([]);
  // Shared with TableCallsProvider (waiter calls, the floor map), so this shell keeps one connection.
  const [socket, setSocket] = useState<Socket | null>(null);
  // The toast column; waiter-call toasts are rendered into it too, so the two kinds never overlap.
  const [toastRegion, setToastRegion] = useState<HTMLDivElement | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!canReview || !token) {
      return;
    }

    const socket: Socket = connectSocket(token);
    setSocket(socket);

    function refetchIncoming() {
      queryClient.invalidateQueries({ queryKey: ["orders", "incoming"] });
    }

    function refetchChanges() {
      queryClient.invalidateQueries({ queryKey: ["orders", "changes", "incoming"] });
    }

    function handleSubmitted(payload: OrderSubmittedPayload) {
      // The reception room carries every source's orders; an online admin only cares about online ones
      // (no chime or toast for an order-taker's order they can't act on).
      if (isOnlineAdmin && payload.source !== "ONLINE") {
        return;
      }
      refetchIncoming();
      // A released scheduled order leaves the Scheduled list at the same moment.
      queryClient.invalidateQueries({ queryKey: ["orders", "scheduled"] });
      chime();
      setToasts((prev) => [
        ...prev,
        { id: payload.orderId, orderNumber: payload.orderNumber, source: payload.source, tableGuestName: payload.tableGuestName ?? null },
      ]);
    }

    function handleLifecycleEvent(_payload: OrderLifecyclePayload) {
      refetchIncoming();
    }

    // Every (re)connect is a new server-side socket with no rooms, so the room is joined here each
    // time, not once — otherwise live updates would silently stop after the first reconnect.
    function handleConnect() {
      socket.emit("join", "pos-admin", (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          console.error("Failed to join pos-admin room:", result.error);
        }
      });
      setConnectionStatus("live");
      refetchIncoming();
    }
    function handleDisconnect() {
      setConnectionStatus("reconnecting");
    }
    function handleConnectError() {
      setConnectionStatus("reconnecting");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("order:submitted", handleSubmitted);
    socket.on("order:updated", handleLifecycleEvent);
    socket.on("order:accepted", handleLifecycleEvent);
    socket.on("order:rejected", handleLifecycleEvent);
    socket.on("order:change-requested", refetchChanges);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("order:submitted", handleSubmitted);
      socket.off("order:updated", handleLifecycleEvent);
      socket.off("order:accepted", handleLifecycleEvent);
      socket.off("order:rejected", handleLifecycleEvent);
      socket.off("order:change-requested", refetchChanges);
      socket.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview, token]);

  // Auto-dismiss toasts after ~6s.
  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const value = useMemo<IncomingOrdersContextValue>(
    () => ({ incomingOrders, count, connectionStatus, isMuted, toggleMute, toasts, dismissToast }),
    [incomingOrders, count, connectionStatus, isMuted, toggleMute, toasts, dismissToast],
  );

  return (
    <IncomingOrdersContext.Provider value={value}>
      <TableCallsProvider socket={socket} chime={chime} toastRegion={toastRegion}>
        {children}
      </TableCallsProvider>
      {needsAudioUnlock && (
        <button
          type="button"
          onClick={unlockAudio}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-card border border-border bg-surface-raised px-4 py-2 text-body font-medium text-ink shadow-md"
        >
          Tap to enable sound for incoming orders
        </button>
      )}
      <div ref={setToastRegion} className="fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <IncomingOrderToastCard key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
        ))}
      </div>
    </IncomingOrdersContext.Provider>
  );
}

function toastSourceLabel(toast: IncomingOrderToast): string {
  switch (toast.source) {
    case "ORDER_TAKER":
      return "order taker";
    case "POS":
      return "scheduled order released";
    case "TABLE_QR":
      return toast.tableGuestName ? `table QR · ${toast.tableGuestName}` : "table QR";
    default:
      return "online";
  }
}

function IncomingOrderToastCard({ toast, onDismiss }: { toast: IncomingOrderToast; onDismiss: () => void }) {
  return (
    <Link
      to="/incoming-orders"
      onClick={onDismiss}
      className="flex w-72 items-start justify-between gap-2 rounded-card border border-border bg-surface-raised px-4 py-3 text-body text-ink no-underline shadow-md"
    >
      <span>
        New order #{toast.orderNumber} waiting ({toastSourceLabel(toast)})
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
        // Preflight is off app-wide, so a bare <button> keeps the browser's grey box without this.
        className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-body text-body text-ink-muted hover:text-ink"
      >
        ×
      </button>
    </Link>
  );
}

export function useIncomingOrdersContext(): IncomingOrdersContextValue {
  const context = useContext(IncomingOrdersContext);
  if (!context) {
    throw new Error("useIncomingOrdersContext must be used within an IncomingOrdersProvider");
  }
  return context;
}
