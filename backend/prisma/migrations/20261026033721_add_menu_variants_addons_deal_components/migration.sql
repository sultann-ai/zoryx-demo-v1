-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "code" TEXT;

UPDATE "Deal"
SET "code" = 'DEAL-' || REPLACE("id", '-', '')
WHERE "code" IS NULL;

ALTER TABLE "Deal" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "sellableAlone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slug" TEXT,
ALTER COLUMN "price" DROP NOT NULL;

UPDATE "MenuItem"
SET "slug" = COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g')), ''),
        'item'
    ) || '-' || LEFT(REPLACE("id", '-', ''), 8)
WHERE "slug" IS NULL;

ALTER TABLE "MenuItem" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "MenuItemVariant" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnPrice" (
    "id" TEXT NOT NULL,
    "addOnId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "AddOnPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealComponent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variantId" TEXT,
    "choiceCategoryId" TEXT,
    "choiceSize" TEXT,
    "allowedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "DealComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemVariant_menuItemId_label_key" ON "MenuItemVariant"("menuItemId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AddOn_name_key" ON "AddOn"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AddOnPrice_addOnId_size_key" ON "AddOnPrice"("addOnId", "size");

-- CreateIndex
CREATE INDEX "DealComponent_dealId_idx" ON "DealComponent"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_code_key" ON "Deal"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_slug_key" ON "MenuItem"("slug");

-- AddForeignKey
ALTER TABLE "MenuItemVariant" ADD CONSTRAINT "MenuItemVariant_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnPrice" ADD CONSTRAINT "AddOnPrice_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "AddOn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealComponent" ADD CONSTRAINT "DealComponent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealComponent" ADD CONSTRAINT "DealComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealComponent" ADD CONSTRAINT "DealComponent_choiceCategoryId_fkey" FOREIGN KEY ("choiceCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

