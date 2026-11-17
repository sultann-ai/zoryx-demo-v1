-- Pickup as a second way to order online (a TAKEAWAY order, no address): switches, pickup minimum and note
-- on the store settings, and a "not collected" marker on orders (a strike for the phone).
ALTER TABLE "SiteSettings" ADD COLUMN "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "pickupMinOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "pickupNoteEn" TEXT,
ADD COLUMN "pickupNoteUr" TEXT;

ALTER TABLE "Order" ADD COLUMN "notCollectedAt" TIMESTAMP(3);

CREATE INDEX "Order_customerPhone_notCollectedAt_idx" ON "Order"("customerPhone", "notCollectedAt");
