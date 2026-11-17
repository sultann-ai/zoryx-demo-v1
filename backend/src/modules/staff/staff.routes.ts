import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as staffController from "./staff.controller";

export const staffRouter = Router();

staffRouter.use(requireAuth, requireRole(StaffRole.SUPER_ADMIN));

staffRouter.get("/", staffController.listStaff);
staffRouter.get("/:id", staffController.getStaff);
staffRouter.post("/", staffController.createStaff);
staffRouter.put("/:id", staffController.updateStaff);
staffRouter.delete("/:id", staffController.deactivateStaff);
