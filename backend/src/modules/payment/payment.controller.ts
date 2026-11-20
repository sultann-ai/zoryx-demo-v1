import { Request, Response } from "express";
import { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "../../../generated/prisma/client";
import { InvalidImageError, processProof } from "../../common/media/processImage";
import { prisma } from "../../config/prisma";
import * as customerAddressService from "../customerAddress/customerAddress.service";
import * as mediaService from "../media/media.service";
import * as orderService from "../order/order.service";
import { getSiteSettings } from "../siteContent/siteContent.service";
import * as paymentService from "./payment.service";

// Online customers order for takeaway or delivery through this endpoint; DINE_IN implies
// a staff member seated them, which only happens through the POS order-creation flow.
const VALID_ONLINE_ORDER_TYPES = [OrderType.TAKEAWAY, OrderType.DELIVERY] as const;
const VALID_PAYMENT_METHODS = Object.values(PaymentMethod);

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export async function createOnlineOrder(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { type, paymentMethod, customerAddressId, notes, items, deals } = req.body ?? {};

  if (!isOneOf(type, VALID_ONLINE_ORDER_TYPES)) {
    res.status(400).json({ error: `type must be one of: ${VALID_ONLINE_ORDER_TYPES.join(", ")}` });
    return;
  }
  // The shop may have switched pickup (TAKEAWAY) or delivery off for the website; a logged-in customer is no exception.
  const settings = await getSiteSettings();
  if (type === OrderType.TAKEAWAY && !settings.pickupEnabled) {
    res.status(400).json({ code: "PICKUP_UNAVAILABLE", error: "Pickup is not available right now." });
    return;
  }
  if (type === OrderType.DELIVERY && !settings.deliveryEnabled) {
    res.status(400).json({ code: "DELIVERY_UNAVAILABLE", error: "Delivery is not available right now." });
    return;
  }
  if (!isOneOf(paymentMethod, VALID_PAYMENT_METHODS)) {
    res.status(400).json({ error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}` });
    return;
  }
  if (notes !== undefined && typeof notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }

  if (type === OrderType.DELIVERY && typeof customerAddressId !== "string") {
    res.status(400).json({ error: "customerAddressId is required for DELIVERY orders" });
    return;
  }
  if (customerAddressId !== undefined && typeof customerAddressId !== "string") {
    res.status(400).json({ error: "customerAddressId must be a string" });
    return;
  }
  if (typeof customerAddressId === "string") {
    // Ownership scoped by the JWT, not trusted from the request — a customer can only
    // ever use one of their own saved addresses, never someone else's by guessing its id.
    const ownedAddress = await customerAddressService.findOwnedAddress(customerAddressId, req.customer.id);
    if (!ownedAddress) {
      res.status(400).json({ error: "customerAddressId does not reference one of your addresses" });
      return;
    }
  }

  // multipart/form-data can't carry a nested JSON array as a native field, so a client
  // uploading a screenshot alongside the order sends `items` as a JSON-encoded string.
  let rawItems: unknown = items;
  if (typeof items === "string") {
    try {
      rawItems = JSON.parse(items);
    } catch {
      res.status(400).json({ error: "items must be valid JSON when sent as a form field" });
      return;
    }
  }

  let parsedItems: orderService.CreateOrderItemInput[];
  try {
    // This is the online-order route — customers place these themselves, so a
    // client-sent unitPrice must never be accepted here. Leave allowUnitPrice at its
    // default (false); the online menu listing also excludes open-price items entirely
    // (menuService.listOnlineMenuItems), so a customer shouldn't even see one to try.
    parsedItems = orderService.parseOrderItems(rawItems);
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  // Same multipart-form-data caveat as items: a JSON array can't be a native field
  // alongside a file upload, so it may arrive as a JSON-encoded string.
  let rawDeals: unknown = deals;
  if (typeof deals === "string") {
    try {
      rawDeals = JSON.parse(deals);
    } catch {
      res.status(400).json({ error: "deals must be valid JSON when sent as a form field" });
      return;
    }
  }

  let parsedDeals: orderService.CreateOrderDealInput[];
  try {
    // This is the online-order route — customers place these themselves, so it must
    // never allow a client-set deal price. Leave allowCustomization at its default
    // (false); only the staff-only POS route in order.controller.ts opts in.
    parsedDeals = orderService.parseOrderDeals(rawDeals);
  } catch (error) {
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  if (paymentMethod === PaymentMethod.ONLINE && !req.file) {
    res.status(400).json({ error: "A payment screenshot is required for ONLINE payment method" });
    return;
  }

  const isCash = paymentMethod === PaymentMethod.CASH;

  // The screenshot is processed and stored in Postgres (a PAYMENT_PROOF media asset) — never on
  // local disk, which Railway wipes on every redeploy.
  let proofMediaId: string | undefined;
  if (req.file !== undefined) {
    try {
      const processed = await processProof(req.file.buffer);
      const asset = await mediaService.createMedia({
        kind: "PAYMENT_PROOF",
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        data: processed.data,
        thumb: processed.thumb,
        createdById: null,
      });
      proofMediaId = asset.id;
    } catch (error) {
      if (error instanceof InvalidImageError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }

  try {
    const order = await orderService.createOrder({
      source: OrderSource.ONLINE,
      type,
      paymentMethod,
      customerId: req.customer.id,
      // Every online order now waits for reception's review before it's "real" — the
      // kitchen never sees it and stock never moves until accept(). Payment-field handling
      // below is unchanged: a cash order still just sits at the default PENDING
      // paymentStatus; an online-paid one still needs its screenshot checked, now at
      // accept time instead of at creation.
      status: OrderStatus.AWAITING_RECEPTION,
      // discount/waiterId/riderId are intentionally not accepted from the client here —
      // those are staff-controlled fields, not something a customer should set themselves.
      ...(isCash ? {} : { paymentStatus: PaymentStatus.AWAITING_VERIFICATION }),
      ...(proofMediaId !== undefined ? { paymentProofMediaId: proofMediaId } : {}),
      // Only what the website offers may be ordered (hidden / deal-only / inactive things are refused).
      onlineOnly: true,
      // Pickup has its own minimum (no address and no delivery fee: a saved address is not needed).
      ...(type === OrderType.TAKEAWAY && settings.pickupMinOrderAmount.greaterThan(0)
        ? { minSubtotal: settings.pickupMinOrderAmount }
        : {}),
      ...(typeof customerAddressId === "string" ? { customerAddressId } : {}),
      ...(notes !== undefined ? { notes } : {}),
      items: parsedItems,
      deals: parsedDeals,
    });
    res.status(201).json(order);
  } catch (error) {
    // The order wasn't created, so don't leave its proof behind in Postgres.
    if (proofMediaId !== undefined) {
      await prisma.mediaAsset.deleteMany({ where: { id: proofMediaId } }).catch(() => undefined);
    }
    if (error instanceof orderService.BelowMinimumError) {
      res.status(400).json({
        code: "BELOW_MINIMUM",
        error: `The minimum order is ${error.minOrderAmount.toString()}.`,
        minOrderAmount: error.minOrderAmount.toString(),
      });
      return;
    }
    if (error instanceof orderService.ItemNotOrderableOnlineError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof orderService.NoActiveBusinessDayError) {
      res.status(400).json({ error: "No active business day. Orders cannot be placed right now." });
      return;
    }
    if (error instanceof orderService.EmptyOrderError) {
      res.status(400).json({ error: "Order must include at least one item or deal" });
      return;
    }
    if (error instanceof orderService.MenuItemNotFoundError) {
      res.status(400).json({ error: `menuItemId ${error.menuItemId} does not reference an existing MenuItem` });
      return;
    }
    if (error instanceof orderService.DealNotFoundError) {
      res.status(400).json({ error: `dealId ${error.dealId} does not reference an existing Deal` });
      return;
    }
    // Thrown by resolveItemPrice inside createOrder for a sized item ordered without (or
    // with the wrong) variantId.
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}

export async function listPendingPayments(_req: Request, res: Response) {
  const orders = await paymentService.listPendingPayments();
  res.json(orders);
}

export async function verifyPayment(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const order = await paymentService.verifyPayment(req.params.orderId as string, req.staff.id);
    res.json(order);
  } catch (error) {
    if (error instanceof paymentService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof paymentService.PaymentNotAwaitingVerificationError) {
      res.status(400).json({ error: "This order's payment is not awaiting verification" });
      return;
    }
    throw error;
  }
}

export async function rejectPayment(req: Request, res: Response) {
  // Optional body { reason } (1-200 chars once trimmed); the customer sees it on their status page.
  const rawReason = (req.body as { reason?: unknown } | undefined)?.reason;
  if (rawReason !== undefined && rawReason !== null && (typeof rawReason !== "string" || rawReason.trim().length > 200)) {
    res.status(400).json({ error: "reason must be a string of at most 200 characters" });
    return;
  }
  const reason = typeof rawReason === "string" && rawReason.trim().length > 0 ? rawReason.trim() : undefined;
  try {
    const order = await paymentService.rejectPayment(req.params.orderId as string, reason);
    res.json(order);
  } catch (error) {
    if (error instanceof paymentService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof paymentService.PaymentNotAwaitingVerificationError) {
      res.status(400).json({ error: "This order's payment is not awaiting verification" });
      return;
    }
    throw error;
  }
}
