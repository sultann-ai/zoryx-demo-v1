import { Router } from "express";
import { guestOrderLimiter, orderStatusLimiter, proofUploadLimiter } from "../../common/middlewares/rateLimit";
import { proofUpload } from "../../config/mediaUpload";
import * as guestOrderController from "./guestOrder.controller";

// POST /api/online/guest-orders — public, no account.
export const guestOrderRouter = Router();
guestOrderRouter.post("/", guestOrderLimiter, guestOrderController.createGuestOrder);

// /api/online/orders/:publicId… — public, identified by the unguessable status link. Mounted ahead
// of the customer-accounts router, which gates only the account-based POST /api/online/orders.
export const publicOrderRouter = Router();
publicOrderRouter.get("/:publicId", orderStatusLimiter, guestOrderController.getOrderStatus);
publicOrderRouter.post(
  "/:publicId/payment-proof",
  proofUploadLimiter,
  proofUpload.single("file"),
  guestOrderController.uploadPaymentProof,
);
// The customer's own proof, as a thumbnail only (the full image is staff-only).
publicOrderRouter.get("/:publicId/payment-proof", orderStatusLimiter, guestOrderController.getPaymentProofThumb);
