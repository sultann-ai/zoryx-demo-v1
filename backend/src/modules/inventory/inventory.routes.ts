import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as inventoryController from "./inventory.controller";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth, requireRole(StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN));

// Static sub-resource paths registered before "/:id" so they aren't swallowed by it.
inventoryRouter.get("/links", inventoryController.listInventoryLinks);
inventoryRouter.post("/links", inventoryController.createInventoryLink);
inventoryRouter.get("/links/:id", inventoryController.getInventoryLink);
inventoryRouter.put("/links/:id", inventoryController.updateInventoryLink);
inventoryRouter.delete("/links/:id", inventoryController.deleteInventoryLink);

inventoryRouter.get("/", inventoryController.listInventoryItems);
inventoryRouter.post("/", inventoryController.createInventoryItem);
inventoryRouter.get("/:id", inventoryController.getInventoryItem);
inventoryRouter.put("/:id", inventoryController.updateInventoryItem);
inventoryRouter.delete("/:id", inventoryController.deleteInventoryItem);
inventoryRouter.post("/:id/adjust", inventoryController.adjustStock);
