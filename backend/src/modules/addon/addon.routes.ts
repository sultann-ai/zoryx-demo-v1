import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as addOnController from "./addon.controller";

export const addOnRouter = Router();

const writeRoles = requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN);

addOnRouter.get("/", requireAuth, addOnController.listAddOns);
addOnRouter.get("/:id", requireAuth, addOnController.getAddOn);
addOnRouter.post("/", requireAuth, writeRoles, addOnController.createAddOn);
addOnRouter.put("/:id", requireAuth, writeRoles, addOnController.updateAddOn);
addOnRouter.delete("/:id", requireAuth, writeRoles, addOnController.deleteAddOn);
addOnRouter.put("/:id/prices/:size", requireAuth, writeRoles, addOnController.setAddOnPrice);
addOnRouter.delete("/:id/prices/:size", requireAuth, writeRoles, addOnController.removeAddOnPrice);
