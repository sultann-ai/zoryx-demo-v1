import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import { requireCustomerAuth } from "../../common/middlewares/customerAuth";
import { proofUpload } from "../../config/mediaUpload";
import * as paymentController from "./payment.controller";

// Customer-facing: POST /api/online/orders
export const onlineOrderRouter = Router();

onlineOrderRouter.post(
  "/",
  requireCustomerAuth,
  proofUpload.single("screenshot"),
  paymentController.createOnlineOrder,
);

// Staff-facing: /api/online/payment/*
export const paymentAdminRouter = Router();

paymentAdminRouter.use(requireAuth, requireRole(StaffRole.ONLINE_ADMIN, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN));

paymentAdminRouter.get("/pending", paymentController.listPendingPayments);
paymentAdminRouter.patch("/:orderId/verify", paymentController.verifyPayment);
paymentAdminRouter.patch("/:orderId/reject", paymentController.rejectPayment);
