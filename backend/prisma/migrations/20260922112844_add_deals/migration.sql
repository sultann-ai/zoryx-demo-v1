-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "dealOrderLineId" TEXT;

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailableInPOS" BOOLEAN NOT NULL DEFAULT true,
    "isAvailableOnline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealItem" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDealLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dealId" TEXT,
    "dealName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDealLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealItem_dealId_menuItemId_key" ON "DealItem"("dealId", "menuItemId");

-- CreateIndex
CREATE INDEX "OrderDealLine_orderId_idx" ON "OrderDealLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderDealLine_dealId_idx" ON "OrderDealLine"("dealId");

-- CreateIndex
CREATE INDEX "OrderItem_dealOrderLineId_idx" ON "OrderItem"("dealOrderLineId");

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealItem" ADD CONSTRAINT "DealItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_dealOrderLineId_fkey" FOREIGN KEY ("dealOrderLineId") REFERENCES "OrderDealLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDealLine" ADD CONSTRAINT "OrderDealLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDealLine" ADD CONSTRAINT "OrderDealLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
