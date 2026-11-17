import bcrypt from "bcrypt";
import {
  AttendanceStatus,
  InventoryTrackingType,
  MediaKind,
  Prisma,
  type PrismaClient,
  StaffRole,
  VendorLedgerEntryType,
} from "../../generated/prisma/client";
import type { ProcessedMedia } from "../../src/common/media/processImage";
import { addDays, karachiYearMonth } from "../../src/common/pkTime";
import {
  ADD_ONS,
  CATEGORIES,
  DEALS,
  DELIVERY_AREAS,
  DEMO_PASSWORD,
  DINING_AREAS,
  GALLERY,
  INVENTORY,
  INVENTORY_LINKS,
  ITEMS,
  KITCHENS,
  type KitchenKey,
  PAYMENT_ACCOUNTS,
  PEOPLE,
  SHOP,
  TESTIMONIALS,
  VENDORS,
} from "./data";
import { pkTime } from "./history";
import { placeholderPhoto, placeholderQr } from "./images";
import type { SeededRandom } from "./random";

export interface CatalogIds {
  kitchenIdByKey: Map<KitchenKey, string>;
  categoryIdByKey: Map<string, string>;
  itemIdByKey: Map<string, string>;
  staffIdByKey: Map<string, string>;
  employeeIdByKey: Map<string, string>;
  tableIdByName: Map<string, string>;
  dealIdByCode: Map<string, string>;
  areaIds: string[];
  images: number;
}

type Db = PrismaClient;

// Stores a processed image exactly like the upload route does (MediaAsset + MediaBlob).
async function storeMedia(db: Db, random: SeededRandom, kind: MediaKind, media: ProcessedMedia, createdById: string): Promise<string> {
  const id = random.uuid();
  await db.mediaAsset.create({
    data: {
      id,
      kind,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      sizeBytes: media.data.length,
      hasTransparency: media.hasTransparency,
      createdById,
      blob: { create: { data: new Uint8Array(media.data), thumb: media.thumb ? new Uint8Array(media.thumb) : null } },
    },
  });
  return id;
}

export async function seedCatalog(db: Db, random: SeededRandom, todayPk: string, historyDays: number): Promise<CatalogIds> {
  const ids: CatalogIds = {
    kitchenIdByKey: new Map(),
    categoryIdByKey: new Map(),
    itemIdByKey: new Map(),
    staffIdByKey: new Map(),
    employeeIdByKey: new Map(),
    tableIdByName: new Map(),
    dealIdByCode: new Map(),
    areaIds: [],
    images: 0,
  };

  await db.siteSettings.create({
    data: { id: 1, ...SHOP, onlineOrderingEnabled: true, deliveryEnabled: true, pickupEnabled: true, pickupMinOrderAmount: 0, isDemo: true },
  });

  for (const [key, name] of Object.entries(KITCHENS) as [KitchenKey, string][]) {
    ids.kitchenIdByKey.set(key, (await db.kitchen.create({ data: { id: random.uuid(), name } })).id);
  }

  // ---- people: employees, then their logins ----
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const { year: thisYear, month: thisMonth } = karachiYearMonth(pkTime(todayPk, 12));
  for (const person of PEOPLE) {
    const joined = addDays(todayPk, -person.joinedMonthsAgo * 30);
    const employee = await db.employee.create({
      data: {
        id: random.uuid(),
        name: person.name,
        phone: person.phone,
        designation: person.designation,
        baseSalary: person.salary,
        joiningDate: new Date(`${joined}T00:00:00.000Z`),
      },
    });
    ids.employeeIdByKey.set(person.key, employee.id);
    if (person.login) {
      const staff = await db.staffUser.create({
        data: {
          id: random.uuid(),
          name: person.name,
          username: person.login.username,
          passwordHash,
          role: person.login.role as StaffRole,
          kitchenId: person.login.kitchen ? ids.kitchenIdByKey.get(person.login.kitchen)! : null,
          employeeId: employee.id,
        },
      });
      ids.staffIdByKey.set(person.key, staff.id);
    }
  }
  const owner = ids.staffIdByKey.get("owner")!;
  const manager = ids.staffIdByKey.get("manager")!;

  // ---- menu ----
  for (const [index, category] of CATEGORIES.entries()) {
    const image = await storeMedia(db, random, MediaKind.CATEGORY, await placeholderPhoto(category.name, "Scoops & Slices", index), owner);
    ids.images += 1;
    const row = await db.category.create({
      data: { id: random.uuid(), name: category.name, nameUr: category.nameUr, sortOrder: index, imageId: image },
    });
    ids.categoryIdByKey.set(category.key, row.id);
  }

  for (const [index, item] of ITEMS.entries()) {
    const categoryName = CATEGORIES.find((category) => category.key === item.category)!.name;
    const imageId = item.dealOnly
      ? null
      : await storeMedia(db, random, MediaKind.MENU_ITEM, await placeholderPhoto(item.name, categoryName, index), owner);
    if (imageId) {
      ids.images += 1;
    }
    const row = await db.menuItem.create({
      data: {
        id: random.uuid(),
        name: item.name,
        nameUr: item.nameUr,
        description: item.description,
        slug: item.key,
        price: item.price ?? null,
        sellableAlone: !item.dealOnly,
        isOpenPrice: item.openPrice !== undefined,
        minPrice: item.openPrice?.min ?? null,
        maxPrice: item.openPrice?.max ?? null,
        kitchenId: ids.kitchenIdByKey.get(item.kitchen)!,
        categoryId: ids.categoryIdByKey.get(item.category)!,
        imageId,
        isFeatured: item.featured ?? false,
        sortOrder: index,
        isAvailableInPOS: !item.dealOnly,
        isAvailableOnline: !item.hiddenOnline && !item.dealOnly && item.openPrice === undefined,
        ...(item.variants
          ? { variants: { create: item.variants.map(([label, price], sortOrder) => ({ id: random.uuid(), label, price, sortOrder })) } }
          : {}),
      },
    });
    ids.itemIdByKey.set(item.key, row.id);
  }

  const scoopsCategory = ids.categoryIdByKey.get("scoops")!;
  for (const addOn of ADD_ONS) {
    await db.addOn.create({
      data: {
        id: random.uuid(),
        name: addOn.name,
        categoryId: scoopsCategory,
        prices: { create: addOn.prices.map(([size, price]) => ({ id: random.uuid(), size, price })) },
      },
    });
  }

  for (const [index, deal] of DEALS.entries()) {
    const imageId = await storeMedia(db, random, MediaKind.DEAL, await placeholderPhoto(deal.name, "Deal", index + 3), owner);
    ids.images += 1;
    const row = await db.deal.create({
      data: {
        id: random.uuid(),
        code: deal.code,
        name: deal.name,
        nameUr: deal.nameUr,
        description: deal.description,
        price: deal.price,
        imageId,
        isFeatured: deal.featured ?? false,
        items: { create: deal.items.map(([key, quantity]) => ({ id: random.uuid(), menuItemId: ids.itemIdByKey.get(key)!, quantity })) },
        // The same fixed contents as composition lines, which the POS deal builder shows.
        components: { create: deal.items.map(([key, quantity]) => ({ id: random.uuid(), menuItemId: ids.itemIdByKey.get(key)!, quantity })) },
      },
    });
    ids.dealIdByCode.set(deal.code, row.id);
  }

  for (const [name, area, capacity] of DINING_AREAS) {
    const row = await db.diningArea.create({
      data: { id: random.uuid(), name, area, capacity, type: area === "Family Hall" ? "FAMILY_HALL" : "TABLE" },
    });
    ids.tableIdByName.set(name, row.id);
  }

  // ---- attendance: the history days, mostly present ----
  const attendance: Prisma.AttendanceRecordCreateManyInput[] = [];
  const absencesLastMonth = new Map<string, number>();
  const lastMonth = thisMonth === 1 ? { year: thisYear - 1, month: 12 } : { year: thisYear, month: thisMonth - 1 };
  for (const person of PEOPLE.filter((p) => p.onPayroll !== false)) {
    const employeeId = ids.employeeIdByKey.get(person.key)!;
    for (let back = historyDays; back >= 1; back -= 1) {
      const date = addDays(todayPk, -back);
      const status = random.weighted([
        [AttendanceStatus.PRESENT, 88],
        [AttendanceStatus.HALF_DAY, 5],
        [AttendanceStatus.LEAVE, 4],
        [AttendanceStatus.ABSENT, 3],
      ] as const);
      const present = status === AttendanceStatus.PRESENT || status === AttendanceStatus.HALF_DAY;
      attendance.push({
        id: random.uuid(),
        employeeId,
        date: new Date(`${date}T00:00:00.000Z`),
        status,
        checkIn: present ? pkTime(date, 11, random.int(20, 55)) : null,
        checkOut: present ? pkTime(date, status === AttendanceStatus.HALF_DAY ? 18 : 25, random.int(0, 40)) : null,
        remarks: status === AttendanceStatus.LEAVE ? random.pick(["Family wedding", "Sick leave", "Eid travel", "Personal"]) : null,
      });
      const [year, month] = date.split("-").map(Number) as [number, number];
      if (status === AttendanceStatus.ABSENT && year === lastMonth.year && month === lastMonth.month) {
        absencesLastMonth.set(employeeId, (absencesLastMonth.get(employeeId) ?? 0) + 1);
      }
    }
  }
  await db.attendanceRecord.createMany({ data: attendance });

  // ---- last month's payroll, processed on the 1st: allowances, absences deducted, a few advances ----
  const paidAt = pkTime(`${thisYear}-${String(thisMonth).padStart(2, "0")}-01`, 18);
  for (const person of PEOPLE.filter((p) => p.onPayroll !== false)) {
    const employeeId = ids.employeeIdByKey.get(person.key)!;
    const baseSalary = new Prisma.Decimal(person.salary);
    const allowance = new Prisma.Decimal(person.designation === "Rider" ? 6000 : random.chance(0.3) ? 2000 : 0);
    const absences = absencesLastMonth.get(employeeId) ?? 0;
    const deduction = new Prisma.Decimal(Math.round((person.salary / 30) * absences));
    const advanceTaken = new Prisma.Decimal(["waiter2", "rider1", "cleaner"].includes(person.key) ? random.pick([5000, 8000, 10000]) : 0);
    // Same formula as the payroll service: base + allowance − deduction − advance − paid.
    const paidAmount = baseSalary.plus(allowance).minus(deduction).minus(advanceTaken);
    await db.payrollEntry.create({
      data: {
        id: random.uuid(),
        employeeId,
        month: lastMonth.month,
        year: lastMonth.year,
        baseSalary,
        allowance,
        deduction,
        advanceTaken,
        paidAmount,
        remainingAmount: baseSalary.plus(allowance).minus(deduction).minus(advanceTaken).minus(paidAmount),
        paidAt,
        note: [absences > 0 ? `${absences} day(s) absent` : null, advanceTaken.greaterThan(0) ? "Advance adjusted" : null, person.designation === "Rider" ? "Fuel allowance" : null]
          .filter(Boolean)
          .join("; ") || null,
      },
    });
  }

  // ---- inventory and its links to the menu ----
  const inventoryIdByKey = new Map<string, string>();
  for (const item of INVENTORY) {
    const row = await db.inventoryItem.create({
      data: {
        id: random.uuid(),
        name: item.name,
        unit: item.unit,
        currentStock: item.stock,
        minThreshold: item.min,
        trackingType: item.auto ? InventoryTrackingType.AUTO : InventoryTrackingType.MANUAL,
      },
    });
    inventoryIdByKey.set(item.key, row.id);
  }
  await db.menuItemInventoryLink.createMany({
    data: INVENTORY_LINKS.map(([itemKey, inventoryKey, quantity]) => ({
      id: random.uuid(),
      menuItemId: ids.itemIdByKey.get(itemKey)!,
      inventoryItemId: inventoryIdByKey.get(inventoryKey)!,
      quantityPerOrder: quantity,
    })),
  });

  // ---- vendors: 60 days of purchases and payments, some still owed ----
  const ledger: Prisma.VendorLedgerEntryCreateManyInput[] = [];
  for (const vendor of VENDORS) {
    const vendorId = (
      await db.vendor.create({
        data: { id: random.uuid(), name: vendor.name, contactPerson: vendor.contact, phone: vendor.phone, address: vendor.address },
      })
    ).id;
    let owed = 0;
    let bill = 1000 + random.int(0, 8000);
    for (let back = historyDays; back >= 1; back -= 1) {
      const date = addDays(todayPk, -back);
      if (back % vendor.buyEveryDays === 0) {
        const amount = Math.round(random.int(vendor.buyAmount[0], vendor.buyAmount[1]) / 100) * 100;
        owed += amount;
        bill += random.int(1, 40);
        ledger.push({ id: random.uuid(), vendorId, type: VendorLedgerEntryType.PURCHASE, amount, description: `Bill #${bill} — ${vendor.supplies}`, date: pkTime(date, 10, random.int(0, 50)), recordedById: manager, createdAt: pkTime(date, 11, 0) });
      }
      // Paid every Saturday, most (not all) of what's owed.
      if (back % 7 === 3 && owed > 0) {
        const amount = Math.round((owed * random.int(70, 95)) / 100 / 100) * 100;
        owed -= amount;
        ledger.push({ id: random.uuid(), vendorId, type: VendorLedgerEntryType.PAYMENT, amount, description: random.pick(["Cash payment", "Bank transfer — Meezan", "Cheque"]), date: pkTime(date, 17, random.int(0, 50)), recordedById: manager, createdAt: pkTime(date, 17, 55) });
      }
    }
  }
  await db.vendorLedgerEntry.createMany({ data: ledger });

  // ---- the website ----
  for (const [index, [nameEn, nameUr, fee, min]] of DELIVERY_AREAS.entries()) {
    ids.areaIds.push((await db.deliveryArea.create({ data: { id: random.uuid(), nameEn, nameUr, deliveryFee: fee, minOrderAmount: min, sortOrder: index } })).id);
  }
  for (const [index, account] of PAYMENT_ACCOUNTS.entries()) {
    const qrMediaId = await storeMedia(db, random, MediaKind.PAYMENT_QR, await placeholderQr(account.label, random), owner);
    ids.images += 1;
    await db.paymentAccount.create({ data: { id: random.uuid(), ...account, qrMediaId, sortOrder: index } });
  }
  for (const [index, testimonial] of TESTIMONIALS.entries()) {
    await db.testimonial.create({ data: { id: random.uuid(), ...testimonial, sortOrder: index } });
  }
  for (const [index, entry] of GALLERY.entries()) {
    const mediaId = await storeMedia(db, random, MediaKind.GALLERY, await placeholderPhoto(entry.caption, "Gallery", index + 5), owner);
    ids.images += 1;
    await db.galleryImage.create({ data: { id: random.uuid(), mediaId, captionEn: entry.caption, captionUr: entry.captionUr, sortOrder: index } });
  }

  return ids;
}
