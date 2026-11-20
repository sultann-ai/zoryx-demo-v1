import type { FloorTable } from "../../api/tables";
import { isOptimisticSessionId } from "../../hooks/useTables";
import { formatMoney } from "../../lib/format";

// What picking a table for a new order will do (docs/TABLE_SYNC_SPEC.md R2), read from the live floor map
// (the same ["tables","floor"] query the Tables page uses, kept fresh by the shell's socket). The server
// decides in the end — the order says which session it expected, so a stale screen gets a 409, never a
// silent merge — this only tells the cashier beforehand.
export type TableAvailability =
  // The floor hasn't loaded (or the table isn't on it): pickable; the server answers if it's taken.
  | { kind: "unknown" }
  // No one is there: this order seats it.
  | { kind: "free" }
  // Open: this order goes on its bill. sessionId is what the order sends as expectedTableSessionId.
  | { kind: "open"; sessionId: string | null; summary: string; joinedTo: string | null }
  // Can't take an order: out of service, or still open from the previous business day.
  | { kind: "blocked"; reason: string; short: string };

export function tableAvailability(table: FloorTable | undefined): TableAvailability {
  if (!table) {
    return { kind: "unknown" };
  }
  if (table.state === "UNAVAILABLE" || table.outOfService) {
    return { kind: "blocked", reason: "Out of service — it can't take orders.", short: "Out of service" };
  }
  const session = table.session;
  if (table.state === "PREVIOUS_DAY" || session?.fromPreviousDay) {
    return {
      kind: "blocked",
      reason: "Still open from the previous business day — settle or close it on the Tables page first.",
      short: "From yesterday",
    };
  }
  if (!session) {
    return { kind: "free" };
  }
  const orders = session.orderCount ?? 0;
  const parts = [
    orders > 0 ? `${orders} ${orders === 1 ? "order" : "orders"}` : "seated, no orders yet",
    orders > 0 && session.total ? formatMoney(session.total) : null,
    session.guestCount > 0 ? `${session.guestCount} on phones` : null,
  ].filter((part): part is string => part !== null);
  return {
    kind: "open",
    // A tile seated a moment ago on this screen has a placeholder id until the server answers.
    sessionId: isOptimisticSessionId(session.id) ? null : session.id,
    summary: parts.join(" · "),
    joinedTo: session.joinedTo?.name ?? null,
  };
}

/** The short word under a table's name on a picker tile. */
export function availabilityShortLabel(availability: TableAvailability): string | null {
  switch (availability.kind) {
    case "free":
      return "Free";
    case "open":
      return availability.joinedTo ? `With ${availability.joinedTo}` : "Open";
    case "blocked":
      return availability.short;
    default:
      return null;
  }
}

/** The order's expectedTableSessionId for a table: the session the cashier saw, or null ("it looked free"). */
export function expectedSessionFor(table: FloorTable | undefined): string | null {
  const availability = tableAvailability(table);
  return availability.kind === "open" ? availability.sessionId : null;
}
