import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { getIO } from "../../config/socket";
import type { ProcessedMedia } from "../../common/media/processImage";
import { releaseMediaIfUnreferenced } from "../media/media.service";
import { createOrder, OrderGuardRejectedError } from "../order/order.service";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { getOrderingState } from "../store/store.service";
import { hashClientIp } from "./clientIp";
import { CustomerStatus, deriveCustomerStatus, derivePaymentState } from "./customerStatus";
import { buildDeliveryAddress, GuestOrderInput, MAX_ORDER_TOTAL } from "./guestOrder.validators";
import { exceedsGuestLimits, NOT_COLLECTED_WINDOW_MS, ONE_DAY_MS, TEN_MINUTES_MS } from "./guestOrderLimits";
import { generatePublicCode, generatePublicId } from "./publicIds";
import { SourcePublicOrder, toPublicOrderStatus } from "./publicOrderMapper";

export class OrderingClosedError extends Error {}
export class BadAreaError extends Error {}
// The customer picked a way to order that the shop has switched off.
export class PickupUnavailableError extends Error {}
export class DeliveryUnavailableError extends Error {}
// The clientRequestId was already used for an order that isn't this request's (a different phone,
// or not a guest order at all) — never hand someone else's status link back.
export class RequestIdReusedError extends Error {}
export class PublicOrderNotFoundError extends Error {}
export class NotAwaitingPaymentError extends Error {}

export interface GuestOrderResult {
  publicId: string;
  publicCode: string;
  orderNumber: number;
  total: string;
  deliveryFee: string;
  paymentMethod: PaymentMethod;
  status: CustomerStatus;
  orderType: "DELIVERY" | "PICKUP";
}

const replaySelect = {
  publicId: true,
  publicCode: true,
  orderNumber: true,
  totalAmount: true,
  deliveryFee: true,
  paymentMethod: true,
  status: true,
  type: true,
  riderId: true,
  customerPhone: true,
  items: { select: { status: true } },
} satisfies Prisma.OrderSelect;

type ReplayRow = Prisma.OrderGetPayload<{ select: typeof replaySelect }>;

function toResult(row: ReplayRow): GuestOrderResult {
  return {
    publicId: row.publicId as string,
    publicCode: row.publicCode as string,
    orderNumber: row.orderNumber,
    total: row.totalAmount.toString(),
    deliveryFee: row.deliveryFee.toString(),
    paymentMethod: row.paymentMethod,
    status: deriveCustomerStatus({
      type: row.type,
      status: row.status,
      riderId: row.riderId,
      itemStatuses: row.items.map((item) => item.status),
    }),
    orderType: row.type === OrderType.TAKEAWAY ? "PICKUP" : "DELIVERY",
  };
}

async function findReplay(clientRequestId: string, phone: string): Promise<GuestOrderResult | null> {
  const existing = await prisma.order.findUnique({ where: { clientRequestId }, select: replaySelect });
  if (!existing) {
    return null;
  }
  // Only the same guest (same phone) gets the original answer back.
  if (existing.publicId === null || existing.publicCode === null || existing.customerPhone !== phone) {
    throw new RequestIdReusedError();
  }
  return toResult(existing);
}

function isUniqueViolationOn(error: unknown, column: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(column)
  );
}

const MAX_CODE_ATTEMPTS = 6;

export async function createGuestOrder(
  input: GuestOrderInput,
  clientIp: string | undefined,
): Promise<{ result: GuestOrderResult; isNew: boolean }> {
  const { customer } = input;

  // A retry of a request that already succeeded gets the same answer and counts toward no limit.
  const replay = await findReplay(input.clientRequestId, customer.phone);
  if (replay) {
    return { result: replay, isNew: false };
  }

  if (!(await getOrderingState()).orderingOpen) {
    throw new OrderingClosedError();
  }

  // The shop may have switched one way of ordering off; the check is the server's, never the page's.
  const settings = await getSiteSettings();
  if (input.orderType === "PICKUP" ? !settings.pickupEnabled : !settings.deliveryEnabled) {
    throw input.orderType === "PICKUP" ? new PickupUnavailableError() : new DeliveryUnavailableError();
  }

  // Delivery: the chosen area sets the fee, minimum and printed address. Pickup has none of that:
  // no area, no address, no fee, and its own minimum.
  let orderPart: Pick<
    Parameters<typeof createOrder>[0],
    "type" | "deliveryAreaId" | "deliveryFee" | "deliveryAddress" | "minSubtotal"
  >;
  if (input.orderType === "PICKUP") {
    orderPart = {
      type: OrderType.TAKEAWAY,
      ...(settings.pickupMinOrderAmount.greaterThan(0) ? { minSubtotal: settings.pickupMinOrderAmount } : {}),
    };
  } else {
    if (input.customer.deliveryAreaId === undefined) {
      // The customer's area isn't listed: no area row, no fee and no minimum. Staff see the typed
      // area in the printed address and confirm the delivery fee by phone.
      orderPart = {
        type: OrderType.DELIVERY,
        deliveryAddress: buildDeliveryAddress({
          house: input.customer.house,
          street: input.customer.street,
          areaName: `${input.customer.otherArea ?? ""} (area not listed)`,
          landmark: input.customer.landmark,
        }),
      };
    } else {
      const area = await prisma.deliveryArea.findUnique({ where: { id: input.customer.deliveryAreaId } });
      if (!area || !area.isActive) {
        throw new BadAreaError();
      }
      orderPart = {
        type: OrderType.DELIVERY,
        deliveryAreaId: area.id,
        deliveryFee: area.deliveryFee,
        deliveryAddress: buildDeliveryAddress({
          house: input.customer.house,
          street: input.customer.street,
          areaName: area.nameEn,
          landmark: input.customer.landmark,
        }),
        ...(area.minOrderAmount.greaterThan(0) ? { minSubtotal: area.minOrderAmount } : {}),
      };
    }
  }

  const ipHash = hashClientIp(clientIp, env.JWT_SECRET);

  // Counted in Postgres inside the creation transaction (after its per-day lock), so the limits
  // survive restarts and two simultaneous orders can't both slip under one.
  const guard = async (tx: Prisma.TransactionClient) => {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - TEN_MINUTES_MS);
    const dayAgo = new Date(now - ONE_DAY_MS);
    const counts = {
      ipLastTenMinutes: await tx.orderClientIp.count({ where: { ipHash, createdAt: { gte: tenMinutesAgo } } }),
      ipLastDay: await tx.orderClientIp.count({ where: { ipHash, createdAt: { gte: dayAgo } } }),
      phoneAwaitingReception: await tx.order.count({
        where: { customerPhone: customer.phone, status: OrderStatus.AWAITING_RECEPTION },
      }),
      phoneLastDay: await tx.order.count({ where: { customerPhone: customer.phone, createdAt: { gte: dayAgo } } }),
      // Repeat no-shows: pickup orders staff marked "Not collected" (the same answer as the other limits).
      phoneNotCollected: await tx.order.count({
        where: { customerPhone: customer.phone, notCollectedAt: { gte: new Date(now - NOT_COLLECTED_WINDOW_MS) } },
      }),
    };
    if (exceedsGuestLimits(counts)) {
      throw new OrderGuardRejectedError();
    }
  };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      const order = await createOrder({
        source: OrderSource.ONLINE,
        ...orderPart,
        paymentMethod: input.paymentMethod,
        // Waits at reception exactly like any online order: no kitchen, no stock, until accepted.
        status: OrderStatus.AWAITING_RECEPTION,
        ...(input.paymentMethod === PaymentMethod.ONLINE ? { paymentStatus: PaymentStatus.AWAITING_VERIFICATION } : {}),
        customerName: customer.name,
        customerPhone: customer.phone,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        publicId: generatePublicId(),
        publicCode: generatePublicCode(),
        clientRequestId: input.clientRequestId,
        clientIpHash: ipHash,
        onlineOnly: true,
        maxTotal: new Prisma.Decimal(MAX_ORDER_TOTAL),
        guard,
        items: input.items,
        deals: input.deals,
      });
      return {
        result: {
          publicId: order.publicId as string,
          publicCode: order.publicCode as string,
          orderNumber: order.orderNumber,
          total: order.totalAmount.toString(),
          deliveryFee: order.deliveryFee.toString(),
          paymentMethod: order.paymentMethod,
          status: "RECEIVED",
          orderType: input.orderType,
        },
        isNew: true,
      };
    } catch (error) {
      // The 5-character code collided with an existing order's: draw another and retry.
      if (isUniqueViolationOn(error, "publicCode")) {
        continue;
      }
      // True race: two requests with the same clientRequestId both passed the pre-check. The unique
      // constraint is the backstop — answer exactly like the pre-check's replay.
      if (isUniqueViolationOn(error, "clientRequestId")) {
        const raced = await findReplay(input.clientRequestId, customer.phone);
        if (raced) {
          return { result: raced, isNew: false };
        }
      }
      throw error;
    }
  }
  throw new Error("Could not allocate a unique order code");
}

// ================= Status page =================

const publicStatusSelect = {
  publicCode: true,
  status: true,
  type: true,
  riderId: true,
  paymentMethod: true,
  paymentStatus: true,
  paymentProofMediaId: true,
  cancelledReason: true,
  discount: true,
  deliveryFee: true,
  totalAmount: true,
  createdAt: true,
  items: {
    select: {
      status: true,
      quantity: true,
      subtotal: true,
      variantLabel: true,
      addOns: true,
      dealOrderLineId: true,
      menuItem: { select: { name: true, nameUr: true } },
    },
  },
  dealLines: {
    select: { id: true, dealName: true, quantity: true, subtotal: true, deal: { select: { nameUr: true } } },
  },
} satisfies Prisma.OrderSelect;

export async function getPublicOrderStatus(publicId: string) {
  const order = await prisma.order.findUnique({ where: { publicId }, select: publicStatusSelect });
  if (!order || order.publicCode === null) {
    return null;
  }
  // A pickup customer also needs to know where to collect: public shop content, loaded only for pickup orders.
  const pickupShop =
    order.type === OrderType.TAKEAWAY
      ? await getSiteSettings().then((s) => ({
          addressEn: s.addressEn,
          addressUr: s.addressUr,
          mapUrl: s.mapUrl,
          noteEn: s.pickupNoteEn,
          noteUr: s.pickupNoteUr,
        }))
      : undefined;
  return toPublicOrderStatus(order as SourcePublicOrder, pickupShop);
}

// ================= Payment proof =================

// Stores the (already processed) proof as a PAYMENT_PROOF asset and points the order at it,
// deleting any earlier proof in the same transaction. Only for an ONLINE order that is still
// waiting for its payment to be verified.
export async function attachPaymentProof(publicId: string, processed: ProcessedMedia) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { publicId },
      select: { id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, paymentProofMediaId: true },
    });
    if (!order) {
      throw new PublicOrderNotFoundError();
    }
    const isOpen = order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED;
    if (
      order.paymentMethod !== PaymentMethod.ONLINE ||
      order.paymentStatus !== PaymentStatus.AWAITING_VERIFICATION ||
      !isOpen
    ) {
      throw new NotAwaitingPaymentError();
    }

    const asset = await tx.mediaAsset.create({
      data: {
        kind: "PAYMENT_PROOF",
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.data.length,
        createdById: null,
        blob: {
          create: {
            data: new Uint8Array(processed.data),
            thumb: processed.thumb ? new Uint8Array(processed.thumb) : null,
          },
        },
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: order.id }, data: { paymentProofMediaId: asset.id } });
    await releaseMediaIfUnreferenced(tx, order.paymentProofMediaId);
    return { orderId: order.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod };
  });

  // Reception's open Incoming card refreshes to show the new proof.
  try {
    getIO().to("pos-admin").emit("order:updated", { orderId: result.orderId, orderNumber: result.orderNumber });
  } catch {
    // No Socket.io in this process (a standalone script) — nothing to notify.
  }

  return derivePaymentState({
    paymentMethod: result.paymentMethod,
    paymentStatus: result.paymentStatus,
    hasProof: true,
  });
}
