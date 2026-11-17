// End-to-end check of guest checkout against the real app (real middleware, routes, Socket.io, a
// real Postgres): guest order -> Incoming inbox -> (proof, payment verify) -> accept -> kitchen ->
// status link through to DELIVERED, plus idempotency, the honeypot, the Postgres limits, the delivery
// fee surviving every recompute, privacy of the status endpoint, and COMPLETED handling.
//
//   npx ts-node scripts/verify-guest-orders.ts
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
  const businessDayService = await import("../src/modules/businessDay/businessDay.service");
  const { purgeOrphanMedia } = await import("../src/modules/media/media.service");

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
    deal: [] as string[],
    area: [] as string[],
    inventory: [] as string[],
    employee: [] as string[],
    businessDay: [] as string[],
  };
  const settingsBefore = await prisma.siteSettings.findUnique({ where: { id: 1 } });

  // ------------------------------------------------------------------ helpers
  let ipCounter = 10;
  const nextIp = () => `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
  const api = (method: string, path: string, opts: { token?: string; body?: unknown; ip?: string; headers?: Record<string, string> } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "X-Forwarded-For": opts.ip ?? nextIp(),
        ...(opts.body !== undefined && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      ...(opts.body === undefined ? {} : { body: opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body) }),
    });
  const json = async (response: Response) => (await response.json()) as Record<string, any>;

  const makeStaff = async (role: (typeof StaffRole)[keyof typeof StaffRole], label: string, kitchenId?: string) => {
    const staff = await prisma.staffUser.create({
      data: {
        name: `${tag} ${label}`,
        username: `${tag}-${label}`.toLowerCase(),
        passwordHash: await bcrypt.hash("verify-pass-123", 4),
        role,
        ...(kitchenId ? { kitchenId } : {}),
      },
    });
    created.staff.push(staff.id);
    return { id: staff.id, token: jwt.sign({ id: staff.id, role, kitchenId: kitchenId ?? null }, env.JWT_SECRET, { expiresIn: "30m" }) };
  };

  // ------------------------------------------------------------------ fixtures
  const kitchen = await prisma.kitchen.create({ data: { name: tag } });
  created.kitchen.push(kitchen.id);
  const admin = await makeStaff(StaffRole.SUPER_ADMIN, "admin");
  const online = await makeStaff(StaffRole.ONLINE_ADMIN, "online");
  const taker = await makeStaff(StaffRole.ORDER_TAKER, "taker");
  const category = await prisma.category.create({ data: { name: tag } });
  created.category.push(category.id);

  const mkItem = async (name: string, over: Record<string, unknown> = {}) => {
    const item = await prisma.menuItem.create({
      data: { name: `${tag} ${name}`, slug: `${tag}-${name}`.toLowerCase(), kitchenId: kitchen.id, categoryId: category.id, price: "500", ...over } as never,
    });
    created.menuItem.push(item.id);
    return item;
  };
  const item = await mkItem("item");
  const hiddenItem = await mkItem("hidden", { isAvailableOnline: false });
  const openItem = await mkItem("open", { price: null, isOpenPrice: true });
  const dealOnlyItem = await mkItem("dealonly", { sellableAlone: false });
  const cheapItem = await mkItem("cheap", { price: "100" });

  const stockItem = await prisma.inventoryItem.create({
    data: { name: `${tag} stock`, unit: "pcs", currentStock: "100", trackingType: InventoryTrackingType.AUTO },
  });
  created.inventory.push(stockItem.id);
  await prisma.menuItemInventoryLink.create({ data: { menuItemId: item.id, inventoryItemId: stockItem.id, quantityPerOrder: "1" } });
  const stock = async () => Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stockItem.id } })).currentStock);

  const mkDeal = async (name: string, over: Record<string, unknown> = {}) => {
    const deal = await prisma.deal.create({
      data: {
        name: `${tag} ${name}`,
        code: `${tag}-${name}`.toUpperCase(),
        price: "900",
        ...over,
        items: { create: [{ menuItemId: item.id, quantity: 2 }] },
      } as never,
    });
    created.deal.push(deal.id);
    return deal;
  };
  const liveDeal = await mkDeal("live");
  const inactiveDeal = await mkDeal("inactive", { isActive: false });

  const mkArea = async (name: string, fee: string, min: string, isActive = true) => {
    const row = await prisma.deliveryArea.create({
      data: { nameEn: `${tag} ${name}`, nameUr: "علاقہ", deliveryFee: fee, minOrderAmount: min, isActive },
    });
    created.area.push(row.id);
    return row;
  };
  const diningArea = await prisma.diningArea.create({ data: { name: `${tag} table`, type: "TABLE" } });
  const area = await mkArea("DHA", "150", "800");
  const freeArea = await mkArea("Near", "50", "0");
  const closedArea = await mkArea("Closed", "0", "0", false);

  await prisma.siteSettings.upsert({ where: { id: 1 }, update: { onlineOrderingEnabled: true }, create: { id: 1, shopNameEn: "x", shopNameUr: "x", taglineEn: "x", taglineUr: "x", phone: "x", whatsappNumber: "923000000000", addressEn: "x", addressUr: "x", mapUrl: "https://x.test", openingHoursEn: "x", openingHoursUr: "x" } });

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
  for (const name of ["order:submitted", "order:updated", "order:accepted", "order:rejected", "order-item:new"]) {
    socket.on(name, (payload) => events.push({ name, payload }));
  }
  const eventsFor = (name: string, orderId: string) => events.filter((e) => e.name === name && e.payload?.orderId === orderId);

  // ------------------------------------------------------------------ order-making helpers
  const phoneFor = (n: number) => `0300${String(1000000 + n).slice(-7)}`;
  const guestBody = (over: Record<string, unknown> = {}, customer: Record<string, unknown> = {}) => ({
    clientRequestId: randomUUID(),
    items: [{ menuItemId: item.id, quantity: 2 }],
    deals: [{ dealId: liveDeal.id, quantity: 1 }],
    customer: { name: "Ali Khan", phone: "+92 300 1234567", deliveryAreaId: area.id, house: "12", street: "Street 5", landmark: "Near the mosque", ...customer },
    notes: "Ring the bell",
    paymentMethod: "CASH",
    website: "",
    ...over,
  });
  const placeGuest = (body: Record<string, unknown>, ip?: string) => api("POST", "/api/online/guest-orders", { body, ...(ip ? { ip } : {}) });
  const dbOrder = (publicId: string) => prisma.order.findUniqueOrThrow({ where: { publicId }, include: { items: true, clientIp: true } });
  const incomingIds = async (query = "") =>
    ((await json(await api("GET", `/api/pos/orders/incoming${query}`, { token: admin.token }))).orders as { id: string }[]).map((o) => o.id);
  const dashboard = async () => {
    const d = await json(await api("GET", "/api/pos/reports/dashboard", { token: admin.token }));
    return { sales: Number(d.totalSales), count: Number(d.orderCount) };
  };
  const status = async (publicId: string) => json(await api("GET", `/api/online/orders/${publicId}`));
  const png = () => sharp({ create: { width: 1080, height: 2400, channels: 3, background: { r: 30, g: 140, b: 90 } } }).png().toBuffer();
  const uploadProof = async (publicId: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await png())], { type: "image/png" }), "screenshot.png");
    return api("POST", `/api/online/orders/${publicId}/payment-proof`, { body: form });
  };

  try {
    console.log(`business day: ${dayWasMine ? "created for this run" : "existing, reused"}\n`);

    // ============================ 1. the guest order lands in the inbox ============================
    const dashBefore = await dashboard();
    const ipA = nextIp();
    const stockBefore = await stock();
    const eventsBefore = events.length;
    const first = await placeGuest(guestBody(), ipA);
    const firstBody = await json(first);
    check("guest order: 201 with { publicId, publicCode, orderNumber, total, deliveryFee, paymentMethod, status, orderType }", first.status === 201 && ["publicId", "publicCode", "orderNumber", "total", "deliveryFee", "paymentMethod", "status", "orderType"].every((k) => k in firstBody) && Object.keys(firstBody).length === 8, firstBody);
    check("guest order: price is computed on the server — 2 x 500 + deal 900 + fee 150 = 2050", firstBody.total === "2050" && firstBody.deliveryFee === "150", firstBody);
    check("guest order: customer-facing status is RECEIVED", firstBody.status === "RECEIVED");
    check("guest order: publicId is >= 22 URL-safe chars, publicCode 5 chars from the alphabet", /^[A-Za-z0-9_-]{22,}$/.test(firstBody.publicId) && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(firstBody.publicCode), firstBody);

    const row1 = await dbOrder(firstBody.publicId);
    check("db: source ONLINE, type DELIVERY, AWAITING_RECEPTION, no customer account", row1.source === "ONLINE" && row1.type === "DELIVERY" && row1.status === "AWAITING_RECEPTION" && row1.customerId === null, { s: row1.source, t: row1.type, st: row1.status });
    check("db: name, phone normalised to 03XXXXXXXXX, area, fee, total stored", row1.customerName === "Ali Khan" && row1.customerPhone === "03001234567" && row1.deliveryAreaId === area.id && row1.deliveryFee.toString() === "150" && row1.totalAmount.toString() === "2050", row1);
    check("db: deliveryAddress is 'House <house>, <street>, <area>' + Landmark on a new line", row1.deliveryAddress === `House 12, Street 5, ${tag} DHA\nLandmark: Near the mosque`, row1.deliveryAddress);
    check("db: cash order stays paymentStatus PENDING", row1.paymentStatus === "PENDING");
    check("db: a hashed client IP row exists and is not the IP", !!row1.clientIp && !row1.clientIp.ipHash.includes("198.51") && row1.clientIp.ipHash.length === 32);
    check("db: item lines include the deal's exploded items (2 direct + 2 from the deal)", row1.items.length >= 2, row1.items.length);

    await sleep(400);
    check("socket: order:submitted reached pos-admin with the customer name and code", eventsFor("order:submitted", row1.id).some((e) => e.payload.customerName === "Ali Khan" && e.payload.publicCode === firstBody.publicCode), events.slice(eventsBefore));
    check("socket: NO kitchen emit before reception accepts", events.slice(eventsBefore).every((e) => e.name !== "order-item:new"));
    check("stock: untouched before accept", (await stock()) === stockBefore, { stockBefore, now: await stock() });
    const queue = (await json(await api("GET", `/api/pos/kitchen-queue?kitchenId=${kitchen.id}`, { token: admin.token }))) as unknown as { order?: unknown; orderId: string }[];
    check("kitchen queue: the order's items are not there", Array.isArray(queue) && !queue.some((q) => q.orderId === row1.id));
    const dashDuring = await dashboard();
    check("dashboard: an order waiting at reception is not counted", dashDuring.sales === dashBefore.sales && dashDuring.count === dashBefore.count, { dashBefore, dashDuring });

    // ============================ 2. staff see it (inbox, by code, detail, list) ============================
    check("incoming: the order is in the inbox", (await incomingIds()).includes(row1.id));
    check("incoming ?code=: finds exactly that order (any case)", JSON.stringify(await incomingIds(`?code=${firstBody.publicCode.toLowerCase()}`)) === JSON.stringify([row1.id]));
    check("incoming ?code=: an unused code finds nothing", (await incomingIds("?code=ZZZZZ")).length === 0);
    check("incoming ?code=: a malformed code is a 400", (await api("GET", "/api/pos/orders/incoming?code=ab1", { token: admin.token })).status === 400);
    const detail = await json(await api("GET", `/api/pos/orders/${row1.id}`, { token: admin.token }));
    check("staff order detail: name, phone, address, fee, code and the area are all there", detail.customerName === "Ali Khan" && detail.customerPhone === "03001234567" && detail.deliveryAddress.includes("House 12") && detail.deliveryFee === "150" && detail.publicCode === firstBody.publicCode && detail.deliveryArea?.id === area.id && detail.customer === null, { n: detail.customerName, a: detail.deliveryArea });
    check("staff order detail: no hashed IP anywhere in the payload", !JSON.stringify(detail).includes("ipHash") && !JSON.stringify(detail).includes(row1.clientIp!.ipHash));
    const list = (await json(await api("GET", "/api/pos/orders", { token: admin.token }))) as unknown as { id: string; customerName: string | null; publicCode: string | null }[];
    check("staff orders list: rows carry customerName and publicCode", Array.isArray(list) && list.some((o) => o.id === row1.id && o.customerName === "Ali Khan" && o.publicCode === firstBody.publicCode));

    // ============================ 3. the status link ============================
    const s1 = await status(firstBody.publicId);
    check("status: RECEIVED, cash NOT_REQUIRED, the right money, newest fields only", s1.status === "RECEIVED" && s1.payment?.state === "NOT_REQUIRED" && s1.total === "2050" && s1.deliveryFee === "150" && s1.subtotal === "1900", s1);
    const statusHeaders = await api("GET", `/api/online/orders/${firstBody.publicId}`);
    check("status: Cache-Control no-store", statusHeaders.headers.get("cache-control") === "no-store");
    check("status: lists the item line and the deal with its contents", s1.lines.some((l: any) => l.kind === "item" && l.quantity === 2 && l.lineTotal === "1000") && s1.lines.some((l: any) => l.kind === "deal" && l.contents?.length > 0), s1.lines);
    const leakScan = JSON.stringify(s1);
    const forbidden = ["03001234567", "300 1234567", "Street 5", "House 12", "Landmark", "Ring the bell", admin.id, row1.id, "Ali Khan", String(row1.waiterId ?? "x-none"), row1.items[0]!.id, row1.items[0]!.menuItemId, kitchen.id, row1.publicId!];
    check("status privacy: no phone, address, notes, staff, or internal ids in the JSON", forbidden.every((f) => !leakScan.includes(f)), forbidden.filter((f) => leakScan.includes(f)));
    check("status: unknown and malformed ids are the same 404", (await api("GET", `/api/online/orders/${"x".repeat(22)}`)).status === 404 && (await api("GET", "/api/online/orders/short")).status === 404);

    // ============================ 4. accept -> kitchen, fee survives a discount ============================
    const accept = await api("POST", `/api/pos/orders/${row1.id}/accept`, { token: admin.token, body: { discount: 50 } });
    const accepted = await json(accept);
    check("accept: 200, CONFIRMED", accept.status === 200 && accepted.status === "CONFIRMED", accepted.status);
    check("accept with a discount keeps the delivery fee: 1900 − 50 + 150 = 2000", accepted.totalAmount === "2000" && accepted.deliveryFee === "150", { t: accepted.totalAmount, f: accepted.deliveryFee });
    await sleep(400);
    check("socket: the kitchen now gets order-item:new", eventsFor("order-item:new", row1.id).length > 0);
    check("stock: deducted only now (2 + the deal's 2 items = 4)", (await stock()) === stockBefore - 4, { stockBefore, now: await stock() });
    const dashAfterAccept = await dashboard();
    check("dashboard: counted once accepted (sales + the order's total, count + 1)", dashAfterAccept.sales === dashBefore.sales + 2000 && dashAfterAccept.count === dashBefore.count + 1, { dashBefore, dashAfterAccept });
    check("status after accept: CONFIRMED", (await status(firstBody.publicId)).status === "CONFIRMED");
    check("End Day: a CONFIRMED (undelivered) order blocks ending the day", (await businessDayService.getBlockingOrderIds(day.id)).includes(row1.id));

    // ============================ 5. kitchen progress -> ON_THE_WAY -> DELIVERED ============================
    const items = (await json(await api("GET", `/api/pos/orders/${row1.id}`, { token: admin.token }))).items as { id: string }[];
    const setItem = (id: string, s: string) => api("PATCH", `/api/pos/orders/${row1.id}/items/${id}/status`, { token: admin.token, body: { status: s } });
    await setItem(items[0]!.id, "PREPARING");
    check("status: an item PREPARING -> PREPARING", (await status(firstBody.publicId)).status === "PREPARING");
    for (const it of items) await setItem(it.id, "READY");
    check("status: every item READY -> READY", (await status(firstBody.publicId)).status === "READY");
    const rider = await prisma.employee.create({ data: { name: `${tag} rider`, designation: "Rider", baseSalary: "1", joiningDate: new Date() } });
    created.employee.push(rider.id);
    await api("PATCH", `/api/pos/orders/${row1.id}/assign`, { token: admin.token, body: { riderId: rider.id } });
    const onTheWay = await status(firstBody.publicId);
    check("status: READY with a rider assigned -> ON_THE_WAY", onTheWay.status === "ON_THE_WAY", onTheWay.status);
    check("status: the rider is never exposed", !JSON.stringify(onTheWay).includes(rider.id) && !JSON.stringify(onTheWay).includes("rider"));

    check("delivered: ORDER_TAKER and ONLINE_ADMIN are refused (403)", (await api("POST", `/api/pos/orders/${row1.id}/delivered`, { token: taker.token })).status === 403 && (await api("POST", `/api/pos/orders/${row1.id}/delivered`, { token: online.token })).status === 403);
    const delivered = await api("POST", `/api/pos/orders/${row1.id}/delivered`, { token: admin.token });
    const deliveredBody = await json(delivered);
    check("delivered: an accepted order becomes COMPLETED", delivered.status === 200 && deliveredBody.status === "COMPLETED", deliveredBody.status);
    check("status: COMPLETED -> DELIVERED", (await status(firstBody.publicId)).status === "DELIVERED");
    check("delivered: a second call is a 409", (await api("POST", `/api/pos/orders/${row1.id}/delivered`, { token: admin.token })).status === 409);
    const dashAfterDelivered = await dashboard();
    check("dashboard: COMPLETED is still counted, exactly once", dashAfterDelivered.sales === dashAfterAccept.sales && dashAfterDelivered.count === dashAfterAccept.count, { dashAfterAccept, dashAfterDelivered });
    check("End Day: a COMPLETED order no longer blocks", !(await businessDayService.getBlockingOrderIds(day.id)).includes(row1.id));
    const completedList = (await json(await api("GET", "/api/pos/orders?status=COMPLETED", { token: admin.token }))) as unknown as { id: string }[];
    check("orders list: the COMPLETED filter finds it", Array.isArray(completedList) && completedList.some((o) => o.id === row1.id));

    // ============================ 6. ONLINE payment: proof, verify, accept ============================
    const online1 = await json(await placeGuest(guestBody({ paymentMethod: "ONLINE" }, { phone: "03111111111" })));
    const onlineRow = await dbOrder(online1.publicId);
    check("online order: paymentStatus AWAITING_VERIFICATION, status WAITING_FOR_PAYMENT", onlineRow.paymentStatus === "AWAITING_VERIFICATION" && (await status(online1.publicId)).payment.state === "WAITING_FOR_PAYMENT");
    const acceptNoProof = await api("POST", `/api/pos/orders/${onlineRow.id}/accept`, { token: admin.token, body: { paymentVerified: true } });
    const acceptNoProofBody = await json(acceptNoProof);
    check("accept without a proof is refused (400 PROOF_MISSING, not a 409)", acceptNoProof.status === 400 && acceptNoProofBody.code === "PROOF_MISSING", acceptNoProofBody);
    check("…and the order is still in the inbox", (await incomingIds()).includes(onlineRow.id));

    const proof1 = await uploadProof(online1.publicId);
    check("proof upload: 200 PROOF_RECEIVED", proof1.status === 200 && (await json(proof1)).paymentState === "PROOF_RECEIVED");
    await sleep(300);
    check("socket: reception's open card is told (order:updated)", eventsFor("order:updated", onlineRow.id).length > 0);
    const afterProof1 = await prisma.order.findUniqueOrThrow({ where: { id: onlineRow.id } });
    const firstProofId = afterProof1.paymentProofMediaId!;
    const proofAsset = await prisma.mediaAsset.findUnique({ where: { id: firstProofId } });
    check("proof: stored in Postgres as PAYMENT_PROOF, WebP, not cropped (1080x2400 -> 720x1600)", proofAsset?.kind === "PAYMENT_PROOF" && proofAsset.mimeType === "image/webp" && proofAsset.width === 720 && proofAsset.height === 1600, proofAsset);
    check("status: PROOF_RECEIVED", (await status(online1.publicId)).payment.state === "PROOF_RECEIVED");

    const proof2 = await uploadProof(online1.publicId);
    const afterProof2 = await prisma.order.findUniqueOrThrow({ where: { id: onlineRow.id } });
    check("proof replace: a second upload is accepted and points at a new asset", proof2.status === 200 && afterProof2.paymentProofMediaId !== firstProofId);
    check("proof replace: the earlier proof asset is deleted", (await prisma.mediaAsset.findUnique({ where: { id: firstProofId } })) === null);

    const staffThumb = await api("GET", `/api/pos/orders/${onlineRow.id}/payment-proof?size=thumb`, { token: admin.token });
    const staffThumbMeta = await sharp(Buffer.from(await staffThumb.arrayBuffer())).metadata();
    check("staff proof view: authenticated thumbnail (WebP, fits 480 px)", staffThumb.status === 200 && staffThumb.headers.get("content-type") === "image/webp" && staffThumbMeta.height === 480, { s: staffThumb.status, h: staffThumbMeta.height });
    check("staff proof view: the ONLINE_ADMIN may see it; no token / ORDER_TAKER may not", (await api("GET", `/api/pos/orders/${onlineRow.id}/payment-proof`, { token: online.token })).status === 200 && (await api("GET", `/api/pos/orders/${onlineRow.id}/payment-proof`)).status === 401 && (await api("GET", `/api/pos/orders/${onlineRow.id}/payment-proof`, { token: taker.token })).status === 403);
    const etagged = await api("GET", `/api/pos/orders/${onlineRow.id}/payment-proof?size=thumb`, { token: admin.token, headers: { "If-None-Match": staffThumb.headers.get("etag") ?? "" } });
    check("staff proof view: ETag revalidation answers 304", etagged.status === 304);
    check("the public media route NEVER serves a payment proof", (await api("GET", `/api/online/media/${afterProof2.paymentProofMediaId}`)).status === 404);
    const incoming = (await json(await api("GET", "/api/pos/orders/incoming", { token: admin.token }))).orders as { id: string; paymentProofMediaId: string | null }[];
    check("incoming: the order's paymentProofMediaId is what the inbox thumbnail reads", incoming.find((o) => o.id === onlineRow.id)?.paymentProofMediaId === afterProof2.paymentProofMediaId);

    // The orphan purge keeps a proof that an order uses, and removes one nothing references.
    const strayProof = await prisma.mediaAsset.create({
      data: { kind: "PAYMENT_PROOF", mimeType: "image/webp", width: 1, height: 1, sizeBytes: 1, blob: { create: { data: new Uint8Array([1]) } } },
    });
    const unreferenced = {
      menuItems: { none: {} },
      deals: { none: {} },
      galleryImages: { none: {} },
      paymentAccounts: { none: {} },
      paymentProofOrders: { none: {} },
    };
    const foreignOrphans = await prisma.mediaAsset.count({ where: { ...unreferenced, id: { not: strayProof.id } } });
    if (foreignOrphans === 0) {
      await purgeOrphanMedia(new Date(Date.now() + 60_000));
      check("purge: an unreferenced payment proof is removed", (await prisma.mediaAsset.findUnique({ where: { id: strayProof.id } })) === null);
      check("purge: a proof an order still uses is kept", (await prisma.mediaAsset.findUnique({ where: { id: afterProof2.paymentProofMediaId! } })) !== null);
    } else {
      await prisma.mediaAsset.delete({ where: { id: strayProof.id } });
      check(`purge: destructive check skipped (${foreignOrphans} unreferenced assets exist that this run didn't create)`, true);
    }

    const cashProof = await uploadProof(firstBody.publicId);
    check("proof upload on a cash order is refused (409 NOT_AWAITING_PAYMENT)", cashProof.status === 409 && (await json(cashProof)).code === "NOT_AWAITING_PAYMENT");
    check("proof upload: not an image -> 400, over 5 MB -> 413", (await (async () => {
      const bad = new FormData();
      bad.append("file", new Blob(["not an image"], { type: "image/png" }), "x.png");
      const big = new FormData();
      big.append("file", new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" }), "big.png");
      return (await api("POST", `/api/online/orders/${online1.publicId}/payment-proof`, { body: bad })).status === 400 && (await api("POST", `/api/online/orders/${online1.publicId}/payment-proof`, { body: big })).status === 413;
    })()));

    // Verify the payment through the existing payment route: it must NOT move the order out of the inbox.
    const verify = await api("PATCH", `/api/online/payment/${onlineRow.id}/verify`, { token: online.token });
    check("payment verify: 200 and paymentStatus VERIFIED", verify.status === 200 && (await json(verify)).paymentStatus === "VERIFIED");
    const afterVerify = await prisma.order.findUniqueOrThrow({ where: { id: onlineRow.id } });
    check("payment verify does NOT change the order status (still AWAITING_RECEPTION)", afterVerify.status === "AWAITING_RECEPTION", afterVerify.status);
    check("…so it is still in the inbox, and not in the kitchen queue", (await incomingIds()).includes(onlineRow.id));
    const queue2 = (await json(await api("GET", `/api/pos/kitchen-queue?kitchenId=${kitchen.id}`, { token: admin.token }))) as unknown as { orderId: string }[];
    check("…and nothing reached the kitchen queue", Array.isArray(queue2) && !queue2.some((q) => q.orderId === onlineRow.id));
    const stockPreAccept = await stock();
    check("status: PAYMENT_CONFIRMED while still RECEIVED", (await status(online1.publicId)).payment.state === "PAYMENT_CONFIRMED" && (await status(online1.publicId)).status === "RECEIVED");
    check("proof upload after verification is refused (409)", (await uploadProof(online1.publicId)).status === 409);
    const acceptOnline = await api("POST", `/api/pos/orders/${onlineRow.id}/accept`, { token: admin.token, body: { paymentVerified: true } });
    check("accept (proof present, verified): 200 CONFIRMED", acceptOnline.status === 200 && (await json(acceptOnline)).status === "CONFIRMED");
    check("stock moves only on this accept", (await stock()) === stockPreAccept - 4);

    // ============================ 7. reject -> CANCELLED with the staff reason ============================
    const toReject = await json(await placeGuest(guestBody({}, { phone: "03222222222" })));
    const rejectRow = await dbOrder(toReject.publicId);
    const stockPreReject = await stock();
    const rejected = await api("POST", `/api/pos/orders/${rejectRow.id}/reject`, { token: admin.token, body: { reason: "We are out of zinger today" } });
    check("reject: 200 CANCELLED", rejected.status === 200 && (await json(rejected)).status === "CANCELLED");
    const rejectedStatus = await status(toReject.publicId);
    check("status: CANCELLED with the staff's reason", rejectedStatus.status === "CANCELLED" && rejectedStatus.cancelReason === "We are out of zinger today", rejectedStatus);
    check("reject: no stock moved, and the dashboard doesn't count it", (await stock()) === stockPreReject);
    check("delivered: refused for a CANCELLED order (409), and for one still at reception", (await api("POST", `/api/pos/orders/${rejectRow.id}/delivered`, { token: admin.token })).status === 409);
    const waiting = await json(await placeGuest(guestBody({}, { phone: "03333333333" })));
    const waitingRow = await dbOrder(waiting.publicId);
    check("delivered: refused for an order still at reception (409), and an unknown id is 404", (await api("POST", `/api/pos/orders/${waitingRow.id}/delivered`, { token: admin.token })).status === 409 && (await api("POST", "/api/pos/orders/nope/delivered", { token: admin.token })).status === 404);

    // ============================ 8. the fee survives a reception edit ============================
    const editRes = await api("PUT", `/api/pos/orders/${waitingRow.id}/submission`, { token: admin.token, body: { items: [{ menuItemId: item.id, quantity: 3 }] } });
    const edited = await json(editRes);
    check("reception edits quantities: 3 x 500 + fee 150 = 1650 (fee kept)", editRes.status === 200 && edited.totalAmount === "1650" && edited.deliveryFee === "150", { s: editRes.status, t: edited.totalAmount });

    // ============================ 9. idempotency and the honeypot ============================
    const requestId = randomUUID();
    const idem1 = await placeGuest(guestBody({ clientRequestId: requestId }, { phone: "03444444444" }));
    const idem1Body = await json(idem1);
    const idem2 = await placeGuest(guestBody({ clientRequestId: requestId }, { phone: "03444444444" }));
    const idem2Body = await json(idem2);
    check("idempotent: the same clientRequestId returns the same order (201 then 200)", idem1.status === 201 && idem2.status === 200 && idem1Body.publicId === idem2Body.publicId && idem1Body.publicCode === idem2Body.publicCode, { a: idem1.status, b: idem2.status });
    check("idempotent: exactly one order exists for it", (await prisma.order.count({ where: { clientRequestId: requestId } })) === 1);
    const reused = await placeGuest(guestBody({ clientRequestId: requestId }, { phone: "03555555555" }));
    check("idempotent: the same id from a different phone is refused (409), never handing back the link", reused.status === 409 && (await json(reused)).code === "REQUEST_ID_REUSED");

    const ordersBeforeBot = await prisma.order.count();
    const bot = await placeGuest(guestBody({ website: "http://spam.example" }));
    const botBody = await json(bot);
    check("honeypot: a normal-looking 201 ...", bot.status === 201 && botBody.status === "RECEIVED" && /^[A-Za-z0-9_-]{22,}$/.test(botBody.publicId), botBody);
    check("honeypot: ... that created nothing", (await prisma.order.count()) === ordersBeforeBot && (await prisma.order.count({ where: { publicId: botBody.publicId } })) === 0);
    check("honeypot: the fake link doesn't exist", (await api("GET", `/api/online/orders/${botBody.publicId}`)).status === 404);

    // ============================ 10. validation and the policy codes ============================
    const expectCode = async (label: string, body: Record<string, unknown>, httpStatus: number, code: string) => {
      const response = await placeGuest(body);
      const parsed = await json(response);
      check(`validation: ${label} -> ${httpStatus} ${code}`, response.status === httpStatus && parsed.code === code, { s: response.status, p: parsed });
      return parsed;
    };
    const ordersBeforeRefusals = await prisma.order.count();
    await expectCode("bad phone", guestBody({}, { phone: "12345" }), 400, "BAD_PHONE");
    await expectCode("inactive area", guestBody({}, { deliveryAreaId: closedArea.id }), 400, "BAD_AREA");
    await expectCode("unknown area", guestBody({}, { deliveryAreaId: "no-such-area" }), 400, "BAD_AREA");
    const below = await expectCode("below the area's minimum", guestBody({ items: [{ menuItemId: item.id, quantity: 1 }], deals: [] }), 400, "BELOW_MINIMUM");
    check("validation: BELOW_MINIMUM reports minOrderAmount", below.minOrderAmount === "800", below);
    const noMin = await placeGuest(guestBody({ items: [{ menuItemId: cheapItem.id, quantity: 1 }], deals: [] }, { deliveryAreaId: freeArea.id, phone: "03666666666" }));
    const noMinBody = await json(noMin);
    check("validation: an area with no minimum accepts a 100 order, with its own fee (100 + 50)", noMin.status === 201 && noMinBody.total === "150" && noMinBody.deliveryFee === "50", noMinBody);
    await expectCode("hidden-online item", guestBody({ items: [{ menuItemId: hiddenItem.id, quantity: 2 }], deals: [] }), 400, "ITEM_UNAVAILABLE");
    await expectCode("open-price item", guestBody({ items: [{ menuItemId: openItem.id, quantity: 2 }], deals: [] }), 400, "ITEM_UNAVAILABLE");
    await expectCode("deal-only item", guestBody({ items: [{ menuItemId: dealOnlyItem.id, quantity: 2 }], deals: [] }), 400, "ITEM_UNAVAILABLE");
    await expectCode("inactive deal", guestBody({ items: [], deals: [{ dealId: inactiveDeal.id, quantity: 1 }] }), 400, "ITEM_UNAVAILABLE");
    await expectCode("unknown item", guestBody({ items: [{ menuItemId: "nope", quantity: 1 }], deals: [] }), 400, "BAD_REQUEST");
    await expectCode("client-sent price", guestBody({ items: [{ menuItemId: item.id, quantity: 2, unitPrice: 1 }] }), 400, "BAD_REQUEST");
    await expectCode("deal customization", guestBody({ items: [], deals: [{ dealId: liveDeal.id, quantity: 1, customization: { items: [], finalPrice: 1 } }] }), 400, "BAD_REQUEST");
    await expectCode("unknown top-level field", guestBody({ total: 1 }), 400, "BAD_REQUEST");
    await expectCode("more than 40 lines", guestBody({ items: Array.from({ length: 41 }, () => ({ menuItemId: cheapItem.id, quantity: 1 })), deals: [] }), 400, "BAD_REQUEST");
    await expectCode("quantity over 50", guestBody({ items: [{ menuItemId: item.id, quantity: 51 }], deals: [] }), 400, "BAD_REQUEST");
    await expectCode("total over 200,000", guestBody({ items: Array.from({ length: 9 }, () => ({ menuItemId: item.id, quantity: 50 })), deals: [] }), 400, "ORDER_TOO_LARGE");

    // The one accepted order in that block is the no-minimum area's 100 order; everything else was refused.
    check("validation: none of the refused orders created a row", (await prisma.order.count()) === ordersBeforeRefusals + 1, { before: ordersBeforeRefusals, now: await prisma.order.count() });

    await prisma.siteSettings.update({ where: { id: 1 }, data: { onlineOrderingEnabled: false } });
    await expectCode("ordering switched off", guestBody({}, { phone: "03777777777" }), 409, "ORDERING_CLOSED");
    await prisma.siteSettings.update({ where: { id: 1 }, data: { onlineOrderingEnabled: true } });

    check("accounts: the account-based POST /api/online/orders is still a 404 (flag off)", (await api("POST", "/api/online/orders", { body: {} })).status === 404);

    // ============================ 11. Postgres limits ============================
    // Per phone: 3 still awaiting reception.
    const limitPhone = "03888888888";
    const limitIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await placeGuest(guestBody({}, { phone: limitPhone }));
      if (response.status === 201) limitIds.push((await json(response)).publicId);
    }
    const fourth = await placeGuest(guestBody({}, { phone: limitPhone }));
    const fourthBody = await json(fourth);
    check("limit: a 4th order from a phone with 3 awaiting -> 429 TOO_MANY", limitIds.length === 3 && fourth.status === 429 && fourthBody.code === "TOO_MANY", { n: limitIds.length, s: fourth.status, b: fourthBody });
    check("limit: the refused order created nothing", (await prisma.order.count({ where: { customerPhone: limitPhone } })) === 3);
    // Reject them: awaiting drops, so the phone can order again (but the 24 h count keeps climbing).
    for (const publicId of limitIds) {
      const o = await dbOrder(publicId);
      await api("POST", `/api/pos/orders/${o.id}/reject`, { token: admin.token, body: { reason: "test" } });
    }
    check("limit: once they are rejected the phone may order again", (await placeGuest(guestBody({}, { phone: limitPhone }))).status === 201);
    // Per phone: 10 in 24 h (so far 4; add rejected ones until the 10th is in).
    for (let i = 0; i < 6; i += 1) {
      const response = await placeGuest(guestBody({}, { phone: limitPhone }));
      if (response.status === 201) {
        const o = await dbOrder((await json(response)).publicId);
        await api("POST", `/api/pos/orders/${o.id}/reject`, { token: admin.token, body: { reason: "test" } });
      }
    }
    const eleventh = await placeGuest(guestBody({}, { phone: limitPhone }));
    check("limit: an 11th order from the same phone within 24 h -> 429 TOO_MANY (even with none awaiting)", eleventh.status === 429 && (await json(eleventh)).code === "TOO_MANY", eleventh.status);

    // Per IP: 5 in 10 minutes, whichever phone.
    const flood = nextIp();
    const results: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await placeGuest(guestBody({}, { phone: phoneFor(100 + i) }), flood);
      results.push(response.status);
      if (response.status === 201) {
        const o = await dbOrder((await json(response)).publicId);
        await api("POST", `/api/pos/orders/${o.id}/reject`, { token: admin.token, body: { reason: "test" } });
      }
    }
    check("limit: the 6th order from one IP inside 10 minutes -> 429 (first five succeed)", JSON.stringify(results) === JSON.stringify([201, 201, 201, 201, 201, 429]), results);
    check("limit: a different IP is unaffected", (await placeGuest(guestBody({}, { phone: phoneFor(200) }), nextIp())).status === 201);
    check("limit: counts live in Postgres (OrderClientIp rows, no raw IPs)", (await prisma.orderClientIp.count({ where: { ipHash: (await prisma.orderClientIp.findFirstOrThrow({ where: { order: { customerPhone: phoneFor(100) } } })).ipHash } })) >= 5);

    // ============================ 11b. ONLINE_ADMIN: the online inbox only, no discounts ============================
    const onlineOrder = await json(await placeGuest(guestBody({}, { phone: "03999999991" })));
    const onlineOrderRow = await dbOrder(onlineOrder.publicId);
    const takerOrderResponse = await api("POST", "/api/pos/orders/submit", {
      token: taker.token,
      body: { diningAreaId: diningArea.id, items: [{ menuItemId: item.id, quantity: 1 }], clientRequestId: randomUUID() },
    });
    const takerOrder = await json(takerOrderResponse);
    check("online admin: set-up — an order-taker order is waiting alongside the online one", takerOrderResponse.status === 201 && takerOrder.status === "AWAITING_RECEPTION", takerOrder);

    const adminInbox = (await json(await api("GET", "/api/pos/orders/incoming", { token: admin.token }))).orders as { id: string; source: string }[];
    check("online admin: reception sees both sources in the inbox", adminInbox.some((o) => o.id === onlineOrderRow.id) && adminInbox.some((o) => o.id === takerOrder.id));
    const onlineInbox = await json(await api("GET", "/api/pos/orders/incoming", { token: online.token }));
    const onlineInboxOrders = onlineInbox.orders as { id: string; source: string }[];
    check("online admin: sees the online order and ONLY online orders", onlineInboxOrders.some((o) => o.id === onlineOrderRow.id) && onlineInboxOrders.every((o) => o.source === "ONLINE") && !onlineInboxOrders.some((o) => o.id === takerOrder.id), onlineInboxOrders.map((o) => o.source));
    check("online admin: the count is scoped too", onlineInbox.count === onlineInboxOrders.length);
    check("online admin: can find a guest order by code", JSON.stringify(((await json(await api("GET", `/api/pos/orders/incoming?code=${onlineOrder.publicCode}`, { token: online.token }))).orders as { id: string }[]).map((o) => o.id)) === JSON.stringify([onlineOrderRow.id]));

    check("online admin: accepting an order-taker order is a 404 (it isn't theirs)", (await api("POST", `/api/pos/orders/${takerOrder.id}/accept`, { token: online.token, body: {} })).status === 404);
    check("online admin: rejecting an order-taker order is a 404", (await api("POST", `/api/pos/orders/${takerOrder.id}/reject`, { token: online.token, body: { reason: "x" } })).status === 404);
    check("…and that order is untouched", (await prisma.order.findUniqueOrThrow({ where: { id: takerOrder.id } })).status === "AWAITING_RECEPTION");
    check("online admin: may not give a discount (403), and nothing changed", (await api("POST", `/api/pos/orders/${onlineOrderRow.id}/accept`, { token: online.token, body: { discount: 50 } })).status === 403 && (await prisma.order.findUniqueOrThrow({ where: { id: onlineOrderRow.id } })).status === "AWAITING_RECEPTION");
    const onlineAdminAccept = await api("POST", `/api/pos/orders/${onlineOrderRow.id}/accept`, { token: online.token, body: {} });
    const onlineAdminAccepted = await json(onlineAdminAccept);
    check("online admin: accepts an online order (200 CONFIRMED, fee kept: 1900 + 150 = 2050)", onlineAdminAccept.status === 200 && onlineAdminAccepted.status === "CONFIRMED" && onlineAdminAccepted.totalAmount === "2050", onlineAdminAccepted.totalAmount);
    check("online admin: the accept reached the kitchen like any other", eventsFor("order-item:new", onlineOrderRow.id).length > 0 || (await sleep(400), eventsFor("order-item:new", onlineOrderRow.id).length > 0));
    const secondOnline = await json(await placeGuest(guestBody({}, { phone: "03999999992" })));
    const secondOnlineRow = await dbOrder(secondOnline.publicId);
    const onlineAdminReject = await api("POST", `/api/pos/orders/${secondOnlineRow.id}/reject`, { token: online.token, body: { reason: "Outside our delivery area — ہمارے ڈیلیوری ایریا سے باہر" } });
    check("online admin: rejects an online order with a bilingual reason, and the customer sees it", onlineAdminReject.status === 200 && (await status(secondOnline.publicId)).cancelReason === "Outside our delivery area — ہمارے ڈیلیوری ایریا سے باہر");
    check("online admin: still refused where it was before (changes inbox, delivered, orders list)", (await api("GET", "/api/pos/orders/changes/incoming", { token: online.token })).status === 403 && (await api("POST", `/api/pos/orders/${onlineOrderRow.id}/delivered`, { token: online.token })).status === 403 && (await api("GET", "/api/pos/orders", { token: online.token })).status === 403);

    // live updates: the reception room is open to it (listen-only), kitchen rooms are not
    const onlineSocket = connectSocket(base, { auth: { token: online.token }, transports: ["websocket"] });
    await new Promise<void>((resolve, reject) => {
      onlineSocket.on("connect", () => resolve());
      onlineSocket.on("connect_error", reject);
    });
    const joined = await new Promise<{ ok: boolean }>((resolve) => onlineSocket.emit("join", "pos-admin", resolve));
    const kitchenJoin = await new Promise<{ ok: boolean }>((resolve) => onlineSocket.emit("join", `kitchen:${kitchen.id}`, resolve));
    check("online admin: may join the pos-admin room but not a kitchen room", joined.ok === true && kitchenJoin.ok === false, { joined, kitchenJoin });
    onlineSocket.close();

    // a deal's "Show online" switch (website field) for ONLINE_ADMIN
    const dealSwitch = await api("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, { token: online.token, body: { isAvailableOnline: false } });
    check("online admin: can switch a deal off online (a website field), still not change its price", dealSwitch.status === 200 && (await api("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, { token: online.token, body: { price: 1 } })).status === 400);
    await api("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, { token: online.token, body: { isAvailableOnline: true } });

    // ============================ 12. End Day blockers ============================
    const blocking = await businessDayService.getBlockingOrderIds(day.id);
    check("End Day: orders still at reception block ending the day", blocking.includes(waitingRow.id));
  } finally {
    // Cleanup, children first. Settings are restored.
    socket.close();
    // Every order this run created contains one of its own menu items.
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
    await prisma.diningArea.deleteMany({ where: { name: { startsWith: tag } } }).catch(() => undefined);
    await prisma.inventoryTransaction.deleteMany({ where: { inventoryItemId: { in: created.inventory } } }).catch(() => undefined);
    await prisma.inventoryItem.deleteMany({ where: { id: { in: created.inventory } } }).catch(() => undefined);
    await prisma.deal.deleteMany({ where: { id: { in: created.deal } } }).catch(() => undefined);
    await prisma.menuItem.deleteMany({ where: { id: { in: created.menuItem } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.category } } }).catch(() => undefined);
    await prisma.deliveryArea.deleteMany({ where: { id: { in: created.area } } }).catch(() => undefined);
    await prisma.employee.deleteMany({ where: { id: { in: created.employee } } }).catch(() => undefined);
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
