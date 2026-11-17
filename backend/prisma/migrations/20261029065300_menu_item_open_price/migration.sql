-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "isOpenPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPrice" DECIMAL(10,2),
ADD COLUMN     "minPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isCustomPrice" BOOLEAN NOT NULL DEFAULT false;
