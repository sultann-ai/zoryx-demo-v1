-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('MENU_ITEM', 'DEAL', 'GALLERY', 'PAYMENT_QR', 'PAYMENT_PROOF');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "nameUr" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "descriptionUr" TEXT,
ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "nameUr" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "descriptionUr" TEXT,
ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nameUr" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaBlob" (
    "id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "thumb" BYTEA,

    CONSTRAINT "MediaBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shopNameEn" TEXT NOT NULL,
    "shopNameUr" TEXT NOT NULL,
    "taglineEn" TEXT NOT NULL,
    "taglineUr" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "addressEn" TEXT NOT NULL,
    "addressUr" TEXT NOT NULL,
    "mapUrl" TEXT NOT NULL,
    "openingHoursEn" TEXT NOT NULL,
    "openingHoursUr" TEXT NOT NULL,
    "announcementEn" TEXT,
    "announcementUr" TEXT,
    "onlineOrderingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryArea" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameUr" TEXT NOT NULL,
    "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "qrMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "captionEn" TEXT,
    "captionUr" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "text" TEXT NOT NULL,
    "textUr" TEXT,
    "rating" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_kind_createdAt_idx" ON "MediaAsset"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaBlob" ADD CONSTRAINT "MediaBlob_id_fkey" FOREIGN KEY ("id") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_qrMediaId_fkey" FOREIGN KEY ("qrMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-added constraints (Prisma's schema language can't express CHECKs).
-- SiteSettings is a single row, id always 1.
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_single_row" CHECK ("id" = 1);

-- Testimonial rating is optional, but 1-5 when present.
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));

-- Delivery fee and minimum order can't be negative.
ALTER TABLE "DeliveryArea" ADD CONSTRAINT "DeliveryArea_amounts_non_negative" CHECK ("deliveryFee" >= 0 AND "minOrderAmount" >= 0);
