import { Router } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { requireAuth, requireRole } from "../../common/middlewares/auth";
import * as controller from "./table.controller";
import * as bill from "./tableBill.controller";

// Table QR, staff side (docs/TABLE_QR_SPEC.md §4.2). Seating, guests, PIN and closing are for whoever
// works the floor (SA, PA, ORDER_TAKER); layout, QR keys and void are admin-only.
const FLOOR_ROLES = [StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN, StaffRole.ORDER_TAKER];
const ADMIN_ROLES = [StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN];

// /api/pos/tables
export const tableRouter = Router();
tableRouter.get("/floor", requireAuth, requireRole(...FLOOR_ROLES), controller.getFloor);
tableRouter.put("/layout", requireAuth, requireRole(...ADMIN_ROLES), controller.saveLayout);
tableRouter.get("/qr-sheet", requireAuth, requireRole(...ADMIN_ROLES), controller.getQrSheet);
tableRouter.post("/:diningAreaId/seat", requireAuth, requireRole(...FLOOR_ROLES), controller.seat);

// /api/pos/table-sessions
export const tableSessionRouter = Router();
tableSessionRouter.get("/:id", requireAuth, requireRole(...FLOOR_ROLES), controller.getSession);
tableSessionRouter.patch("/:id", requireAuth, requireRole(...FLOOR_ROLES), controller.updateSession);
tableSessionRouter.post("/:id/pin/rotate", requireAuth, requireRole(...FLOOR_ROLES), controller.rotatePin);
tableSessionRouter.post("/:id/guests/:guestId/remove", requireAuth, requireRole(...FLOOR_ROLES), controller.removeGuest);
tableSessionRouter.post("/:id/close", requireAuth, requireRole(...FLOOR_ROLES), controller.closeSession);
tableSessionRouter.post("/:id/void", requireAuth, requireRole(...ADMIN_ROLES), controller.voidSession);
// The table bill (phase 2): requesting it is a floor action; discount, split and taking payment are admin-only.
tableSessionRouter.post("/:id/bill", requireAuth, requireRole(...FLOOR_ROLES), bill.requestBill);
tableSessionRouter.post("/:id/bill/unlock", requireAuth, requireRole(...ADMIN_ROLES), bill.unlockBill);
tableSessionRouter.put("/:id/bill/discount", requireAuth, requireRole(...ADMIN_ROLES), bill.setDiscount);
tableSessionRouter.put("/:id/bill/split", requireAuth, requireRole(...ADMIN_ROLES), bill.setSplit);
tableSessionRouter.post("/:id/bill/shares/:shareId/mark-paid", requireAuth, requireRole(...ADMIN_ROLES), bill.markSharePaid);
tableSessionRouter.post("/:id/bill/shares/:shareId/verify", requireAuth, requireRole(...ADMIN_ROLES), bill.verifyShare);
tableSessionRouter.post("/:id/bill/shares/:shareId/reject", requireAuth, requireRole(...ADMIN_ROLES), bill.rejectShare);
tableSessionRouter.post("/:id/bill/shares/:shareId/unmark", requireAuth, requireRole(...ADMIN_ROLES), bill.unmarkShare);
tableSessionRouter.get("/:id/bill/shares/:shareId/payment-proof", requireAuth, requireRole(...ADMIN_ROLES), bill.getShareProof);
tableSessionRouter.get("/:id/receipt", requireAuth, requireRole(...FLOOR_ROLES), bill.getReceipt);

// /api/pos/table-calls — waiter calls (build step 3): whoever works the floor sees and answers them.
export const tableCallRouter = Router();
tableCallRouter.get("/", requireAuth, requireRole(...FLOOR_ROLES), controller.listCalls);
tableCallRouter.post("/:id/acknowledge", requireAuth, requireRole(...FLOOR_ROLES), controller.acknowledgeCall);
tableCallRouter.post("/:id/resolve", requireAuth, requireRole(...FLOOR_ROLES), controller.resolveCall);
