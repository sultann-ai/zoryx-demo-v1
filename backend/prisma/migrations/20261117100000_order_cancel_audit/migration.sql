-- Phase 1, fix 2: who/when on a cancellation, and the stock-return transaction type.
-- Additive only: a new enum value and two nullable columns. cancelledReason (the reason) already exists.
-- AlterEnum
ALTER TYPE "InventoryTxnType" ADD VALUE 'RESTOCK_CANCEL';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

