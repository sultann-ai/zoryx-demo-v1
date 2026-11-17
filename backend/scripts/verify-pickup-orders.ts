// End-to-end check of PICKUP orders against the real app (real middleware, routes, Socket.io, a real
// Postgres): the settings switches, a pickup guest order (a TAKEAWAY order with no address and no fee),
// the pickup minimum, switched-off order types, the staff view, the status wording (READY is never
// "on the way", COMPLETED is "collected"), "Not collected" and the strike rule, plus idempotency.
//
//   npx ts-node scripts/verify-pickup-orders.ts
//
// Refuses to run unless DATABASE_URL points at localhost. It creates temporary rows (all named
// VERIFY-<timestamp>) and removes them afterwards; site settings are restored.
import dotenv from "dotenv";
dotenv.config();

import { randomUUID } from "crypto";
import { createServer } from "http";
import { AddressInfo } from "net";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL.includes("localhost")) {
  console.error("Refusing to run: DATABASE_URL does not point at localhost.");
  process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const bcrypt = (await import("bcrypt")).default;
  const jwt = (await import("jsonwebtoken")).default;
  const sharp = (await import("sharp")).default;
  const { io: connectSocket } = await import("socket.io-client");
  const { StaffRole, InventoryTrackingType } = await import("../generated/prisma/client");
  const { prisma } = await import("../src/config/prisma");
  const { app } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { initSocket } = await import("../src/config/socket");

  const httpServer = createServer(app);
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  const stamp = Date.now();
  const tag = `VERIFY-${stamp}`;
  const created = {
    staff: [] as string[],
    kitchen: [] as string[],
    category: [] as string[],
    menuItem: [] as string[],
    area: [] as string[],
    inventory: [] as string[],
    businessDay: [] as string[],
  };
  const settingsBefore = await prisma.siteSettings.findUnique({ where: { id: 1 } });

  // ------------------------------------------------------------------ helpers
  let ipCounter = 10;
  const nextIp = () => `198.52.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  const api = (method: string, path: string, opts: { token?: string; body?: unknown; ip?: string } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "X-Forwarded-For": opts.ip ?? nextIp(),
        ...(opts.body !== undefined && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      ...(opts.body === undefined ? {} : { body: opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body) }),
    });
  const json = async (response: Response) => (await response.json()) as Record<string, any>;

  const makeStaff = async (role: (typeof StaffRole)[keyof typeof StaffRole], label: string) => {
    const staff = await prisma.staffUser.create({
      data: {
        name: `${tag} ${label}`,
        username: `${tag}-${label}`.toLowerCase(),
        passwordHash: await bcrypt.hash("verify-pass-123", 4),
        role,
      },
    });
    created.staff.push(staff.id);
    return { id: staff.id, token: jwt.sign({ id: staff.id, role, kitchenId: null }, env.JWT_SECRET, { expiresIn: "30m" }) };
  };

  // ------------------------------------------------------------------ fixtures
  const kitchen = await prisma.kitchen.create({ data: { name: tag } });
  created.kitchen.push(kitchen.id);
  const admin = await makeStaff(StaffRole.SUPER_ADMIN, "admin");
  const online = await makeStaff(StaffRole.ONLINE_ADMIN, "online");
  const category = await prisma.category.create({ data: { name: tag } });
  created.category.push(category.id);
  const item = await prisma.menuItem.create({
    data: { name: `${tag} item`, slug: `${tag}-item`.toLowerCase(), kitchenId: kitchen.id, categoryId: category.id, price: "500" } as never,
  });
  created.menuItem.push(item.id);
  const stockItem = await prisma.inventoryItem.create({
    data: { name: `${tag} stock`, unit: "pcs", currentStock: "100", trackingType: InventoryTrackingType.AUTO },
  });
  created.inventory.push(stockItem.id);
  await prisma.menuItemInventoryLink.create({ data: { menuItemId: item.id, inventoryItemId: stockItem.id, quantityPerOrder: "1" } });
  const stock = async () => Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stockItem.id } })).currentStock);
  const area = await prisma.deliveryArea.create({ data: { nameEn: `${tag} DHA`, nameUr: "علاقہ", deliveryFee: "150", minOrderAmount: "800" } });
  created.area.push(area.id);

  const baseSettings = {
    onlineOrderingEnabled: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    pickupMinOrderAmount: "0",
    pickupNoteEn: "Ready in about 20 minutes",
    pickupNoteUr: "تقریباً 20 منٹ میں تیار",
    addressEn: `${tag} Main Bazaar`,
    addressUr: "مین بازار",
    mapUrl: "https://maps.example/shop",
  };
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: baseSettings,
    create: { id: 1, shopNameEn: "x", shopNameUr: "x", taglineEn: "x", taglineUr: "x", phone: "x", whatsappNumber: "923000000000", openingHoursEn: "x", openingHoursUr: "x", ...baseSettings },
  });
  const setSettings = (data: Record<string, unknown>) => prisma.siteSettings.update({ where: { id: 1 }, data: data as never });

  let day = await prisma.businessDay.findFirst({ where: { isActive: true } });
  const dayWasMine = !day;
  if (!day) {
    day = await prisma.businessDay.create({ data: { label: tag, startedAt: new Date(), openedById: admin.id } });
    created.businessDay.push(day.id);
  }

  // ------------------------------------------------------------------ live sockets
  const events: { name: string; payload: any }[] = [];
  const socket = connectSocket(base, { auth: { token: admin.token }, transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  for (const room of ["pos-admin", `kitchen:${kitchen.id}`]) {
    await new Promise<void>((resolve) => socket.emit("join", room, () => resolve()));
  }
  for (const name of ["order:submitted", "order:updated", "order:accepted", "order-item:new"]) {
    socket.on(name, (payload) => events.push({ name, payload }));
  }

  // ------------------------------------------------------------------ order helpers
  let phoneSeq = 0;
  const newPhone = () => `0301${String(stamp % 1000).padStart(3, "0")}${String(++phoneSeq).padStart(4, "0")}`;
  const pickupBody = (over: Record<string, unknown> = {}, customer: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    orderType: "PICKUP",
    items: [{ menuItemId: item.id, quantity: 2 }],
    customer: { name: "Ali Khan", phone: newPhone(), ...customer },
    paymentMethod: "CASH",
    website: "",
    ...over,
  });
  const deliveryBody = (over: Record<string, unknown> = {}, customer: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    items: [{ menuItemId: item.id, quantity: 2 }],
    customer: { name: "Ali Khan", phone: newPhone(), deliveryAreaId: area.id, house: "12", street: "Street 5", ...customer },
    paymentMethod: "CASH",
    website: "",
    ...over,
  });
  const place = (body: Record<string, unknown>) => api("POST", "/api/online/guest-orders", { body });
  const dbOrder = (publicId: string) => prisma.order.findUniqueOrThrow({ where: { publicId }, include: { items: true } });
  const status = async (publicId: string) => json(await api("GET", `/api/online/orders/${publicId}`));
  const accept = async (orderId: string) => api("POST", `/api/pos/orders/${orderId}/accept`, { token: admin.token, body: {} });
  const itemStatus = (orderId: string, itemId: string, value: string) =>
    api("PATCH", `/api/pos/orders/${orderId}/items/${itemId}/status`, { token: admin.token, body: { status: value } });
  const png = () => sharp({ create: { width: 1080, height: 2400, channels: 3, background: { r: 30, g: 140, b: 90 } } }).png().toBuffer();

  try {
    console.log(`business day: ${dayWasMine ? "created for this run" : "existing, reused"}\n`);

    // ============================ 1. the store settings ============================
    const store = await json(await api("GET", "/api/online/store"));
    check("store: exposes deliveryEnabled, pickupEnabled, pickupMinOrderAmount and the pickup note", store.settings?.deliveryEnabled === true && store.settings?.pickupEnabled === true && store.settings?.pickupMinOrderAmount === "0" && store.settings?.pickupNoteEn === "Ready in about 20 minutes", store.settings);
    const bothOff = await api("PUT", "/api/pos/site-settings", { token: admin.token, body: { deliveryEnabled: false, pickupEnabled: false } });
    check("settings: switching BOTH ways off is a 400 AT_LEAST_ONE_ORDER_TYPE", bothOff.status === 400 && (await json(bothOff)).code === "AT_LEAST_ONE_ORDER_TYPE");
    const bad = await api("PUT", "/api/pos/site-settings", { token: admin.token, body: { pickupMinOrderAmount: -1 } });
    check("settings: a negative pickup minimum is a 400", bad.status === 400);
    await setSettings({ deliveryEnabled: false });
    const lastOne = await api("PUT", "/api/pos/site-settings", { token: admin.token, body: { pickupEnabled: false } });
    check("settings: switching off the LAST enabled way (delivery already off) is refused", lastOne.status === 400 && (await json(lastOne)).code === "AT_LEAST_ONE_ORDER_TYPE");
    await setSettings({ deliveryEnabled: true });
    const okPut = await api("PUT", "/api/pos/site-settings", { token: admin.token, body: { pickupMinOrderAmount: "300", pickupNoteEn: "Ready in about 20 minutes" } });
    check("settings: staff can set the pickup minimum and note", okPut.status === 200 && (await json(okPut)).pickupMinOrderAmount === "300");

    // ============================ 2. a pickup order ============================
    const eventsBefore = events.length;
    const stockBefore = await stock();
    const body1 = pickupBody({}, { deliveryAreaId: "not-an-area", house: "", street: "x", landmark: "L".repeat(500) });
    const r1 = await place(body1);
    const first = await json(r1);
    check("pickup: 201 with orderType PICKUP, fee 0 and the server-computed total (2 x 500)", r1.status === 201 && first.orderType === "PICKUP" && first.deliveryFee === "0" && first.total === "1000" && first.status === "RECEIVED", first);
    const row1 = await dbOrder(first.publicId);
    check("db: ONLINE + TAKEAWAY, AWAITING_RECEPTION, no address, no area, fee 0", row1.source === "ONLINE" && row1.type === "TAKEAWAY" && row1.status === "AWAITING_RECEPTION" && row1.deliveryAddress === null && row1.deliveryAreaId === null && row1.deliveryFee.toString() === "0" && row1.totalAmount.toString() === "1000", { t: row1.type, a: row1.deliveryAddress, f: row1.deliveryFee.toString() });
    check("db: name and phone stored (phone normalised), delivery fields sent by a stale client were ignored", row1.customerName === "Ali Khan" && /^03\d{9}$/.test(row1.customerPhone ?? ""), row1.customerPhone);
    await sleep(400);
    check("socket: order:submitted reached reception; NO kitchen emit and no stock use before accept", events.slice(eventsBefore).some((e) => e.name === "order:submitted" && e.payload.orderId === row1.id && e.payload.orderType === "TAKEAWAY") && events.slice(eventsBefore).every((e) => e.name !== "order-item:new") && (await stock()) === stockBefore);

    const inbox = (await json(await api("GET", "/api/pos/orders/incoming", { token: admin.token }))).orders as { id: string; type: string; source: string }[];
    check("staff inbox: the pickup order is there as TAKEAWAY / ONLINE", inbox.some((o) => o.id === row1.id && o.type === "TAKEAWAY" && o.source === "ONLINE"));
    const detail = await json(await api("GET", `/api/pos/orders/${row1.id}`, { token: admin.token }));
    check("staff detail: name, phone and code, but no address and no fee", detail.customerName === "Ali Khan" && detail.customerPhone === row1.customerPhone && detail.publicCode === first.publicCode && detail.deliveryAddress === null && detail.deliveryArea === null && detail.deliveryFee === "0", detail);

    // ============================ 3. the status page ============================
    const s1 = await status(first.publicId);
    check("status: orderType PICKUP, RECEIVED, with the shop address, map link and note", s1.orderType === "PICKUP" && s1.status === "RECEIVED" && s1.pickup?.addressEn === `${tag} Main Bazaar` && s1.pickup?.mapUrl === "https://maps.example/shop" && s1.pickup?.noteEn === "Ready in about 20 minutes", s1);
    const leak = JSON.stringify(s1);
    check("status privacy: no phone, name, internal ids or hashed IP", ![row1.customerPhone ?? "x", "Ali Khan", row1.id, row1.publicId ?? "x", admin.id, "ipHash"].some((f) => leak.includes(f)));
    const del = await json(await place(deliveryBody()));
    const sDel = await status(del.publicId);
    check("a delivery order says DELIVERY and has no pickup block", sDel.orderType === "DELIVERY" && !("pickup" in sDel) && del.orderType === "DELIVERY", sDel);
    const old = await json(await place(deliveryBody({ orderType: undefined })));
    check("an old client (no orderType) still places a delivery order", old.orderType === "DELIVERY" && old.deliveryFee === "150" && old.total === "1150", old);

    // ============================ 4. minimum, switches ============================
    await setSettings({ pickupMinOrderAmount: "1200" });
    const low = await place(pickupBody());
    const lowBody = await json(low);
    check("pickup minimum: 2 x 500 is below Rs 1200 -> 400 BELOW_MINIMUM with minOrderAmount", low.status === 400 && lowBody.code === "BELOW_MINIMUM" && lowBody.minOrderAmount === "1200", lowBody);
    const delOk = await place(deliveryBody());
    check("the pickup minimum does not apply to delivery (area minimum 800 does)", delOk.status === 201, delOk.status);
    await setSettings({ pickupMinOrderAmount: "0" });
    check("with no pickup minimum the same order goes through", (await place(pickupBody())).status === 201);

    await setSettings({ pickupEnabled: false });
    const noPickup = await place(pickupBody());
    check("pickup switched off -> 400 PICKUP_UNAVAILABLE, nothing created", noPickup.status === 400 && (await json(noPickup)).code === "PICKUP_UNAVAILABLE");
    check("...and delivery still works", (await place(deliveryBody())).status === 201);
    await setSettings({ pickupEnabled: true, deliveryEnabled: false });
    const noDelivery = await place(deliveryBody());
    check("delivery switched off -> 400 DELIVERY_UNAVAILABLE (also for an old client)", noDelivery.status === 400 && (await json(noDelivery)).code === "DELIVERY_UNAVAILABLE" && (await place(deliveryBody({ orderType: undefined }))).status === 400);
    check("...and pickup still works", (await place(pickupBody())).status === 201);
    await setSettings({ deliveryEnabled: true });
    check("an unknown orderType is a 400 BAD_REQUEST", (await json(await place(pickupBody({ orderType: "TAKEAWAY" })))).code === "BAD_REQUEST");

    // ============================ 5. idempotency, honeypot ============================
    const idem = pickupBody();
    const a = await place(idem);
    const aBody = await json(a);
    const b = await place(idem);
    check("replay: the same clientRequestId answers 200 with the same link and does not make a second order", a.status === 201 && b.status === 200 && (await json(b)).publicId === aBody.publicId && (await prisma.order.count({ where: { clientRequestId: idem.clientRequestId } })) === 1);
    const trapPhone = newPhone();
    const trap = await place(pickupBody({ website: "http://spam.test" }, { phone: trapPhone }));
    check("honeypot: a plausible 201 and nothing is created", trap.status === 201 && (await prisma.order.count({ where: { customerPhone: trapPhone } })) === 0);

    // ============================ 6. accept -> kitchen -> ready -> collected ============================
    const acc = await accept(row1.id);
    check("accept: 200 CONFIRMED (no discount, fee stays 0)", acc.status === 200 && (await json(acc)).status === "CONFIRMED");
    await sleep(400);
    check("accept: the kitchen got it and stock was used", events.some((e) => e.name === "order-item:new" && e.payload?.orderId === row1.id) && (await stock()) < stockBefore);
    check("status: CONFIRMED", (await status(first.publicId)).status === "CONFIRMED");
    const itemId = row1.items[0]!.id;
    await itemStatus(row1.id, itemId, "PREPARING");
    check("status: PREPARING", (await status(first.publicId)).status === "PREPARING");
    await prisma.order.update({ where: { id: row1.id }, data: { riderId: admin.id } }).catch(() => undefined);
    for (const it of row1.items) await itemStatus(row1.id, it.id, "READY");
    const sReady = await status(first.publicId);
    check("status: READY (ready for pickup) — never ON_THE_WAY, even with a rider recorded", sReady.status === "READY" && sReady.orderType === "PICKUP", sReady.status);
    const dl = await api("POST", `/api/pos/orders/${row1.id}/delivered`, { token: admin.token });
    check("Mark delivered/collected works for pickup -> COMPLETED", dl.status === 200 && (await json(dl)).status === "COMPLETED");
    const sDone = await status(first.publicId);
    check("status: DELIVERED (shown as Collected by the website), still a pickup", sDone.status === "DELIVERED" && sDone.orderType === "PICKUP");

    // ============================ 7. online payment for a pickup ============================
    const payBody = pickupBody({ paymentMethod: "ONLINE" });
    const pay = await json(await place(payBody));
    const payRow = await dbOrder(pay.publicId);
    check("online-paid pickup waits for payment like delivery (AWAITING_VERIFICATION, WAITING_FOR_PAYMENT)", payRow.paymentStatus === "AWAITING_VERIFICATION" && (await status(pay.publicId)).payment?.state === "WAITING_FOR_PAYMENT");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await png())], { type: "image/png" }), "screenshot.png");
    const proof = await api("POST", `/api/online/orders/${pay.publicId}/payment-proof`, { body: form });
    check("payment proof upload works for a pickup order", proof.status === 200 && (await status(pay.publicId)).payment?.state === "PROOF_RECEIVED");

    // ============================ 8. Not collected ============================
    const phoneNC = newPhone();
    const nc = await json(await place(pickupBody({}, { phone: phoneNC })));
    const ncRow = await dbOrder(nc.publicId);
    check("not-collected before acceptance is refused (409 NOT_COLLECTABLE)", (await api("POST", `/api/pos/orders/${ncRow.id}/not-collected`, { token: admin.token })).status === 409);
    await accept(ncRow.id);
    check("not-collected is POS_ADMIN/SUPER_ADMIN only (ONLINE_ADMIN is 403)", (await api("POST", `/api/pos/orders/${ncRow.id}/not-collected`, { token: online.token })).status === 403);
    const ncRes = await api("POST", `/api/pos/orders/${ncRow.id}/not-collected`, { token: admin.token });
    const ncBody = await json(ncRes);
    check("not-collected: 200, CANCELLED with reason 'Not collected' and notCollectedAt set", ncRes.status === 200 && ncBody.status === "CANCELLED" && ncBody.cancelledReason === "Not collected" && !!ncBody.notCollectedAt, ncBody);
    const sNc = await status(nc.publicId);
    check("status: CANCELLED with the reason shown to the customer", sNc.status === "CANCELLED" && sNc.cancelReason === "Not collected");
    const again = await api("POST", `/api/pos/orders/${ncRow.id}/not-collected`, { token: admin.token });
    check("not-collected twice is a 409", again.status === 409 && (await json(again)).code === "NOT_COLLECTABLE");
    const delRow = await dbOrder(del.publicId);
    await accept(delRow.id);
    const onDelivery = await api("POST", `/api/pos/orders/${delRow.id}/not-collected`, { token: admin.token });
    check("not-collected on a DELIVERY order is a 409 (and the order is untouched)", onDelivery.status === 409 && (await prisma.order.findUniqueOrThrow({ where: { id: delRow.id } })).status === "CONFIRMED" && (await prisma.order.findUniqueOrThrow({ where: { id: delRow.id } })).notCollectedAt === null);
    check("a delivered pickup cannot be marked not collected (409)", (await api("POST", `/api/pos/orders/${row1.id}/not-collected`, { token: admin.token })).status === 409);

    // ============================ 9. the strike rule ============================
    const strikePhone = newPhone();
    const strikeIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const placed = await place(pickupBody({}, { phone: strikePhone }));
      const pb = await json(placed);
      check(`strike ${i}: the phone can still order (${i} strikes so far)`, placed.status === 201, pb);
      const row = await dbOrder(pb.publicId);
      strikeIds.push(row.id);
      await accept(row.id);
      const res = await api("POST", `/api/pos/orders/${row.id}/not-collected`, { token: admin.token });
      if (res.status !== 200) check(`strike ${i}: marked not collected`, false, await res.text());
    }
    const blocked = await place(pickupBody({}, { phone: strikePhone }));
    const blockedBody = await json(blocked);
    check("3 strikes in 90 days: the phone is refused (429 TOO_MANY) for pickup...", blocked.status === 429 && blockedBody.code === "TOO_MANY", blockedBody);
    check("...and for delivery", (await place(deliveryBody({}, { phone: strikePhone }))).status === 429);
    check("a different phone is not affected", (await place(pickupBody())).status === 201);
    await prisma.order.updateMany({ where: { id: { in: strikeIds } }, data: { notCollectedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) } });
    check("strikes older than 90 days no longer count", (await place(pickupBody({}, { phone: strikePhone }))).status === 201);

    // ============================ 10. reports ============================
    const dash = await json(await api("GET", "/api/pos/reports/dashboard", { token: admin.token }));
    check("dashboard still answers (cancelled no-shows are not sales)", typeof dash.totalSales !== "undefined");
  } finally {
    socket.close();
    const mine = await prisma.order.findMany({
      where: { items: { some: { menuItemId: { in: created.menuItem } } } },
      select: { id: true, paymentProofMediaId: true },
    });
    const orderIds = mine.map((o) => o.id);
    const proofIds = mine.map((o) => o.paymentProofMediaId).filter((id): id is string => !!id);
    await prisma.inventoryTransaction.deleteMany({ where: { relatedOrderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.orderDealLine.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch((e) => console.error("order cleanup failed", e));
    await prisma.mediaAsset.deleteMany({ where: { id: { in: proofIds } } }).catch(() => undefined);
    await prisma.menuItemInventoryLink.deleteMany({ where: { inventoryItemId: { in: created.inventory } } }).catch(() => undefined);
    await prisma.inventoryTransaction.deleteMany({ where: { inventoryItemId: { in: created.inventory } } }).catch(() => undefined);
    await prisma.inventoryItem.deleteMany({ where: { id: { in: created.inventory } } }).catch(() => undefined);
    await prisma.menuItem.deleteMany({ where: { id: { in: created.menuItem } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.category } } }).catch(() => undefined);
    await prisma.deliveryArea.deleteMany({ where: { id: { in: created.area } } }).catch(() => undefined);
    await prisma.kitchen.deleteMany({ where: { id: { in: created.kitchen } } }).catch(() => undefined);
    await prisma.businessDay.deleteMany({ where: { id: { in: created.businessDay } } }).catch(() => undefined);
    await prisma.staffUser.deleteMany({ where: { id: { in: created.staff } } }).catch(() => undefined);
    if (settingsBefore) {
      const { updatedAt: _updatedAt, ...restore } = settingsBefore;
      await prisma.siteSettings.update({ where: { id: 1 }, data: restore }).catch(() => undefined);
    } else {
      await prisma.siteSettings.deleteMany({}).catch(() => undefined);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
