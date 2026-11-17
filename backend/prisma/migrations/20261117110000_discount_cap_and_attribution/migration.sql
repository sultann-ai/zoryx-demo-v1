-- Phase 1, fix 4: who/when/why on a discount, and the POS Admin discount cap (default 20%).
-- Additive only: three nullable Order columns and one SiteSettings column with a default.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAt" TIMESTAMP(3),
ADD COLUMN     "discountById" TEXT,
ADD COLUMN     "discountReason" TEXT;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "maxDiscountPercentPosAdmin" DECIMAL(5,2) NOT NULL DEFAULT 20;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountById_fkey" FOREIGN KEY ("discountById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

