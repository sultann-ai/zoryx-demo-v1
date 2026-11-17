-- AlterTable
ALTER TABLE "OrderDealLine" ADD COLUMN     "baseUnitPrice" DECIMAL(10,2),
ADD COLUMN     "customization" JSONB;

-- Backfill: unitPrice already equals the deal's standard price at order time for every
-- existing row (customization didn't exist yet), so this is exact, not a guess.
UPDATE "OrderDealLine" SET "baseUnitPrice" = "unitPrice" WHERE "baseUnitPrice" IS NULL;
