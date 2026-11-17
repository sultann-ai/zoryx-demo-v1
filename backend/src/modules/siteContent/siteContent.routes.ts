import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as controller from "./siteContent.controller";

// Website content is managed by the same three roles throughout. ONLINE_ADMIN is deliberately
// included: it's all online-facing content (and menu prices/kitchens are never reachable from
// these routes).
const contentEditors = [requireAuth, requireRole(StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN, StaffRole.ONLINE_ADMIN)];

export const siteSettingsRouter = Router();
siteSettingsRouter.use(...contentEditors);
siteSettingsRouter.get("/", controller.getSiteSettings);
siteSettingsRouter.put("/", controller.updateSiteSettings);

// Public (no token): the POS login page needs it before anyone signs in.
export const appInfoRouter = Router();
appInfoRouter.get("/", controller.getAppInfo);

function crudRouter(handlers: typeof controller.deliveryAreas) {
  const router = Router();
  router.use(...contentEditors);
  router.get("/", handlers.list);
  router.post("/", handlers.create);
  router.put("/:id", handlers.update);
  router.delete("/:id", handlers.remove);
  return router;
}

export const deliveryAreaRouter = crudRouter(controller.deliveryAreas);
export const paymentAccountRouter = crudRouter(controller.paymentAccounts);
export const galleryRouter = crudRouter(controller.gallery);
export const testimonialRouter = crudRouter(controller.testimonials);
