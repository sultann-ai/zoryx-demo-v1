import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import { mediaLimiter } from "../../common/middlewares/rateLimit";
import { mediaUpload } from "../../config/mediaUpload";
import * as mediaController from "./media.controller";

// Staff: POST /api/pos/media
export const mediaAdminRouter = Router();

mediaAdminRouter.post(
  "/",
  requireAuth,
  requireRole(StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN, StaffRole.ONLINE_ADMIN),
  mediaUpload.single("file"),
  mediaController.uploadMedia,
);

// Public: GET /api/online/media/:id. Has its own limiter (and is exempt from the general
// /api/online one) because a single menu page legitimately requests dozens of images.
export const onlineMediaRouter = Router();

onlineMediaRouter.get("/:id", mediaLimiter, mediaController.serveMedia);
