-- Table QR, build step 2: QR orders (a new order source, the session/guest links on orders and
-- every line) and the "show on QR menu" flag on menu items and deals. Additive only; no backfill
-- (nothing is on the QR menu until staff switch it on — docs/TABLE_QR_SPEC.md Q1).

-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'TABLE_QR';

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "isAvailableOnQr" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "isAvailableOnQr" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "tableGuestId" TEXT,
ADD COLUMN     "tableSessionId" TEXT;

-- AlterTable
ALTER TABLE "OrderDealLine" ADD COLUMN     "tableGuestId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "tableGuestId" TEXT;

-- CreateIndex
CREATE INDEX "Order_tableSessionId_idx" ON "Order"("tableSessionId");

-- CreateIndex
CREATE INDEX "Order_tableGuestId_createdAt_idx" ON "Order"("tableGuestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableGuestId_fkey" FOREIGN KEY ("tableGuestId") REFERENCES "TableGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tableGuestId_fkey" FOREIGN KEY ("tableGuestId") REFERENCES "TableGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDealLine" ADD CONSTRAINT "OrderDealLine_tableGuestId_fkey" FOREIGN KEY ("tableGuestId") REFERENCES "TableGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
