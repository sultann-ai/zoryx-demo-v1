import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { diningAreasApi } from "../api/diningAreas";
import type { FloorPlan, FloorTable, LayoutEntry, SeatResult, StaffTableCall } from "../api/tables";
import {
  acknowledgeTableCall,
  closeTableSession,
  fetchOpenTableCalls,
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
    onSuccess: (_result, sessionId) => {
      queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...TABLE_SESSION_QUERY_KEY, sessionId] });
    },
  });
}

export function useRegenerateTableQrKey() {
  return useMutation({ mutationFn: regenerateTableQrKey });
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
