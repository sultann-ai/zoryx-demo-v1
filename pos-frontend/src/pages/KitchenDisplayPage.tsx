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
import { ALL_KITCHENS, kitchenQueueApi } from "../api/kitchenQueue";
import type { OrderItemStatus } from "../api/orders";
import { useAuth } from "../context/AuthContext";
import { useKitchenQueue } from "../hooks/useKitchenQueue";
import { useKitchens } from "../hooks/useKitchens";
import { itemNoteLines } from "../lib/lineNotes";
import { connectSocket } from "../socket/client";
import { Button, Select, StatusBadge, accentBgClassForStatus } from "../components/ui";

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

// The admin's last pick, per browser (a convenience only — "All kitchens" when there's none).
const PICKED_KITCHEN_KEY = "zoryx:kds-kitchen";

function readPickedKitchen(): string {
  try {
    return localStorage.getItem(PICKED_KITCHEN_KEY) ?? ALL_KITCHENS;
  } catch {
    return ALL_KITCHENS;
  }
}

function savePickedKitchen(value: string): void {
  try {
    localStorage.setItem(PICKED_KITCHEN_KEY, value);
  } catch {
    // Not remembered: the screen still works.
  }
}

export function KitchenDisplayPage() {
  const { staff, token, logout } = useAuth();
  // A KITCHEN account never picks: its own token.kitchenId is the only queue it may see (the backend
  // 403s any other). SUPER_ADMIN/POS_ADMIN pick one kitchen or "All kitchens".
  const isKitchenAccount = staff?.role === "KITCHEN";
  const [storedPick, setPickedKitchen] = useState(readPickedKitchen);
  // The login record only carries kitchenId, not the name. The list endpoint is
  // open to any signed-in staff, so look this account's own kitchen up in it.
  const { data: kitchens } = useKitchens();
  const activeKitchens = (kitchens ?? []).filter((kitchen) => kitchen.isActive);
  // A remembered kitchen that has since been deactivated or deleted falls back to "All kitchens".
  const pickedKitchen =
    storedPick === ALL_KITCHENS || !kitchens || activeKitchens.some((kitchen) => kitchen.id === storedPick)
      ? storedPick
      : ALL_KITCHENS;
  const kitchenId = isKitchenAccount ? (staff?.kitchenId ?? null) : pickedKitchen;
  const isAllKitchens = kitchenId === ALL_KITCHENS;

  const queryClient = useQueryClient();
  const { data: queueItems, isLoading, isError } = useKitchenQueue(kitchenId);
  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));
  const kitchenName = isAllKitchens ? "All kitchens" : kitchenId ? kitchenNameById.get(kitchenId) : undefined;
  // The socket rooms this screen listens to: its kitchen, or every active kitchen for "All kitchens".
  const rooms = isAllKitchens ? activeKitchens.map((kitchen) => `kitchen:${kitchen.id}`) : kitchenId ? [`kitchen:${kitchenId}`] : [];
  const roomsKey = rooms.join(",");
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
  // (Adjusted while rendering, when the fetched queue changes — React's pattern for state that follows
  // an input, rather than an effect that renders twice.)
  const [appliedQueue, setAppliedQueue] = useState<KitchenQueueItem[] | undefined>(undefined);
  if (queueItems !== appliedQueue) {
    setAppliedQueue(queueItems);
    if (queueItems) {
      setItems(queueItems);
      const present = new Set(queueItems.map((row) => row.id));
      setNoteUpdatedIds((prev) => new Set([...prev].filter((id) => present.has(id))));
    }
  }

  useEffect(() => {
    if (!kitchenId || !token || roomsKey === "") {
      return;
    }

    const socket: Socket = connectSocket(token);
    const joinRooms = roomsKey.split(",");
    let hasConnectedBefore = false;

    // Every (re)connect is a new server-side socket with no rooms: join again each time, and after a
    // reconnect refetch the queue so nothing missed while offline stays missing (or stays on screen).
    // An auth refusal logs out (socket/client.ts); anything else just keeps retrying by itself.
    function handleConnect() {
      for (const room of joinRooms) {
        socket.emit("join", room, (result: { ok: boolean; error?: string }) => {
          if (!result.ok) {
            setActionError(result.error ?? "Failed to join the live kitchen queue.");
          }
        });
      }
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
      if (kitchenId !== ALL_KITCHENS && payload.kitchenId !== kitchenId) {
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

    // Table sync R7: an order (or its whole party) moved to another table — the cards say the new table.
    function handleTableChanged(payload: { orderId: string; diningArea: { id: string; name: string; area: string | null } }) {
      setItems((prev) =>
        prev.map((row) =>
          row.orderId === payload.orderId
            ? { ...row, order: { ...row.order, diningArea: { ...(row.order.diningArea ?? {}), ...payload.diningArea } as typeof row.order.diningArea } }
            : row,
        ),
      );
    }

    socket.on("order-item:new", handleNewItems);
    socket.on("order:table-changed", handleTableChanged);
    socket.on("order-item:note-updated", handleNoteUpdated);
    socket.on("order-item:updated", handleUpdatedItem);
    socket.on("order:cancelled", handleItemsGone);
    socket.on("order:completed", handleItemsGone);
    socket.on("order-item:removed", handleItemsGone);

    return () => {
      socket.off("order-item:new", handleNewItems);
      socket.off("order:table-changed", handleTableChanged);
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
  }, [kitchenId, token, roomsKey, queryClient]);

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

  function handlePickKitchen(value: string) {
    setPickedKitchen(value);
    savePickedKitchen(value);
    setItems([]);
    setNoteUpdatedIds(new Set());
    setActionError(null);
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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-8 sm:py-5">
        <h1 className="font-heading text-title font-semibold text-white">{kitchenName ?? "Kitchen"}</h1>
        {isKitchenAccount ? (
          <Button variant="inverse" onClick={logout}>
            Log out
          </Button>
        ) : (
          // An owner/manager watching the kitchens: pick which, and hand this tab to kitchen staff if
          // needed. No Log out here — it would end the admin session in every admin tab of this browser.
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="kds-kitchen" className="sr-only">
              Kitchen
            </label>
            <Select id="kds-kitchen" value={pickedKitchen} onChange={(event) => handlePickKitchen(event.target.value)} className="w-56">
              <option value={ALL_KITCHENS}>All kitchens</option>
              {activeKitchens.map((kitchen) => (
                <option key={kitchen.id} value={kitchen.id}>
                  {kitchen.name}
                </option>
              ))}
            </Select>
            <span className="text-body text-white/70 max-sm:hidden">{staff?.name}</span>
            <Button variant="inverse" onClick={() => window.location.assign("/login?slot=kitchen")}>
              Kitchen staff login
            </Button>
          </div>
        )}
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
                        {isAllKitchens && (
                          <span className="block text-section font-medium text-ink-muted">
                            {kitchenNameById.get(item.kitchenId) ?? "Kitchen"}
                          </span>
                        )}
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
