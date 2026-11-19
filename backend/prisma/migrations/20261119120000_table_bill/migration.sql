-- Table QR, build step 8: the table bill (docs/TABLE_QR_SPEC.md §2.4, §7). Additive only: four new
-- enums and four new tables. Generated with `prisma migrate diff --from-url <local DB>` (the dev DB user
-- cannot create the shadow database `migrate dev` needs) and applied with `migrate deploy`.

-- CreateEnum
CREATE TYPE "TableBillStatus" AS ENUM ('REQUESTED', 'UNLOCKED', 'PAID');

-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('EQUAL', 'BY_ITEMS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TableShareStatus" AS ENUM ('UNPAID', 'PROOF_SUBMITTED', 'VERIFIED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "TableBillLineKind" AS ENUM ('ITEM', 'DEAL');

-- CreateTable
CREATE TABLE "TableBill" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "TableBillStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByGuestId" TEXT,
    "requestedByStaffId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "discountById" TEXT,
    "discountAt" TIMESTAMP(3),
    "discountReason" VARCHAR(200),
    "splitMode" "SplitMode",
    "splitVersion" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableBillShare" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "splitVersion" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "guestId" TEXT,
    "label" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "TableShareStatus" NOT NULL DEFAULT 'UNPAID',
    "method" "PaymentMethod",
    "paymentProofMediaId" TEXT,
    "paidAmount" DECIMAL(10,2),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableBillShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableBillClaim" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "splitVersion" INTEGER NOT NULL,
    "lineKind" "TableBillLineKind" NOT NULL,
    "lineId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableBillClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableReceipt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "taxInvoiceNumber" TEXT,
    "taxAuthority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableBill_sessionId_key" ON "TableBill"("sessionId");

-- CreateIndex
CREATE INDEX "TableBillShare_billId_splitVersion_idx" ON "TableBillShare"("billId", "splitVersion");

-- CreateIndex
CREATE INDEX "TableBillShare_status_idx" ON "TableBillShare"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TableBillShare_billId_splitVersion_position_key" ON "TableBillShare"("billId", "splitVersion", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TableBillClaim_billId_splitVersion_lineKind_lineId_guestId_key" ON "TableBillClaim"("billId", "splitVersion", "lineKind", "lineId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "TableReceipt_sessionId_key" ON "TableReceipt"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TableReceipt_receiptKey_key" ON "TableReceipt"("receiptKey");

-- AddForeignKey
ALTER TABLE "TableBill" ADD CONSTRAINT "TableBill_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBillShare" ADD CONSTRAINT "TableBillShare_billId_fkey" FOREIGN KEY ("billId") REFERENCES "TableBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBillShare" ADD CONSTRAINT "TableBillShare_paymentProofMediaId_fkey" FOREIGN KEY ("paymentProofMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBillClaim" ADD CONSTRAINT "TableBillClaim_billId_fkey" FOREIGN KEY ("billId") REFERENCES "TableBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableBillClaim" ADD CONSTRAINT "TableBillClaim_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "TableGuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableReceipt" ADD CONSTRAINT "TableReceipt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-appended (Prisma can't express CHECK constraints): money on a share or a bill discount is never
-- negative, enforced by the database itself as well as by splitMath.ts.
ALTER TABLE "TableBillShare" ADD CONSTRAINT "TableBillShare_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "TableBill" ADD CONSTRAINT "TableBill_discount_nonnegative" CHECK ("discount" >= 0);
