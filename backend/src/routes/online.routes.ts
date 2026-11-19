import { Router } from "express";
import { customerAccountsGate } from "../common/middlewares/customerAccountsGate";
import { onlineGeneralLimiter } from "../common/middlewares/rateLimit";
import { customerAuthRouter } from "../modules/customer/customer.routes";
import { customerAddressRouter } from "../modules/customerAddress/customerAddress.routes";
import { guestOrderRouter, publicOrderRouter } from "../modules/guestOrder/guestOrder.routes";
import { onlineDealRouter } from "../modules/deal/deal.routes";
import { onlineMediaRouter } from "../modules/media/media.routes";
import { onlineMenuRouter } from "../modules/menu/menu.routes";
import { onlineOrderRouter, paymentAdminRouter } from "../modules/payment/payment.routes";
import { onlineStoreRouter } from "../modules/store/store.routes";
import { tableGuestRouter } from "../modules/tableGuest/tableGuest.routes";

export const onlineRouter = Router();

// Feature routers (src/modules/<name>/<name>.routes.ts) get mounted here.

// Per-IP ceiling for everything public under /api/online (staff /payment/* is exempt).
onlineRouter.use(onlineGeneralLimiter);

onlineRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", scope: "online" });
});

onlineRouter.use("/media", onlineMediaRouter);

// Guest checkout — no account. Public; each route has its own limiter (the general one skips
// these paths). The status/proof router is mounted BEFORE the customer-accounts gate below, which
// guards only the account-based POST /orders.
onlineRouter.use("/guest-orders", guestOrderRouter);
onlineRouter.use("/orders", publicOrderRouter);

// Table QR — guests at a table (docs/TABLE_QR_SPEC.md). Public; its own limiters (the general one
// skips /table), guest routes authenticated by the X-Table-Token header.
onlineRouter.use("/table", tableGuestRouter);

onlineRouter.use("/store", onlineStoreRouter);
onlineRouter.use("/menu", onlineMenuRouter);
onlineRouter.use("/deals", onlineDealRouter);

// Password-based customer accounts: 404 unless ENABLE_CUSTOMER_ACCOUNTS is set. The website
// starts with guest checkout; accounts come in a later module.
const customerAccounts = customerAccountsGate();
onlineRouter.use("/auth", customerAccounts, customerAuthRouter);
onlineRouter.use("/addresses", customerAccounts, customerAddressRouter);
onlineRouter.use("/orders", customerAccounts, onlineOrderRouter);

onlineRouter.use("/payment", paymentAdminRouter);
