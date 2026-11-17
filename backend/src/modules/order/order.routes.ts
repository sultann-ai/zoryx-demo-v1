import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as orderController from "./order.controller";

export const orderRouter = Router();

// Registered before "/:id" and its siblings below — "submit" and "incoming" are literal
// path segments, not ids, but Express matches routes in registration order, so a later
// "/:id" would otherwise swallow them first.
orderRouter.post(
  "/submit",
  requireAuth,
  requireRole(StaffRole.ORDER_TAKER),
  orderController.submitOrder,
);
// ONLINE_ADMIN is allowed here, on accept and on reject below — but the controllers scope it to
// ONLINE-source orders and refuse a discount, so it can't touch order-taker or POS orders or prices.
orderRouter.get(
  "/incoming",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  orderController.getIncomingOrders,
);
// Scheduled orders — POS_ADMIN/SUPER_ADMIN, like placing one. A literal segment, so it's
// registered before "/:id" for the same reason as "/submit"/"/incoming".
orderRouter.get(
  "/scheduled",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.listScheduledOrders,
);
orderRouter.get(
  "/changes/incoming",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.listOrderChanges,
);
orderRouter.patch(
  "/changes/:changeId/review",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.reviewOrderChange,
);

orderRouter.get(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  orderController.listOrders,
);
orderRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.createOrder,
);
orderRouter.get(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  orderController.getOrder,
);
orderRouter.get(
  "/:id/changes",
  requireAuth,
  requireRole(StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.listOrderChanges,
);
orderRouter.post(
  "/:id/changes",
  requireAuth,
  requireRole(StaffRole.ORDER_TAKER),
  orderController.createOrderChange,
);
orderRouter.put(
  "/:id/submission",
  requireAuth,
  requireRole(StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.updateSubmission,
);
// Staff-only view of a guest's payment proof (private customer data — never on the public media route).
orderRouter.get(
  "/:id/payment-proof",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  orderController.getPaymentProof,
);
orderRouter.get(
  "/:id/events",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.listOrderEvents,
);
orderRouter.post(
  "/:id/delivered",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.markDelivered,
);
orderRouter.post(
  "/:id/complete",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.completeOrder,
);
orderRouter.post(
  "/:id/not-collected",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.markNotCollected,
);
orderRouter.post(
  "/:id/accept",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  orderController.acceptOrder,
);
orderRouter.post(
  "/:id/reject",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  orderController.rejectOrder,
);
orderRouter.post(
  "/:id/release",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.releaseScheduledOrder,
);
orderRouter.patch(
  "/:id/schedule",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.rescheduleOrder,
);
orderRouter.put(
  "/:id/scheduled-items",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.updateScheduledItems,
);
orderRouter.post(
  "/:id/cancel-scheduled",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.cancelScheduledOrder,
);
orderRouter.patch(
  "/:id/cancel",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  orderController.cancelOrder,
);
orderRouter.patch(
  "/:id/assign",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.assignOrder,
);
orderRouter.patch(
  "/:id/payment-status",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.updatePaymentStatus,
);
orderRouter.post(
  "/:id/items",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.addOrderItems,
);
orderRouter.delete(
  "/:id/items/:itemId",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.removeOrderItem,
);
// Same roles as adding/removing items — editing what the kitchen makes is a cashier action.
orderRouter.patch(
  "/:id/items/:itemId/notes",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.updateOrderItemNote,
);
orderRouter.patch(
  "/:id/deal-lines/:dealLineId/notes",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  orderController.updateOrderDealLineNote,
);
orderRouter.patch(
  "/:id/items/:itemId/status",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.KITCHEN),
  orderController.updateOrderItemStatus,
);

// Separate top-level resource: GET /api/pos/kitchen-queue
export const kitchenQueueRouter = Router();

kitchenQueueRouter.get(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.KITCHEN),
  orderController.getKitchenQueue,
);
