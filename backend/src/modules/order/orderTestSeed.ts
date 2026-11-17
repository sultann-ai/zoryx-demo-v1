import { InventoryTrackingType, Prisma, StaffRole } from "../../../generated/prisma/client";

// Minimal fixtures for DB-backed order tests (see common/testDb.ts). Everything is created
// inside the test's rolled-back transaction, with unique names so nothing collides with real data.

let counter = 0;
const unique = (prefix: string) => `${prefix}-${Date.now()}-${(counter += 1)}`;

export async function seedOrderWorld(tx: Prisma.TransactionClient) {
  const staff = (role: StaffRole, name: string = role) =>
    tx.staffUser.create({ data: { name, username: unique("test-staff"), passwordHash: "x", role } });
  const superAdmin = await staff(StaffRole.SUPER_ADMIN, "Sana Super");
  const posAdmin = await staff(StaffRole.POS_ADMIN, "Pervez Pos");
  const kitchenA = await tx.kitchen.create({ data: { name: unique("Kitchen A") } });
  const kitchenB = await tx.kitchen.create({ data: { name: unique("Kitchen B") } });
  const burger = await tx.menuItem.create({
    data: { name: "Test Burger", slug: unique("burger"), price: 500, kitchenId: kitchenA.id },
  });
  const tea = await tx.menuItem.create({
    data: { name: "Test Tea", slug: unique("tea"), price: 100, kitchenId: kitchenB.id },
  });
  const bun = await tx.inventoryItem.create({
    data: { name: unique("Bun"), unit: "pc", currentStock: 100, trackingType: InventoryTrackingType.AUTO },
  });
  await tx.menuItemInventoryLink.create({ data: { menuItemId: burger.id, inventoryItemId: bun.id, quantityPerOrder: 2 } });
  const day = await tx.businessDay.create({
    data: { label: unique("day"), startedAt: new Date("2001-01-01T05:00:00Z"), isActive: false, openedById: superAdmin.id },
  });

  let orderNumber = 0;
  // An order with one burger (kitchen A, 500) and one tea (kitchen B, 100), total 600 less discount.
  async function order(over: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    orderNumber += 1;
    const discount = new Prisma.Decimal((over.discount as number | string | undefined) ?? 0);
    return tx.order.create({
      data: {
        orderNumber,
        businessDayId: day.id,
        source: "POS",
        type: "TAKEAWAY",
        paymentMethod: "CASH",
        totalAmount: new Prisma.Decimal(600).minus(discount),
        placedByStaffId: posAdmin.id,
        ...over,
        discount,
        items: {
          create: [
            { menuItemId: burger.id, kitchenId: kitchenA.id, quantity: 1, unitPrice: 500, subtotal: 500 },
            { menuItemId: tea.id, kitchenId: kitchenB.id, quantity: 1, unitPrice: 100, subtotal: 100 },
          ],
        },
      },
      include: { items: true },
    });
  }

  return { superAdmin, posAdmin, kitchenA, kitchenB, burger, tea, bun, day, order };
}
