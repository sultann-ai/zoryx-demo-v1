import { MediaKind, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { assertAttachable, releaseMediaIfUnreferenced } from "../media/media.service";
import {
  assertUnderCap,
  DELIVERY_AREA_ACTIVE_CAP,
  GALLERY_ACTIVE_CAP,
  PAYMENT_ACCOUNT_ACTIVE_CAP,
  RecordNotFoundError,
  TESTIMONIAL_ACTIVE_CAP,
} from "./siteContent.errors";

type Data = Record<string, unknown>;

// ================= SiteSettings (single row, id 1) =================

// Shown until staff fill in the real details.
const SETTINGS_PLACEHOLDERS = {
  shopNameEn: "Zoryx",
  shopNameUr: "زوریکس",
  taglineEn: "Fresh cakes, pastries and sweets",
  taglineUr: "تازہ کیک، پیسٹری اور مٹھائیاں",
  phone: "0300 0000000",
  whatsappNumber: "923000000000",
  addressEn: "Address coming soon",
  addressUr: "پتہ جلد شامل کیا جائے گا",
  mapUrl: "https://maps.google.com",
  openingHoursEn: "Opening hours coming soon",
  openingHoursUr: "اوقاتِ کار جلد شامل کیے جائیں گے",
};

// Creates the row on first boot and does nothing afterwards (update is empty, so staff edits are
// never overwritten).
export function ensureSiteSettings() {
  return prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...SETTINGS_PLACEHOLDERS },
  });
}

export async function getSiteSettings() {
  return (await prisma.siteSettings.findUnique({ where: { id: 1 } })) ?? ensureSiteSettings();
}

// At least one way of ordering must stay on, or the website could not take any order.
export class NoOrderTypeEnabledError extends Error {}

export async function updateSiteSettings(data: Data) {
  const current = await ensureSiteSettings();
  const delivery = typeof data.deliveryEnabled === "boolean" ? data.deliveryEnabled : current.deliveryEnabled;
  const pickup = typeof data.pickupEnabled === "boolean" ? data.pickupEnabled : current.pickupEnabled;
  if (!delivery && !pickup) {
    throw new NoOrderTypeEnabledError();
  }
  return prisma.siteSettings.update({ where: { id: 1 }, data: data as Prisma.SiteSettingsUpdateInput });
}

// ================= DeliveryArea =================

const byOrder = [{ sortOrder: "asc" }, { createdAt: "asc" }] as const;

export function listDeliveryAreas() {
  return prisma.deliveryArea.findMany({ orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });
}

export function createDeliveryArea(data: Data) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive !== false) {
      assertUnderCap(
        await tx.deliveryArea.count({ where: { isActive: true } }),
        DELIVERY_AREA_ACTIVE_CAP,
        "delivery areas",
      );
    }
    return tx.deliveryArea.create({ data: data as Prisma.DeliveryAreaCreateInput });
  });
}

export function updateDeliveryArea(id: string, data: Data) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.deliveryArea.findUnique({ where: { id }, select: { isActive: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (data.isActive === true && !current.isActive) {
      assertUnderCap(
        await tx.deliveryArea.count({ where: { isActive: true } }),
        DELIVERY_AREA_ACTIVE_CAP,
        "delivery areas",
      );
    }
    return tx.deliveryArea.update({ where: { id }, data: data as Prisma.DeliveryAreaUpdateInput });
  });
}

// Once the ordering module references an area from orders, this starts failing with a foreign-key
// error, which the error mapper turns into "deactivate it instead".
export async function deleteDeliveryArea(id: string) {
  await prisma.deliveryArea.delete({ where: { id } });
}

// ================= PaymentAccount =================

export function listPaymentAccounts() {
  return prisma.paymentAccount.findMany({ orderBy: [...byOrder] });
}

export function createPaymentAccount(data: Data) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive !== false) {
      assertUnderCap(
        await tx.paymentAccount.count({ where: { isActive: true } }),
        PAYMENT_ACCOUNT_ACTIVE_CAP,
        "payment accounts",
      );
    }
    if (typeof data.qrMediaId === "string") {
      await assertAttachable(tx, data.qrMediaId, MediaKind.PAYMENT_QR);
    }
    return tx.paymentAccount.create({ data: data as Prisma.PaymentAccountUncheckedCreateInput });
  });
}

export function updatePaymentAccount(id: string, data: Data) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentAccount.findUnique({ where: { id }, select: { isActive: true, qrMediaId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (data.isActive === true && !current.isActive) {
      assertUnderCap(
        await tx.paymentAccount.count({ where: { isActive: true } }),
        PAYMENT_ACCOUNT_ACTIVE_CAP,
        "payment accounts",
      );
    }
    if (typeof data.qrMediaId === "string" && data.qrMediaId !== current.qrMediaId) {
      await assertAttachable(tx, data.qrMediaId, MediaKind.PAYMENT_QR);
    }
    const updated = await tx.paymentAccount.update({
      where: { id },
      data: data as Prisma.PaymentAccountUncheckedUpdateInput,
    });
    if (data.qrMediaId !== undefined && current.qrMediaId !== updated.qrMediaId) {
      await releaseMediaIfUnreferenced(tx, current.qrMediaId);
    }
    return updated;
  });
}

export function deletePaymentAccount(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentAccount.findUnique({ where: { id }, select: { qrMediaId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    await tx.paymentAccount.delete({ where: { id } });
    await releaseMediaIfUnreferenced(tx, current.qrMediaId);
  });
}

// ================= GalleryImage =================

export function listGalleryImages() {
  return prisma.galleryImage.findMany({ orderBy: [...byOrder] });
}

export function createGalleryImage(data: Data) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive !== false) {
      assertUnderCap(await tx.galleryImage.count({ where: { isActive: true } }), GALLERY_ACTIVE_CAP, "gallery images");
    }
    await assertAttachable(tx, data.mediaId as string, MediaKind.GALLERY);
    return tx.galleryImage.create({ data: data as Prisma.GalleryImageUncheckedCreateInput });
  });
}

export function updateGalleryImage(id: string, data: Data) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.galleryImage.findUnique({ where: { id }, select: { isActive: true, mediaId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (data.isActive === true && !current.isActive) {
      assertUnderCap(await tx.galleryImage.count({ where: { isActive: true } }), GALLERY_ACTIVE_CAP, "gallery images");
    }
    if (typeof data.mediaId === "string" && data.mediaId !== current.mediaId) {
      await assertAttachable(tx, data.mediaId, MediaKind.GALLERY);
    }
    const updated = await tx.galleryImage.update({
      where: { id },
      data: data as Prisma.GalleryImageUncheckedUpdateInput,
    });
    if (updated.mediaId !== current.mediaId) {
      await releaseMediaIfUnreferenced(tx, current.mediaId);
    }
    return updated;
  });
}

export function deleteGalleryImage(id: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.galleryImage.findUnique({ where: { id }, select: { mediaId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    await tx.galleryImage.delete({ where: { id } });
    await releaseMediaIfUnreferenced(tx, current.mediaId);
  });
}

// ================= Testimonial =================

export function listTestimonials() {
  return prisma.testimonial.findMany({ orderBy: [...byOrder] });
}

export function createTestimonial(data: Data) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive !== false) {
      assertUnderCap(await tx.testimonial.count({ where: { isActive: true } }), TESTIMONIAL_ACTIVE_CAP, "testimonials");
    }
    return tx.testimonial.create({ data: data as Prisma.TestimonialCreateInput });
  });
}

export function updateTestimonial(id: string, data: Data) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.testimonial.findUnique({ where: { id }, select: { isActive: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (data.isActive === true && !current.isActive) {
      assertUnderCap(await tx.testimonial.count({ where: { isActive: true } }), TESTIMONIAL_ACTIVE_CAP, "testimonials");
    }
    return tx.testimonial.update({ where: { id }, data: data as Prisma.TestimonialUpdateInput });
  });
}

export async function deleteTestimonial(id: string) {
  await prisma.testimonial.delete({ where: { id } });
}
