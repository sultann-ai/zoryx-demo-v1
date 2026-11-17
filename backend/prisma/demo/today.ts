import {
  OrderChangeKind,
  OrderItemStatus,
  OrderSource,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type PrismaClient,
  StaffRole,
} from "../../generated/prisma/client";
import { karachiDate } from "../../src/common/pkTime";
import * as guestOrderService from "../../src/modules/guestOrder/guestOrder.service";
import type { CreateOrderItemInput } from "../../src/modules/order/order.service";
import * as orderService from "../../src/modules/order/order.service";
import type { CatalogIds } from "./catalog";
import { placeholderProof } from "./images";
import type { SeededRandom } from "./random";

// Today: an open business day with a dozen orders in every state the demo walks through. Each one
// goes through the real order services (pricing, stock, events, guards), then has its timestamps
// moved back so the day reads naturally from opening until now.
export interface TodaySummary {
  orders: number;
}

const MINUTE = 60 * 1000;

export async function seedToday(db: PrismaClient, random: SeededRandom, ids: CatalogIds, startedAt: Date, now: Date): Promise<TodaySummary> {
  const staff = (key: string) => ids.staffIdByKey.get(key)!;
  const employee = (key: string) => ids.employeeIdByKey.get(key)!;
  const table = (name: string) => ids.tableIdByName.get(name)!;
  const variants = await db.menuItemVariant.findMany({ select: { id: true, label: true, menuItem: { select: { slug: true } } } });
  const addOns = await db.addOn.findMany({ select: { id: true, name: true } });
  const line = (key: string, quantity: number, extra: { size?: string; addOns?: string[]; notes?: string; unitPrice?: number } = {}): CreateOrderItemInput => ({
    menuItemId: ids.itemIdByKey.get(key)!,
    quantity,
    ...(extra.size ? { variantId: variants.find((v) => v.menuItem.slug === key && v.label === extra.size)!.id } : {}),
    ...(extra.addOns ? { addOnIds: extra.addOns.map((name) => addOns.find((a) => a.name === name)!.id) } : {}),
    ...(extra.notes ? { notes: extra.notes } : {}),
    ...(extra.unitPrice !== undefined ? { unitPrice: new Prisma.Decimal(extra.unitPrice) } : {}),
  });
  const area = await db.deliveryArea.findFirstOrThrow({ where: { nameEn: "F-10" } });

  // Labelled with its Pakistan date, like the app's default.
  await db.businessDay.create({
    data: { id: random.uuid(), label: karachiDate(startedAt), startedAt, isActive: true, openedById: staff("manager") },
  });

  const created: string[] = [];
  const setItemStatuses = async (orderId: string, statuses: Record<string, OrderItemStatus>) => {
    const rows = await db.orderItem.findMany({ where: { orderId }, select: { id: true, menuItem: { select: { slug: true } } } });
    for (const row of rows) {
      const status = statuses[row.menuItem.slug];
      if (status) {
        await db.orderItem.update({ where: { id: row.id }, data: { status } });
      }
    }
  };
  const roundUp = (total: Prisma.Decimal, step: number) => new Prisma.Decimal(Math.ceil(total.toNumber() / step) * step);
  const pos = (input: Omit<orderService.CreateOrderInput, "source" | "paymentMethod">) =>
    orderService.createOrder({ source: OrderSource.POS, paymentMethod: PaymentMethod.CASH, ...input });

  // 1. A POS takeaway, paid — completed by itself (autoCompleteTakeawayOnPayment).
  const a1 = await pos({ type: OrderType.TAKEAWAY, placedByStaffId: staff("cashier"), items: [line("lotus", 1, { size: "Double", addOns: ["Waffle Cone"] }), line("kashmiri-chai", 2)] });
  await orderService.updatePaymentStatus(a1.id, PaymentStatus.VERIFIED, { paidAmount: roundUp(a1.totalAmount, 500), actorId: staff("cashier"), actorRole: StaffRole.POS_ADMIN });
  created.push(a1.id);

  // 2. A dine-in table that ate, paid with a regular-customer discount, and was completed.
  const a2 = await pos({ type: OrderType.DINE_IN, placedByStaffId: staff("manager"), diningAreaId: table("G2"), waiterId: employee("waiter1"), items: [line("hot-fudge", 1), line("cappuccino", 2), line("fudge-brownie", 1)] });
  await setItemStatuses(a2.id, { "hot-fudge": "SERVED", cappuccino: "SERVED", "fudge-brownie": "SERVED" });
  const a2Paid = await orderService.updatePaymentStatus(a2.id, PaymentStatus.VERIFIED, {
    discount: new Prisma.Decimal(150),
    discountReason: "Regular customer",
    paidAmount: new Prisma.Decimal(2500),
    actorId: staff("manager"),
    actorRole: StaffRole.POS_ADMIN,
  });
  await orderService.completeOrder(a2Paid.id, staff("manager"));
  created.push(a2.id);

  // 3–4. Two dine-in tables that have eaten (everything served) and haven't paid yet.
  const u1 = await pos({ type: OrderType.DINE_IN, placedByStaffId: staff("cashier"), diningAreaId: table("F3"), items: [line("hot-chocolate", 2)], deals: [{ dealId: ids.dealIdByCode.get("COUPLE-SUNDAE")!, quantity: 1 }] });
  await setItemStatuses(u1.id, { "hot-chocolate": "SERVED", "hot-fudge": "SERVED", "lotus-sundae": "SERVED" });
  created.push(u1.id);
  const u2 = await pos({ type: OrderType.DINE_IN, placedByStaffId: staff("cashier"), diningAreaId: table("G5"), waiterId: employee("waiter3"), items: [line("banana-split", 1), line("cold-coffee", 1, { size: "Regular", notes: "less ice" }), line("chicken-patty", 2)] });
  await setItemStatuses(u2.id, { "banana-split": "SERVED", "cold-coffee": "SERVED", "chicken-patty": "SERVED" });
  created.push(u2.id);

  // 5. A dine-in table that paid up front; the kitchens are still on it.
  const p4 = await pos({ type: OrderType.DINE_IN, placedByStaffId: staff("cashier"), diningAreaId: table("T1"), items: [line("tiramisu", 1), line("latte", 2), line("pista", 1, { size: "Triple", addOns: ["Nutella"] })] });
  await orderService.updatePaymentStatus(p4.id, PaymentStatus.VERIFIED, { paidAmount: roundUp(p4.totalAmount, 1000), actorId: staff("cashier"), actorRole: StaffRole.POS_ADMIN });
  await setItemStatuses(p4.id, { tiramisu: "READY", latte: "READY", pista: "PREPARING" });
  created.push(p4.id);

  // 6. A waiter's order, accepted, cooking — and the waiter has asked to add two chai (pending review).
  const waiterItems = [line("falooda", 2), line("chicken-sandwich", 1), line("doodh-patti", 3, { notes: "kam cheeni" })];
  const { order: p2Submitted } = await orderService.submitOrderTakerOrder({ placedByStaffId: staff("waiter1"), diningAreaId: table("F2"), items: waiterItems, clientRequestId: random.uuid() });
  const p2 = await orderService.acceptOrder(p2Submitted.id, staff("cashier"), {});
  await setItemStatuses(p2.id, { falooda: "PREPARING", "doodh-patti": "READY" });
  await orderService.createOrderChange({
    orderId: p2.id,
    requestedById: staff("waiter1"),
    kind: OrderChangeKind.EDIT,
    reason: "Table wants two Kashmiri chai as well",
    requestedState: { items: [...waiterItems, line("kashmiri-chai", 2)] as unknown as Prisma.JsonArray, deals: [] },
  });
  created.push(p2.id);

  // 7. A POS delivery, cash on delivery, rider assigned, cake on the way.
  const p3 = await pos({
    type: OrderType.DELIVERY,
    placedByStaffId: staff("cashier"),
    riderId: employee("rider1"),
    customerName: "Hira Aslam",
    customerPhone: "03331234567",
    deliveryAddress: "House 21, Street 15, F-10/2\nLandmark: Near the park",
    items: [line("choc-fudge-cake", 1, { size: "2 lb", notes: "Write: Happy Birthday Ali" }), line("choc-cupcake", 6), line("oreo-shake", 1, { size: "Large" })],
  });
  await setItemStatuses(p3.id, { "choc-fudge-cake": "PREPARING", "choc-cupcake": "READY" });
  created.push(p3.id);

  // 8. A takeaway someone is waiting for at the counter (pays on collection).
  const p1 = await pos({ type: OrderType.TAKEAWAY, placedByStaffId: staff("cashier"), items: [line("kashmiri-chai", 1), line("fudge-brownie", 2), line("mango", 1, { size: "Double" })] });
  await setItemStatuses(p1.id, { "kashmiri-chai": "PREPARING", "fudge-brownie": "READY" });
  created.push(p1.id);

  // 9. A waiter's order still waiting at reception.
  const { order: w1 } = await orderService.submitOrderTakerOrder({
    placedByStaffId: staff("waiter2"),
    diningAreaId: table("G3"),
    items: [line("hot-fudge", 2), line("gajar-halwa", 1), line("green-tea", 2)],
    notes: "Guests in a hurry",
    clientRequestId: random.uuid(),
  });
  created.push(w1.id);

  // 10. A website delivery, cash on delivery, waiting at reception.
  const o1 = await guestOrderService.createGuestOrder(
    {
      clientRequestId: random.uuid(),
      orderType: "DELIVERY",
      paymentMethod: "CASH",
      customer: { name: "Faraz Ahmed", phone: "03211234567", deliveryAreaId: area.id, house: "7", street: "Street 31", landmark: "Opposite the park" },
      items: [line("choc-pastry", 2)],
      deals: [{ dealId: ids.dealIdByCode.get("FAMILY-BUCKET")!, quantity: 1 }],
      notes: "Please ring the bell twice",
    },
    "127.0.0.1",
  );
  created.push((await db.order.findUniqueOrThrow({ where: { publicId: o1.result.publicId } })).id);

  // 11. A website pickup paid online — its payment screenshot is waiting to be verified.
  const o2 = await guestOrderService.createGuestOrder(
    {
      clientRequestId: random.uuid(),
      orderType: "PICKUP",
      paymentMethod: "ONLINE",
      customer: { name: "Mehwish Tariq", phone: "03451234567" },
      items: [line("lotus-cheesecake", 2), line("kashmiri-chai", 2)],
      deals: [],
      notes: undefined,
    },
    "127.0.0.1",
  );
  const o2Total = Number(o2.result.total).toLocaleString("en-PK");
  await guestOrderService.attachPaymentProof(o2.result.publicId, await placeholderProof(o2Total, `EP${random.int(100000000, 999999999)}`));
  created.push((await db.order.findUniqueOrThrow({ where: { publicId: o2.result.publicId } })).id);

  // 12. A celebration cake ordered for collection later today: on hold until its time.
  const s1 = await pos({
    type: OrderType.TAKEAWAY,
    placedByStaffId: staff("cashier"),
    scheduledFor: new Date(now.getTime() + 2 * 60 * MINUTE),
    customerName: "Sana Javed",
    customerPhone: "03121234567",
    notes: "Collecting at the counter",
    items: [line("custom-cake", 1, { unitPrice: 6500, notes: "Write: Happy 10th Birthday Hira" }), line("vanilla-cupcake", 6)],
  });
  created.push(s1.id);

  // Spread the orders from shortly after opening until a few minutes ago, oldest first, moving every
  // timestamp that belongs to each order (its items, events, stock moves, change requests) with it.
  const first = startedAt.getTime() + 10 * MINUTE;
  const last = now.getTime() - 3 * MINUTE;
  const step = Math.max(MINUTE, (last - first) / Math.max(1, created.length - 1));
  for (const [index, orderId] of created.entries()) {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { createdAt: true } });
    const target = Math.min(last, first + index * step);
    const shiftMs = Math.round(target - order.createdAt.getTime());
    await db.$executeRaw`UPDATE "Order" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}), "updatedAt" = "updatedAt" + make_interval(secs => ${shiftMs / 1000}), "acceptedAt" = "acceptedAt" + make_interval(secs => ${shiftMs / 1000}), "discountAt" = "discountAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "id" = ${orderId}`;
    await db.$executeRaw`UPDATE "OrderItem" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}), "updatedAt" = "updatedAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "orderId" = ${orderId}`;
    await db.$executeRaw`UPDATE "OrderDealLine" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "orderId" = ${orderId}`;
    await db.$executeRaw`UPDATE "OrderEvent" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "orderId" = ${orderId}`;
    await db.$executeRaw`UPDATE "OrderChange" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "orderId" = ${orderId}`;
    await db.$executeRaw`UPDATE "InventoryTransaction" SET "createdAt" = "createdAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "relatedOrderId" = ${orderId}`;
  }

  return { orders: created.length };
}
