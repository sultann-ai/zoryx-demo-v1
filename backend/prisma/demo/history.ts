import {
  OrderEventType,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StaffRole,
} from "../../generated/prisma/client";
import { computeOrderTotal } from "../../src/common/orderTotals";
import { addDays, isoWeekday } from "../../src/common/pkTime";
import { buildDeliveryAddress } from "../../src/modules/guestOrder/guestOrder.validators";
import { PUBLIC_CODE_ALPHABET, PUBLIC_CODE_LENGTH } from "../../src/modules/guestOrder/publicIds";
import { checkDiscountChange } from "../../src/modules/order/discountPolicy";
import type { CreateOrderDealInput, CreateOrderItemInput, OrderPricingCatalog } from "../../src/modules/order/order.service";
import { priceOrderLines } from "../../src/modules/order/order.service";
import { money } from "../../src/modules/order/orderEvents";
import {
  CAKE_NOTES,
  CANCEL_REASONS,
  CUSTOMER_NAMES,
  DISCOUNT_REASONS,
  LANDMARKS,
  LINE_NOTES,
  STREETS,
  type DemandGroup,
} from "./data";
import type { SeededRandom } from "./random";

// 60 closed business days of orders, priced by the server's own pricing (priceOrderLines,
// computeOrderTotal) and discount policy (checkDiscountChange), so reports reconcile to the rupee.

export interface MenuEntry {
  id: string;
  key: string;
  group: DemandGroup;
  featured: boolean;
  onlineOk: boolean;
  isOpenPrice: boolean;
  variants: { id: string; label: string }[];
  categoryId: string | null;
}

export interface HistoryContext {
  random: SeededRandom;
  pricing: OrderPricingCatalog;
  menu: MenuEntry[];
  // Scoop add-on ids (they apply to every scoop size).
  scoopAddOnIds: string[];
  dealIdByCode: Map<string, string>;
  staff: { owner: string; manager: string; cashier: string; online: string; waiters: string[] };
  // Waiter employees, in the same order as staff.waiters, and the riders.
  employees: { waiters: string[]; riders: string[] };
  tables: string[];
  areas: { id: string; nameEn: string; fee: Prisma.Decimal; min: Prisma.Decimal }[];
  discountCapPercent: Prisma.Decimal;
}

export interface HistoryRows {
  businessDays: Prisma.BusinessDayCreateManyInput[];
  orders: Prisma.OrderCreateManyInput[];
  dealLines: Prisma.OrderDealLineCreateManyInput[];
  items: Prisma.OrderItemCreateManyInput[];
  events: Prisma.OrderEventCreateManyInput[];
}

const PK_OFFSET_MS = 5 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// A Pakistan wall-clock time on a Pakistan date, as a UTC instant. Hours past 23 roll into the next day.
export function pkTime(date: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + (hour * 60 + minute) * MINUTE - PK_OFFSET_MS);
}

// Winter: more chai, coffee, hot chocolate and cake than shakes.
const GROUP_WEIGHTS: [DemandGroup, number][] = [
  ["scoops", 17],
  ["sundaes", 9],
  ["desi", 7],
  ["shakes", 4],
  ["chai", 20],
  ["coffee", 13],
  ["cakes", 6],
  ["slices", 12],
  ["bakes", 8],
  ["savoury", 6],
];

// Opening 12 pm to 1 am: a small afternoon bump, the peak 4 pm – 11 pm. 24 = the half hour after midnight.
const HOUR_WEIGHTS: [number, number][] = [
  [12, 3], [13, 6], [14, 7], [15, 5], [16, 8], [17, 10], [18, 12], [19, 13], [20, 14], [21, 14], [22, 11], [23, 7], [24, 3],
];

const PHONE_PREFIXES = ["0300", "0301", "0303", "0311", "0312", "0315", "0321", "0322", "0333", "0335", "0345", "0346"];
const PUBLIC_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function generateHistory(ctx: HistoryContext, todayPk: string, days: number, endBefore: Date): HistoryRows {
  const { random } = ctx;
  const rows: HistoryRows = { businessDays: [], orders: [], dealLines: [], items: [], events: [] };
  const usedCodes = new Set<string>();
  const byGroup = new Map<DemandGroup, MenuEntry[]>();
  for (const entry of ctx.menu) {
    if (!entry.isOpenPrice) {
      byGroup.set(entry.group, [...(byGroup.get(entry.group) ?? []), entry]);
    }
  }
  const customCake = ctx.menu.find((entry) => entry.isOpenPrice);

  for (let back = days; back >= 1; back -= 1) {
    const date = addDays(todayPk, -back);
    const weekday = isoWeekday(date);
    const isWeekend = weekday >= 5;
    const businessDayId = random.uuid();
    const startedAt = pkTime(date, 11, 40 + random.int(0, 10));
    let endedAt = pkTime(date, 25, random.int(5, 25));
    if (endedAt.getTime() > endBefore.getTime()) {
      endedAt = new Date(endBefore.getTime() - MINUTE);
    }
    const opener = isWeekend && random.chance(0.4) ? ctx.staff.owner : ctx.staff.manager;
    rows.businessDays.push({
      id: businessDayId,
      label: date,
      startedAt,
      endedAt,
      isActive: false,
      openedById: opener,
      closedById: random.chance(0.8) ? ctx.staff.manager : ctx.staff.cashier,
    });

    const count = isWeekend ? random.int(90, 140) : random.int(40, 70);
    const times = Array.from({ length: count }, () => {
      const hour = random.weighted(HOUR_WEIGHTS);
      return pkTime(date, hour, random.int(0, 59)).getTime() + random.int(0, 59) * 1000;
    })
      .filter((time) => time < endedAt.getTime() - 20 * MINUTE)
      .sort((a, b) => a - b);

    times.forEach((time, index) => {
      buildOrder(ctx, rows, byGroup, customCake, usedCodes, { businessDayId, orderNumber: index + 1, createdAt: new Date(time), date });
    });
  }
  return rows;
}

interface OrderSlot {
  businessDayId: string;
  orderNumber: number;
  createdAt: Date;
  date: string;
}

function pickLine(ctx: HistoryContext, byGroup: Map<DemandGroup, MenuEntry[]>, online: boolean): CreateOrderItemInput {
  const { random } = ctx;
  const group = random.weighted(GROUP_WEIGHTS);
  const candidates = (byGroup.get(group) ?? []).filter((entry) => !online || entry.onlineOk);
  const pool = candidates.length > 0 ? candidates : ctx.menu.filter((entry) => !entry.isOpenPrice && (!online || entry.onlineOk));
  const entry = random.weighted(pool.map((candidate) => [candidate, candidate.featured ? 3 : 1] as const));

  let variantId: string | undefined;
  if (entry.variants.length > 0) {
    const label =
      entry.group === "scoops"
        ? random.weighted([["Single", 45], ["Double", 40], ["Triple", 15]] as const)
        : entry.group === "shakes"
          ? random.weighted([["Regular", 65], ["Large", 35]] as const)
          : random.weighted([["1 lb", 60], ["2 lb", 40]] as const);
    variantId = entry.variants.find((variant) => variant.label === label)?.id ?? entry.variants[0]!.id;
  }

  const quantity =
    entry.group === "chai" || entry.group === "coffee"
      ? random.weighted([[1, 50], [2, 35], [3, 10], [4, 5]] as const)
      : entry.key.includes("cupcake") || entry.key.includes("cookie")
        ? random.weighted([[1, 45], [2, 25], [4, 18], [6, 12]] as const)
        : entry.group === "cakes"
          ? 1
          : random.weighted([[1, 82], [2, 18]] as const);

  const line: CreateOrderItemInput = { menuItemId: entry.id, quantity };
  if (variantId !== undefined) {
    line.variantId = variantId;
  }
  if (entry.group === "scoops" && random.chance(0.3)) {
    const count = random.weighted([[1, 75], [2, 25]] as const);
    const chosen = new Set<string>();
    while (chosen.size < count) {
      chosen.add(random.pick(ctx.scoopAddOnIds));
    }
    line.addOnIds = [...chosen];
  }
  if (entry.group === "cakes" && random.chance(0.3)) {
    line.notes = random.pick(CAKE_NOTES);
  } else if (random.chance(0.06)) {
    line.notes = random.pick(LINE_NOTES);
  }
  return line;
}

function phone(random: SeededRandom): string {
  return `${random.pick(PHONE_PREFIXES)}${String(random.int(0, 9999999)).padStart(7, "0")}`;
}

function uniqueCode(random: SeededRandom, used: Set<string>): string {
  let code = random.code(PUBLIC_CODE_ALPHABET, PUBLIC_CODE_LENGTH);
  while (used.has(code)) {
    code = random.code(PUBLIC_CODE_ALPHABET, PUBLIC_CODE_LENGTH);
  }
  used.add(code);
  return code;
}

// Cash handed over: the exact amount, or the next round note.
function cashTendered(random: SeededRandom, total: Prisma.Decimal): Prisma.Decimal {
  const amount = total.toNumber();
  const step = random.weighted([[0, 40], [500, 30], [1000, 25], [5000, 5]] as const);
  if (step === 0) {
    return total;
  }
  return new Prisma.Decimal(Math.ceil(amount / step) * step);
}

function buildOrder(
  ctx: HistoryContext,
  rows: HistoryRows,
  byGroup: Map<DemandGroup, MenuEntry[]>,
  customCake: MenuEntry | undefined,
  usedCodes: Set<string>,
  slot: OrderSlot,
): void {
  const { random, staff } = ctx;
  const orderId = random.uuid();
  const createdAt = slot.createdAt;

  // Source first, then a type that source can have: ~60% POS, 25% order taker (always dine-in),
  // 15% online (delivery or pickup). Together ~45% dine-in, 35% takeaway, 20% delivery.
  const source = random.weighted([[OrderSource.POS, 60], [OrderSource.ORDER_TAKER, 25], [OrderSource.ONLINE, 15]] as const);
  const type =
    source === OrderSource.ORDER_TAKER
      ? OrderType.DINE_IN
      : source === OrderSource.ONLINE
        ? random.weighted([[OrderType.DELIVERY, 75], [OrderType.TAKEAWAY, 25]] as const)
        : random.weighted([[OrderType.DINE_IN, 33], [OrderType.TAKEAWAY, 52], [OrderType.DELIVERY, 15]] as const);
  const online = source === OrderSource.ONLINE;

  // ---- lines ----
  const lineCount = type === OrderType.DINE_IN ? random.weighted([[1, 25], [2, 35], [3, 25], [4, 15]] as const) : random.weighted([[1, 45], [2, 35], [3, 15], [4, 5]] as const);
  const items: CreateOrderItemInput[] = Array.from({ length: lineCount }, () => pickLine(ctx, byGroup, online));
  const deals: CreateOrderDealInput[] = [];
  if (random.chance(0.08)) {
    const code = random.weighted([["CHAI-CAKE", 40], ["COUPLE-SUNDAE", 30], ["FAMILY-BUCKET", 20], ["BIRTHDAY", 10]] as const);
    const deal: CreateOrderDealInput = { dealId: ctx.dealIdByCode.get(code)!, quantity: code === "CHAI-CAKE" ? random.int(1, 2) : 1 };
    if (code === "BIRTHDAY" && random.chance(0.6)) {
      deal.notes = random.pick(CAKE_NOTES);
    }
    deals.push(deal);
  }
  if (!online && customCake && random.chance(0.004)) {
    items.push({ menuItemId: customCake.id, quantity: 1, unitPrice: new Prisma.Decimal(random.pick([3000, 3500, 4500, 6000, 8500, 12000])), notes: random.pick(CAKE_NOTES) });
  }

  // ---- delivery details ----
  const area = type === OrderType.DELIVERY ? random.pick(ctx.areas) : undefined;
  let priced = priceOrderLines(items, deals, ctx.pricing);
  const subtotalOf = (p: typeof priced) =>
    [...p.orderItemsCreateData, ...p.pendingDealLines].reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
  // An online delivery must reach the area's minimum (the website refuses less): top up with a slice.
  if (online && area) {
    while (subtotalOf(priced).lessThan(area.min)) {
      items.push(pickLine(ctx, byGroup, true));
      priced = priceOrderLines(items, deals, ctx.pricing);
    }
  }
  const subtotal = subtotalOf(priced);
  const itemsTotal = priced.orderItemsCreateData.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  const dealLinesTotal = priced.pendingDealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
  // Only the website sets a delivery fee (from the area); a POS delivery has none, as in the app.
  const deliveryFee = online && area ? area.fee : new Prisma.Decimal(0);

  // ---- outcome ----
  const cancelled = random.chance(0.03);
  const paidOnline = online && !cancelled && random.chance(0.3);
  const placer = source === OrderSource.POS ? (random.chance(0.65) ? staff.cashier : staff.manager) : null;
  const cashier = placer ?? (random.chance(0.7) ? staff.cashier : staff.manager);

  let discount = new Prisma.Decimal(0);
  let discountBy: string | null = null;
  let discountRole: StaffRole = StaffRole.POS_ADMIN;
  let discountReason: string | null = null;
  if (!cancelled && random.chance(0.05)) {
    const percent = random.pick([5, 10, 10, 15]);
    discount = new Prisma.Decimal(Math.max(10, Math.floor((subtotal.toNumber() * percent) / 100 / 10) * 10));
    const byOwner = random.chance(0.1);
    discountBy = byOwner ? staff.owner : cashier;
    discountRole = byOwner ? StaffRole.SUPER_ADMIN : StaffRole.POS_ADMIN;
    const check = checkDiscountChange({
      next: discount,
      current: new Prisma.Decimal(0),
      subtotal,
      actor: { actorId: discountBy, role: discountRole, reason: random.pick(DISCOUNT_REASONS) },
      capPercent: ctx.discountCapPercent,
    });
    discountReason = check.changed ? check.reason : null;
  }
  const totalAmount = computeOrderTotal({ itemsTotal, dealLinesTotal, discount, deliveryFee });

  // ---- timeline ----
  const acceptedAt = source === OrderSource.POS ? null : new Date(createdAt.getTime() + random.int(1, 4) * MINUTE);
  const acceptedBy = source === OrderSource.ONLINE ? (random.chance(0.7) ? staff.online : cashier) : source === OrderSource.ORDER_TAKER ? cashier : null;
  const minutesToFinish =
    type === OrderType.DINE_IN ? random.int(35, 80) : type === OrderType.DELIVERY ? random.int(40, 75) : random.int(8, 22);
  const finishedAt = new Date(createdAt.getTime() + minutesToFinish * MINUTE);
  const cancelledAt = new Date(createdAt.getTime() + random.int(5, 20) * MINUTE);

  // Online and order-taker orders are accepted at reception first.
  const openStatus = online ? OrderStatus.CONFIRMED : OrderStatus.PENDING;
  const paymentMethod = paidOnline ? PaymentMethod.ONLINE : PaymentMethod.CASH;
  const paidAmount = !cancelled && !paidOnline ? cashTendered(random, totalAmount) : null;
  const waiterIndex = random.int(0, ctx.employees.waiters.length - 1);

  const customerName = type === OrderType.DELIVERY || online ? random.pick(CUSTOMER_NAMES) : null;
  const customerPhone = customerName ? phone(random) : null;
  const deliveryAddress = area
    ? buildDeliveryAddress({
        house: String(random.int(1, 480)),
        street: random.pick(STREETS),
        areaName: area.nameEn,
        landmark: random.chance(0.3) ? random.pick(LANDMARKS) : undefined,
      })
    : null;

  rows.orders.push({
    id: orderId,
    orderNumber: slot.orderNumber,
    businessDayId: slot.businessDayId,
    source,
    type,
    diningAreaId: type === OrderType.DINE_IN ? random.pick(ctx.tables) : null,
    waiterId:
      source === OrderSource.ORDER_TAKER
        ? ctx.employees.waiters[waiterIndex]!
        : type === OrderType.DINE_IN && random.chance(0.5)
          ? random.pick(ctx.employees.waiters)
          : null,
    riderId: type === OrderType.DELIVERY && !cancelled ? random.pick(ctx.employees.riders) : null,
    deliveryAddress,
    customerName,
    customerPhone,
    deliveryAreaId: online && area ? area.id : null,
    deliveryFee,
    publicId: online ? random.code(PUBLIC_ID_ALPHABET, 22) : null,
    publicCode: online ? uniqueCode(random, usedCodes) : null,
    status: cancelled ? OrderStatus.CANCELLED : OrderStatus.COMPLETED,
    paymentMethod,
    paymentStatus: cancelled ? PaymentStatus.PENDING : PaymentStatus.VERIFIED,
    paymentVerifiedById: paidOnline ? staff.online : null,
    placedByStaffId: source === OrderSource.POS ? placer : source === OrderSource.ORDER_TAKER ? staff.waiters[waiterIndex]! : null,
    acceptedById: acceptedBy,
    acceptedAt,
    totalAmount,
    discount,
    discountById: discountBy,
    discountAt: discountBy ? (source === OrderSource.POS ? createdAt : finishedAt) : null,
    discountReason,
    paidAmount,
    cancelledReason: cancelled ? random.pick(CANCEL_REASONS) : null,
    cancelledAt: cancelled ? cancelledAt : null,
    cancelledById: cancelled ? cashier : null,
    createdAt,
    updatedAt: cancelled ? cancelledAt : finishedAt,
  });

  // ---- lines ----
  const itemStatus = cancelled ? OrderItemStatus.PENDING : OrderItemStatus.SERVED;
  const itemUpdatedAt = cancelled ? createdAt : finishedAt;
  for (const item of priced.orderItemsCreateData) {
    rows.items.push({ ...item, id: random.uuid(), orderId, status: itemStatus, createdAt, updatedAt: itemUpdatedAt });
  }
  for (const line of priced.pendingDealLines) {
    const dealOrderLineId = random.uuid();
    const { explodedItems, ...dealLine } = line;
    rows.dealLines.push({ ...dealLine, id: dealOrderLineId, orderId, createdAt });
    for (const exploded of explodedItems) {
      rows.items.push({
        ...exploded,
        id: random.uuid(),
        orderId,
        unitPrice: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(0),
        dealOrderLineId,
        status: itemStatus,
        createdAt,
        updatedAt: itemUpdatedAt,
      });
    }
  }

  // ---- audit trail, in the order the real actions write it ----
  const event = (type: OrderEventType, actorId: string | null, at: Date, before: Prisma.InputJsonObject, after: Prisma.InputJsonObject, reason: string | null = null) =>
    rows.events.push({ id: random.uuid(), orderId, actorId, type, reason, before, after, createdAt: at });
  const preDiscountTotal = totalAmount.plus(discount);

  if (discountBy && source === OrderSource.POS) {
    event(OrderEventType.DISCOUNT_SET, discountBy, createdAt, { discount: "0.00", totalAmount: money(preDiscountTotal) }, { discount: money(discount), totalAmount: money(totalAmount) }, discountReason);
  }
  if (acceptedAt && acceptedBy) {
    event(OrderEventType.ACCEPTED, acceptedBy, acceptedAt, { status: OrderStatus.AWAITING_RECEPTION }, { status: openStatus, paymentMethod });
    if (paidOnline) {
      event(OrderEventType.PAYMENT_MARKED, acceptedBy, acceptedAt, { paymentStatus: PaymentStatus.AWAITING_VERIFICATION }, { paymentStatus: PaymentStatus.VERIFIED, totalAmount: money(totalAmount) });
    }
  }
  if (cancelled) {
    event(
      OrderEventType.CANCELLED,
      cashier,
      cancelledAt,
      { status: acceptedAt ? openStatus : OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING, paid: false, totalAmount: money(totalAmount) },
      { status: OrderStatus.CANCELLED, restocked: false },
      rows.orders[rows.orders.length - 1]!.cancelledReason as string,
    );
    return;
  }
  if (discountBy && source !== OrderSource.POS) {
    event(OrderEventType.DISCOUNT_SET, discountBy, finishedAt, { discount: "0.00", totalAmount: money(preDiscountTotal) }, { discount: money(discount), totalAmount: money(totalAmount) }, discountReason);
  }
  if (!paidOnline) {
    event(OrderEventType.PAYMENT_MARKED, cashier, finishedAt, { paymentStatus: PaymentStatus.PENDING, paidAmount: null }, { paymentStatus: PaymentStatus.VERIFIED, paidAmount: money(paidAmount), totalAmount: money(totalAmount) });
  }
  // A POS takeaway completes itself when it's paid (autoCompleteTakeawayOnPayment).
  const auto = source === OrderSource.POS && type === OrderType.TAKEAWAY;
  event(
    OrderEventType.COMPLETED,
    cashier,
    new Date(finishedAt.getTime() + (auto ? 0 : random.int(1, 20) * 1000)),
    { status: openStatus, paymentStatus: PaymentStatus.VERIFIED },
    auto ? { status: OrderStatus.COMPLETED, auto: true, via: "auto" } : { status: OrderStatus.COMPLETED, via: "complete" },
  );
}
