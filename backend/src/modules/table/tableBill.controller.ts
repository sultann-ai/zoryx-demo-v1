import { Request, Response } from "express";
import { sendPaymentProof } from "../media/sendPaymentProof";
import * as billService from "./tableBill.service";
import * as validators from "./tableBill.validators";
import { TableStaffError } from "./tableErrors";

// Staff side of the table bill: /api/pos/table-sessions/:id/bill… and /receipt (docs/TABLE_QR_SPEC.md §4.2
// phase 2). Answers are { bill } (the staff view); refusals { error, code, ...extra }.

const staffActor = (req: Request) => ({ kind: "staff" as const, id: req.staff!.id, role: req.staff!.role });
const sessionId = (req: Request) => req.params.id as string;
const shareId = (req: Request) => req.params.shareId as string;

async function run(res: Response, work: () => Promise<unknown>) {
  try {
    res.json(await work());
  } catch (error) {
    if (error instanceof validators.BillValidationError) {
      res.status(400).json({ error: error.message, code: "BAD_REQUEST" });
      return;
    }
    if (error instanceof TableStaffError) {
      res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
      return;
    }
    throw error;
  }
}

// POST /:id/bill — request the bill on the table's behalf (SA, PA, OT). {}
export async function requestBill(req: Request, res: Response) {
  await run(res, () => {
    validators.parseEmpty(req.body);
    return billService.requestBill(sessionId(req), staffActor(req));
  });
}

// POST /:id/bill/unlock — { expectedVersion }
export async function unlockBill(req: Request, res: Response) {
  await run(res, () => billService.unlockBill(sessionId(req), staffActor(req), validators.parseExpectedVersionOnly(req.body)));
}

// PUT /:id/bill/discount — { discount, discountReason?, expectedVersion }
export async function setDiscount(req: Request, res: Response) {
  await run(res, () => billService.setBillDiscount(sessionId(req), staffActor(req), validators.parseDiscount(req.body)));
}

// PUT /:id/bill/split — { mode, parts? (EQUAL), shares? (CUSTOM), expectedVersion }
export async function setSplit(req: Request, res: Response) {
  await run(res, () => billService.setSplit(sessionId(req), staffActor(req), validators.parseStaffSplit(req.body)));
}

// POST /:id/bill/shares/:shareId/mark-paid — cash collected. { paidAmount? }
export async function markSharePaid(req: Request, res: Response) {
  await run(res, () => billService.markSharePaid(sessionId(req), staffActor(req), shareId(req), validators.parseMarkPaid(req.body)));
}

// POST /:id/bill/shares/:shareId/verify — the online proof is good.
export async function verifyShare(req: Request, res: Response) {
  await run(res, () => {
    validators.parseVerify(req.body);
    return billService.verifyShare(sessionId(req), staffActor(req), shareId(req));
  });
}

// POST /:id/bill/shares/:shareId/reject — { reason (1-200) }
export async function rejectShare(req: Request, res: Response) {
  await run(res, () => billService.rejectShare(sessionId(req), staffActor(req), shareId(req), validators.parseReason(req.body)));
}

// POST /:id/bill/shares/:shareId/unmark — { reason (1-200) }
export async function unmarkShare(req: Request, res: Response) {
  await run(res, () => billService.unmarkShare(sessionId(req), staffActor(req), shareId(req), validators.parseReason(req.body)));
}

// GET /:id/bill/shares/:shareId/payment-proof?size=thumb|full — the guest's proof image (blob).
export async function getShareProof(req: Request, res: Response) {
  const mediaId = await billService.getShareProofId(sessionId(req), shareId(req));
  await sendPaymentProof(req, res, mediaId, "No payment proof for this share");
}

// GET /:id/receipt — the closed table's receipt and its link.
export async function getReceipt(req: Request, res: Response) {
  const receipt = await billService.getSessionReceipt(sessionId(req));
  if (!receipt) {
    res.status(404).json({ error: "This table has no receipt yet", code: "NOT_READY" });
    return;
  }
  res.json(receipt);
}
