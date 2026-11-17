CREATE TYPE "OrderChangeKind" AS ENUM ('EDIT', 'CANCEL');

CREATE TYPE "OrderChangeStatus" AS ENUM ('APPLIED', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "OrderChange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "kind" "OrderChangeKind" NOT NULL,
    "status" "OrderChangeStatus" NOT NULL,
    "reason" TEXT,
    "rejectionReason" TEXT,
    "previousState" JSONB NOT NULL,
    "requestedState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "OrderChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderChange_orderId_createdAt_idx" ON "OrderChange"("orderId", "createdAt");
CREATE INDEX "OrderChange_status_createdAt_idx" ON "OrderChange"("status", "createdAt");

ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
