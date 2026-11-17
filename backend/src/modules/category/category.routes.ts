import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as categoryController from "./category.controller";

export const categoryRouter = Router();

categoryRouter.get("/", requireAuth, categoryController.listCategories);
categoryRouter.get("/:id", requireAuth, categoryController.getCategory);
categoryRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  categoryController.createCategory,
);
categoryRouter.put(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  categoryController.updateCategory,
);
categoryRouter.patch(
  "/:id/online-content",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ONLINE_ADMIN),
  categoryController.patchOnlineContent,
);
categoryRouter.delete(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  categoryController.deleteCategory,
);
