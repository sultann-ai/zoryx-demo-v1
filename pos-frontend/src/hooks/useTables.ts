import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { diningAreasApi } from "../api/diningAreas";
import type { FloorPlan, FloorTable, LayoutEntry, QrSheetTable, SeatResult, SettleTableInput, StaffTableCall } from "../api/tables";
import {
  acknowledgeTableCall,
  closeTableSession,
  mergeTableSession,
  moveOrderToTable,
  moveTableSession,
  printTableBill,
  settleTableSession,
  voidTableSession,
  fetchOpenTableCalls,
  fetchQrSheet,
  fetchFloorPlan,
  fetchTableSession,
  regenerateTableQrKey,
  resolveTableCall,
  rotateTablePin,
  saveFloorLayout,
  seatTable,
} from "../api/tables";

export const FLOOR_QUERY_KEY = ["tables", "floor"] as const;
export const TABLE_SESSION_QUERY_KEY = ["table-sessions"] as const;
export const TABLE_CALLS_QUERY_KEY = ["table-calls", "open"] as const;
export const QR_SHEET_QUERY_KEY = ["tables", "qr-sheet"] as const;

// An optimistic seat's placeholder session id: never fetched, replaced by the refetch that follows.
const OPTIMISTIC_PREFIX = "optimistic:";

export function isOptimisticSessionId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

// One query for every area — switching area tabs filters on the client, so it never refetches or
// flashes a skeleton. Old data stays on screen while a refetch runs, so live updates never blank it.
export function useFloorPlan() {
  return useQuery({
    queryKey: FLOOR_QUERY_KEY,
    queryFn: fetchFloorPlan,
    placeholderData: (previous) => previous,
  });
}

// The floor map by table id — what the New Order and order-taker pickers read each table's state from.
// Same query (and so the same socket-driven refresh) as the Tables page.
export function useFloorById(enabled = true): Map<string, FloorTable> | undefined {
  const { data } = useQuery({
    queryKey: FLOOR_QUERY_KEY,
    queryFn: fetchFloorPlan,
    placeholderData: (previous) => previous,
    enabled,
  });
  return useMemo(() => (data ? new Map(data.tables.map((table) => [table.id, table])) : undefined), [data]);
}

// Everything a table change can move: the map, the sessions, the calls, and the order pages/lists.
export function invalidateTableViews(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: TABLE_SESSION_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["orders"] });
}

interface PlacedTableOrder {
  status: string;
  totalAmount: string;
  diningAreaId: string | null;
  tableSessionId?: string | null;
  tableOpened?: { sessionId: string; pin: string | null } | null;
}

/**
 * Right after an order lands on a table, the map shows the table taken (table sync): the tile is patched in
 * the cache at once, then refetched — the server's table:updated (socket) refetches it again. Nothing here
 * decides anything; it only avoids a "Free" tile for the second it takes the refetch to arrive.
 */
export function applyPlacedOrderToFloor(queryClient: QueryClient, order: PlacedTableOrder) {
  if (!order.diningAreaId || !order.tableSessionId) {
    return;
  }
  const sessionId = order.tableSessionId;
  const awaiting = order.status === "AWAITING_RECEPTION";
  queryClient.setQueryData<FloorPlan>(FLOOR_QUERY_KEY, (plan) =>
    patchFloorTable(plan, order.diningAreaId as string, (table) => {
      const busyState = awaiting ? "ORDER_AWAITING" : "IN_KITCHEN";
      const keepState = table.state === "PAYING" || table.state === "BILL_REQUESTED" || table.state === "ORDER_AWAITING";
      if (table.session) {
        return {
          ...table,
          state: keepState ? table.state : busyState,
          session: {
            ...table.session,
            awaitingCount: table.session.awaitingCount + (awaiting ? 1 : 0),
            orderCount: (table.session.orderCount ?? 0) + 1,
            total: (Number(table.session.total ?? 0) + Number(order.totalAmount)).toFixed(2),
          },
        };
      }
      return {
        ...table,
        state: busyState,
        session: {
          id: sessionId,
          seatedAt: new Date().toISOString(),
          waiter: null,
          guestCount: 0,
          awaitingCount: awaiting ? 1 : 0,
          openCalls: [],
          bill: null,
          openedVia: "STAFF_ORDER",
          openedByOrderId: null,
          orderCount: 1,
          total: order.totalAmount,
          fromPreviousDay: false,
          joinedTo: null,
          joined: [],
        },
      };
    }),
  );
  queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: [...TABLE_SESSION_QUERY_KEY, sessionId] });
}

export function useTableSession(sessionId: string | null) {
  return useQuery({
    queryKey: [...TABLE_SESSION_QUERY_KEY, sessionId],
    queryFn: () => fetchTableSession(sessionId as string),
    enabled: sessionId !== null && !isOptimisticSessionId(sessionId),
  });
}

// Which round of its table a Table QR order is ("Round 2"): its place among the session's orders,
// oldest first (GET /table-sessions/:id lists them in that order). Null until loaded, and for any
// order that isn't a Table QR round.
export function useTableRoundNumber(order: { id: string; source: string; tableSession?: { id: string } | null }): number | null {
  const sessionId = order.source === "TABLE_QR" ? (order.tableSession?.id ?? null) : null;
  const { data } = useTableSession(sessionId);
  const index = data?.orders.findIndex((sessionOrder) => sessionOrder.id === order.id) ?? -1;
  return index >= 0 ? index + 1 : null;
}

function patchFloorTable(plan: FloorPlan | undefined, tableId: string, patch: (table: FloorTable) => FloorTable) {
  if (!plan) {
    return plan;
  }
  return { ...plan, tables: plan.tables.map((table) => (table.id === tableId ? patch(table) : table)) };
}

// Seating is safe to show at once: the tile turns "Seated" on tap and rolls back if the server refuses.
export function useSeatTable() {
  const queryClient = useQueryClient();
  return useMutation<SeatResult, unknown, string, { previous: FloorPlan | undefined }>({
    mutationFn: seatTable,
    onMutate: async (tableId) => {
      await queryClient.cancelQueries({ queryKey: FLOOR_QUERY_KEY });
      const previous = queryClient.getQueryData<FloorPlan>(FLOOR_QUERY_KEY);
      queryClient.setQueryData<FloorPlan>(FLOOR_QUERY_KEY, (plan) =>
        patchFloorTable(plan, tableId, (table) => ({
          ...table,
          state: "SEATED",
          session: {
            id: `${OPTIMISTIC_PREFIX}${tableId}`,
            seatedAt: new Date().toISOString(),
            waiter: null,
            guestCount: 0,
            awaitingCount: 0,
            openCalls: [],
            bill: null,
          },
        })),
      );
      return { previous };
    },
    onSuccess: (result, tableId) => {
      // Swap in the real session id straight away, so the panel can load it before the refetch lands.
      queryClient.setQueryData<FloorPlan>(FLOOR_QUERY_KEY, (plan) =>
        patchFloorTable(plan, tableId, (table) =>
          table.session ? { ...table, session: { ...table.session, ...result.session } } : table,
        ),
      );
    },
    onError: (_error, _tableId, context) => {
      queryClient.setQueryData(FLOOR_QUERY_KEY, context?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY }),
  });
}

export function useRotateTablePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotateTablePin,
    onSuccess: (_result, sessionId) =>
      queryClient.invalidateQueries({ queryKey: [...TABLE_SESSION_QUERY_KEY, sessionId] }),
  });
}

// Not optimistic: closing is refused while orders are still open, and a tile that flips to "Free"
// and back would mislead whoever is looking at the map.
export function useCloseTableSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: closeTableSession,
    // Refused closes refetch too: whatever blocked it is now shown as it really is.
    onSettled: () => invalidateTableViews(queryClient),
  });
}

// ---- Table sync actions (docs/TABLE_SYNC_SPEC.md R4, R7, R13). Not optimistic: each can be refused
// (a taken table, a bill with payments), and a tile that jumps and jumps back would mislead the floor. ----

export function useMoveOrderToTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, diningAreaId, expectedTableSessionId }: { orderId: string; diningAreaId: string; expectedTableSessionId: string | null }) =>
      moveOrderToTable(orderId, { diningAreaId, expectedTableSessionId }),
    onSettled: () => invalidateTableViews(queryClient),
  });
}

export function useMoveTableSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, diningAreaId }: { sessionId: string; diningAreaId: string }) => moveTableSession(sessionId, diningAreaId),
    onSettled: () => invalidateTableViews(queryClient),
  });
}

export function useMergeTableSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, intoSessionId }: { sessionId: string; intoSessionId: string }) => mergeTableSession(sessionId, intoSessionId),
    onSettled: () => invalidateTableViews(queryClient),
  });
}

export function useSettleTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: SettleTableInput }) => settleTableSession(sessionId, input),
    onSettled: () => invalidateTableViews(queryClient),
  });
}

export function useVoidTableSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) => voidTableSession(sessionId, reason),
    onSettled: () => invalidateTableViews(queryClient),
  });
}

export function usePrintTableBill() {
  return useMutation({ mutationFn: (sessionId: string) => printTableBill(sessionId, import.meta.env.VITE_PRINTER_ID || undefined) });
}

// The print sheet's tables, sorted the way people count ("Table 2" before "Table 10").
export function useQrSheet() {
  return useQuery({
    queryKey: QR_SHEET_QUERY_KEY,
    queryFn: fetchQrSheet,
    select: (data) => [...data.tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
  });
}

// The new key goes straight into the print sheet's data, so its card redraws with the new QR at once.
export function useRegenerateTableQrKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: regenerateTableQrKey,
    onSuccess: ({ id, qrKey }) => {
      queryClient.setQueryData<{ tables: QrSheetTable[] }>(QR_SHEET_QUERY_KEY, (current) =>
        current ? { tables: current.tables.map((table) => (table.id === id ? { ...table, qrKey } : table)) } : current,
      );
    },
  });
}

export interface TableDetailsChange {
  id: string;
  name: string;
  capacity: number | null;
}

export interface SaveLayoutInput {
  layout: LayoutEntry[];
  details: TableDetailsChange[];
}

// The layout editor's Save: names/seats first (they can be refused, e.g. a blank name), then every
// moved table in one transaction. The map's cache is updated up front so the floor shows the new
// layout at once; a failure puts the old one back.
export function useSaveFloorLayout() {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, SaveLayoutInput, { previous: FloorPlan | undefined }>({
    mutationFn: async ({ layout, details }) => {
      for (const change of details) {
        await diningAreasApi.update(change.id, { name: change.name, capacity: change.capacity });
      }
      if (layout.length > 0) {
        await saveFloorLayout(layout);
      }
    },
    onMutate: async ({ layout, details }) => {
      await queryClient.cancelQueries({ queryKey: FLOOR_QUERY_KEY });
      const previous = queryClient.getQueryData<FloorPlan>(FLOOR_QUERY_KEY);
      const layoutById = new Map(layout.map((entry) => [entry.id, entry]));
      const detailsById = new Map(details.map((change) => [change.id, change]));
      queryClient.setQueryData<FloorPlan>(FLOOR_QUERY_KEY, (plan) =>
        plan
          ? {
              ...plan,
              tables: plan.tables.map((table) => {
                const entry = layoutById.get(table.id);
                const change = detailsById.get(table.id);
                let next = table;
                if (entry) {
                  next = {
                    ...next,
                    layout:
                      entry.x === null || entry.y === null || entry.w === null || entry.h === null
                        ? null
                        : {
                            x: entry.x,
                            y: entry.y,
                            w: entry.w,
                            h: entry.h,
                            shape: entry.shape ?? table.layout?.shape ?? "RECT",
                            rotation: entry.rotation ?? table.layout?.rotation ?? 0,
                          },
                  };
                }
                if (change) {
                  next = { ...next, name: change.name, capacity: change.capacity };
                }
                return next;
              }),
            }
          : plan,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(FLOOR_QUERY_KEY, context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["dining-areas"] });
    },
  });
}

// Every open waiter call, oldest first. Live updates come from TableCallsProvider's socket; the
// interval is only a backstop (and picks up the server's escalation if an event was missed).
export function useOpenTableCalls(enabled: boolean) {
  return useQuery({
    queryKey: TABLE_CALLS_QUERY_KEY,
    queryFn: fetchOpenTableCalls,
    enabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}

type CallsContext = { previousCalls: StaffTableCall[] | undefined; previousFloor: FloorPlan | undefined };

// Acknowledge and Done are safe to show at once: the server's answer is almost always yes, and a
// 409 (someone else got there first) just puts the list back and refetches it. `nextStatus` null
// means the call leaves the open list (Done).
function useCallMutation(
  mutationFn: (callId: string) => Promise<StaffTableCall>,
  nextStatus: "ACKNOWLEDGED" | null,
  me: { id: string; name: string } | null,
) {
  const queryClient = useQueryClient();
  return useMutation<StaffTableCall, unknown, string, CallsContext>({
    mutationFn,
    onMutate: async (callId) => {
      await queryClient.cancelQueries({ queryKey: TABLE_CALLS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: FLOOR_QUERY_KEY });
      const previousCalls = queryClient.getQueryData<StaffTableCall[]>(TABLE_CALLS_QUERY_KEY);
      const previousFloor = queryClient.getQueryData<FloorPlan>(FLOOR_QUERY_KEY);
      queryClient.setQueryData<StaffTableCall[]>(TABLE_CALLS_QUERY_KEY, (calls) =>
        calls?.flatMap((call) => {
          if (call.id !== callId) {
            return [call];
          }
          return nextStatus ? [{ ...call, status: nextStatus, acknowledgedBy: me, acknowledgedAt: new Date().toISOString() }] : [];
        }),
      );
      // The map's tile (ring, chip) follows straight away too.
      queryClient.setQueryData<FloorPlan>(FLOOR_QUERY_KEY, (plan) =>
        plan
          ? {
              ...plan,
              tables: plan.tables.map((table) => {
                const session = table.session;
                if (!session || !session.openCalls.some((call) => call.id === callId)) {
                  return table;
                }
                const openCalls = session.openCalls.flatMap((call) => {
                  if (call.id !== callId) {
                    return [call];
                  }
                  return nextStatus ? [{ ...call, status: nextStatus }] : [];
                });
                const attention = openCalls.length === 0 ? null : openCalls.some((call) => call.escalated) ? "ESCALATED" : "OPEN";
                return { ...table, attention, session: { ...session, openCalls } };
              }),
            }
          : plan,
      );
      return { previousCalls, previousFloor };
    },
    onError: (_error, _callId, context) => {
      queryClient.setQueryData(TABLE_CALLS_QUERY_KEY, context?.previousCalls);
      queryClient.setQueryData(FLOOR_QUERY_KEY, context?.previousFloor);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_CALLS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
    },
  });
}

export function useAcknowledgeTableCall(me: { id: string; name: string } | null) {
  return useCallMutation(acknowledgeTableCall, "ACKNOWLEDGED", me);
}

export function useResolveTableCall() {
  return useCallMutation(resolveTableCall, null, null);
}
