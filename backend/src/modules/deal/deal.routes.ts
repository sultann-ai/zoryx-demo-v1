import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as dealController from "./deal.controller";

export const posDealRouter = Router();

posDealRouter.get("/", requireAuth, dealController.listDeals);
posDealRouter.get("/:id", requireAuth, dealController.getDeal);
posDealRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  dealController.createDeal,
);
posDealRouter.put(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  dealController.updateDeal,
);
posDealRouter.patch(
  "/:id/online-content",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  dealController.patchOnlineContent,
);
// Table QR: "Show on QR menu".
posDealRouter.patch(
  "/:id/qr-availability",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  dealController.patchQrAvailability,
);
posDealRouter.delete(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  dealController.deleteDeal,
);

// Public: customer-facing online deals, no staff auth required.
export const onlineDealRouter = Router();

onlineDealRouter.get("/", dealController.listOnlineDeals);
