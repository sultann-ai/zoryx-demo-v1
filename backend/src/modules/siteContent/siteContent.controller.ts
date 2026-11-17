import { Request, Response } from "express";
import { mediaUrls } from "../media/media.service";
import { makeCrudHandlers } from "./siteContent.crud";
import * as service from "./siteContent.service";
import * as validators from "./siteContent.validators";

// ---------- Site settings ----------

export async function getSiteSettings(_req: Request, res: Response) {
  res.json(await service.getSiteSettings());
}

export async function updateSiteSettings(req: Request, res: Response) {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "A JSON object body is required" });
    return;
  }
  const parsed = validators.parseSiteSettingsUpdate(body as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (Object.keys(parsed.value).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    res.json(await service.updateSiteSettings(parsed.value));
  } catch (error) {
    if (error instanceof service.NoOrderTypeEnabledError) {
      res.status(400).json({ code: "AT_LEAST_ONE_ORDER_TYPE", error: "Keep at least one of Delivery and Pickup switched on" });
      return;
    }
    throw error;
  }
}

// ---------- Lists ----------

export const deliveryAreas = makeCrudHandlers({
  label: "Delivery area",
  list: service.listDeliveryAreas,
  create: service.createDeliveryArea,
  update: service.updateDeliveryArea,
  remove: service.deleteDeliveryArea,
  parseCreate: validators.parseDeliveryAreaCreate,
  parseUpdate: validators.parseDeliveryAreaUpdate,
});

export const paymentAccounts = makeCrudHandlers({
  label: "Payment account",
  list: service.listPaymentAccounts,
  create: service.createPaymentAccount,
  update: service.updatePaymentAccount,
  remove: service.deletePaymentAccount,
  parseCreate: validators.parsePaymentAccountCreate,
  parseUpdate: validators.parsePaymentAccountUpdate,
  present: (account) => ({ ...account, qrUrl: account.qrMediaId ? mediaUrls(account.qrMediaId).full : null }),
});

export const gallery = makeCrudHandlers({
  label: "Gallery image",
  list: service.listGalleryImages,
  create: service.createGalleryImage,
  update: service.updateGalleryImage,
  remove: service.deleteGalleryImage,
  parseCreate: validators.parseGalleryCreate,
  parseUpdate: validators.parseGalleryUpdate,
  present: (image) => ({ ...image, image: mediaUrls(image.mediaId) }),
});

export const testimonials = makeCrudHandlers({
  label: "Testimonial",
  list: service.listTestimonials,
  create: service.createTestimonial,
  update: service.updateTestimonial,
  remove: service.deleteTestimonial,
  parseCreate: validators.parseTestimonialCreate,
  parseUpdate: validators.parseTestimonialUpdate,
});
