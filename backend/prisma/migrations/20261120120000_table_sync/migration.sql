-- CreateEnum
CREATE TYPE "TableSessionOpenedVia" AS ENUM ('SEAT', 'STAFF_ORDER', 'SCHEDULED_ORDER', 'SPLIT_OFF', 'MIGRATION');

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'TABLE_CHANGED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TableSessionEventType" ADD VALUE 'OPENED_BY_ORDER';
ALTER TYPE "TableSessionEventType" ADD VALUE 'AUTO_RELEASED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'ORDER_MOVED_IN';
ALTER TYPE "TableSessionEventType" ADD VALUE 'ORDER_MOVED_OUT';
ALTER TYPE "TableSessionEventType" ADD VALUE 'TABLE_MOVED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'MERGED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'UNMERGED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'SPLIT_OFF';
ALTER TYPE "TableSessionEventType" ADD VALUE 'SETTLED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'MIGRATED';
ALTER TYPE "TableSessionEventType" ADD VALUE 'DAY_END_CLOSED';

-- AlterTable
ALTER TABLE "TableSession" ADD COLUMN     "mergedIntoSessionId" TEXT,
ADD COLUMN     "openedByOrderId" TEXT,
ADD COLUMN     "openedVia" "TableSessionOpenedVia" NOT NULL DEFAULT 'SEAT';

-- CreateIndex
CREATE INDEX "TableSession_mergedIntoSessionId_idx" ON "TableSession"("mergedIntoSessionId");

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_mergedIntoSessionId_fkey" FOREIGN KEY ("mergedIntoSessionId") REFERENCES "TableSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

