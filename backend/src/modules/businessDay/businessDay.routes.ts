import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as businessDayController from "./businessDay.controller";

export const businessDayRouter = Router();

businessDayRouter.use(requireAuth);

// Read-only: ORDER_TAKER needs to know whether the day has started before offering
// the table grid (see TakeOrderPage's "Business day hasn't started" block) but never
// starts/ends one itself.
businessDayRouter.get(
  "/current",
  requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN, StaffRole.ORDER_TAKER),
  businessDayController.getCurrent,
);
businessDayRouter.post("/start", requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN), businessDayController.start);
businessDayRouter.post("/end", requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN), businessDayController.end);
