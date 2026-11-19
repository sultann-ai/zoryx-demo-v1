import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as printController from "./print.controller";

export const printRouter = Router();

// Raw print documents can include drawer commands, so ORDER_TAKER uses the
// server-generated table receipt endpoint instead of this route.
const PRINT_ROLES = [StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN, StaffRole.ONLINE_ADMIN, StaffRole.KITCHEN] as const;
printRouter.post("/", requireAuth, requireRole(...PRINT_ROLES), printController.createPrintJob);
printRouter.get("/status", requireAuth, requireRole(...PRINT_ROLES), printController.getPrintStatus);
