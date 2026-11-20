import { randomInt } from "crypto";
import { Request, Response } from "express";
import { InvalidImageError, processProof } from "../../common/media/processImage";
import { sendPaymentProof } from "../media/sendPaymentProof";
import {
  BelowMinimumError,
  DealNotFoundError,
  EmptyOrderError,
  InvalidOrderDealsError,
  InvalidOrderItemsError,
  ItemNotOrderableOnlineError,
  MenuItemNotFoundError,
  NoActiveBusinessDayError,
  OrderGuardRejectedError,
  OrderTooLargeError,
} from "../order/order.service";
import { GuestOrderValidationError, parseGuestOrderBody } from "./guestOrder.validators";
import * as guestOrderService from "./guestOrder.service";
import { generatePublicCode, generatePublicId, isPlausiblePublicId } from "./publicIds";

// Every error body on the public order routes is { code, error } so the website can branch on code.
function fail(res: Response, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ code, error, ...extra });
}

// POST /api/online/guest-orders
export async function createGuestOrder(req: Request, res: Response) {
  let parsed;
  try {
    parsed = parseGuestOrderBody(req.body);
  } catch (error) {
    if (error instanceof GuestOrderValidationError) {
      fail(res, 400, error.code, error.message);
      return;
    }
    throw error;
  }

  // A bot that filled the hidden field gets an ordinary-looking success — and nothing is created.
  if (parsed.kind === "honeypot") {
    const claimed = (req.body as Record<string, unknown>).paymentMethod;
    res.status(201).json({
      publicId: generatePublicId(),
      publicCode: generatePublicCode(),
      orderNumber: randomInt(1, 60),
      total: "0",
      deliveryFee: "0",
      paymentMethod: claimed === "ONLINE" ? "ONLINE" : "CASH",
      status: "RECEIVED",
    });
    return;
  }

  try {
    const { result, isNew } = await guestOrderService.createGuestOrder(parsed.order, req.ip);
    res.status(isNew ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof guestOrderService.OrderingClosedError || error instanceof NoActiveBusinessDayError) {
      fail(res, 409, "ORDERING_CLOSED", "We are not taking online orders right now.");
      return;
    }
    if (error instanceof guestOrderService.PickupUnavailableError) {
      fail(res, 400, "PICKUP_UNAVAILABLE", "Pickup is not available right now.");
      return;
    }
    if (error instanceof guestOrderService.DeliveryUnavailableError) {
      fail(res, 400, "DELIVERY_UNAVAILABLE", "Delivery is not available right now.");
      return;
    }
    if (error instanceof guestOrderService.BadAreaError) {
      fail(res, 400, "BAD_AREA", "That delivery area is not available.");
      return;
    }
    if (error instanceof BelowMinimumError) {
      fail(res, 400, "BELOW_MINIMUM", `The minimum order for this area is ${error.minOrderAmount.toString()}.`, {
        minOrderAmount: error.minOrderAmount.toString(),
      });
      return;
    }
    if (error instanceof OrderTooLargeError) {
      fail(res, 400, "ORDER_TOO_LARGE", "That order is too large to place online. Please call us.");
      return;
    }
    if (error instanceof ItemNotOrderableOnlineError) {
      fail(res, 400, "ITEM_UNAVAILABLE", "Something in your order is no longer available.");
      return;
    }
    if (
      error instanceof MenuItemNotFoundError ||
      error instanceof DealNotFoundError ||
      error instanceof InvalidOrderItemsError ||
      error instanceof InvalidOrderDealsError ||
      error instanceof EmptyOrderError
    ) {
      fail(res, 400, "BAD_REQUEST", error instanceof Error ? error.message : "Invalid order");
      return;
    }
    if (error instanceof OrderGuardRejectedError) {
      fail(res, 429, "TOO_MANY", "Too many orders from this connection or phone number. Please try again later.");
      return;
    }
    if (error instanceof guestOrderService.RequestIdReusedError) {
      fail(res, 409, "REQUEST_ID_REUSED", "This request id was already used for a different order.");
      return;
    }
    throw error;
  }
}

// GET /api/online/orders/:publicId
export async function getOrderStatus(req: Request, res: Response) {
  // The link is a secret and the answer changes minute to minute: never store it anywhere.
  res.setHeader("Cache-Control", "no-store");
  const publicId = req.params.publicId;
  if (!isPlausiblePublicId(publicId)) {
    fail(res, 404, "NOT_FOUND", "Order not found");
    return;
  }
  const status = await guestOrderService.getPublicOrderStatus(publicId);
  if (!status) {
    fail(res, 404, "NOT_FOUND", "Order not found");
    return;
  }
  res.json(status);
}

// POST /api/online/orders/:publicId/payment-proof — multipart, one image (field "file").
export async function uploadPaymentProof(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const publicId = req.params.publicId;
  if (!isPlausiblePublicId(publicId)) {
    fail(res, 404, "NOT_FOUND", "Order not found");
    return;
  }
  if (!req.file) {
    fail(res, 400, "BAD_REQUEST", "file is required");
    return;
  }

  let processed;
  try {
    processed = await processProof(req.file.buffer);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      fail(res, 400, "BAD_REQUEST", error.message);
      return;
    }
    throw error;
  }

  try {
    const paymentState = await guestOrderService.attachPaymentProof(publicId, processed);
    res.json({ paymentState });
  } catch (error) {
    if (error instanceof guestOrderService.PublicOrderNotFoundError) {
      fail(res, 404, "NOT_FOUND", "Order not found");
      return;
    }
    if (error instanceof guestOrderService.NotAwaitingPaymentError) {
      fail(res, 409, "NOT_AWAITING_PAYMENT", "This order is not waiting for a payment proof.");
      return;
    }
    throw error;
  }
}

// GET /api/online/orders/:publicId/payment-proof?size=thumb — the customer's own proof as a small thumbnail, for the
// status page's "this is what you sent". The unguessable status link is the key (like the status itself). Thumbnail
// only: the full image stays staff-only. Private cache; the page adds ?v=<proofSentAt> so a replaced proof shows at once.
export async function getPaymentProofThumb(req: Request, res: Response) {
  const publicId = req.params.publicId;
  if (!isPlausiblePublicId(publicId)) {
    fail(res, 404, "NOT_FOUND", "Order not found");
    return;
  }
  if (req.query.size !== "thumb") {
    fail(res, 400, "BAD_REQUEST", "size must be thumb");
    return;
  }
  const mediaId = await guestOrderService.getPublicProofMediaId(publicId);
  await sendPaymentProof(req, res, mediaId, "No payment proof");
}
