-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'ORDER_TAKER';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_RECEPTION';

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'ORDER_TAKER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_clientRequestId_key" ON "Order"("clientRequestId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
