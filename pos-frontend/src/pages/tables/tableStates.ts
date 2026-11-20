import type { FloorTable, TableCallStatus, TableCallType, TableState } from "../../api/tables";
import type { StatusTone } from "../../components/ui";

// How each floor-map state reads (docs/TABLE_QR_SPEC.md §8.2): mapped onto the five status tones, and
// always shown with its text label — colour is never the only signal.
//   EMPTY → neutral outline · SEATED, IN_KITCHEN, PAYING → active · SERVED → success
//   ORDER_AWAITING, BILL_REQUESTED → warning · UNAVAILABLE → neutral, hatched, "Out of service"
// `short` is for tiles too small for the full label — still a word, never colour alone.
export const TABLE_STATE_META: Record<TableState, { label: string; short: string; tone: StatusTone }> = {
  EMPTY: { label: "Free", short: "Free", tone: "neutral" },
  SEATED: { label: "Seated", short: "Seated", tone: "active" },
  ORDER_AWAITING: { label: "Order waiting", short: "Order", tone: "warning" },
  IN_KITCHEN: { label: "In kitchen", short: "Kitchen", tone: "active" },
  SERVED: { label: "Served", short: "Served", tone: "success" },
  BILL_REQUESTED: { label: "Bill requested", short: "Bill", tone: "warning" },
  PAYING: { label: "Paying", short: "Paying", tone: "active" },
  UNAVAILABLE: { label: "Out of service", short: "Off", tone: "neutral" },
  // Table sync R6: left open past a forced day end — settle or close it before anyone sits there.
  PREVIOUS_DAY: { label: "From yesterday", short: "Old", tone: "danger" },
};

// Legend order: the order a table usually moves through during a meal.
export const LEGEND_STATES: TableState[] = [
  "EMPTY",
  "SEATED",
  "ORDER_AWAITING",
  "IN_KITCHEN",
  "SERVED",
  "BILL_REQUESTED",
  "PAYING",
  "PREVIOUS_DAY",
  "UNAVAILABLE",
];

// The shape's fill and border. Only existing status tokens; the hatch is two of them striped.
const HATCHED =
  "border-dashed border-status-neutral bg-[repeating-linear-gradient(135deg,var(--color-status-neutral-bg)_0_6px,var(--color-surface-raised)_6px_12px)]";

const SHAPE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-border bg-surface-raised",
  active: "border-status-active bg-status-active-bg",
  success: "border-status-success bg-status-success-bg",
  warning: "border-status-warning bg-status-warning-bg",
  danger: "border-status-danger bg-status-danger-bg",
};

export function shapeClassesForState(state: TableState): string {
  return state === "UNAVAILABLE" ? HATCHED : SHAPE_CLASSES[TABLE_STATE_META[state].tone];
}

export const CALL_TYPE_LABEL: Record<TableCallType, string> = {
  WATER: "Water",
  NAPKINS: "Napkins",
  BILL_CASH: "Cash bill",
  OTHER: "Other",
};

export const CALL_STATUS_LABEL: Record<TableCallStatus, string> = {
  RAISED: "Waiting",
  ACKNOWLEDGED: "On the way",
  RESOLVED: "Done",
  CANCELLED: "Cancelled",
};

// "just now", "4m", "1h 05m" — compact, for tiles and call ages.
export function formatElapsed(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// The oldest open call — the one a tile's "Call" chip names.
export function oldestCall(table: FloorTable) {
  return table.session?.openCalls[0] ?? null;
}

export function areaLabel(area: string | null | ""): string {
  return area ? area : "Other";
}

// The second line of a tile: who's there and for how long, or the seat count when it's free.
export function tileMeta(table: FloorTable, now: number): string {
  if (table.session) {
    if (table.session.joinedTo) {
      return `with ${table.session.joinedTo.name}`;
    }
    const guests = table.session.guestCount;
    const elapsed = formatElapsed(table.session.seatedAt, now);
    // Opened by a POS or waiter order with nobody on a phone: the orders say more than "0 guests".
    if (guests === 0 && (table.session.orderCount ?? 0) > 0) {
      const orders = table.session.orderCount ?? 0;
      return `${orders} ${orders === 1 ? "order" : "orders"} · ${elapsed}`;
    }
    const seats = table.capacity ? `/${table.capacity}` : "";
    return `${guests}${seats} guests · ${elapsed}`;
  }
  if (table.capacity) {
    return `${table.capacity} seats`;
  }
  return "";
}
