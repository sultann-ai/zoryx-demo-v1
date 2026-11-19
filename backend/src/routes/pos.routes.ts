import { Router } from "express";
import { addOnRouter } from "../modules/addon/addon.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { businessDayRouter } from "../modules/businessDay/businessDay.routes";
import { categoryRouter } from "../modules/category/category.routes";
import { posDealRouter } from "../modules/deal/deal.routes";
import { diningAreaRouter } from "../modules/diningArea/diningArea.routes";
import { employeeRouter } from "../modules/employee/employee.routes";
import { inventoryRouter } from "../modules/inventory/inventory.routes";
import { kitchenRouter } from "../modules/kitchen/kitchen.routes";
import { mediaAdminRouter } from "../modules/media/media.routes";
import { posMenuRouter } from "../modules/menu/menu.routes";
import { kitchenQueueRouter, orderRouter } from "../modules/order/order.routes";
import { printRouter } from "../modules/print/print.routes";
import { reportsRouter } from "../modules/reports/reports.routes";
import {
  deliveryAreaRouter,
  galleryRouter,
  paymentAccountRouter,
  siteSettingsRouter,
  appInfoRouter,
  testimonialRouter,
} from "../modules/siteContent/siteContent.routes";
import { staffRouter } from "../modules/staff/staff.routes";
import { tableCallRouter, tableRouter, tableSessionRouter } from "../modules/table/table.routes";
import { vendorRouter } from "../modules/vendor/vendor.routes";

export const posRouter = Router();

// Feature routers (src/modules/<name>/<name>.routes.ts) get mounted here.

posRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", scope: "pos" });
});

posRouter.use("/auth", authRouter);
posRouter.use("/business-day", businessDayRouter);
posRouter.use("/kitchens", kitchenRouter);
posRouter.use("/staff", staffRouter);
posRouter.use("/categories", categoryRouter);
posRouter.use("/menu", posMenuRouter);
posRouter.use("/addons", addOnRouter);
posRouter.use("/deals", posDealRouter);
posRouter.use("/dining-areas", diningAreaRouter);
posRouter.use("/employees", employeeRouter);
posRouter.use("/orders", orderRouter);
posRouter.use("/kitchen-queue", kitchenQueueRouter);
posRouter.use("/inventory", inventoryRouter);
posRouter.use("/reports", reportsRouter);
posRouter.use("/print", printRouter);
posRouter.use("/vendors", vendorRouter);
// Table QR: floor map, seating, sessions (docs/TABLE_QR_SPEC.md).
posRouter.use("/tables", tableRouter);
posRouter.use("/table-sessions", tableSessionRouter);
posRouter.use("/table-calls", tableCallRouter);

// Customer-website content (photos, Urdu text, shop info, delivery areas, payment accounts,
// gallery, testimonials). SUPER_ADMIN, POS_ADMIN, ONLINE_ADMIN.
posRouter.use("/media", mediaAdminRouter);
posRouter.use("/site-settings", siteSettingsRouter);
posRouter.use("/app-info", appInfoRouter);
posRouter.use("/delivery-areas", deliveryAreaRouter);
posRouter.use("/payment-accounts", paymentAccountRouter);
posRouter.use("/gallery", galleryRouter);
posRouter.use("/testimonials", testimonialRouter);
