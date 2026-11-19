-- Table QR, build step 1: tables (layout, QR key), table sessions, guests, session audit.
-- Additive only. Generated with `prisma migrate diff` (the dev DB user can't create the shadow
-- database `migrate dev` needs), plus the hand-written partial unique index at the end.

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('RECT', 'ROUND');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "TableSessionEventType" AS ENUM ('SEATED', 'GUEST_JOINED', 'GUEST_REMOVED', 'PIN_ROTATED', 'PIN_LOCKED', 'WAITER_CHANGED', 'CLOSED', 'VOIDED', 'BILL_REQUESTED', 'BILL_UNLOCKED', 'BILL_DISCOUNT_SET', 'SPLIT_SET', 'SPLIT_CANCELLED', 'SHARE_PAID', 'SHARE_PROOF', 'SHARE_VERIFIED', 'SHARE_REJECTED', 'SHARE_UNMARKED', 'BILL_PAID');

-- AlterTable
ALTER TABLE "DiningArea" ADD COLUMN     "defaultWaiterStaffId" TEXT,
ADD COLUMN     "layoutH" INTEGER,
ADD COLUMN     "layoutW" INTEGER,
ADD COLUMN     "layoutX" INTEGER,
ADD COLUMN     "layoutY" INTEGER,
ADD COLUMN     "outOfService" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qrKey" TEXT,
ADD COLUMN     "rotation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shape" "TableShape" NOT NULL DEFAULT 'RECT';

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "tableQrEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tableQrRequirePin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "diningAreaId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "joinPin" VARCHAR(4),
    "pinFailures" INTEGER NOT NULL DEFAULT 0,
    "waiterStaffId" TEXT,
    "seatedById" TEXT NOT NULL,
    "seatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "voidReason" VARCHAR(200),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableGuest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "displayName" VARCHAR(30) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "joinRequestId" TEXT,
    "joinOrder" INTEGER NOT NULL,
    "joinIpHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "TableSessionEventType" NOT NULL,
    "actorId" TEXT,
    "guestId" TEXT,
    "reason" VARCHAR(200),
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableSession_diningAreaId_status_idx" ON "TableSession"("diningAreaId", "status");

-- CreateIndex
CREATE INDEX "TableSession_businessDayId_status_idx" ON "TableSession"("businessDayId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TableGuest_tokenHash_key" ON "TableGuest"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TableGuest_joinRequestId_key" ON "TableGuest"("joinRequestId");

-- CreateIndex
CREATE INDEX "TableGuest_sessionId_idx" ON "TableGuest"("sessionId");

-- CreateIndex
CREATE INDEX "TableGuest_joinIpHash_createdAt_idx" ON "TableGuest"("joinIpHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableGuest_sessionId_joinOrder_key" ON "TableGuest"("sessionId", "joinOrder");

-- CreateIndex
CREATE INDEX "TableSessionEvent_sessionId_createdAt_idx" ON "TableSessionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiningArea_qrKey_key" ON "DiningArea"("qrKey");

-- AddForeignKey
ALTER TABLE "DiningArea" ADD CONSTRAINT "DiningArea_defaultWaiterStaffId_fkey" FOREIGN KEY ("defaultWaiterStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_diningAreaId_fkey" FOREIGN KEY ("diningAreaId") REFERENCES "DiningArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_businessDayId_fkey" FOREIGN KEY ("businessDayId") REFERENCES "BusinessDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_waiterStaffId_fkey" FOREIGN KEY ("waiterStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_seatedById_fkey" FOREIGN KEY ("seatedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableGuest" ADD CONSTRAINT "TableGuest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableGuest" ADD CONSTRAINT "TableGuest_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionEvent" ADD CONSTRAINT "TableSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSessionEvent" ADD CONSTRAINT "TableSessionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (Prisma can't express a partial unique index): at most one OPEN session per table.
-- A concurrent second "seat" of the same table fails here (P2002) and is answered TABLE_OCCUPIED.
CREATE UNIQUE INDEX "TableSession_one_open_per_table" ON "TableSession" ("diningAreaId") WHERE "status" = 'OPEN';
