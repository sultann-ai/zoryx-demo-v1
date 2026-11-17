import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as printController from "./print.controller";

export const printRouter = Router();

// Any staff except ORDER_TAKER — the other callers (OrderDetailPage's print buttons,
// KITCHEN tickets) are already gated to their own pages client-side, so this role list is
// about keeping ORDER_TAKER out by default (it's not one of their listed capabilities),
// not protecting against the roles that remain.
const PRINT_ROLES = [StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN, StaffRole.ONLINE_ADMIN, StaffRole.KITCHEN] as const;
printRouter.post("/", requireAuth, requireRole(...PRINT_ROLES), printController.createPrintJob);
printRouter.get("/status", requireAuth, requireRole(...PRINT_ROLES), printController.getPrintStatus);
