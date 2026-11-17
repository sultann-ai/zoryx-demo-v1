-- Phase 2, task 1: completing orders. Additive only: a new OrderEventType value and one SiteSettings
-- column with a default.
-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "autoCompleteTakeawayOnPayment" BOOLEAN NOT NULL DEFAULT true;
