import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as vendorController from "./vendor.controller";

export const vendorRouter = Router();

vendorRouter.use(requireAuth, requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN));

vendorRouter.get("/", vendorController.listVendors);
vendorRouter.post("/", vendorController.createVendor);
vendorRouter.get("/:id", vendorController.getVendor);
vendorRouter.put("/:id", vendorController.updateVendor);
vendorRouter.delete("/:id", vendorController.deleteVendor);
vendorRouter.get("/:id/ledger", vendorController.getLedger);
vendorRouter.post("/:id/ledger", vendorController.addLedgerEntry);
