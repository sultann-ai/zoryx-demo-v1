import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as diningAreaController from "./diningArea.controller";

export const diningAreaRouter = Router();

// Reads also open to ORDER_TAKER — a waiter picking a table needs the dining-area list;
// writes stay POS_ADMIN/SUPER_ADMIN only.
diningAreaRouter.get(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  diningAreaController.listDiningAreas,
);
diningAreaRouter.get(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  diningAreaController.getDiningArea,
);
diningAreaRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  diningAreaController.createDiningArea,
);
diningAreaRouter.put(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  diningAreaController.updateDiningArea,
);
diningAreaRouter.delete(
  "/:id",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  diningAreaController.deleteDiningArea,
);
