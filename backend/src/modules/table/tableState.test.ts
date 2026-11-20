import { describe, expect, it, vi } from "vitest";
import { OrderItemStatus, OrderStatus } from "../../../generated/prisma/client";
import { summariseOrders } from "./tableNotify";
import { deriveTableState, TableState, TableStateInput } from "./tableState";

// tableNotify loads the Prisma/Socket.io config modules; summariseOrders itself is pure.
vi.mock("../../config/prisma", () => ({ prisma: {} }));
vi.mock("../../config/socket", () => ({ getIO: () => undefined }));

const base: TableStateInput = {
  outOfService: false,
  hasOpenSession: true,
  billRequested: false,
  sharesPaidOrSubmitted: 0,
  openBillCashCall: false,
  openCalls: 0,
  escalatedCalls: 0,
  awaitingOrders: 0,
  kitchenItems: 0,
  readyItems: 0,
  acceptedOrders: 0,
};

describe("deriveTableState (spec §3.7, first match wins)", () => {
  it("out of service beats everything, with no attention overlay", () => {
    expect(deriveTableState({ ...base, outOfService: true, awaitingOrders: 2, openCalls: 1 })).toMatchObject({
      state: "UNAVAILABLE",
      attention: null,
    });
  });

  it("no open session is EMPTY", () => {
    expect(deriveTableState({ ...base, hasOpenSession: false }).state).toBe("EMPTY");
  });

  it("orders the open-session states by priority", () => {
    expect(deriveTableState({ ...base, billRequested: true, sharesPaidOrSubmitted: 1, awaitingOrders: 1 }).state).toBe("PAYING");
    expect(deriveTableState({ ...base, billRequested: true, awaitingOrders: 1 }).state).toBe("BILL_REQUESTED");
    expect(deriveTableState({ ...base, openBillCashCall: true, awaitingOrders: 1 }).state).toBe("BILL_REQUESTED");
    expect(deriveTableState({ ...base, awaitingOrders: 1, kitchenItems: 3 }).state).toBe("ORDER_AWAITING");
    expect(deriveTableState({ ...base, kitchenItems: 3, readyItems: 1, acceptedOrders: 1 })).toMatchObject({
      state: "IN_KITCHEN",
      readyCount: 1,
    });
    expect(deriveTableState({ ...base, acceptedOrders: 2 }).state).toBe("SERVED");
    expect(deriveTableState(base).state).toBe("SEATED");
  });

  it("adds the attention overlay for open calls, ESCALATED when any is escalated", () => {
    expect(deriveTableState({ ...base, openCalls: 1 }).attention).toBe("OPEN");
    expect(deriveTableState({ ...base, openCalls: 2, escalatedCalls: 1 }).attention).toBe("ESCALATED");
  });
});

describe("deriveTableState: every state, and PREVIOUS_DAY (table sync R1)", () => {
  // One input per state, each the smallest that reaches it; the list covers every TableState.
  const cases: [string, Partial<TableStateInput>][] = [
    ["UNAVAILABLE", { outOfService: true, fromPreviousDay: true, awaitingOrders: 1 }],
    ["EMPTY", { hasOpenSession: false }],
    ["PREVIOUS_DAY", { fromPreviousDay: true, billRequested: true, sharesPaidOrSubmitted: 1, awaitingOrders: 1 }],
    ["PAYING", { billRequested: true, sharesPaidOrSubmitted: 1 }],
    ["BILL_REQUESTED", { billRequested: true }],
    ["ORDER_AWAITING", { awaitingOrders: 1 }],
    ["IN_KITCHEN", { kitchenItems: 1, acceptedOrders: 1 }],
    ["SERVED", { acceptedOrders: 1 }],
    ["SEATED", {}],
  ];

  it.each(cases)("%s", (state, input) => {
    expect(deriveTableState({ ...base, ...input }).state).toBe(state);
  });

  it("covers every state the type allows", () => {
    const all: TableState[] = ["UNAVAILABLE", "PREVIOUS_DAY", "EMPTY", "PAYING", "BILL_REQUESTED", "ORDER_AWAITING", "IN_KITCHEN", "SERVED", "SEATED"];
    expect(new Set(cases.map(([state]) => state))).toEqual(new Set(all));
  });

  it("a table left from an earlier day keeps its call overlay; an empty one never has one", () => {
    expect(deriveTableState({ ...base, fromPreviousDay: true, openCalls: 1 }).attention).toBe("OPEN");
    expect(deriveTableState({ ...base, hasOpenSession: false, fromPreviousDay: true, openCalls: 1 })).toMatchObject({ state: "EMPTY", attention: null });
  });
});

describe("summariseOrders", () => {
  it("counts awaiting rounds, skips cancelled ones, and counts kitchen and ready items of accepted ones", () => {
    const counts = summariseOrders([
      { status: OrderStatus.AWAITING_RECEPTION, items: [{ status: OrderItemStatus.PENDING }] },
      { status: OrderStatus.CANCELLED, items: [{ status: OrderItemStatus.PENDING }] },
      {
        status: OrderStatus.PENDING,
        items: [{ status: OrderItemStatus.PREPARING }, { status: OrderItemStatus.READY }, { status: OrderItemStatus.SERVED }],
      },
    ]);
    expect(counts).toEqual({ awaitingOrders: 1, kitchenItems: 2, readyItems: 1, acceptedOrders: 1 });
  });
});
