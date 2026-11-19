import { Router } from "express";
import {
  qrMenuLimiter,
  receiptLimiter,
  tableActionLimiter,
  tableProofUploadLimiter,
  tableJoinLimiter,
  tableLookupLimiter,
  tablePollLimiter,
} from "../../common/middlewares/rateLimit";
import { proofUpload } from "../../config/mediaUpload";
import * as controller from "./tableGuest.controller";

// /api/online/table — public Table QR routes for guests at a table (docs/TABLE_QR_SPEC.md §4.1).
// Literal paths first: Express matches in registration order, so "/:qrKey" would otherwise swallow
// "/menu" and "/session".
export const tableGuestRouter = Router();

tableGuestRouter.get("/menu", qrMenuLimiter, controller.getMenu);
tableGuestRouter.get("/session", tablePollLimiter, controller.requireTableGuest, controller.getSession);
tableGuestRouter.post("/orders", tableActionLimiter, controller.requireTableGuest, controller.createOrder);
tableGuestRouter.post("/orders/:orderId/cancel", tableActionLimiter, controller.requireTableGuest, controller.cancelOrder);
tableGuestRouter.post("/calls", tableActionLimiter, controller.requireTableGuest, controller.createCall);
tableGuestRouter.post("/calls/:id/cancel", tableActionLimiter, controller.requireTableGuest, controller.cancelCall);
// The table bill (phase 2). Guests act only for themselves; every amount is computed on the server.
tableGuestRouter.post("/bill/request", tableActionLimiter, controller.requireTableGuest, controller.requestBill);
tableGuestRouter.put("/bill/split", tableActionLimiter, controller.requireTableGuest, controller.setSplit);
tableGuestRouter.put("/bill/claims", tableActionLimiter, controller.requireTableGuest, controller.setClaim);
tableGuestRouter.post("/bill/shares/:shareId/claim", tableActionLimiter, controller.requireTableGuest, controller.claimShare);
tableGuestRouter.post("/bill/shares/:shareId/pay", tableActionLimiter, controller.requireTableGuest, controller.payShare);
tableGuestRouter.post(
  "/bill/shares/:shareId/payment-proof",
  tableProofUploadLimiter,
  controller.requireTableGuest,
  proofUpload.single("file"),
  controller.uploadShareProof,
);
tableGuestRouter.get("/receipt", tablePollLimiter, controller.getReceiptKey);
tableGuestRouter.get("/:qrKey", tableLookupLimiter, controller.getTable);
tableGuestRouter.post("/:qrKey/join", tableJoinLimiter, controller.join);

// /api/online/receipts/:receiptKey — a closed table's receipt, public behind its long random link.
export const tableReceiptRouter = Router();
tableReceiptRouter.get("/:receiptKey", receiptLimiter, controller.getPublicReceipt);
