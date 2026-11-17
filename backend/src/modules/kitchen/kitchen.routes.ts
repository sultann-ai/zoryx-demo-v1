import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as kitchenController from "./kitchen.controller";

export const kitchenRouter = Router();

kitchenRouter.get("/", requireAuth, kitchenController.listKitchens);
kitchenRouter.get("/:id", requireAuth, kitchenController.getKitchen);
kitchenRouter.post("/", requireAuth, requireRole(StaffRole.SUPER_ADMIN), kitchenController.createKitchen);
kitchenRouter.put("/:id", requireAuth, requireRole(StaffRole.SUPER_ADMIN), kitchenController.updateKitchen);
kitchenRouter.delete("/:id", requireAuth, requireRole(StaffRole.SUPER_ADMIN), kitchenController.deleteKitchen);
