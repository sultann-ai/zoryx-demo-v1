-- DropForeignKey
ALTER TABLE "DealComponent" DROP CONSTRAINT "DealComponent_variantId_fkey";

-- AddForeignKey
ALTER TABLE "DealComponent" ADD CONSTRAINT "DealComponent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

