-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "deliveryAreaId" TEXT,
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentProofMediaId" TEXT,
ADD COLUMN     "publicCode" TEXT,
ADD COLUMN     "publicId" TEXT;

-- CreateTable
CREATE TABLE "OrderClientIp" (
    "orderId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderClientIp_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "OrderClientIp_ipHash_createdAt_idx" ON "OrderClientIp"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicId_key" ON "Order"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicCode_key" ON "Order"("publicCode");

-- CreateIndex
CREATE INDEX "Order_customerPhone_createdAt_idx" ON "Order"("customerPhone", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAreaId_fkey" FOREIGN KEY ("deliveryAreaId") REFERENCES "DeliveryArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentProofMediaId_fkey" FOREIGN KEY ("paymentProofMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderClientIp" ADD CONSTRAINT "OrderClientIp_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-added constraint (Prisma's schema language can't express CHECKs): a delivery fee can't be negative.
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryFee_non_negative" CHECK ("deliveryFee" >= 0);
