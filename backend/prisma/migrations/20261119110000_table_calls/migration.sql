-- Table QR, build step 3: waiter calls (docs/TABLE_QR_SPEC.md §3.4, §5.4). Additive only: two new
-- enums and one new table. Generated with `prisma migrate diff` against the local DB (the dev DB user
-- cannot create the shadow database `migrate dev` needs) and applied with `migrate deploy`.

-- CreateEnum
CREATE TYPE "TableCallType" AS ENUM ('WATER', 'NAPKINS', 'BILL_CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "TableCallStatus" AS ENUM ('RAISED', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TableCall" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "diningAreaId" TEXT NOT NULL,
    "guestId" TEXT,
    "type" "TableCallType" NOT NULL,
    "note" VARCHAR(80),
    "status" "TableCallStatus" NOT NULL DEFAULT 'RAISED',
    "clientRequestId" TEXT,
    "routedToStaffId" TEXT,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableCall_clientRequestId_key" ON "TableCall"("clientRequestId");

-- CreateIndex
CREATE INDEX "TableCall_sessionId_status_idx" ON "TableCall"("sessionId", "status");

-- CreateIndex
CREATE INDEX "TableCall_status_createdAt_idx" ON "TableCall"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TableCall_guestId_createdAt_idx" ON "TableCall"("guestId", "createdAt");

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "DiningArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TableGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_routedToStaffId_fkey" FOREIGN KEY ("routedToStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCall" ADD CONSTRAINT "TableCall_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

