import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as diningAreaController from "./diningArea.controller";
import * as tableController from "../table/table.controller";

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
// Table QR: a new QR key for this table — the printed card stops working at once (SA/PA).
diningAreaRouter.post(
  "/:id/qr-key/regenerate",
  requireAuth,
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN),
  tableController.regenerateQrKey,
);
