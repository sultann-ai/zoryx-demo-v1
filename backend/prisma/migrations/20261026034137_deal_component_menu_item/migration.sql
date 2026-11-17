-- AlterTable
ALTER TABLE "DealComponent" ADD COLUMN     "menuItemId" TEXT;

-- AddForeignKey
ALTER TABLE "DealComponent" ADD CONSTRAINT "DealComponent_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

