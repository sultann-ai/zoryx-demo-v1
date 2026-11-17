-- Scheduled orders: a new hold status plus when to release / when released.
-- Additive only: a new enum value, two nullable columns and an index. No existing data changes.
ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED';

ALTER TABLE "Order" ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "releasedAt" TIMESTAMP(3);

CREATE INDEX "Order_status_scheduledFor_idx" ON "Order"("status", "scheduledFor");
