import {
  InventoryItem,
  InventoryTrackingType,
  InventoryTxnType,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export class InventoryItemNotFoundError extends Error {}
export class NotManuallyTrackedError extends Error {}

// ================= InventoryItem CRUD =================

export interface CreateInventoryItemInput {
  name: string;
  unit: string;
  currentStock: Prisma.Decimal;
  minThreshold?: Prisma.Decimal;
  trackingType: InventoryTrackingType;
}

export interface UpdateInventoryItemInput {
  name?: string;
  unit?: string;
  minThreshold?: Prisma.Decimal | null;
  trackingType?: InventoryTrackingType;
}

export function listInventoryItems() {
  return prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
}

// Cross-field comparison (currentStock < minThreshold) can't be expressed in Prisma's
// standard `where` filter, which only compares a field against a value, not another field.
export function getLowStockItems() {
  return prisma.$queryRaw<InventoryItem[]>`
    SELECT * FROM "InventoryItem"
    WHERE "minThreshold" IS NOT NULL AND "currentStock" < "minThreshold"
    ORDER BY "name" ASC
  `;
}

export function getInventoryItemById(id: string) {
  return prisma.inventoryItem.findUnique({ where: { id } });
}

export function createInventoryItem(data: CreateInventoryItemInput) {
  return prisma.inventoryItem.create({
    data: {
      name: data.name,
      unit: data.unit,
      currentStock: data.currentStock,
      trackingType: data.trackingType,
      ...(data.minThreshold !== undefined ? { minThreshold: data.minThreshold } : {}),
    },
  });
}

export function updateInventoryItem(id: string, data: UpdateInventoryItemInput) {
  return prisma.inventoryItem.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.minThreshold !== undefined ? { minThreshold: data.minThreshold } : {}),
      ...(data.trackingType !== undefined ? { trackingType: data.trackingType } : {}),
    },
  });
}

export class InventoryItemInUseError extends Error {
  constructor(public readonly menuItemNames: string[]) {
    super(`Used by: ${menuItemNames.join(", ")}`);
  }
}

// A menu-item link blocks deletion (it drives auto-deduction when orders are placed — never
// silently dropped). Stock history (InventoryTransaction) does not: it holds no money, so it's
// deleted along with the item in one transaction rather than blocking on it. Without this, a
// raw delete would 409 on almost every real item, since AUTO items get a transaction row on
// every order and MANUAL items get one on every stock adjustment.
export async function deleteInventoryItem(id: string): Promise<void> {
  const links = await prisma.menuItemInventoryLink.findMany({
    where: { inventoryItemId: id },
    include: { menuItem: { select: { name: true } } },
  });
  if (links.length > 0) {
    throw new InventoryItemInUseError(links.map((link) => link.menuItem.name));
  }

  await prisma.$transaction([
    prisma.inventoryTransaction.deleteMany({ where: { inventoryItemId: id } }),
    prisma.inventoryItem.delete({ where: { id } }),
  ]);
}

// ================= Manual stock adjustment =================

export interface AdjustStockInput {
  inventoryItemId: string;
  type: InventoryTxnType;
  quantity: Prisma.Decimal;
  performedById: string;
  note?: string;
}

export async function adjustStock(input: AdjustStockInput) {
  return prisma.$transaction(async (tx) => {
    const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
    if (!inventoryItem) {
      throw new InventoryItemNotFoundError();
    }
    if (inventoryItem.trackingType !== InventoryTrackingType.MANUAL) {
      throw new NotManuallyTrackedError();
    }

    // STOCK_IN adds, STOCK_OUT removes; ADJUSTMENT applies the signed quantity directly
    // (a physical-count correction, which can go either way).
    const delta = input.type === InventoryTxnType.STOCK_OUT ? input.quantity.negated() : input.quantity;

    const updatedItem = await tx.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: { currentStock: { increment: delta } },
    });

    const transaction = await tx.inventoryTransaction.create({
      data: {
        inventoryItemId: input.inventoryItemId,
        type: input.type,
        quantity: input.quantity,
        performedById: input.performedById,
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });

    return { inventoryItem: updatedItem, transaction };
  });
}

// ================= Order-creation hook =================

export interface OrderItemForDeduction {
  menuItemId: string;
  quantity: number;
}

export async function deductForOrderItems(
  tx: Prisma.TransactionClient,
  params: { orderId: string; performedById: string; items: OrderItemForDeduction[] },
): Promise<void> {
  const quantityByMenuItemId = new Map<string, number>();
  for (const item of params.items) {
    quantityByMenuItemId.set(item.menuItemId, (quantityByMenuItemId.get(item.menuItemId) ?? 0) + item.quantity);
  }

  const menuItemIds = [...quantityByMenuItemId.keys()];
  if (menuItemIds.length === 0) {
    return;
  }

  const links = await tx.menuItemInventoryLink.findMany({
    where: { menuItemId: { in: menuItemIds }, inventoryItem: { trackingType: InventoryTrackingType.AUTO } },
  });

  const deductionByInventoryItemId = new Map<string, Prisma.Decimal>();
  for (const link of links) {
    const orderedQuantity = quantityByMenuItemId.get(link.menuItemId) ?? 0;
    if (orderedQuantity <= 0) {
      continue;
    }
    const deduction = link.quantityPerOrder.times(orderedQuantity);
    const existing = deductionByInventoryItemId.get(link.inventoryItemId);
    deductionByInventoryItemId.set(link.inventoryItemId, existing ? existing.plus(deduction) : deduction);
  }

  for (const [inventoryItemId, deduction] of deductionByInventoryItemId) {
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { decrement: deduction } },
    });
    await tx.inventoryTransaction.create({
      data: {
        inventoryItemId,
        type: InventoryTxnType.STOCK_OUT,
        quantity: deduction,
        relatedOrderId: params.orderId,
        performedById: params.performedById,
        note: "Auto-deducted on order creation",
      },
    });
  }
}

// Mirror of deductForOrderItems for the opposite direction — an item removed from an
// already-created order (before the kitchen has started it) gives its stock back.
export async function restockForOrderItems(
  tx: Prisma.TransactionClient,
  params: { orderId: string; performedById: string; items: OrderItemForDeduction[] },
): Promise<void> {
  const quantityByMenuItemId = new Map<string, number>();
  for (const item of params.items) {
    quantityByMenuItemId.set(item.menuItemId, (quantityByMenuItemId.get(item.menuItemId) ?? 0) + item.quantity);
  }

  const menuItemIds = [...quantityByMenuItemId.keys()];
  if (menuItemIds.length === 0) {
    return;
  }

  const links = await tx.menuItemInventoryLink.findMany({
    where: { menuItemId: { in: menuItemIds }, inventoryItem: { trackingType: InventoryTrackingType.AUTO } },
  });

  const restockByInventoryItemId = new Map<string, Prisma.Decimal>();
  for (const link of links) {
    const removedQuantity = quantityByMenuItemId.get(link.menuItemId) ?? 0;
    if (removedQuantity <= 0) {
      continue;
    }
    const restock = link.quantityPerOrder.times(removedQuantity);
    const existing = restockByInventoryItemId.get(link.inventoryItemId);
    restockByInventoryItemId.set(link.inventoryItemId, existing ? existing.plus(restock) : restock);
  }

  for (const [inventoryItemId, restock] of restockByInventoryItemId) {
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { increment: restock } },
    });
    await tx.inventoryTransaction.create({
      data: {
        inventoryItemId,
        type: InventoryTxnType.STOCK_IN,
        quantity: restock,
        relatedOrderId: params.orderId,
        performedById: params.performedById,
        note: "Auto-restocked on order item removal",
      },
    });
  }
}

// ================= MenuItemInventoryLink CRUD =================

const linkInclude = {
  menuItem: { select: { id: true, name: true } },
  inventoryItem: { select: { id: true, name: true, unit: true } },
} satisfies Prisma.MenuItemInventoryLinkInclude;

export interface CreateLinkInput {
  menuItemId: string;
  inventoryItemId: string;
  quantityPerOrder: Prisma.Decimal;
}

export interface UpdateLinkInput {
  menuItemId?: string;
  inventoryItemId?: string;
  quantityPerOrder?: Prisma.Decimal;
}

export interface ListLinksFilter {
  menuItemId?: string;
  inventoryItemId?: string;
}

export function listInventoryLinks(filter: ListLinksFilter) {
  return prisma.menuItemInventoryLink.findMany({
    where: {
      ...(filter.menuItemId !== undefined ? { menuItemId: filter.menuItemId } : {}),
      ...(filter.inventoryItemId !== undefined ? { inventoryItemId: filter.inventoryItemId } : {}),
    },
    include: linkInclude,
  });
}

export function getInventoryLinkById(id: string) {
  return prisma.menuItemInventoryLink.findUnique({ where: { id }, include: linkInclude });
}

export function menuItemExists(id: string) {
  return prisma.menuItem.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function inventoryItemExists(id: string) {
  return prisma.inventoryItem.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function createInventoryLink(data: CreateLinkInput) {
  return prisma.menuItemInventoryLink.create({ data, include: linkInclude });
}

export function updateInventoryLink(id: string, data: UpdateLinkInput) {
  return prisma.menuItemInventoryLink.update({
    where: { id },
    data: {
      ...(data.menuItemId !== undefined ? { menuItemId: data.menuItemId } : {}),
      ...(data.inventoryItemId !== undefined ? { inventoryItemId: data.inventoryItemId } : {}),
      ...(data.quantityPerOrder !== undefined ? { quantityPerOrder: data.quantityPerOrder } : {}),
    },
    include: linkInclude,
  });
}

export function deleteInventoryLink(id: string) {
  return prisma.menuItemInventoryLink.delete({ where: { id } });
}

// ================= Shared error helpers =================

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

// Gives back everything a cancelled order still has deducted — once. Reads the order's own stock
// ledger (InventoryTransaction.relatedOrderId): per inventory item, STOCK_OUT minus STOCK_IN, so an
// item removed earlier (restocked then) or an approved edit (restocked and re-deducted) is already
// accounted for. An order that never deducted anything — gated at reception and never accepted,
// scheduled and never released, placed by a customer with no staff to attribute it to — has no
// ledger rows and gets nothing back. If the order already has a RESTOCK_CANCEL row, nothing is
// done again. Must run in the cancelling transaction, after the order row is locked by its status
// update, so two concurrent cancels can't both get here.
export async function restockForCancelledOrder(
  tx: Prisma.TransactionClient,
  params: { orderId: string; performedById: string },
): Promise<{ restocked: boolean }> {
  const alreadyReturned = await tx.inventoryTransaction.count({
    where: { relatedOrderId: params.orderId, type: InventoryTxnType.RESTOCK_CANCEL },
  });
  if (alreadyReturned > 0) {
    return { restocked: false };
  }

  const ledger = await tx.inventoryTransaction.groupBy({
    by: ["inventoryItemId", "type"],
    where: { relatedOrderId: params.orderId, type: { in: [InventoryTxnType.STOCK_OUT, InventoryTxnType.STOCK_IN] } },
    _sum: { quantity: true },
  });

  const netByInventoryItemId = new Map<string, Prisma.Decimal>();
  for (const row of ledger) {
    const quantity = row._sum.quantity ?? new Prisma.Decimal(0);
    const signed = row.type === InventoryTxnType.STOCK_OUT ? quantity : quantity.negated();
    const existing = netByInventoryItemId.get(row.inventoryItemId);
    netByInventoryItemId.set(row.inventoryItemId, existing ? existing.plus(signed) : signed);
  }

  let restocked = false;
  for (const [inventoryItemId, net] of netByInventoryItemId) {
    if (!net.greaterThan(0)) {
      continue;
    }
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { increment: net } },
    });
    await tx.inventoryTransaction.create({
      data: {
        inventoryItemId,
        type: InventoryTxnType.RESTOCK_CANCEL,
        quantity: net,
        relatedOrderId: params.orderId,
        performedById: params.performedById,
        note: "Returned: order cancelled",
      },
    });
    restocked = true;
  }
  return { restocked };
}
