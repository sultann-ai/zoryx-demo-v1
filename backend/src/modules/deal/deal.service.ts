import { MediaKind, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { uniqueSlug } from "../../common/slug";
import { assertAttachable, releaseMediaIfUnreferenced } from "../media/media.service";
import { RecordNotFoundError } from "../siteContent/siteContent.errors";

export interface DealItemInput {
  menuItemId: string;
  quantity: number;
}

export interface CreateDealInput {
  name: string;
  description?: string;
  price: Prisma.Decimal;
  isActive?: boolean;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  items: DealItemInput[];
}

export interface UpdateDealInput {
  name?: string;
  description?: string | null;
  price?: Prisma.Decimal;
  isActive?: boolean;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  items?: DealItemInput[];
}

const dealInclude = {
  items: { include: { menuItem: { select: { id: true, name: true, price: true } } } },
} satisfies Prisma.DealInclude;

export function listDeals() {
  return prisma.deal.findMany({ include: dealInclude, orderBy: { name: "asc" } });
}

export function listOnlineDeals() {
  return prisma.deal.findMany({
    where: { isAvailableOnline: true, isActive: true },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true, nameUr: true, price: true } } } },
      image: { select: { hasTransparency: true } },
    },
    orderBy: { name: "asc" },
  });
}

// The customer-website fields of a deal (photo, Urdu text). Replacing the photo deletes the old
// asset in the same transaction.
export function updateDealOnlineContent(id: string, data: Record<string, unknown>) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.deal.findUnique({ where: { id }, select: { imageId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (typeof data.imageId === "string" && data.imageId !== current.imageId) {
      await assertAttachable(tx, data.imageId, MediaKind.DEAL);
    }
    const updated = await tx.deal.update({ where: { id }, data: data as Prisma.DealUncheckedUpdateInput });
    if (data.imageId !== undefined && current.imageId !== updated.imageId) {
      await releaseMediaIfUnreferenced(tx, current.imageId);
    }
    return updated;
  });
}

export function getDealById(id: string) {
  return prisma.deal.findUnique({ where: { id }, include: dealInclude });
}

export function menuItemIdsExist(ids: string[]) {
  return prisma.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, isOpenPrice: true } });
}

export async function createDeal(data: CreateDealInput) {
  const code = (
    await uniqueSlug(data.name, async (candidate) => {
      const existing = await prisma.deal.findUnique({ where: { code: candidate.toUpperCase() }, select: { id: true } });
      return existing !== null;
    })
  ).toUpperCase();

  return prisma.deal.create({
    data: {
      name: data.name,
      code,
      price: data.price,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.isAvailableInPOS !== undefined ? { isAvailableInPOS: data.isAvailableInPOS } : {}),
      ...(data.isAvailableOnline !== undefined ? { isAvailableOnline: data.isAvailableOnline } : {}),
      items: {
        create: data.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      },
    },
    include: dealInclude,
  });
}

// Composition is replaced wholesale on update (delete then recreate) rather than diffed,
// matching the "set the whole DealItem composition in the same request" spec — simpler
// than reconciling adds/removes/quantity-changes against the existing rows.
export async function updateDeal(id: string, data: UpdateDealInput) {
  return prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isAvailableInPOS !== undefined ? { isAvailableInPOS: data.isAvailableInPOS } : {}),
        ...(data.isAvailableOnline !== undefined ? { isAvailableOnline: data.isAvailableOnline } : {}),
      },
    });

    if (data.items !== undefined) {
      await tx.dealItem.deleteMany({ where: { dealId: id } });
      await tx.dealItem.createMany({
        data: data.items.map((item) => ({ dealId: id, menuItemId: item.menuItemId, quantity: item.quantity })),
      });
    }

    return tx.deal.findUniqueOrThrow({ where: { id }, include: dealInclude });
  });
}

export function deleteDeal(id: string) {
  return prisma.deal.delete({ where: { id } });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
