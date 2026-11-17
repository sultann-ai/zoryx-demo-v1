-- CreateEnum
CREATE TYPE "VendorLedgerEntryType" AS ENUM ('PURCHASE', 'PAYMENT');

-- AlterTable
ALTER TABLE "InventoryTransaction" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorLedgerEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "VendorLedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorLedgerEntry_vendorId_idx" ON "VendorLedgerEntry"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorLedgerEntry" ADD CONSTRAINT "VendorLedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLedgerEntry" ADD CONSTRAINT "VendorLedgerEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
