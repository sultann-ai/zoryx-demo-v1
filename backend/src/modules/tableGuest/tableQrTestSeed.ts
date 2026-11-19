import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { seedOrderWorld } from "../order/orderTestSeed";
import { generateQrKey } from "./guestToken";

// Fixtures for DB-backed Table QR tests (inside common/testDb.ts's rolled-back transaction): the order
// world plus an ACTIVE business day (any real active day is switched off — rolled back afterwards),
// table QR switched on, a table with a QR key, and an order-taker login.
let counter = 0;

export async function seedTableWorld(tx: Prisma.TransactionClient, options: { requirePin?: boolean } = {}) {
  const world = await seedOrderWorld(tx);
  await tx.businessDay.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const activeDay = await tx.businessDay.create({
    data: { label: `qr-day-${Date.now()}`, startedAt: new Date(), isActive: true, openedById: world.superAdmin.id },
  });
  const settings = { tableQrEnabled: true, tableQrRequirePin: options.requirePin ?? false };
  await tx.siteSettings.upsert({
    where: { id: 1 },
    update: settings,
    create: {
      id: 1,
      shopNameEn: "Test",
      shopNameUr: "Test",
      taglineEn: "-",
      taglineUr: "-",
      phone: "0300 0000000",
      whatsappNumber: "923000000000",
      addressEn: "-",
      addressUr: "-",
      mapUrl: "https://maps.google.com",
      openingHoursEn: "-",
      openingHoursUr: "-",
      ...settings,
    },
  });
  // Burger (500) is on the QR menu; tea (100) is not.
  await tx.menuItem.update({ where: { id: world.burger.id }, data: { isAvailableOnQr: true } });
  const cake = await tx.menuItem.create({
    data: { name: "Custom Cake", slug: `cake-${Date.now()}-${(counter += 1)}`, isOpenPrice: true, isAvailableOnQr: true, kitchenId: world.kitchenA.id },
  });
  const deal = await tx.deal.create({
    data: {
      name: "Burger Deal",
      code: `QRDEAL-${Date.now()}-${(counter += 1)}`,
      price: 900,
      isAvailableOnQr: true,
      items: { create: [{ menuItemId: world.burger.id, quantity: 2 }] },
    },
  });
  const table = await tx.diningArea.create({
    data: { name: `QR Table ${(counter += 1)}`, type: "TABLE", area: "Family Hall", qrKey: generateQrKey() },
  });
  const waiter = await tx.staffUser.create({
    data: { name: "Wasim Waiter", username: `waiter-${Date.now()}-${(counter += 1)}`, passwordHash: "x", role: StaffRole.ORDER_TAKER },
  });
  return { ...world, activeDay, table, cake, deal, waiter };
}
