import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { getApiErrorMessage } from "../api/errors";
import type {
  KitchenQueueItem,
  NewOrderItemsSocketPayload,
  NoteUpdatedOrderItemsSocketPayload,
  OrderItemsGoneSocketPayload,
  UpdatedOrderItemSocketPayload,
} from "../api/kitchenQueue";
import { kitchenQueueApi } from "../api/kitchenQueue";
import type { OrderItemStatus } from "../api/orders";
import { useAuth } from "../context/AuthContext";
import { useKitchenQueue } from "../hooks/useKitchenQueue";
import { useKitchens } from "../hooks/useKitchens";
import { itemNoteLines } from "../lib/lineNotes";
import { connectSocket } from "../socket/client";
import { Button, StatusBadge, accentBgClassForStatus } from "../components/ui";

const NEXT_STATUS: Record<OrderItemStatus, OrderItemStatus | null> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: null,
};

const ACTION_LABEL: Record<OrderItemStatus, string | null> = {
  PENDING: "Start Preparing",
  PREPARING: "Mark Ready",
  READY: "Mark Served",
  SERVED: null,
};

// Returns the same set when the id isn't in it, so clearing a flag that isn't set doesn't
// re-render.
function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) {
    return ids;
  }
  const next = new Set(ids);
  next.delete(id);
  return next;
}

export function KitchenDisplayPage() {
  const { staff, token, logout } = useAuth();
  // Never let the user pick a kitchen — this account's own token.kitchenId is the
  // only queue it's allowed to see (the backend enforces this too, 403ing a KITCHEN
  // request for any other kitchenId).
  const kitchenId = staff?.kitchenId ?? null;

  const queryClient = useQueryClient();
  const { data: queueItems, isLoading, isError } = useKitchenQueue(kitchenId);
  // The login record only carries kitchenId, not the name. The list endpoint is
  // open to any signed-in staff, so look this account's own kitchen up in it.
  const { data: kitchens } = useKitchens();
  const kitchenName = kitchens?.find((kitchen) => kitchen.id === kitchenId)?.name;
  const [items, setItems] = useState<KitchenQueueItem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  // "reconnecting" while the socket is down; it reconnects by itself and the queue is refetched then.
  const [connection, setConnection] = useState<"live" | "reconnecting">("live");
  // Items whose note changed after they reached this screen — flagged until the kitchen next
  // advances them, so a changed instruction can't slip by as just another card.
  const [noteUpdatedIds, setNoteUpdatedIds] = useState<ReadonlySet<string>>(new Set());

  // The server's queue replaces what's on screen every time it's fetched: the first load, and again
  // after every socket reconnect (anything that happened while the socket was down is in it). Live
  // events then patch it until the next fetch.
  useEffect(() => {
    if (!queueItems) {
      return;
    }
    setItems(queueItems);
    const present = new Set(queueItems.map((row) => row.id));
    setNoteUpdatedIds((prev) => new Set([...prev].filter((id) => present.has(id))));
  }, [queueItems]);

  useEffect(() => {
    if (!kitchenId || !token) {
      return;
    }

    const socket: Socket = connectSocket(token);
    const room = `kitchen:${kitchenId}`;
    let hasConnectedBefore = false;

    // Every (re)connect is a new server-side socket with no rooms: join again each time, and after a
    // reconnect refetch the queue so nothing missed while offline stays missing (or stays on screen).
    // An auth refusal logs out (socket/client.ts); anything else just keeps retrying by itself.
    function handleConnect() {
      socket.emit("join", room, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          setActionError(result.error ?? "Failed to join the live kitchen queue.");
        }
      });
      setConnection("live");
      if (hasConnectedBefore) {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-queue", kitchenId] });
      }
      hasConnectedBefore = true;
    }
    function handleConnectionLost() {
      setConnection("reconnecting");
    }
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleConnectionLost);
    socket.on("connect_error", handleConnectionLost);

    function toRows(payload: NewOrderItemsSocketPayload): KitchenQueueItem[] {
      return payload.items.map((item) => ({
        ...item,
        order: { orderNumber: payload.orderNumber, diningArea: payload.diningArea },
      }));
    }

    function handleNewItems(payload: NewOrderItemsSocketPayload) {
      const newRows = toRows(payload);
      setItems((prev) => {
        const existingIds = new Set(prev.map((row) => row.id));
        const uniqueNewRows = newRows.filter((row) => !existingIds.has(row.id));
        return [...uniqueNewRows, ...prev];
      });
    }

    // Same treatment as a new item — to the top of the queue — but replacing the card if
    // it's already here (it carries the latest notes), and flagged "Note updated".
    function handleNoteUpdated(payload: NoteUpdatedOrderItemsSocketPayload) {
      const updatedRows = toRows(payload);
      const updatedIds = new Set(updatedRows.map((row) => row.id));
      setItems((prev) => [...updatedRows, ...prev.filter((row) => !updatedIds.has(row.id))]);
      setNoteUpdatedIds((prev) => new Set([...prev, ...updatedIds]));
    }

    function handleUpdatedItem(payload: UpdatedOrderItemSocketPayload) {
      if (payload.kitchenId !== kitchenId) {
        return;
      }
      setItems((prev) => prev.map((row) => (row.id === payload.id ? { ...row, status: payload.status } : row)));
      setNoteUpdatedIds((prev) => withoutId(prev, payload.id));
    }

    // The order was cancelled or completed, or an item was taken off it: those cards leave the screen.
    function handleItemsGone(payload: OrderItemsGoneSocketPayload) {
      const goneIds = new Set(payload.itemIds);
      setItems((prev) => prev.filter((row) => !goneIds.has(row.id)));
      setNoteUpdatedIds((prev) => new Set([...prev].filter((id) => !goneIds.has(id))));
    }

    socket.on("order-item:new", handleNewItems);
    socket.on("order-item:note-updated", handleNoteUpdated);
    socket.on("order-item:updated", handleUpdatedItem);
    socket.on("order:cancelled", handleItemsGone);
    socket.on("order:completed", handleItemsGone);
    socket.on("order-item:removed", handleItemsGone);

    return () => {
      socket.off("order-item:new", handleNewItems);
      socket.off("order-item:note-updated", handleNoteUpdated);
      socket.off("order-item:updated", handleUpdatedItem);
      socket.off("order:cancelled", handleItemsGone);
      socket.off("order:completed", handleItemsGone);
      socket.off("order-item:removed", handleItemsGone);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleConnectionLost);
      socket.off("connect_error", handleConnectionLost);
      socket.disconnect();
    };
  }, [kitchenId, token, queryClient]);

  async function handleAdvance(item: KitchenQueueItem) {
    const nextStatus = NEXT_STATUS[item.status];
    if (!nextStatus) {
      return;
    }
    setActionError(null);
    try {
      const updated = await kitchenQueueApi.updateItemStatus(item.orderId, item.id, nextStatus);
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, status: updated.status } : row)));
      setNoteUpdatedIds((prev) => withoutId(prev, item.id));
    } catch (error) {
      setActionError(getApiErrorMessage(error, "Failed to update item status"));
    }
  }

  if (!kitchenId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-6 text-center">
        <p className="text-title font-semibold text-white">This account is not assigned to a kitchen.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-8 sm:py-5">
        <h1 className="font-heading text-title font-semibold text-white">{kitchenName ?? "Kitchen"}</h1>
        <Button variant="inverse" onClick={logout}>
          Log out
        </Button>
      </header>

      {/* A system-level alert, not a routine per-item status — unlike the
          quiet dot+label pills below, this is meant to be impossible to miss. */}
      {connection === "reconnecting" && (
        <div role="status" className="bg-status-warning px-4 py-3 text-section font-semibold text-ink sm:px-8 sm:py-4">
          Connection lost — reconnecting… The queue refreshes by itself when it's back.
        </div>
      )}
      {actionError && (
        <div role="alert" className="bg-status-danger px-4 py-3 text-section font-semibold text-white sm:px-8 sm:py-4">
          {actionError}
        </div>
      )}

      <div className="flex flex-1 flex-col p-4 sm:p-8">
        {isLoading && <p className="text-title text-white/70">Loading queue…</p>}
        {isError && (
          <p role="alert" className="text-title font-semibold text-status-danger-text">
            Could not load the kitchen queue.
          </p>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-white/20 px-6 py-16 text-center sm:px-10 sm:py-24">
            <p className="text-title font-semibold text-white sm:text-display">Queue is empty</p>
            <p className="text-section text-white/60 sm:text-title">New items will appear here as soon as they're ordered.</p>
          </div>
        )}

        {items.length > 0 && (
          // Single full-width card per row on a phone (a 360px grid track
          // wouldn't even fit a 375px screen); the exact original multi-column,
          // wall-screen-friendly grid unchanged from sm up.
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(360px,1fr))] sm:gap-6">
            {items.map((item) => {
              const actionLabel = ACTION_LABEL[item.status];
              const notes = itemNoteLines(item);
              const isNoteUpdated = noteUpdatedIds.has(item.id);
              return (
                <div key={item.id} className="flex overflow-hidden rounded-card border border-border bg-surface-raised">
                  <div className={`w-3 shrink-0 ${accentBgClassForStatus(item.status)}`} aria-hidden="true" />
                  <div className="flex flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-card-head font-semibold text-ink sm:text-title">
                        Order #{item.order.orderNumber}
                        {item.order.diningArea ? ` — ${item.order.diningArea.name}` : ""}
                      </span>
                      <StatusBadge status={item.status} size="lg" />
                    </div>
                    {/* The star of this screen, even scaled down for a phone
                        held close — text-title is already the single biggest
                        size used anywhere in the admin screens, so this is a
                        floor, not a shrink to their level. */}
                    <div className="text-title font-bold leading-tight text-ink sm:text-display">
                      {item.menuItem.name}
                      {item.variantLabel && <span className="text-ink-muted"> ({item.variantLabel})</span>}{" "}
                      <span className="text-ink-muted">× {item.quantity}</span>
                    </div>
                    {item.addOns && item.addOns.length > 0 && (
                      <p className="text-section font-semibold text-ink-muted">
                        {item.addOns.map((addOn) => `+ ${addOn.name}`).join(", ")}
                      </p>
                    )}
                    {item.dealOrderLine && (
                      <p className="text-section font-semibold text-ink-muted">
                        Part of {item.dealOrderLine.dealName}
                        {item.dealOrderLine.customization && " - customized"}
                      </p>
                    )}
                    {isNoteUpdated && (
                      <p role="status" className="self-start rounded-card bg-status-danger px-3 py-1 text-section font-semibold text-white">
                        Note updated
                      </p>
                    )}
                    {notes.map((note) => (
                      <p key={note} className="break-words rounded-card bg-status-warning-bg px-4 py-3 text-section text-ink">
                        Note: {note}
                      </p>
                    ))}
                    {isNoteUpdated && notes.length === 0 && (
                      <p className="rounded-card bg-status-warning-bg px-4 py-3 text-section text-ink">Note removed</p>
                    )}
                    {actionLabel && (
                      <Button size="lg" className="w-full" onClick={() => handleAdvance(item)}>
                        {actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
