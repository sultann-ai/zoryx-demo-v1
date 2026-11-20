import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Socket } from "socket.io-client";
import type { StaffTableCall, TableCallType } from "../api/tables";
import { cn } from "../components/ui/cn";
import { FLOOR_QUERY_KEY, TABLE_CALLS_QUERY_KEY, TABLE_SESSION_QUERY_KEY, useOpenTableCalls } from "../hooks/useTables";
import { CALL_TYPE_LABEL } from "../pages/tables/tableStates";
import { useAuth } from "./AuthContext";

// Table QR waiter calls and the floor map's live updates, for whoever works the floor (spec §8.2
// "TableCallsProvider"). It opens no socket of its own: AppLayout's IncomingOrdersProvider (SA/PA) and
// TakerShell's TakerOrdersProvider (OT) each pass the one they already have, so a shell never holds
// two connections.

// What the server sends when a table or its session may have changed (§6.2); the table-call:*
// events have their own handlers below.
// Table sync adds order:table-changed (an order or a whole party moved to another table).
const FLOOR_EVENTS = [
  "table:updated",
  "table-session:updated",
  "table-guest:joined",
  "table-session:pin-locked",
  "table-bill:updated",
  "order:table-changed",
];

// A burst of events (an order accepted moves several items at once) becomes one refetch.
const COALESCE_MS = 150;
// A new call's toast; an escalated one stays until it's dismissed or the call is answered.
const TOAST_MS = 8000;

interface CallRaisedPayload {
  callId: string;
  diningAreaId: string;
  tableName: string;
  area: string | null;
  type: TableCallType;
  note: string | null;
  guestName: string | null;
}

interface CallEscalatedPayload {
  callId: string;
  diningAreaId: string;
  tableName: string;
  type: TableCallType;
}

interface CallUpdatedPayload {
  callId: string;
}

interface CallToast {
  callId: string;
  diningAreaId: string;
  tableName: string;
  detail: string;
  type: TableCallType;
  escalated: boolean;
}

interface TableCallsContextValue {
  // Every open call (RAISED or ACKNOWLEDGED), oldest first. Empty for roles that don't work the floor.
  calls: StaffTableCall[];
  isLoading: boolean;
  // What the nav badge shows: calls nobody has answered yet — for an order taker, only those sent
  // to them or to everyone.
  badgeCount: number;
}

const TableCallsContext = createContext<TableCallsContextValue | undefined>(undefined);

const EMPTY_CALLS: StaffTableCall[] = [];

interface TableCallsProviderProps {
  socket: Socket | null;
  // The shell's own chime (and its mute setting / "tap to enable sound" banner).
  chime: () => void;
  // Order takers carry the phone: a buzz as well as the chime.
  vibrate?: boolean;
  // Where call toasts go (reception's toast column); null = no toasts (the order taker has a Calls tab).
  toastRegion?: HTMLElement | null;
  children: ReactNode;
}

export function TableCallsProvider({ socket, chime, vibrate = false, toastRegion = null, children }: TableCallsProviderProps) {
  const { staff } = useAuth();
  const queryClient = useQueryClient();
  const role = staff?.role;
  const isEnabled = role === "SUPER_ADMIN" || role === "POS_ADMIN" || role === "ORDER_TAKER";
  const { data, isPending } = useOpenTableCalls(isEnabled);
  const calls = isEnabled ? (data ?? EMPTY_CALLS) : EMPTY_CALLS;
  const [toasts, setToasts] = useState<CallToast[]>([]);

  // The handlers below live as long as the connection; they read the latest chime through a ref.
  const chimeRef = useRef(chime);
  useEffect(() => {
    chimeRef.current = chime;
  }, [chime]);

  const dismissToast = useCallback((callId: string) => {
    setToasts((prev) => prev.filter((toast) => toast.callId !== callId));
  }, []);

  useEffect(() => {
    if (!socket || !isEnabled) {
      return;
    }
    const showToasts = toastRegion !== null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Events only invalidate — never patch — and every (re)connect refetches the same way, so a
    // dropped connection can't leave a stale map or list. Old data stays on screen meanwhile.
    function refetch() {
      if (timer !== null) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: TABLE_SESSION_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: TABLE_CALLS_QUERY_KEY });
        // Order pages show their table and the table's bill, which these same events change.
        queryClient.invalidateQueries({ queryKey: ["orders", "detail"] });
      }, COALESCE_MS);
    }

    function alert() {
      chimeRef.current();
      if (vibrate && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }

    function addToast(toast: CallToast) {
      // One toast per call: an escalation replaces the call's earlier "needs a waiter" toast.
      setToasts((prev) => [...prev.filter((existing) => existing.callId !== toast.callId), toast]);
    }

    function handleRaised(payload: CallRaisedPayload) {
      refetch();
      alert();
      if (showToasts) {
        const detail = [payload.area, payload.guestName, payload.note].filter(Boolean).join(" · ");
        addToast({ ...payload, detail, escalated: false });
      }
    }

    function handleEscalated(payload: CallEscalatedPayload) {
      refetch();
      alert();
      if (showToasts) {
        addToast({ ...payload, detail: "No one has answered for 2 minutes", escalated: true });
      }
    }

    function handleCallUpdated(payload: CallUpdatedPayload) {
      refetch();
      // Answered (or withdrawn) — its toast has done its job.
      setToasts((prev) => prev.filter((toast) => toast.callId !== payload.callId));
    }

    socket.on("connect", refetch);
    socket.on("table-call:raised", handleRaised);
    socket.on("table-call:escalated", handleEscalated);
    socket.on("table-call:updated", handleCallUpdated);
    for (const event of FLOOR_EVENTS) {
      socket.on(event, refetch);
    }
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      socket.off("connect", refetch);
      socket.off("table-call:raised", handleRaised);
      socket.off("table-call:escalated", handleEscalated);
      socket.off("table-call:updated", handleCallUpdated);
      for (const event of FLOOR_EVENTS) {
        socket.off(event, refetch);
      }
    };
  }, [socket, isEnabled, vibrate, toastRegion, queryClient]);

  // Auto-dismiss the oldest ordinary toast; escalated ones wait for a person.
  useEffect(() => {
    const oldest = toasts.find((toast) => !toast.escalated);
    if (!oldest) {
      return;
    }
    const timer = setTimeout(() => dismissToast(oldest.callId), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  const badgeCount = useMemo(
    () =>
      calls.filter(
        (call) =>
          call.status === "RAISED" &&
          (role !== "ORDER_TAKER" || call.routedTo === null || call.routedTo.id === staff?.id),
      ).length,
    [calls, role, staff?.id],
  );

  const value = useMemo<TableCallsContextValue>(
    () => ({ calls, isLoading: isEnabled && isPending, badgeCount }),
    [calls, isEnabled, isPending, badgeCount],
  );

  return (
    <TableCallsContext.Provider value={value}>
      {children}
      {toastRegion &&
        toasts.length > 0 &&
        createPortal(
          toasts.map((toast) => <CallToastCard key={toast.callId} toast={toast} onDismiss={() => dismissToast(toast.callId)} />),
          toastRegion,
        )}
    </TableCallsContext.Provider>
  );
}

// Same card as IncomingOrdersContext's toast; an escalated call gets the danger edge and wording.
function CallToastCard({ toast, onDismiss }: { toast: CallToast; onDismiss: () => void }) {
  return (
    <Link
      to={`/tables?table=${toast.diningAreaId}`}
      onClick={onDismiss}
      role={toast.escalated ? "alert" : "status"}
      className={cn(
        "flex w-72 items-start justify-between gap-2 rounded-card border bg-surface-raised px-4 py-3 text-body text-ink no-underline shadow-md",
        toast.escalated ? "border-status-danger border-l-4" : "border-border",
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn(toast.escalated && "font-semibold text-status-danger-text")}>
          {toast.escalated ? `${toast.tableName} still waiting` : `${toast.tableName} needs a waiter`} — {CALL_TYPE_LABEL[toast.type]}
        </span>
        {toast.detail && <span className="truncate text-meta text-ink-muted">{toast.detail}</span>}
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

export function useTableCallsContext(): TableCallsContextValue {
  const context = useContext(TableCallsContext);
  if (!context) {
    throw new Error("useTableCallsContext must be used within a TableCallsProvider");
  }
  return context;
}
