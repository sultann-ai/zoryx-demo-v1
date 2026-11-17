// Places one fake online order directly through order.service.ts's createOrder — the same
// function POST /api/online/orders calls — so you can see an online order land in the
// reception inbox (GET /api/pos/orders/incoming) without a real customer-facing website.
//
// Run with: npm run dev:fake-online-order
//           npm run dev:fake-online-order -- --online-payment   (places an ONLINE-payment
//           order with a dummy screenshot file, landing paymentStatus AWAITING_VERIFICATION)
//
// Refuses to run unless DATABASE_URL points at localhost — this writes real rows via the
// real service function (inventory deduction aside, since AWAITING_RECEPTION skips that),
// so it must never be pointed at a deployed database by accident.
import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "../generated/prisma/client";
import { prisma } from "../src/config/prisma";
import * as orderService from "../src/modules/order/order.service";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL.includes("localhost")) {
  console.error("Refusing to run: DATABASE_URL does not point at localhost.");
  console.error("This script writes real orders — only run it against a local dev database.");
  process.exit(1);
}

const isOnlinePayment = process.argv.includes("--online-payment");

const FAKE_CUSTOMER_PHONE = "03000000000";
const FAKE_CUSTOMER_EMAIL = "dev-fake-customer@example.com";

async function getOrCreateFakeCustomer() {
  const existing = await prisma.customer.findUnique({ where: { phone: FAKE_CUSTOMER_PHONE } });
  if (existing) {
    return existing;
  }
  const passwordHash = await bcrypt.hash("dev-fake-customer-password", 10);
  return prisma.customer.create({
    data: {
      name: "Dev Fake Customer",
      phone: FAKE_CUSTOMER_PHONE,
      email: FAKE_CUSTOMER_EMAIL,
      passwordHash,
    },
  });
}

async function getOrCreateFakeAddress(customerId: string) {
  const existing = await prisma.customerAddress.findFirst({ where: { customerId } });
  if (existing) {
    return existing;
  }
  return prisma.customerAddress.create({
    data: {
      customerId,
      label: "Dev fake address",
      addressText: "123 Fake Street, Test Town",
      isDefault: true,
    },
  });
}

async function pickRandomOrderableItems(count: number) {
  // Keep this simple and robust: plain, directly-priced, sellable-alone items only — no
  // sizes, no add-ons, no open price. The point is to get *an* order into the inbox, not
  // to exercise every pricing path (that's what the vitest suite and manual curl pass do).
  const candidates = await prisma.menuItem.findMany({
    where: { sellableAlone: true, isAvailableOnline: true, isOpenPrice: false, price: { not: null } },
    take: 50,
  });
  if (candidates.length === 0) {
    throw new Error("No directly-priced, online-available menu items found to order.");
  }
  const picked: { menuItemId: string; quantity: number }[] = [];
  for (let i = 0; i < count; i++) {
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    if (!item) {
      continue;
    }
    picked.push({ menuItemId: item.id, quantity: 1 + Math.floor(Math.random() * 2) });
  }
  return picked;
}

async function main() {
  const customer = await getOrCreateFakeCustomer();
  const address = await getOrCreateFakeAddress(customer.id);
  const items = await pickRandomOrderableItems(2);

  const order = await orderService.createOrder({
    source: OrderSource.ONLINE,
    type: OrderType.DELIVERY,
    paymentMethod: isOnlinePayment ? PaymentMethod.ONLINE : PaymentMethod.CASH,
    customerId: customer.id,
    customerAddressId: address.id,
    status: OrderStatus.AWAITING_RECEPTION,
    ...(isOnlinePayment
      ? {
          paymentStatus: PaymentStatus.AWAITING_VERIFICATION,
          // No real upload pipeline needed for a dev script — just a path shaped like one.
          paymentScreenshotUrl: "/uploads/dev-fake-screenshot.png",
        }
      : {}),
    items,
  });

  console.log(
    `Created order #${order.orderNumber} (id ${order.id}) — AWAITING_RECEPTION, ${
      isOnlinePayment ? "ONLINE payment (AWAITING_VERIFICATION)" : "CASH payment"
    }. Check GET /api/pos/orders/incoming.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
