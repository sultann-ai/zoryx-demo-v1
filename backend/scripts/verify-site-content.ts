// Verifies the customer-website content features against the real app (real middleware stack,
// real routes, real Postgres): media upload -> bytea -> public serving (headers, ETag/304), photo
// replacement deleting the old asset, role restrictions, the public store/menu/deals shapes (no
// leaks), and the active-row caps.
//
//   npx ts-node scripts/verify-site-content.ts            (flag state doesn't matter here)
//
// Refuses to run unless DATABASE_URL points at localhost. It creates temporary rows (all named
// VERIFY-<timestamp>) and removes them afterwards; site settings are restored to what they were.
import dotenv from "dotenv";
dotenv.config();

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

async function main() {
  const bcrypt = (await import("bcrypt")).default;
  const jwt = (await import("jsonwebtoken")).default;
  const sharp = (await import("sharp")).default;
  const { MediaKind, StaffRole } = await import("../generated/prisma/client");
  const { prisma } = await import("../src/config/prisma");
  const { app } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { purgeOrphanMedia } = await import("../src/modules/media/media.service");

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const stamp = Date.now();
  const tag = `VERIFY-${stamp}`;
  const created = {
    staff: [] as string[],
    media: [] as string[],
    kitchen: [] as string[],
    category: [] as string[],
    menuItem: [] as string[],
    deal: [] as string[],
    businessDay: [] as string[],
  };

  // Remember what site settings looked like so they can be put back exactly.
  const settingsBefore = await prisma.siteSettings.findUnique({ where: { id: 1 } });

  const makeStaff = async (role: (typeof StaffRole)[keyof typeof StaffRole], label: string) => {
    const staff = await prisma.staffUser.create({
      data: { name: `${tag} ${label}`, username: `${tag}-${label}`.toLowerCase(), passwordHash: await bcrypt.hash("verify-pass-123", 4), role },
    });
    created.staff.push(staff.id);
    return { id: staff.id, token: jwt.sign({ id: staff.id, role, kitchenId: null }, env.JWT_SECRET, { expiresIn: "30m" }) };
  };

  // Each phase uses its own fake client IP so no rate-limit bucket is shared.
  let ipCounter = 10;
  const nextIp = () => `198.51.100.${ipCounter++}`;
  const request = (method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "X-Forwarded-For": nextIp(),
        ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });

  const upload = async (token: string | undefined, kind: string | undefined, file: Buffer, mime = "image/png", name = "photo.png") => {
    const form = new FormData();
    if (kind !== undefined) form.append("kind", kind);
    form.append("file", new Blob([new Uint8Array(file)], { type: mime }), name);
    return request("POST", "/api/pos/media", token, form);
  };

  const photoPng = () => sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 210, g: 130, b: 40 } } }).png().toBuffer();
  const qrPng = () => sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();

  const uploadOk = async (token: string, kind: string, file?: Buffer) => {
    const response = await upload(token, kind, file ?? (kind === "PAYMENT_QR" ? await qrPng() : await photoPng()));
    const body = (await response.json()) as { id?: string; [key: string]: unknown };
    if (body.id) created.media.push(body.id);
    return { response, body };
  };

  const FORBIDDEN_KEYS = ["createdById", "createdAt", "updatedAt", "isActive", "mediaId", "qrMediaId", "onlineOrderingEnabled", "kitchenId", "isAvailableInPOS", "minPrice", "maxPrice", "isOpenPrice", "sellableAlone", "passwordHash", "blob", "cost"];
  const leaks = (value: unknown) => {
    const json = JSON.stringify(value);
    return FORBIDDEN_KEYS.filter((key) => json.includes(`"${key}"`));
  };

  try {
    const admin = await makeStaff(StaffRole.SUPER_ADMIN, "admin");
    const online = await makeStaff(StaffRole.ONLINE_ADMIN, "online");
    const taker = await makeStaff(StaffRole.ORDER_TAKER, "taker");
    const kitchenStaff = await makeStaff(StaffRole.KITCHEN, "kitchen");
    console.log(`TRUST_PROXY_HOPS=${env.TRUST_PROXY_HOPS}\n`);

    // ============================ media upload ============================
    const first = await uploadOk(online.token, "MENU_ITEM");
    check("upload: ONLINE_ADMIN can upload a menu photo (201)", first.response.status === 201, first.body);
    check("upload: photo is 1000x750 WebP", first.body.width === 1000 && first.body.height === 750 && first.body.mimeType === "image/webp", first.body);
    const urls = first.body.urls as { thumb: string; full: string } | undefined;
    check("upload: response carries relative thumb/full URLs", urls?.thumb === `/api/online/media/${first.body.id}?size=thumb` && urls?.full.endsWith("size=full"), urls ?? "");
    const blob = await prisma.mediaBlob.findUnique({ where: { id: first.body.id as string }, select: { data: true, thumb: true } });
    check("upload: bytes live in MediaBlob (same id), thumb present", !!blob && blob.data.length === first.body.sizeBytes && !!blob.thumb, { size: blob?.data.length });
    const stored = await prisma.mediaAsset.findUnique({ where: { id: first.body.id as string } });
    check("upload: createdById is the uploading staff member", stored?.createdById === online.id);
    const storedMeta = await sharp(Buffer.from(blob!.data)).metadata();
    check("upload: stored image has no EXIF/ICC metadata", !storedMeta.exif && !storedMeta.icc);

    check("upload: no token -> 401", (await upload(undefined, "MENU_ITEM", await photoPng())).status === 401);
    check("upload: ORDER_TAKER -> 403", (await upload(taker.token, "MENU_ITEM", await photoPng())).status === 403);
    check("upload: KITCHEN -> 403", (await upload(kitchenStaff.token, "MENU_ITEM", await photoPng())).status === 403);
    check("upload: kind PAYMENT_PROOF is refused (400)", (await upload(admin.token, "PAYMENT_PROOF", await photoPng())).status === 400);
    check("upload: missing kind -> 400", (await upload(admin.token, undefined, await photoPng())).status === 400);
    const noFile = new FormData();
    noFile.append("kind", "MENU_ITEM");
    check("upload: missing file -> 400", (await request("POST", "/api/pos/media", admin.token, noFile)).status === 400);
    const fakePng = await upload(admin.token, "MENU_ITEM", Buffer.from("this is definitely not an image"));
    check("upload: text declared as image/png -> clean 400", fakePng.status === 400, await fakePng.text());
    const svgPng = await upload(admin.token, "MENU_ITEM", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>'));
    check("upload: SVG declared as image/png -> 400", svgPng.status === 400);
    const badMime = await upload(admin.token, "MENU_ITEM", await photoPng(), "text/html", "x.html");
    check("upload: declared text/html -> 400", badMime.status === 400);
    const tooBig = await upload(admin.token, "MENU_ITEM", Buffer.alloc(9 * 1024 * 1024, 1));
    check("upload: over 8 MB -> 413", tooBig.status === 413, tooBig.status);
    const gifUpload = await upload(admin.token, "MENU_ITEM", await sharp({ create: { width: 30, height: 30, channels: 3, background: "#fff" } }).gif().toBuffer(), "image/png");
    check("upload: real GIF disguised as image/png -> 400 (real format is checked)", gifUpload.status === 400);

    const qr = await uploadOk(admin.token, "PAYMENT_QR");
    check("upload: QR is kept as PNG, not cropped", qr.response.status === 201 && qr.body.mimeType === "image/png" && qr.body.width === 400 && qr.body.height === 400, qr.body);
    const qrBlob = await prisma.mediaBlob.findUnique({ where: { id: qr.body.id as string }, select: { thumb: true } });
    check("upload: QR has no thumbnail", qrBlob?.thumb === null);

    // ============================ public serving ============================
    const id = first.body.id as string;
    const thumb = await request("GET", `/api/online/media/${id}?size=thumb`, undefined, undefined, { Origin: "http://localhost:5173" });
    const thumbBytes = Buffer.from(await thumb.arrayBuffer());
    check("serve: thumb is public (200) and decodes to 480x360 WebP", thumb.status === 200 && (await sharp(thumbBytes).metadata()).width === 480, thumb.status);
    check("serve: Content-Type image/webp", thumb.headers.get("content-type") === "image/webp", String(thumb.headers.get("content-type")));
    check("serve: Cache-Control public, immutable, one year", thumb.headers.get("cache-control") === "public, max-age=31536000, immutable", String(thumb.headers.get("cache-control")));
    check("serve: strong ETag derived from id and size", thumb.headers.get("etag") === `"${id}-thumb"`, String(thumb.headers.get("etag")));
    check("serve: CORP is cross-origin for this route", thumb.headers.get("cross-origin-resource-policy") === "cross-origin");
    check("serve: CORS header present for an allowed origin", thumb.headers.get("access-control-allow-origin") === "http://localhost:5173", String(thumb.headers.get("access-control-allow-origin")));
    check("serve: Content-Length matches the body", Number(thumb.headers.get("content-length")) === thumbBytes.length);
    check("serve: nosniff", thumb.headers.get("x-content-type-options") === "nosniff");

    const full = await request("GET", `/api/online/media/${id}`);
    const fullMeta = await sharp(Buffer.from(await full.arrayBuffer())).metadata();
    check("serve: default size is full (1000x750)", full.status === 200 && fullMeta.width === 1000 && fullMeta.height === 750);

    const revalidate = await request("GET", `/api/online/media/${id}?size=thumb`, undefined, undefined, { "If-None-Match": `"${id}-thumb"` });
    check("serve: matching If-None-Match -> 304 with no body", revalidate.status === 304 && (await revalidate.text()) === "");
    check("serve: 304 still carries cache headers", revalidate.headers.get("cache-control") === "public, max-age=31536000, immutable" && revalidate.headers.get("etag") === `"${id}-thumb"`);
    const otherTag = await request("GET", `/api/online/media/${id}?size=thumb`, undefined, undefined, { "If-None-Match": `"${id}-full"` });
    check("serve: a different ETag does not 304", otherTag.status === 200);
    check("serve: unknown id -> 404", (await request("GET", "/api/online/media/does-not-exist")).status === 404);
    check("serve: bad size -> 400", (await request("GET", `/api/online/media/${id}?size=huge`)).status === 400);

    const qrThumb = await request("GET", `/api/online/media/${qr.body.id}?size=thumb`);
    check("serve: QR thumb request falls back to the full PNG", qrThumb.status === 200 && qrThumb.headers.get("content-type") === "image/png");

    const proof = await prisma.mediaAsset.create({
      data: { kind: MediaKind.PAYMENT_PROOF, mimeType: "image/webp", width: 10, height: 10, sizeBytes: 3, blob: { create: { data: new Uint8Array([1, 2, 3]) } } },
    });
    created.media.push(proof.id);
    check("serve: PAYMENT_PROOF is never public (404, both sizes)", (await request("GET", `/api/online/media/${proof.id}`)).status === 404 && (await request("GET", `/api/online/media/${proof.id}?size=thumb`)).status === 404);

    // ============================ catalog fixtures ============================
    const kitchen = await prisma.kitchen.create({ data: { name: tag } });
    created.kitchen.push(kitchen.id);
    const category = await prisma.category.create({ data: { name: tag, nameUr: "ویریفائی", sortOrder: 5 } });
    created.category.push(category.id);
    const mkItem = async (over: Record<string, unknown>) => {
      const item = await prisma.menuItem.create({
        data: { name: `${tag} ${over.name ?? "item"}`, slug: `${tag}-${over.name ?? "item"}`.toLowerCase(), kitchenId: kitchen.id, categoryId: category.id, ...over, ...(over.name ? { name: `${tag} ${over.name}` } : {}) } as never,
      });
      created.menuItem.push(item.id);
      return item;
    };
    const normal = await mkItem({ name: "normal", price: "120.00", nameUr: "عام", isFeatured: true });
    const sized = await mkItem({ name: "sized", price: null });
    await prisma.menuItemVariant.createMany({
      data: [
        { menuItemId: sized.id, label: "Small", price: "100.00", sortOrder: 1 },
        { menuItemId: sized.id, label: "Unpriced", price: null, sortOrder: 2 },
      ],
    });
    const hidden = await mkItem({ name: "hidden", price: "50.00", isAvailableOnline: false });
    const openPrice = await mkItem({ name: "open", price: null, isOpenPrice: true });
    const dealOnly = await mkItem({ name: "dealonly", price: null, sellableAlone: false, minPrice: null });
    const posOnly = await mkItem({ name: "posonly", price: "75.00", isAvailableInPOS: false });

    const mkDeal = async (name: string, over: Record<string, unknown>) => {
      const deal = await prisma.deal.create({
        data: { name: `${tag} ${name}`, code: `${tag}-${name}`.toUpperCase(), price: "999.00", ...over, items: { create: [{ menuItemId: normal.id, quantity: 2 }] } } as never,
      });
      created.deal.push(deal.id);
      return deal;
    };
    const liveDeal = await mkDeal("live", { nameUr: "ڈیل" });
    const inactiveDeal = await mkDeal("inactive", { isActive: false });
    const posDeal = await mkDeal("posdeal", { isAvailableOnline: false });

    // ============================ photo attach / replace ============================
    const patchItem = (token: string, itemId: string, body: unknown) => request("PATCH", `/api/pos/menu/${itemId}/online-content`, token, body);

    const attached = await patchItem(online.token, normal.id, { imageId: id, nameUr: "دودھ پتی", descriptionUr: "کڑک", isFeatured: true });
    const attachedBody = (await attached.json()) as { imageId?: string; image?: { full: string } };
    check("item: ONLINE_ADMIN sets photo + Urdu text (200)", attached.status === 200 && attachedBody.imageId === id && !!attachedBody.image, attachedBody);

    const wrongKind = await patchItem(online.token, normal.id, { imageId: qr.body.id });
    check("item: a QR asset can't be a menu photo (400)", wrongKind.status === 400, await wrongKind.text());
    check("item: an unknown imageId is refused (400)", (await patchItem(online.token, normal.id, { imageId: "nope" })).status === 400);
    check("item: ONLINE_ADMIN sending a price is refused (400)", (await patchItem(online.token, normal.id, { price: 1 })).status === 400);
    check("item: ONLINE_ADMIN sending kitchenId is refused (400)", (await patchItem(online.token, normal.id, { kitchenId: kitchen.id })).status === 400);
    check("item: ONLINE_ADMIN cannot use the full PUT (403)", (await request("PUT", `/api/pos/menu/${normal.id}`, online.token, { price: 1 })).status === 403);
    check("item: ORDER_TAKER cannot patch online content (403)", (await patchItem(taker.token, normal.id, { nameUr: "x" })).status === 403);
    check("item: unknown id -> 404", (await patchItem(online.token, "missing-item", { nameUr: "x" })).status === 404);
    const priceUnchanged = await prisma.menuItem.findUnique({ where: { id: normal.id }, select: { price: true, kitchenId: true } });
    check("item: price and kitchen untouched by all of the above", priceUnchanged?.price?.toString() === "120" && priceUnchanged.kitchenId === kitchen.id);

    // Replace the photo: the old asset must be gone, the new one live, in one transaction.
    const second = await uploadOk(online.token, "MENU_ITEM");
    const replaced = await patchItem(online.token, normal.id, { imageId: second.body.id });
    check("replace: new photo attached (200)", replaced.status === 200);
    check("replace: the OLD asset is deleted (row and bytes)", (await prisma.mediaAsset.findUnique({ where: { id } })) === null && (await prisma.mediaBlob.findUnique({ where: { id } })) === null);
    check("replace: the old image URL now 404s", (await request("GET", `/api/online/media/${id}`)).status === 404);
    check("replace: the new image serves", (await request("GET", `/api/online/media/${second.body.id}`)).status === 200);

    // A photo shared by two items must survive one of them changing.
    await patchItem(online.token, sized.id, { imageId: second.body.id });
    const third = await uploadOk(online.token, "MENU_ITEM");
    await patchItem(online.token, normal.id, { imageId: third.body.id });
    check("replace: a photo still used by another item is NOT deleted", (await prisma.mediaAsset.findUnique({ where: { id: second.body.id as string } })) !== null);
    await patchItem(online.token, sized.id, { imageId: null });
    check("replace: clearing the last reference deletes the asset", (await prisma.mediaAsset.findUnique({ where: { id: second.body.id as string } })) === null);

    // Deals and categories.
    const dealImage = await uploadOk(admin.token, "DEAL");
    const dealPatch = await request("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, online.token, { imageId: dealImage.body.id, nameUr: "فیملی ڈیل", descriptionUr: "وضاحت" });
    check("deal: ONLINE_ADMIN sets photo + Urdu text (200)", dealPatch.status === 200);
    check("deal: ONLINE_ADMIN sending a price is refused (400)", (await request("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, online.token, { price: 1 })).status === 400);
    check("deal: ONLINE_ADMIN cannot use the full PUT (403)", (await request("PUT", `/api/pos/deals/${liveDeal.id}`, online.token, { price: 1 })).status === 403);
    check("deal: a menu photo can't be used on a deal (400)", (await request("PATCH", `/api/pos/deals/${liveDeal.id}/online-content`, online.token, { imageId: third.body.id })).status === 400);
    const catPatch = await request("PATCH", `/api/pos/categories/${category.id}/online-content`, online.token, { nameUr: "ویریفائی چائے", sortOrder: 7 });
    check("category: ONLINE_ADMIN sets nameUr and sortOrder (200)", catPatch.status === 200);
    check("category: ONLINE_ADMIN cannot rename it (400) or use the full PUT (403)", (await request("PATCH", `/api/pos/categories/${category.id}/online-content`, online.token, { name: "x" })).status === 400 && (await request("PUT", `/api/pos/categories/${category.id}`, online.token, { name: "x" })).status === 403);

    // ============================ public menu + deals ============================
    const menuResponse = await request("GET", "/api/online/menu");
    const menu = (await menuResponse.json()) as { categories: { id: string; nameUr: string | null; sortOrder: number }[]; items: Record<string, any>[] };
    const byId = (id2: string) => menu.items.find((entry) => entry.id === id2);
    check("menu: public 200 with Cache-Control public, max-age=60", menuResponse.status === 200 && menuResponse.headers.get("cache-control") === "public, max-age=60", String(menuResponse.headers.get("cache-control")));
    check("menu: envelope { categories, items }", Array.isArray(menu.categories) && Array.isArray(menu.items));
    check("menu: normal item present with Urdu name, image URLs, featured, orderable", !!byId(normal.id) && byId(normal.id)!.nameUr === "دودھ پتی" && byId(normal.id)!.image?.full.includes(third.body.id as string) && byId(normal.id)!.isFeatured === true && byId(normal.id)!.orderable === true, byId(normal.id));
    check("menu: item without a photo has image: null", byId(sized.id)?.image === null);
    check("menu: unavailable-online item is absent", !byId(hidden.id));
    check("menu: open-price item is absent", !byId(openPrice.id));
    check("menu: deal-only item is listed but orderable: false", byId(dealOnly.id)?.orderable === false);
    check("menu: POS-only flag doesn't hide an online item, and isn't exposed", !!byId(posOnly.id) && !("isAvailableInPOS" in byId(posOnly.id)!));
    check("menu: sized item lists only priced sizes", JSON.stringify(byId(sized.id)?.variants.map((v: any) => v.label)) === '["Small"]', byId(sized.id)?.variants);
    check("menu: money is a string", typeof byId(normal.id)?.price === "string");
    const menuCategory = menu.categories.find((entry) => entry.id === category.id);
    check("menu: category has Urdu name and sortOrder", menuCategory?.nameUr === "ویریفائی چائے" && menuCategory.sortOrder === 7, menuCategory);
    check("menu: categories are in sortOrder", menu.categories.every((entry, index, all) => index === 0 || all[index - 1]!.sortOrder <= entry.sortOrder));
    check("menu: no staff/cost fields anywhere in the JSON", leaks(menu).length === 0, leaks(menu));

    const dealsResponse = await request("GET", "/api/online/deals");
    const deals = (await dealsResponse.json()) as Record<string, any>[];
    const dealById = (id2: string) => deals.find((entry) => entry.id === id2);
    check("deals: public 200 with Cache-Control max-age=60", dealsResponse.status === 200 && dealsResponse.headers.get("cache-control") === "public, max-age=60");
    check("deals: live deal has Urdu name, image URLs and orderable", dealById(liveDeal.id)?.nameUr === "فیملی ڈیل" && !!dealById(liveDeal.id)?.image && dealById(liveDeal.id)?.orderable === true, dealById(liveDeal.id));
    check("deals: inactive deal is absent (new isActive filter)", !dealById(inactiveDeal.id));
    check("deals: not-online deal is absent", !dealById(posDeal.id));
    check("deals: no staff/cost fields anywhere in the JSON", leaks(deals).length === 0, leaks(deals));

    // ============================ site settings / store ============================
    check("settings: ORDER_TAKER cannot read (403)", (await request("GET", "/api/pos/site-settings", taker.token)).status === 403);
    check("settings: invalid WhatsApp number -> 400", (await request("PUT", "/api/pos/site-settings", online.token, { whatsappNumber: "+92 300" })).status === 400);
    check("settings: javascript: map URL -> 400", (await request("PUT", "/api/pos/site-settings", online.token, { mapUrl: "javascript:alert(1)" })).status === 400);
    check("settings: empty body -> 400", (await request("PUT", "/api/pos/site-settings", online.token, {})).status === 400);
    const settingsPut = await request("PUT", "/api/pos/site-settings", online.token, {
      shopNameEn: `${tag} Shop`,
      announcementEn: `${tag} sale`,
      announcementUr: "سیل",
      whatsappNumber: "923001234567",
      facebookUrl: "https://facebook.com/verify",
      onlineOrderingEnabled: true,
    });
    check("settings: ONLINE_ADMIN updates them (200)", settingsPut.status === 200, await settingsPut.clone().text());
    check("settings: GET returns the new values", ((await (await request("GET", "/api/pos/site-settings", admin.token)).json()) as { shopNameEn: string }).shopNameEn === `${tag} Shop`);

    // Delivery areas: ONLINE_ADMIN may manage them including fees (per the agreed answer).
    const area1 = await request("POST", "/api/pos/delivery-areas", online.token, { nameEn: `${tag} DHA`, nameUr: "ڈی ایچ اے", deliveryFee: "150.50", minOrderAmount: 800, sortOrder: 2 });
    const area1Body = (await area1.json()) as { id?: string; deliveryFee?: string };
    check("delivery: ONLINE_ADMIN creates an area with a fee (201)", area1.status === 201 && area1Body.deliveryFee === "150.5", area1Body);
    const area2 = await request("POST", "/api/pos/delivery-areas", admin.token, { nameEn: `${tag} Gulberg`, nameUr: "گلبرگ", sortOrder: 1 });
    const area2Body = (await area2.json()) as { id: string; deliveryFee: string; minOrderAmount: string };
    check("delivery: fee and minimum default to 0", area2.status === 201 && area2Body.deliveryFee === "0" && area2Body.minOrderAmount === "0", area2Body);
    check("delivery: negative fee -> 400", (await request("POST", "/api/pos/delivery-areas", admin.token, { nameEn: "x", nameUr: "x", deliveryFee: -5 })).status === 400);
    const area3 = await request("POST", "/api/pos/delivery-areas", admin.token, { nameEn: `${tag} Off`, nameUr: "بند", isActive: false });
    const area3Body = (await area3.json()) as { id: string };
    const areaUpdate = await request("PUT", `/api/pos/delivery-areas/${area2Body.id}`, online.token, { deliveryFee: "99" });
    check("delivery: ONLINE_ADMIN edits a fee (200)", areaUpdate.status === 200);

    // Payment account + QR, gallery, testimonials.
    const accountQr = await uploadOk(online.token, "PAYMENT_QR");
    const account = await request("POST", "/api/pos/payment-accounts", online.token, { label: `${tag} Easypaisa`, accountTitle: "Zoryx", accountNumber: "0300-1234567", qrMediaId: accountQr.body.id });
    const accountBody = (await account.json()) as { id: string; qrUrl: string };
    check("payment: account with QR created, QR URL returned", account.status === 201 && accountBody.qrUrl.includes(accountQr.body.id as string), accountBody);
    const wrongQr = await request("POST", "/api/pos/payment-accounts", online.token, { label: "x", accountTitle: "x", accountNumber: "x", qrMediaId: third.body.id });
    check("payment: a menu photo can't be a QR (400)", wrongQr.status === 400);

    const galleryMedia = await uploadOk(online.token, "GALLERY");
    const galleryRow = await request("POST", "/api/pos/gallery", online.token, { mediaId: galleryMedia.body.id, captionEn: `${tag} inside`, captionUr: "اندر", sortOrder: 1 });
    const galleryBody = (await galleryRow.json()) as { id: string; image: { full: string } };
    check("gallery: image added, URLs returned", galleryRow.status === 201 && galleryBody.image.full.includes(galleryMedia.body.id as string), galleryBody);
    const testimonial = await request("POST", "/api/pos/testimonials", online.token, { name: `${tag} Ali`, area: "DHA", text: "Great chai", textUr: "بہترین", rating: 5, sortOrder: 1 });
    const testimonialBody = (await testimonial.json()) as { id: string };
    check("testimonial: created (201)", testimonial.status === 201);
    check("testimonial: rating 6 -> 400", (await request("POST", "/api/pos/testimonials", online.token, { name: "x", text: "x", rating: 6 })).status === 400);
    const hiddenTestimonial = await request("POST", "/api/pos/testimonials", online.token, { name: `${tag} Hidden`, text: "hidden", isActive: false });
    check("testimonial: inactive one created", hiddenTestimonial.status === 201);

    // Business day state drives orderingOpen.
    const existingDay = await prisma.businessDay.findFirst({ where: { isActive: true } });
    const storeAt = async () => {
      const response = await request("GET", "/api/online/store");
      return { response, body: (await response.json()) as Record<string, any> };
    };
    let { response: storeResponse, body: store } = await storeAt();
    check("store: public 200 with Cache-Control public, max-age=60", storeResponse.status === 200 && storeResponse.headers.get("cache-control") === "public, max-age=60", String(storeResponse.headers.get("cache-control")));
    check("store: settings are whitelisted (new values, no id/timestamps)", store.settings.shopNameEn === `${tag} Shop` && !("id" in store.settings) && !("updatedAt" in store.settings));
    check("store: active delivery areas in sortOrder, inactive omitted", JSON.stringify(store.deliveryAreas.filter((a: any) => a.nameEn.startsWith(tag)).map((a: any) => a.nameEn)) === JSON.stringify([`${tag} Gulberg`, `${tag} DHA`]), store.deliveryAreas);
    check("store: delivery fee/minimum are strings", store.deliveryAreas.every((a: any) => typeof a.deliveryFee === "string" && typeof a.minOrderAmount === "string"));
    check("store: payment account carries its QR URL", store.paymentAccounts.some((a: any) => a.accountNumber === "0300-1234567" && a.qrUrl.includes(accountQr.body.id)));
    check("store: gallery entry with image URLs", store.gallery.some((g: any) => g.captionEn === `${tag} inside` && g.image.thumb.includes(galleryMedia.body.id)));
    check("store: only the active testimonial is shown", store.testimonials.some((t: any) => t.name === `${tag} Ali`) && !store.testimonials.some((t: any) => t.name === `${tag} Hidden`));
    check("store: no staff/internal fields anywhere in the JSON", leaks(store).length === 0, leaks(store));

    if (existingDay) {
      check("store: with a real business day active, ordering is open", store.orderingOpen === true && store.closedReason === null, { orderingOpen: store.orderingOpen });
    } else {
      check("store: no business day -> closed with no_business_day", store.orderingOpen === false && store.closedReason === "no_business_day", store);
      const day = await prisma.businessDay.create({ data: { label: tag, startedAt: new Date(), openedById: admin.id } });
      created.businessDay.push(day.id);
      ({ body: store } = await storeAt());
      check("store: business day active -> open", store.orderingOpen === true && store.closedReason === null, store);
    }
    await request("PUT", "/api/pos/site-settings", online.token, { onlineOrderingEnabled: false });
    ({ body: store } = await storeAt());
    check("store: switched off -> closed with switched_off (even with a business day)", store.orderingOpen === false && store.closedReason === "switched_off", store);
    await request("PUT", "/api/pos/site-settings", online.token, { onlineOrderingEnabled: true });

    // Deleting rows releases their media; a shared asset stays.
    const galleryDelete = await request("DELETE", `/api/pos/gallery/${galleryBody.id}`, online.token);
    check("gallery: delete -> 204 and its image is deleted too", galleryDelete.status === 204 && (await prisma.mediaAsset.findUnique({ where: { id: galleryMedia.body.id as string } })) === null);
    const accountDelete = await request("DELETE", `/api/pos/payment-accounts/${accountBody.id}`, online.token);
    check("payment: delete -> 204 and its QR is deleted too", accountDelete.status === 204 && (await prisma.mediaAsset.findUnique({ where: { id: accountQr.body.id as string } })) === null);
    check("delivery: delete works while nothing references the area (204)", (await request("DELETE", `/api/pos/delivery-areas/${area3Body.id}`, online.token)).status === 204);
    check("delivery: deleting an unknown area -> 404", (await request("DELETE", "/api/pos/delivery-areas/missing", online.token)).status === 404);
    await request("DELETE", `/api/pos/testimonials/${testimonialBody.id}`, online.token);
    const hiddenId = ((await prisma.testimonial.findFirst({ where: { name: `${tag} Hidden` } })) ?? { id: "" }).id;
    await request("DELETE", `/api/pos/testimonials/${hiddenId}`, online.token);

    // ============================ caps (active rows only) ============================
    type Cap = { name: string; path: string; cap: number; model: "deliveryArea" | "paymentAccount" | "galleryImage" | "testimonial"; body: (n: number) => Record<string, unknown> };
    const capMedia = await uploadOk(admin.token, "GALLERY");
    const caps: Cap[] = [
      { name: "delivery areas", path: "delivery-areas", cap: 30, model: "deliveryArea", body: (n) => ({ nameEn: `${tag} cap${n}`, nameUr: "ک" }) },
      { name: "payment accounts", path: "payment-accounts", cap: 4, model: "paymentAccount", body: (n) => ({ label: `${tag} cap${n}`, accountTitle: "t", accountNumber: "n" }) },
      { name: "gallery images", path: "gallery", cap: 24, model: "galleryImage", body: () => ({ mediaId: capMedia.body.id }) },
      { name: "testimonials", path: "testimonials", cap: 12, model: "testimonial", body: (n) => ({ name: `${tag} cap${n}`, text: "t" }) },
    ];
    const capIds: Record<string, string[]> = {};
    for (const cap of caps) {
      const delegate = prisma[cap.model] as unknown as { count: (a: unknown) => Promise<number>; deleteMany: (a: unknown) => Promise<unknown> };
      const activeBefore = await delegate.count({ where: { isActive: true } });
      const room = cap.cap - activeBefore;
      if (room < 0) {
        check(`cap ${cap.cap}: ${cap.name} — skipped (database already over the cap)`, true);
        continue;
      }
      capIds[cap.path] = [];
      let allOk = true;
      for (let n = 0; n < room; n += 1) {
        const response = await request("POST", `/api/pos/${cap.path}`, admin.token, cap.body(n));
        const body = (await response.json()) as { id?: string };
        if (response.status !== 201 || !body.id) allOk = false;
        else capIds[cap.path]!.push(body.id);
      }
      check(`cap ${cap.cap}: ${cap.name} fill up to the cap (${room} created)`, allOk);
      const over = await request("POST", `/api/pos/${cap.path}`, admin.token, cap.body(999));
      check(`cap ${cap.cap}: ${cap.name} — one more active -> 409`, over.status === 409, await over.text());
      const inactive = await request("POST", `/api/pos/${cap.path}`, admin.token, { ...cap.body(998), isActive: false });
      const inactiveBody = (await inactive.json()) as { id?: string };
      if (inactiveBody.id) capIds[cap.path]!.push(inactiveBody.id);
      check(`cap ${cap.cap}: ${cap.name} — an inactive one is still allowed (201)`, inactive.status === 201);
      if (inactiveBody.id) {
        const reactivate = await request("PUT", `/api/pos/${cap.path}/${inactiveBody.id}`, admin.token, { isActive: true });
        check(`cap ${cap.cap}: ${cap.name} — re-activating at the cap -> 409`, reactivate.status === 409);
      }
      if (capIds[cap.path]![0]) {
        await request("PUT", `/api/pos/${cap.path}/${capIds[cap.path]![0]}`, admin.token, { isActive: false });
        const afterDeactivate = await request("POST", `/api/pos/${cap.path}`, admin.token, cap.body(997));
        const afterBody = (await afterDeactivate.json()) as { id?: string };
        if (afterBody.id) capIds[cap.path]!.push(afterBody.id);
        check(`cap ${cap.cap}: ${cap.name} — deactivating one frees a slot (201)`, afterDeactivate.status === 201);
      }
    }
    // The 24 gallery rows share one asset: it must survive until the LAST one is deleted.
    if (capIds.gallery?.length) {
      await request("DELETE", `/api/pos/gallery/${capIds.gallery[0]}`, admin.token);
      check("gallery: deleting one of several rows sharing an image keeps the image", (await prisma.mediaAsset.findUnique({ where: { id: capMedia.body.id as string } })) !== null);
      for (const rowId of capIds.gallery.slice(1)) await request("DELETE", `/api/pos/gallery/${rowId}`, admin.token);
      check("gallery: deleting the last row sharing it deletes the image", (await prisma.mediaAsset.findUnique({ where: { id: capMedia.body.id as string } })) === null);
    }
    for (const cap of caps) {
      if (cap.path === "gallery") continue;
      for (const rowId of capIds[cap.path] ?? []) await request("DELETE", `/api/pos/${cap.path}/${rowId}`, admin.token);
    }

    // ============================ orphan purge ============================
    const orphan = await uploadOk(admin.token, "GALLERY");
    // Unreferenced by anything that can point at media — including orders (payment proofs), so a
    // PAYMENT_PROOF that no order uses is an orphan too.
    const orphanWhere = {
      menuItems: { none: {} },
      deals: { none: {} },
      galleryImages: { none: {} },
      paymentAccounts: { none: {} },
      paymentProofOrders: { none: {} },
    };
    const orphansNow = await prisma.mediaAsset.count({ where: orphanWhere });
    const orphansNotMine = await prisma.mediaAsset.count({ where: { ...orphanWhere, id: { notIn: created.media } } });
    if (orphansNotMine === 0) {
      // Every unreferenced upload in the database is one this script made, so a far-future cutoff
      // can only remove those.
      const removed = await purgeOrphanMedia(new Date(Date.now() + 60_000));
      check("purge: removes every unreferenced upload (and only those)", removed === orphansNow && removed >= 2, { removed, orphansNow });
      check("purge: the specific orphan is gone", (await prisma.mediaAsset.findUnique({ where: { id: orphan.body.id as string } })) === null);
      check("purge: leaves assets that something still references alone", (await prisma.mediaAsset.findUnique({ where: { id: third.body.id as string } })) !== null);
      check("purge: an unreferenced PAYMENT_PROOF is purged like any other orphan (proofs used by an order are kept — see verify-guest-orders)", (await prisma.mediaAsset.findUnique({ where: { id: proof.id } })) === null);
    } else {
      // The database holds someone else's unreferenced uploads; don't delete them. A cutoff in the
      // past must remove nothing of mine.
      await purgeOrphanMedia(new Date(Date.now() - 60_000));
      check(`purge: destructive check skipped (${orphansNotMine} unreferenced assets are not mine); past cutoff spares mine`, (await prisma.mediaAsset.findUnique({ where: { id: orphan.body.id as string } })) !== null);
    }

    // ============================ headers ============================
    const health = await request("GET", "/health");
    check("headers: JSON API keeps CORP same-origin", health.headers.get("cross-origin-resource-policy") === "same-origin", String(health.headers.get("cross-origin-resource-policy")));
    const storeHeaders = await request("GET", "/api/online/store");
    check("headers: /store (JSON) keeps CORP same-origin", storeHeaders.headers.get("cross-origin-resource-policy") === "same-origin");
  } finally {
    // Cleanup: everything created above, children first. Site settings go back to what they were.
    await prisma.galleryImage.deleteMany({ where: { captionEn: { startsWith: tag } } }).catch(() => undefined);
    await prisma.paymentAccount.deleteMany({ where: { label: { startsWith: tag } } }).catch(() => undefined);
    await prisma.deliveryArea.deleteMany({ where: { nameEn: { startsWith: tag } } }).catch(() => undefined);
    await prisma.testimonial.deleteMany({ where: { name: { startsWith: tag } } }).catch(() => undefined);
    await prisma.deal.deleteMany({ where: { id: { in: created.deal } } }).catch(() => undefined);
    await prisma.menuItem.deleteMany({ where: { id: { in: created.menuItem } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.category } } }).catch(() => undefined);
    await prisma.kitchen.deleteMany({ where: { id: { in: created.kitchen } } }).catch(() => undefined);
    await prisma.mediaAsset.deleteMany({ where: { id: { in: created.media } } }).catch(() => undefined);
    await prisma.businessDay.deleteMany({ where: { id: { in: created.businessDay } } }).catch(() => undefined);
    await prisma.staffUser.deleteMany({ where: { id: { in: created.staff } } }).catch(() => undefined);
    if (settingsBefore) {
      const { updatedAt: _updatedAt, ...restore } = settingsBefore;
      await prisma.siteSettings.update({ where: { id: 1 }, data: restore }).catch(() => undefined);
    } else {
      await prisma.siteSettings.deleteMany({}).catch(() => undefined);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
