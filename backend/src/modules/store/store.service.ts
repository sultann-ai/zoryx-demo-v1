import { prisma } from "../../config/prisma";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { computeOrdering, toPublicStore } from "./publicMappers";

// Everything the website needs besides the menu, in one round trip. The active rows are filtered
// in SQL and again in the mapper; the mapper is what decides which fields leave the server.
export async function getPublicStore() {
  const [settings, deliveryAreas, paymentAccounts, gallery, testimonials, activeBusinessDay] = await Promise.all([
    getSiteSettings(),
    prisma.deliveryArea.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    prisma.paymentAccount.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.galleryImage.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.testimonial.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.businessDay.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);

  return toPublicStore({
    settings,
    deliveryAreas,
    paymentAccounts,
    gallery,
    testimonials,
    hasActiveBusinessDay: activeBusinessDay !== null,
  });
}

// Whether the website may take an order right now: online ordering is switched on AND a business
// day is running (orders can't be created without one). Shared with guest checkout so the answer
// the website sees on /store is exactly the one the order route enforces.
export async function getOrderingState() {
  const [settings, activeBusinessDay] = await Promise.all([
    getSiteSettings(),
    prisma.businessDay.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  return computeOrdering(settings.onlineOrderingEnabled, activeBusinessDay !== null);
}
