import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as reportsController from "./reports.controller";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN));

reportsRouter.get("/dashboard", reportsController.getDashboard);
reportsRouter.get("/analytics", reportsController.getAnalytics);
reportsRouter.get("/sales", reportsController.getSalesReport);
reportsRouter.get("/export", reportsController.exportReport);
