import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as menuController from "./menu.controller";

export const posMenuRouter = Router();

posMenuRouter.get("/", requireAuth, menuController.listMenuItems);
posMenuRouter.get("/:id", requireAuth, menuController.getMenuItem);
posMenuRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.createMenuItem,
);
posMenuRouter.put(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.updateMenuItem,
);
posMenuRouter.patch(
  "/:id/online-availability",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  menuController.patchOnlineAvailability,
);
posMenuRouter.patch(
  "/:id/online-content",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  menuController.patchOnlineContent,
);
posMenuRouter.delete(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.deleteMenuItem,
);

posMenuRouter.post(
  "/:id/variants",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.createVariant,
);
posMenuRouter.put(
  "/:id/variants/:variantId",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.updateVariant,
);
posMenuRouter.delete(
  "/:id/variants/:variantId",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  menuController.deleteVariant,
);

// Public: customer-facing online menu, no staff auth required.
export const onlineMenuRouter = Router();

onlineMenuRouter.get("/", menuController.listOnlineMenuItems);
