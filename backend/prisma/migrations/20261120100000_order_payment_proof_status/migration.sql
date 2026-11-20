-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentProofAt" TIMESTAMP(3),
ADD COLUMN     "paymentRejectedReason" VARCHAR(200);
