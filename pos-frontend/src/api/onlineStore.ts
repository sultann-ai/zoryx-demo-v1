import { apiClient } from "./client";
import { createCrudApi } from "./crud";

// Everything the customer website shows that isn't ordering. Endpoints: backend/docs §3.18.

// ---------- Store settings (a single row) ----------

export interface SiteSettings {
  id: number;
  shopNameEn: string;
  shopNameUr: string;
  taglineEn: string;
  taglineUr: string;
  phone: string;
  // Digits only, international format without "+", e.g. 923001234567.
  whatsappNumber: string;
  addressEn: string;
  addressUr: string;
  mapUrl: string;
  openingHoursEn: string;
  openingHoursUr: string;
  announcementEn: string | null;
  announcementUr: string | null;
  onlineOrderingEnabled: boolean;
  // Ways to order online (at least one stays on). Pickup is a TAKEAWAY order with no address and no delivery fee.
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  // Money as a string, like every other amount from the API ("0" means no minimum).
  pickupMinOrderAmount: string;
  pickupNoteEn: string | null;
  pickupNoteUr: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  // The largest discount a POS Admin may give, % of an order's items ("20.00"). SUPER_ADMIN-only to change.
  maxDiscountPercentPosAdmin: string;
  // A POS takeaway is completed the moment it is marked paid (default true). SA/PA only to change.
  autoCompleteTakeawayOnPayment: boolean;
  updatedAt: string;
}

// PUT merges whatever is sent, so a partial object is the normal case.
export type SiteSettingsInput = Partial<Omit<SiteSettings, "id" | "updatedAt">>;

export const siteSettingsApi = {
  get: async (): Promise<SiteSettings> => {
    const { data } = await apiClient.get<SiteSettings>("/api/pos/site-settings");
    return data;
  },
  update: async (input: SiteSettingsInput): Promise<SiteSettings> => {
    const { data } = await apiClient.put<SiteSettings>("/api/pos/site-settings", input);
    return data;
  },
};

// ---------- Lists ----------

export interface DeliveryArea {
  id: string;
  nameEn: string;
  nameUr: string;
  // Decimal strings.
  deliveryFee: string;
  minOrderAmount: string;
  sortOrder: number;
  isActive: boolean;
}

export interface DeliveryAreaInput {
  nameEn?: string;
  nameUr?: string;
  deliveryFee?: number;
  minOrderAmount?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export const deliveryAreasApi = createCrudApi<DeliveryArea, DeliveryAreaInput, DeliveryAreaInput>("/api/pos/delivery-areas");

export interface PaymentAccount {
  id: string;
  // e.g. Easypaisa, JazzCash, Bank
  label: string;
  accountTitle: string;
  accountNumber: string;
  qrMediaId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface PaymentAccountInput {
  label?: string;
  accountTitle?: string;
  accountNumber?: string;
  qrMediaId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const paymentAccountsApi = createCrudApi<PaymentAccount, PaymentAccountInput, PaymentAccountInput>(
  "/api/pos/payment-accounts",
);

export interface GalleryImage {
  id: string;
  mediaId: string;
  captionEn: string | null;
  captionUr: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface GalleryImageInput {
  mediaId?: string;
  captionEn?: string | null;
  captionUr?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const galleryApi = createCrudApi<GalleryImage, GalleryImageInput, GalleryImageInput>("/api/pos/gallery");

export interface Testimonial {
  id: string;
  name: string;
  area: string | null;
  text: string;
  textUr: string | null;
  rating: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface TestimonialInput {
  name?: string;
  area?: string | null;
  text?: string;
  textUr?: string | null;
  rating?: number | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const testimonialsApi = createCrudApi<Testimonial, TestimonialInput, TestimonialInput>("/api/pos/testimonials");

// ---------- Website fields on menu items, deals and categories ----------
// Separate PATCH endpoints that take website fields only — so these roles can never reach a price.

export interface MenuItemOnlineContentInput {
  imageId?: string | null;
  nameUr?: string | null;
  descriptionUr?: string | null;
  isFeatured?: boolean;
  isAvailableOnline?: boolean;
  sortOrder?: number;
}

export interface DealOnlineContentInput {
  imageId?: string | null;
  nameUr?: string | null;
  descriptionUr?: string | null;
  isFeatured?: boolean;
  isAvailableOnline?: boolean;
}

export interface CategoryOnlineContentInput {
  imageId?: string | null;
  nameUr?: string | null;
  sortOrder?: number;
}

export const onlineContentApi = {
  menuItem: async (id: string, input: MenuItemOnlineContentInput): Promise<void> => {
    await apiClient.patch(`/api/pos/menu/${id}/online-content`, input);
  },
  deal: async (id: string, input: DealOnlineContentInput): Promise<void> => {
    await apiClient.patch(`/api/pos/deals/${id}/online-content`, input);
  },
  category: async (id: string, input: CategoryOnlineContentInput): Promise<void> => {
    await apiClient.patch(`/api/pos/categories/${id}/online-content`, input);
  },
};

// ---------- Can customers order right now? ----------

export type ClosedReason = "switched_off" | "no_business_day" | null;

export interface OnlineStoreState {
  orderingOpen: boolean;
  closedReason: ClosedReason;
}

// The public /store endpoint — the exact answer the website itself gets (the "live line" on Store
// settings). A throwaway query parameter keeps the browser from showing a cached copy: the server
// marks it cacheable for a minute, and a staff member who just flipped a switch wants the truth.
export async function fetchOnlineStoreState(): Promise<OnlineStoreState> {
  const { data } = await apiClient.get<OnlineStoreState>("/api/online/store", { params: { t: Date.now() } });
  return { orderingOpen: data.orderingOpen, closedReason: data.closedReason };
}
