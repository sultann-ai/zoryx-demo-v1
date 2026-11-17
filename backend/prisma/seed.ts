// Seeds the Zoryx restaurant menu (prisma/seed-data/zoryx-menu.ts) into the
// database. Idempotent: upserts everything keyed on a stable slug/code, and a deal's
// component lines are replaced wholesale (delete-then-recreate for that deal only) so
// re-running always leaves identical row counts rather than accumulating duplicates.
//
// Safety: refuses to run against anything but a local database.
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "../generated/prisma/client";

dotenv.config();
import { ADD_ONS, CATEGORIES, DEALS, ITEMS, type DealComponentSeed } from "./seed-data/zoryx-menu";

const DEFAULT_KITCHEN_NAME = "Main Kitchen";

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  if (!isLocal) {
    console.error("DATABASE_URL does not point to localhost/127.0.0.1 — refusing to run. Aborting.");
    console.error(`DATABASE_URL was: ${url}`);
    process.exit(1);
  }
}

async function main() {
  assertLocalDatabase();

  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(
      async (tx) => {
        const kitchen = await tx.kitchen.findUnique({ where: { name: DEFAULT_KITCHEN_NAME } });
        if (!kitchen) {
          throw new Error(
            `Kitchen "${DEFAULT_KITCHEN_NAME}" not found — every seeded item needs a kitchenId and none was ` +
              `specified in the menu data, so this script defaults everything to that kitchen. Create it first ` +
              `or edit DEFAULT_KITCHEN_NAME in prisma/seed.ts.`,
          );
        }

        const categoryByName = new Map<string, { id: string }>();
        for (const name of CATEGORIES) {
          const category = await tx.category.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          categoryByName.set(name, category);
        }

        const menuItemBySlug = new Map<string, { id: string }>();
        const variantByItemAndLabel = new Map<string, { id: string }>();

        for (const item of ITEMS) {
          const category = categoryByName.get(item.category);
          if (!category) {
            throw new Error(`Item "${item.name}" references unknown category "${item.category}"`);
          }

          const hasAnyPrice =
            item.price !== null && item.price !== undefined
              ? true
              : (item.variants ?? []).some((v) => v.price !== null);

          const menuItem = await tx.menuItem.upsert({
            where: { slug: item.slug },
            update: {
              name: item.name,
              categoryId: category.id,
              kitchenId: kitchen.id,
              price: item.price === null || item.price === undefined ? null : new Prisma.Decimal(item.price),
              sellableAlone: hasAnyPrice,
            },
            create: {
              slug: item.slug,
              name: item.name,
              categoryId: category.id,
              kitchenId: kitchen.id,
              price: item.price === null || item.price === undefined ? null : new Prisma.Decimal(item.price),
              sellableAlone: hasAnyPrice,
            },
          });
          menuItemBySlug.set(item.slug, menuItem);

          let sortOrder = 0;
          for (const variant of item.variants ?? []) {
            const row = await tx.menuItemVariant.upsert({
              where: { menuItemId_label: { menuItemId: menuItem.id, label: variant.label } },
              update: {
                price: variant.price === null ? null : new Prisma.Decimal(variant.price),
                sortOrder,
              },
              create: {
                menuItemId: menuItem.id,
                label: variant.label,
                price: variant.price === null ? null : new Prisma.Decimal(variant.price),
                sortOrder,
              },
            });
            variantByItemAndLabel.set(`${item.slug}::${variant.label}`, row);
            sortOrder += 1;
          }
        }

        for (const addOn of ADD_ONS) {
          const category = categoryByName.get(addOn.category);
          if (!category) {
            throw new Error(`AddOn "${addOn.name}" references unknown category "${addOn.category}"`);
          }
          const row = await tx.addOn.upsert({
            where: { name: addOn.name },
            update: { categoryId: category.id },
            create: { name: addOn.name, categoryId: category.id },
          });
          for (const p of addOn.prices) {
            await tx.addOnPrice.upsert({
              where: { addOnId_size: { addOnId: row.id, size: p.size } },
              update: { price: new Prisma.Decimal(p.price) },
              create: { addOnId: row.id, size: p.size, price: new Prisma.Decimal(p.price) },
            });
          }
        }

        for (const deal of DEALS) {
          const dealRow = await tx.deal.upsert({
            where: { code: deal.code },
            update: { name: deal.name, price: new Prisma.Decimal(deal.price) },
            create: { code: deal.code, name: deal.name, price: new Prisma.Decimal(deal.price) },
          });

          // Components have no natural unique key of their own, so re-running always
          // deletes and recreates this deal's lines rather than trying to upsert them —
          // that still leaves identical row counts on every run, just via a different path.
          await tx.dealComponent.deleteMany({ where: { dealId: dealRow.id } });

          for (const component of deal.components) {
            await createDealComponent(tx, dealRow.id, component, menuItemBySlug, variantByItemAndLabel, categoryByName);
          }
        }
      },
      { timeout: 30000 },
    );

    await report(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function createDealComponent(
  tx: Prisma.TransactionClient,
  dealId: string,
  component: DealComponentSeed,
  menuItemBySlug: Map<string, { id: string }>,
  variantByItemAndLabel: Map<string, { id: string }>,
  categoryByName: Map<string, { id: string }>,
): Promise<void> {
  if (component.kind === "item") {
    const menuItem = menuItemBySlug.get(component.slug);
    if (!menuItem) throw new Error(`Deal component references unknown item slug "${component.slug}"`);
    await tx.dealComponent.create({
      data: { dealId, quantity: component.quantity, menuItemId: menuItem.id },
    });
    return;
  }

  if (component.kind === "variant") {
    const variant = variantByItemAndLabel.get(`${component.slug}::${component.variantLabel}`);
    if (!variant) {
      throw new Error(`Deal component references unknown variant "${component.slug}::${component.variantLabel}"`);
    }
    await tx.dealComponent.create({
      data: { dealId, quantity: component.quantity, variantId: variant.id },
    });
    return;
  }

  const category = categoryByName.get(component.category);
  if (!category) throw new Error(`Deal component references unknown category "${component.category}"`);
  await tx.dealComponent.create({
    data: {
      dealId,
      quantity: component.quantity,
      choiceCategoryId: category.id,
      choiceSize: component.size,
      allowedItemIds: component.allowedSlugs ?? [],
    },
  });
}

async function report(prisma: PrismaClient): Promise<void> {
  // Sequential, not Promise.all: the local dev DB proxy allows only one connection at a
  // time (DATABASE_URL's connection_limit=1), so concurrent queries here would race.
  const itemCount = await prisma.menuItem.count();
  const priceableVariantCount = await prisma.menuItemVariant.count({ where: { price: { not: null } } });
  const sellableItemCount = await prisma.menuItem.count({ where: { sellableAlone: true } });
  const addOnCount = await prisma.addOn.count();
  const addOnPriceCount = await prisma.addOnPrice.count();
  const dealCount = await prisma.deal.count();
  // Single-price items count as one "priced variant" each for the 97-count check.
  const singlePriceItemCount = await prisma.menuItem.count({ where: { price: { not: null } } });

  console.log("--- Seed summary ---");
  console.log(`Total MenuItem rows: ${itemCount}`);
  console.log(`Sellable-alone MenuItem rows: ${sellableItemCount}`);
  console.log(`Priced variants (sized items): ${priceableVariantCount}`);
  console.log(`Priced single-price items: ${singlePriceItemCount}`);
  console.log(`"Priced variant" total (task's definition): ${priceableVariantCount + singlePriceItemCount}`);
  console.log(`AddOns: ${addOnCount}, AddOnPrice rows: ${addOnPriceCount}`);
  console.log(`Deals: ${dealCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
