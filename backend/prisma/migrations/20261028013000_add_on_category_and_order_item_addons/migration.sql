-- AlterTable
ALTER TABLE "AddOn" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "addOns" JSONB;

-- AddForeignKey
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
