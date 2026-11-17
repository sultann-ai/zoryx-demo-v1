import { Request, Response } from "express";
import {
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  OrderChangeKind,
  Prisma,
  StaffRole,
} from "../../../generated/prisma/client";
import { buildOrdersWorkbook } from "../../common/excel/orderReports";
import { ifNoneMatchMatches } from "../../common/http/etag";
import { sendWorkbookAsXlsx } from "../../common/excel/sendWorkbook";
import * as businessDayService from "../businessDay/businessDay.service";
import { normalizePublicCode } from "../guestOrder/publicIds";
import * as mediaService from "../media/media.service";
import * as orderService from "./order.service";

const VALID_ORDER_TYPES = Object.values(OrderType);
const VALID_PAYMENT_METHODS = Object.values(PaymentMethod);
const VALID_ORDER_STATUSES = Object.values(OrderStatus);
const VALID_ORDER_SOURCES = Object.values(OrderSource);
const VALID_ITEM_STATUSES = Object.values(OrderItemStatus);
// Only the two states this quick toggle is meant for — AWAITING_VERIFICATION/REJECTED
// belong to the separate online-payment-screenshot flow, not this one.
const VALID_QUICK_PAYMENT_STATUSES = [PaymentStatus.PENDING, PaymentStatus.VERIFIED] as const;

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

export async function createOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const {
    type,
    paymentMethod,
    diningAreaId,
    waiterId,
    riderId,
    customerId,
    customerAddressId,
    deliveryAddress,
    discount,
    notes,
    items,
    deals,
    scheduledFor,
  } = req.body ?? {};

  if (!isOneOf(type, VALID_ORDER_TYPES)) {
    res.status(400).json({ error: `type must be one of: ${VALID_ORDER_TYPES.join(", ")}` });
    return;
  }
  if (!isOneOf(paymentMethod, VALID_PAYMENT_METHODS)) {
    res.status(400).json({ error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}` });
    return;
  }
  if (diningAreaId !== undefined && typeof diningAreaId !== "string") {
    res.status(400).json({ error: "diningAreaId must be a string" });
    return;
  }
  if (waiterId !== undefined && typeof waiterId !== "string") {
    res.status(400).json({ error: "waiterId must be a string" });
    return;
  }
  if (riderId !== undefined && typeof riderId !== "string") {
    res.status(400).json({ error: "riderId must be a string" });
    return;
  }
  if (customerId !== undefined && typeof customerId !== "string") {
    res.status(400).json({ error: "customerId must be a string" });
    return;
  }
  if (customerAddressId !== undefined && typeof customerAddressId !== "string") {
    res.status(400).json({ error: "customerAddressId must be a string" });
    return;
  }
  if (deliveryAddress !== undefined && typeof deliveryAddress !== "string") {
    res.status(400).json({ error: "deliveryAddress must be a string" });
    return;
  }
  if (notes !== undefined && typeof notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }

  if (type === OrderType.DINE_IN && typeof diningAreaId !== "string") {
    res.status(400).json({ error: "diningAreaId is required for DINE_IN orders" });
    return;
  }
  if (type === OrderType.TAKEAWAY && diningAreaId !== undefined) {
    res.status(400).json({ error: "diningAreaId must not be provided for TAKEAWAY orders" });
    return;
  }
  if (type === OrderType.TAKEAWAY && (customerAddressId !== undefined || deliveryAddress !== undefined)) {
    res.status(400).json({ error: "TAKEAWAY orders must not include customerAddressId or deliveryAddress" });
    return;
  }
  if (type === OrderType.DELIVERY && customerAddressId === undefined && deliveryAddress === undefined) {
    res.status(400).json({ error: "DELIVERY orders require exactly one of customerAddressId or deliveryAddress" });
    return;
  }
  if (type === OrderType.DELIVERY && customerAddressId !== undefined && deliveryAddress !== undefined) {
    res.status(400).json({ error: "DELIVERY orders must not include both customerAddressId and deliveryAddress" });
    return;
  }

  let discountDecimal: Prisma.Decimal | undefined;
  if (discount !== undefined) {
    discountDecimal = parseDecimal(discount);
    if (!discountDecimal || discountDecimal.isNaN() || discountDecimal.isNegative()) {
      res.status(400).json({ error: "discount must be a non-negative number" });
      return;
    }
  }

  // "Schedule for later" — absent means place it now, exactly as before.
  let scheduledForDate: Date | undefined;
  if (scheduledFor !== undefined) {
    try {
      scheduledForDate = orderService.parseScheduledFor(scheduledFor, new Date());
    } catch (error) {
      if (error instanceof orderService.InvalidScheduleError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }

  let parsedItems: orderService.CreateOrderItemInput[];
  try {
    // Staff-only POS route — the cashier may type a price for an open-price item (e.g.
    // a custom cake). The online route must never pass this.
    parsedItems = orderService.parseOrderItems(items, { allowUnitPrice: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  let parsedDeals: orderService.CreateOrderDealInput[];
  try {
    // Only the POS route may send a deal's price-overriding customization — staff-only,
    // by the user's own decision at the counter. The online route must never pass this.
    parsedDeals = orderService.parseOrderDeals(deals, { allowCustomization: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const order = await orderService.createOrder({
      source: OrderSource.POS,
      type,
      paymentMethod,
      placedByStaffId: req.staff.id,
      ...(diningAreaId !== undefined ? { diningAreaId } : {}),
      ...(waiterId !== undefined ? { waiterId } : {}),
      ...(riderId !== undefined ? { riderId } : {}),
      ...(customerId !== undefined ? { customerId } : {}),
      ...(customerAddressId !== undefined ? { customerAddressId } : {}),
      ...(deliveryAddress !== undefined ? { deliveryAddress } : {}),
      ...(discountDecimal !== undefined ? { discount: discountDecimal } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(scheduledForDate !== undefined ? { scheduledFor: scheduledForDate } : {}),
      items: parsedItems,
      deals: parsedDeals,
    });
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof orderService.NoActiveBusinessDayError) {
      res.status(400).json({ error: "No active business day. Start one before creating orders." });
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
    if (error instanceof orderService.EmployeeNotFoundOrInactiveError) {
      res.status(400).json({ error: `Employee ${error.employeeId} does not reference an existing, active Employee` });
      return;
    }
    // Thrown by resolveItemPrice inside createOrder for a sized item ordered without (or
    // with the wrong) variantId — distinct from the shape-only InvalidOrderItemsError
    // already handled by the earlier parseOrderItems try/catch above.
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (orderService.isStalePlacedByStaffError(error)) {
      res.status(401).json({ error: "Your session is no longer valid. Please log in again." });
      return;
    }
    if (orderService.isForeignKeyConstraintError(error)) {
      res.status(400).json({
        error: "diningAreaId, waiterId, riderId, customerId, or customerAddressId does not reference an existing record",
      });
      return;
    }
    throw error;
  }
}

export async function assignOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { waiterId, riderId, diningAreaId } = req.body ?? {};

  if (waiterId !== undefined && typeof waiterId !== "string") {
    res.status(400).json({ error: "waiterId must be a string" });
    return;
  }
  if (riderId !== undefined && typeof riderId !== "string") {
    res.status(400).json({ error: "riderId must be a string" });
    return;
  }
  if (diningAreaId !== undefined && typeof diningAreaId !== "string") {
    res.status(400).json({ error: "diningAreaId must be a string" });
    return;
  }
  if (waiterId === undefined && riderId === undefined && diningAreaId === undefined) {
    res.status(400).json({ error: "At least one of waiterId, riderId, or diningAreaId is required" });
    return;
  }

  try {
    const order = await orderService.assignOrder(req.params.id as string, {
      ...(waiterId !== undefined ? { waiterId } : {}),
      ...(riderId !== undefined ? { riderId } : {}),
      ...(diningAreaId !== undefined ? { diningAreaId } : {}),
    });
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.EmployeeNotFoundOrInactiveError) {
      res.status(400).json({ error: `Employee ${error.employeeId} does not reference an existing, active Employee` });
      return;
    }
    if (orderService.isNotFoundError(error)) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (orderService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "diningAreaId does not reference an existing DiningArea" });
      return;
    }
    throw error;
  }
}

export async function listOrders(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { businessDayId, status, source, diningAreaId, export: exportFormat } = req.query;

  if (businessDayId !== undefined && typeof businessDayId !== "string") {
    res.status(400).json({ error: "businessDayId must be a single string value" });
    return;
  }
  if (status !== undefined && !isOneOf(status, VALID_ORDER_STATUSES)) {
    res.status(400).json({ error: `status must be one of: ${VALID_ORDER_STATUSES.join(", ")}` });
    return;
  }
  if (source !== undefined && !isOneOf(source, VALID_ORDER_SOURCES)) {
    res.status(400).json({ error: `source must be one of: ${VALID_ORDER_SOURCES.join(", ")}` });
    return;
  }
  if (diningAreaId !== undefined && typeof diningAreaId !== "string") {
    res.status(400).json({ error: "diningAreaId must be a single string value" });
    return;
  }
  if (exportFormat !== undefined && exportFormat !== "xlsx") {
    res.status(400).json({ error: "export must be xlsx" });
    return;
  }

  // An ORDER_TAKER only ever sees their own orders — forced server-side, never trusting a
  // client-sent filter for this.
  const isOrderTaker = req.staff.role === StaffRole.ORDER_TAKER;

  const orders = await orderService.listOrders({
    ...(businessDayId !== undefined ? { businessDayId } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(diningAreaId !== undefined ? { diningAreaId } : {}),
    ...(isOrderTaker ? { placedByStaffId: req.staff.id } : {}),
  });

  if (exportFormat === "xlsx") {
    if (isOrderTaker) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const workbook = buildOrdersWorkbook(orders);
    await sendWorkbookAsXlsx(res, workbook, "orders.xlsx");
    return;
  }

  res.json(orders);
}

export async function getOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // A mismatched owner 404s, not 403s — an ORDER_TAKER must not be able to tell the
  // difference between "doesn't exist" and "exists but isn't yours."
  const ownerStaffId = req.staff.role === StaffRole.ORDER_TAKER ? req.staff.id : undefined;
  const order = await orderService.getOrderById(req.params.id as string, ownerStaffId);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(order);
}

export async function cancelOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { cancelledReason } = req.body ?? {};

  // An ORDER_TAKER cancelling their own order needs no reason and only works while it's
  // still AWAITING_RECEPTION (see cancelOwnAwaitingOrder) — distinct from the
  // POS_ADMIN/SUPER_ADMIN path below, which cancels any order at any status with a reason.
  if (req.staff.role === StaffRole.ORDER_TAKER) {
    try {
      const order = await orderService.cancelOwnAwaitingOrder(req.params.id as string, req.staff.id);
      res.json(order);
    } catch (error) {
      if (error instanceof orderService.OrderNotFoundError) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (error instanceof orderService.OrderNotAwaitingReceptionError) {
        res.status(409).json({ error: "This order has already been reviewed and can no longer be cancelled this way" });
        return;
      }
      throw error;
    }
    return;
  }

  if (typeof cancelledReason !== "string" || cancelledReason.trim().length === 0) {
    res.status(400).json({ error: "cancelledReason is required" });
    return;
  }

  try {
    const order = await orderService.cancelOrder(req.params.id as string, cancelledReason.trim());
    res.json(order);
  } catch (error) {
    if (orderService.isNotFoundError(error)) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    throw error;
  }
}

// ================= Reception review (AWAITING_RECEPTION) =================

export async function submitOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { diningAreaId, items, deals, notes, clientRequestId } = req.body ?? {};

  if (typeof diningAreaId !== "string" || diningAreaId.trim().length === 0) {
    res.status(400).json({ error: "diningAreaId is required" });
    return;
  }
  if (typeof clientRequestId !== "string" || clientRequestId.trim().length === 0) {
    res.status(400).json({ error: "clientRequestId is required" });
    return;
  }
  if (notes !== undefined && typeof notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }

  let parsedItems: orderService.CreateOrderItemInput[];
  try {
    // An order taker never sets a price — not even for an open-price item (out of scope
    // for this role; that's a cashier/reception decision).
    parsedItems = orderService.parseOrderItems(items);
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  let parsedDeals: orderService.CreateOrderDealInput[];
  try {
    // Customization (changing a deal's contents) is allowed, but the shared parser's
    // required finalPrice field is a placeholder here — submitOrderTakerOrder always
    // recomputes and overwrites it server-side (standard + extras), never trusting this.
    parsedDeals = orderService.parseOrderDeals(deals, { allowCustomization: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const { order, isNew } = await orderService.submitOrderTakerOrder({
      placedByStaffId: req.staff.id,
      diningAreaId,
      items: parsedItems,
      deals: parsedDeals,
      ...(notes !== undefined ? { notes } : {}),
      clientRequestId: clientRequestId.trim(),
    });
    res.status(isNew ? 201 : 200).json(order);
  } catch (error) {
    if (error instanceof orderService.ClientRequestIdConflictError) {
      res.status(409).json({ error: "clientRequestId was already used by a different order" });
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
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (orderService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "diningAreaId does not reference an existing record" });
      return;
    }
    throw error;
  }
}

export async function createOrderChange(req: Request, res: Response) {
    if (!req.staff) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const { kind, reason, items, deals, notes } = req.body ?? {};
    if (kind !== OrderChangeKind.EDIT && kind !== OrderChangeKind.CANCEL) {
      res.status(400).json({ error: `kind must be one of: ${Object.values(OrderChangeKind).join(", ")}` });
      return;
    }
    if (reason !== undefined && typeof reason !== "string") {
      res.status(400).json({ error: "reason must be a string" });
      return;
    }
    if (notes !== undefined && typeof notes !== "string") {
      res.status(400).json({ error: "notes must be a string" });
      return;
    }
    let requestedState: Prisma.JsonObject | undefined;
    if (kind === OrderChangeKind.EDIT) {
      let parsedItems: orderService.CreateOrderItemInput[];
      try {
        parsedItems = orderService.parseOrderItems(items, { allowUnitPrice: false });
      } catch (error) {
        if (error instanceof orderService.InvalidOrderItemsError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
      let parsedDeals: orderService.CreateOrderDealInput[];
      try {
        parsedDeals = orderService.parseOrderDeals(deals, { allowCustomization: true });
        parsedDeals = await Promise.all(
          parsedDeals.map(async (deal) => {
            if (!deal.customization) return deal;
            const finalPrice = await orderService.computeServerDealPrice(deal.dealId, deal.customization.items);
            return { ...deal, customization: { ...deal.customization, finalPrice } };
          }),
        );
      } catch (error) {
        if (error instanceof orderService.InvalidOrderDealsError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
      if (parsedItems.length === 0) {
        if (parsedDeals.length === 0) {
          res.status(400).json({ error: "items or deals must include at least one entry" });
          return;
        }
      }
      if (parsedDeals.length === 0 && parsedItems.length === 0) {
        res.status(400).json({ error: "items or deals must include at least one entry" });
        return;
      }
      requestedState = {
        items: parsedItems.map((item) => ({
          ...item,
          ...(item.unitPrice !== undefined ? { unitPrice: item.unitPrice.toString() } : {}),
        })) as unknown as Prisma.JsonArray,
        deals: parsedDeals.map((deal) => ({
          ...deal,
          customization: deal.customization
            ? {
                ...deal.customization,
                finalPrice: deal.customization.finalPrice.toString(),
              }
            : undefined,
        })) as unknown as Prisma.JsonArray,
        ...(notes !== undefined ? { notes } : {}),
      };
    }
    try {
      const change = await orderService.createOrderChange({
        orderId: req.params.id as string,
        requestedById: req.staff.id,
        kind,
        ...(requestedState !== undefined ? { requestedState } : {}),
        ...(reason !== undefined ? { reason } : {}),
      });
      res.status(201).json(change);
    } catch (error) {
      if (error instanceof orderService.OrderNotFoundError) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (error instanceof orderService.OrderAwaitingReceptionError) {
        res.status(409).json({ error: "Awaiting reception orders can be edited directly" });
        return;
      }
      throw error;
    }
  }

  export async function listOrderChanges(req: Request, res: Response) {
    if (!req.staff) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const isReception = req.staff.role === StaffRole.POS_ADMIN || req.staff.role === StaffRole.SUPER_ADMIN;
    const changes = isReception
      ? await orderService.listPendingOrderChanges()
      : await orderService.listOrderChanges(req.params.id as string, req.staff.id);
    res.json(changes);
  }

  export async function reviewOrderChange(req: Request, res: Response) {
    if (!req.staff) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const { approved, rejectionReason } = req.body ?? {};
    if (typeof approved !== "boolean") {
      res.status(400).json({ error: "approved must be a boolean" });
      return;
    }
    if (rejectionReason !== undefined && typeof rejectionReason !== "string") {
      res.status(400).json({ error: "rejectionReason must be a string" });
      return;
    }
    try {
      const change = await orderService.reviewOrderChange(
        req.params.changeId as string,
        req.staff.id,
        approved,
        rejectionReason,
      );
      const order = await orderService.getOrderById(change.orderId);
      res.json({ change, order });
    } catch (error) {
      if (error instanceof orderService.OrderChangeNotFoundError) {
        res.status(404).json({ error: "Order change request not found" });
        return;
      }
      if (error instanceof orderService.OrderChangeAlreadyReviewedError) {
        res.status(409).json({ error: "This change request has already been reviewed" });
        return;
      }
      if (error instanceof orderService.OrderChangeStaleError) {
        res.status(409).json({ error: "The order changed after this request was submitted" });
        return;
      }
      if (error instanceof orderService.InvalidOrderItemsError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  }

export async function getIncomingOrders(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  // Optional ?code=K7P2M — find the guest order a customer is reading out over the phone.
  let publicCode: string | undefined;
  if (req.query.code !== undefined) {
    const normalized = normalizePublicCode(req.query.code);
    if (normalized === null) {
      res.status(400).json({ error: "code must be a 5-character order code" });
      return;
    }
    publicCode = normalized;
  }

  const activeBusinessDay = await businessDayService.getActiveBusinessDay();
  if (!activeBusinessDay) {
    res.json({ count: 0, orders: [] });
    return;
  }

  // An ONLINE_ADMIN sees only the online orders in the inbox.
  const onlySource = req.staff.role === StaffRole.ONLINE_ADMIN ? OrderSource.ONLINE : undefined;
  const orders = await orderService.getIncomingOrders(activeBusinessDay.id, publicCode, onlySource);
  res.json({ count: orders.length, orders });
}

export async function updateSubmission(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const orderId = req.params.id as string;
  const isReception = req.staff.role === StaffRole.POS_ADMIN || req.staff.role === StaffRole.SUPER_ADMIN;

  // An ORDER_TAKER may only edit their own order — checked up front (404, not 403, on a
  // mismatch) before any other validation.
  if (!isReception) {
    const existing = await orderService.getOrderById(orderId, req.staff.id);
    if (!existing) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
  }

  const { items, deals, notes, paymentMethod, discount } = req.body ?? {};

  if (notes !== undefined && typeof notes !== "string") {
    res.status(400).json({ error: "notes must be a string" });
    return;
  }
  if (!isReception && (paymentMethod !== undefined || discount !== undefined)) {
    res.status(403).json({ error: "Only reception may set paymentMethod or discount here" });
    return;
  }
  if (paymentMethod !== undefined && !isOneOf(paymentMethod, VALID_PAYMENT_METHODS)) {
    res.status(400).json({ error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}` });
    return;
  }
  let discountDecimal: Prisma.Decimal | undefined;
  if (discount !== undefined) {
    discountDecimal = parseDecimal(discount);
    if (!discountDecimal || discountDecimal.isNaN() || discountDecimal.isNegative()) {
      res.status(400).json({ error: "discount must be a non-negative number" });
      return;
    }
  }

  let parsedItems: orderService.CreateOrderItemInput[];
  try {
    // Only reception may type a price for an open-price item here — same rule as createOrder.
    parsedItems = orderService.parseOrderItems(items, { allowUnitPrice: isReception });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  let parsedDeals: orderService.CreateOrderDealInput[];
  try {
    parsedDeals = orderService.parseOrderDeals(deals, { allowCustomization: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  // Reception's own edit may set a trusted customization price, same as createOrder's POS
  // route — but an order taker editing their own submission never may, same as submitting.
  if (!isReception) {
    try {
      parsedDeals = await Promise.all(
        parsedDeals.map(async (deal) => {
          if (!deal.customization) {
            return deal;
          }
          const finalPrice = await orderService.computeServerDealPrice(deal.dealId, deal.customization.items);
          return { ...deal, customization: { ...deal.customization, finalPrice } };
        }),
      );
    } catch (error) {
      if (error instanceof orderService.DealNotFoundError) {
        res.status(400).json({ error: `dealId ${error.dealId} does not reference an existing Deal` });
        return;
      }
      if (error instanceof orderService.MenuItemNotFoundError) {
        res.status(400).json({ error: `menuItemId ${error.menuItemId} does not reference an existing MenuItem` });
        return;
      }
      throw error;
    }
  }

  try {
    const order = await orderService.updateSubmission(orderId, {
      items: parsedItems,
      deals: parsedDeals,
      ...(notes !== undefined ? { notes } : {}),
      ...(paymentMethod !== undefined ? { paymentMethod } : {}),
      ...(discountDecimal !== undefined ? { discount: discountDecimal } : {}),
    });
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderNotAwaitingReceptionError) {
      res.status(409).json({ error: "This order has already been reviewed and can no longer be edited this way" });
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
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof orderService.DiscountExceedsTotalError) {
      res.status(400).json({ error: "discount cannot exceed the order's total" });
      return;
    }
    throw error;
  }
}

export async function acceptOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let acceptInput: orderService.AcceptOrderInput;
  try {
    acceptInput = orderService.parseAcceptInput(req.body);
  } catch (error) {
    if (error instanceof orderService.InvalidReceptionActionError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  // An ONLINE_ADMIN may accept online orders only, and may not give a discount (that changes a price).
  if (req.staff.role === StaffRole.ONLINE_ADMIN) {
    if (acceptInput.discount !== undefined) {
      res.status(403).json({ error: "Forbidden: only reception can apply a discount" });
      return;
    }
    if ((await orderService.getOrderSource(req.params.id as string)) !== OrderSource.ONLINE) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
  }

  try {
    const order = await orderService.acceptOrder(req.params.id as string, req.staff.id, acceptInput);
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderNotAwaitingReceptionError) {
      res.status(409).json({ error: "This order has already been reviewed" });
      return;
    }
    if (error instanceof orderService.PaymentNotVerifiedError) {
      res.status(400).json({
        error: "This order was paid online — set paymentVerified: true to confirm you checked it before accepting",
      });
      return;
    }
    if (error instanceof orderService.PaymentProofMissingError) {
      res.status(400).json({
        code: "PROOF_MISSING",
        error: "This guest order is paid online but no payment proof has been uploaded yet — wait for it, or switch it to Cash",
      });
      return;
    }
    if (error instanceof orderService.DiscountExceedsTotalError) {
      res.status(400).json({ error: "discount cannot exceed the order's total" });
      return;
    }
    throw error;
  }
}

// POST /:id/delivered — the order has been handed over / delivered. The only way an order reaches
// COMPLETED. 409 for anything that isn't an accepted, still-open order (never for CANCELLED).
export async function markDelivered(req: Request, res: Response) {
  try {
    const order = await orderService.markOrderDelivered(req.params.id as string);
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderNotDeliverableError) {
      res.status(409).json({
        code: "NOT_DELIVERABLE",
        error: `This order is ${error.status} and cannot be marked delivered`,
        status: error.status,
      });
      return;
    }
    throw error;
  }
}

// POST /:id/not-collected — an accepted online pickup order the customer never came for: cancelled, and a
// strike against the phone. 409 for anything else (a delivery order, or one that is not an accepted open order).
export async function markNotCollected(req: Request, res: Response) {
  try {
    res.json(await orderService.markOrderNotCollected(req.params.id as string));
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderNotCollectableError) {
      res.status(409).json({ code: "NOT_COLLECTABLE", error: error.message, status: error.status });
      return;
    }
    throw error;
  }
}

// GET /:id/payment-proof?size=thumb|full — staff only (the proof is private customer data, so it is
// never on the public media route). The frontend fetches it with its token and shows a blob URL.
export async function getPaymentProof(req: Request, res: Response) {
  const size = req.query.size === undefined ? "full" : req.query.size;
  if (size !== "thumb" && size !== "full") {
    res.status(400).json({ error: "size must be thumb or full" });
    return;
  }
  const mediaId = await orderService.getOrderPaymentProofId(req.params.id as string);
  const asset = mediaId ? await mediaService.getAssetMeta(mediaId) : null;
  if (!mediaId || !asset) {
    res.status(404).json({ error: "No payment proof for this order" });
    return;
  }

  const etag = `"${mediaId}-${size}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, max-age=86400");
  if (ifNoneMatchMatches(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return;
  }
  const bytes = await mediaService.getAssetBytes(mediaId, size);
  if (!bytes) {
    res.status(404).json({ error: "No payment proof for this order" });
    return;
  }
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(bytes.byteLength));
  res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

export async function rejectOrder(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let rejectInput: orderService.RejectOrderInput;
  try {
    rejectInput = orderService.parseRejectInput(req.body);
  } catch (error) {
    if (error instanceof orderService.InvalidReceptionActionError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  if (
    req.staff.role === StaffRole.ONLINE_ADMIN &&
    (await orderService.getOrderSource(req.params.id as string)) !== OrderSource.ONLINE
  ) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  try {
    const order = await orderService.rejectOrder(req.params.id as string, rejectInput);
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderNotAwaitingReceptionError) {
      res.status(409).json({ error: "This order has already been reviewed" });
      return;
    }
    throw error;
  }
}

export async function updatePaymentStatus(req: Request, res: Response) {
  const { paymentStatus, discount, paidAmount } = req.body ?? {};

  if (!isOneOf(paymentStatus, VALID_QUICK_PAYMENT_STATUSES)) {
    res.status(400).json({ error: `paymentStatus must be one of: ${VALID_QUICK_PAYMENT_STATUSES.join(", ")}` });
    return;
  }

  let discountDecimal: Prisma.Decimal | undefined;
  if (discount !== undefined) {
    discountDecimal = parseDecimal(discount);
    if (!discountDecimal || discountDecimal.isNaN() || discountDecimal.isNegative()) {
      res.status(400).json({ error: "discount must be a non-negative number" });
      return;
    }
  }

  let paidAmountDecimal: Prisma.Decimal | undefined;
  if (paidAmount !== undefined) {
    paidAmountDecimal = parseDecimal(paidAmount);
    if (!paidAmountDecimal || paidAmountDecimal.isNaN() || paidAmountDecimal.isNegative()) {
      res.status(400).json({ error: "paidAmount must be a non-negative number" });
      return;
    }
  }

  try {
    const order = await orderService.updatePaymentStatus(req.params.id as string, paymentStatus, {
      ...(discountDecimal !== undefined ? { discount: discountDecimal } : {}),
      ...(paidAmountDecimal !== undefined ? { paidAmount: paidAmountDecimal } : {}),
    });
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.NotCashPaymentError) {
      res.status(400).json({ error: "Only CASH orders can use this quick payment toggle" });
      return;
    }
    if (error instanceof orderService.DiscountExceedsTotalError) {
      res.status(400).json({ error: "Discount cannot exceed the order's total" });
      return;
    }
    throw error;
  }
}

export async function addOrderItems(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { items } = req.body ?? {};

  let parsedItems: orderService.CreateOrderItemInput[];
  try {
    // POS-only route (req.staff is required above) — the cashier may type a price for
    // an open-price item, same as on creation.
    parsedItems = orderService.parseOrderItems(items, { allowUnitPrice: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const order = await orderService.addOrderItems(req.params.id as string, {
      items: parsedItems,
      performedById: req.staff.id,
    });
    res.status(201).json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderClosedError) {
      res.status(400).json({ error: "This order is cancelled or completed and can no longer be edited" });
      return;
    }
    if (error instanceof orderService.OrderAwaitingReceptionError) {
      res.status(409).json({ error: "This order hasn't been accepted yet — edit it via PUT /:id/submission instead" });
      return;
    }
    if (error instanceof orderService.OrderScheduledError) {
      res.status(409).json({ error: "This order is scheduled and on hold — edit it from Scheduled orders, or release it first" });
      return;
    }
    if (error instanceof orderService.InvalidOrderItemsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof orderService.MenuItemNotFoundError) {
      res.status(400).json({ error: `menuItemId ${error.menuItemId} does not reference an existing MenuItem` });
      return;
    }
    throw error;
  }
}

export async function removeOrderItem(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const order = await orderService.removeOrderItem(
      req.params.id as string,
      req.params.itemId as string,
      req.staff.id,
    );
    res.json(order);
  } catch (error) {
    if (error instanceof orderService.OrderNotFoundError) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (error instanceof orderService.OrderItemNotFoundError) {
      res.status(404).json({ error: "Order item not found" });
      return;
    }
    if (error instanceof orderService.OrderClosedError) {
      res.status(400).json({ error: "This order is cancelled or completed and can no longer be edited" });
      return;
    }
    if (error instanceof orderService.OrderAwaitingReceptionError) {
      res.status(409).json({ error: "This order hasn't been accepted yet — edit it via PUT /:id/submission instead" });
      return;
    }
    if (error instanceof orderService.OrderScheduledError) {
      res.status(409).json({ error: "This order is scheduled and on hold — edit it from Scheduled orders, or release it first" });
      return;
    }
    if (error instanceof orderService.DealOrderItemError) {
      res.status(400).json({ error: "This item is part of a deal and can't be removed on its own" });
      return;
    }
    if (error instanceof orderService.OrderItemNotPendingError) {
      res.status(400).json({ error: "This item has already been started by the kitchen and can no longer be removed" });
      return;
    }
    if (error instanceof orderService.EmptyOrderError) {
      res.status(400).json({ error: "Can't remove the last item on an order — cancel the order instead" });
      return;
    }
    throw error;
  }
}

// Body for both note-edit routes: { notes: string | null } — the key is required so a
// typo'd body can't silently clear a note; "" or null is how a note is deliberately removed.
function parseNoteEditBody(body: unknown): string | null {
  const { notes } = (body ?? {}) as Record<string, unknown>;
  if (notes === undefined) {
    throw new orderService.InvalidLineNoteError('notes is required (send null or "" to remove the note)');
  }
  return orderService.parseLineNote(notes, "notes", orderService.InvalidLineNoteError);
}

// Shared error mapping for the two note-edit routes; returns false for anything it doesn't
// recognize so the caller rethrows.
function respondToNoteEditError(error: unknown, res: Response): boolean {
  if (error instanceof orderService.OrderNotFoundError) {
    res.status(404).json({ error: "Order not found" });
    return true;
  }
  if (error instanceof orderService.OrderClosedError) {
    res.status(400).json({ error: "This order is cancelled or completed and can no longer be edited" });
    return true;
  }
  if (error instanceof orderService.OrderAwaitingReceptionError) {
    res.status(409).json({ error: "This order hasn't been accepted yet — edit it via PUT /:id/submission instead" });
    return true;
  }
  if (error instanceof orderService.OrderScheduledError) {
    res.status(409).json({ error: "This order is scheduled and on hold — edit its items from Scheduled orders instead" });
    return true;
  }
  return false;
}

export async function updateOrderItemNote(req: Request, res: Response) {
  let notes: string | null;
  try {
    notes = parseNoteEditBody(req.body);
  } catch (error) {
    if (error instanceof orderService.InvalidLineNoteError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const order = await orderService.updateOrderItemNote(req.params.id as string, req.params.itemId as string, notes);
    res.json(order);
  } catch (error) {
    if (respondToNoteEditError(error, res)) {
      return;
    }
    if (error instanceof orderService.OrderItemNotFoundError) {
      res.status(404).json({ error: "Order item not found" });
      return;
    }
    if (error instanceof orderService.DealOrderItemError) {
      res.status(400).json({ error: "This item is part of a deal — edit the deal's note instead" });
      return;
    }
    throw error;
  }
}

export async function updateOrderDealLineNote(req: Request, res: Response) {
  let notes: string | null;
  try {
    notes = parseNoteEditBody(req.body);
  } catch (error) {
    if (error instanceof orderService.InvalidLineNoteError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const order = await orderService.updateOrderDealLineNote(
      req.params.id as string,
      req.params.dealLineId as string,
      notes,
    );
    res.json(order);
  } catch (error) {
    if (respondToNoteEditError(error, res)) {
      return;
    }
    if (error instanceof orderService.OrderDealLineNotFoundError) {
      res.status(404).json({ error: "Deal line not found" });
      return;
    }
    throw error;
  }
}

export async function updateOrderItemStatus(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { status } = req.body ?? {};
  if (!isOneOf(status, VALID_ITEM_STATUSES)) {
    res.status(400).json({ error: `status must be one of: ${VALID_ITEM_STATUSES.join(", ")}` });
    return;
  }

  const item = await orderService.getOrderItem(req.params.id as string, req.params.itemId as string);
  if (!item) {
    res.status(404).json({ error: "Order item not found" });
    return;
  }

  if (req.staff.role === StaffRole.KITCHEN && req.staff.kitchenId !== item.kitchenId) {
    res.status(403).json({ error: "Forbidden: this item does not belong to your kitchen" });
    return;
  }

  try {
    const updated = await orderService.updateOrderItemStatus(item.id, status);
    res.json(updated);
  } catch (error) {
    if (error instanceof orderService.OrderAwaitingReceptionError) {
      res.status(409).json({ error: "This order hasn't been accepted yet" });
      return;
    }
    if (error instanceof orderService.OrderScheduledError) {
      res.status(409).json({ error: "This order is scheduled and hasn't been released yet" });
      return;
    }
    throw error;
  }
}

// ================= Scheduled orders =================

// Shared error mapping for the scheduled-order actions; returns false for anything unknown.
function respondToScheduledActionError(error: unknown, res: Response): boolean {
  if (error instanceof orderService.OrderNotFoundError) {
    res.status(404).json({ error: "Order not found" });
    return true;
  }
  if (error instanceof orderService.OrderNotScheduledError) {
    res.status(409).json({ error: "This order is no longer scheduled — it may have just been released. Check Incoming orders." });
    return true;
  }
  return false;
}

export async function listScheduledOrders(_req: Request, res: Response) {
  const orders = await orderService.listScheduledOrders();
  res.json(orders);
}

export async function releaseScheduledOrder(req: Request, res: Response) {
  try {
    const order = await orderService.releaseScheduledOrderNow(req.params.id as string);
    res.json(order);
  } catch (error) {
    if (respondToScheduledActionError(error, res)) {
      return;
    }
    throw error;
  }
}

export async function rescheduleOrder(req: Request, res: Response) {
  let scheduledFor: Date;
  try {
    scheduledFor = orderService.parseScheduledFor((req.body ?? {}).scheduledFor, new Date());
  } catch (error) {
    if (error instanceof orderService.InvalidScheduleError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  try {
    const order = await orderService.rescheduleOrder(req.params.id as string, scheduledFor);
    res.json(order);
  } catch (error) {
    if (respondToScheduledActionError(error, res)) {
      return;
    }
    throw error;
  }
}

export async function updateScheduledItems(req: Request, res: Response) {
  const { items, deals } = req.body ?? {};
  let parsedItems: orderService.CreateOrderItemInput[];
  let parsedDeals: orderService.CreateOrderDealInput[];
  try {
    // Same POS-only allowances as creating the order in the first place.
    parsedItems = orderService.parseOrderItems(items, { allowUnitPrice: true });
    parsedDeals = orderService.parseOrderDeals(deals, { allowCustomization: true });
  } catch (error) {
    if (error instanceof orderService.InvalidOrderItemsError || error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const order = await orderService.updateScheduledItems(req.params.id as string, { items: parsedItems, deals: parsedDeals });
    res.json(order);
  } catch (error) {
    if (respondToScheduledActionError(error, res)) {
      return;
    }
    if (error instanceof orderService.EmptyOrderError) {
      res.status(400).json({ error: "Order must include at least one item or deal" });
      return;
    }
    if (error instanceof orderService.InvalidOrderItemsError || error instanceof orderService.InvalidOrderDealsError) {
      res.status(400).json({ error: error.message });
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
    if (error instanceof orderService.DiscountExceedsTotalError) {
      res.status(400).json({ error: "The order's discount would exceed its new total" });
      return;
    }
    throw error;
  }
}

const SCHEDULED_CANCEL_REASON_MAX_LENGTH = 200;

export async function cancelScheduledOrder(req: Request, res: Response) {
  const { reason } = req.body ?? {};
  if (reason !== undefined && typeof reason !== "string") {
    res.status(400).json({ error: "reason must be a string" });
    return;
  }
  const trimmed = (reason ?? "").trim();
  if (trimmed.length > SCHEDULED_CANCEL_REASON_MAX_LENGTH) {
    res.status(400).json({ error: `reason must be at most ${SCHEDULED_CANCEL_REASON_MAX_LENGTH} characters` });
    return;
  }
  try {
    const order = await orderService.cancelScheduledOrder(
      req.params.id as string,
      trimmed.length > 0 ? trimmed : "Scheduled order cancelled before release",
    );
    res.json(order);
  } catch (error) {
    if (respondToScheduledActionError(error, res)) {
      return;
    }
    throw error;
  }
}

export async function getKitchenQueue(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { kitchenId } = req.query;

  if (typeof kitchenId !== "string" || kitchenId.trim().length === 0) {
    res.status(400).json({ error: "kitchenId is required" });
    return;
  }

  if (req.staff.role === StaffRole.KITCHEN && req.staff.kitchenId !== kitchenId) {
    res.status(403).json({ error: "Forbidden: you can only view your own kitchen's queue" });
    return;
  }

  const kitchenFound = await orderService.kitchenExists(kitchenId);
  if (!kitchenFound) {
    res.status(400).json({ error: "kitchenId does not reference an existing Kitchen" });
    return;
  }

  const queue = await orderService.getKitchenQueue(kitchenId);
  res.json(queue);
}
