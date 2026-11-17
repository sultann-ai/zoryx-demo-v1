-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'CATEGORY';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "hasTransparency" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "imageId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
