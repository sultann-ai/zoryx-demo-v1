import { Request, Response } from "express";
import * as orderService from "../order/order.service";
import * as callService from "./tableCall.service";
import * as service from "./tableSession.service";

// Staff answers are { error } plus a `code` wherever the POS branches on it (like /business-day/end).
function respondToTableError(res: Response, error: unknown): boolean {
  if (error instanceof service.TableStaffError) {
    res.status(error.status).json({ error: error.message, code: error.code, ...error.extra });
    return true;
  }
  return false;
}

async function run(res: Response, work: () => Promise<unknown>, status = 200) {
  try {
    res.status(status).json(await work());
  } catch (error) {
    if (!respondToTableError(res, error)) {
      throw error;
    }
  }
}

function optionalReason(raw: unknown, res: Response): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string" || raw.trim().length > 200) {
    res.status(400).json({ error: "reason must be a string of at most 200 characters" });
    return { ok: false };
  }
  return { ok: true, value: raw.trim() || null };
}

// GET /api/pos/tables/floor
export async function getFloor(req: Request, res: Response) {
  const { area } = req.query;
  if (area !== undefined && typeof area !== "string") {
    res.status(400).json({ error: "area must be a single string value" });
    return;
  }
  res.json(await service.getFloor(area));
}

const LAYOUT_KEYS = ["id", "x", "y", "w", "h", "shape", "rotation"];
const MAX_LAYOUT_TABLES = 200;

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// PUT /api/pos/tables/layout — { tables: [{ id, x, y, w, h, shape?, rotation? }] }; x/y/w/h all null unplaces.
export async function saveLayout(req: Request, res: Response) {
  const { tables, ...rest } = (req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !Array.isArray(tables) || tables.length === 0 || tables.length > MAX_LAYOUT_TABLES) {
    res.status(400).json({ error: `tables must be an array of 1-${MAX_LAYOUT_TABLES} entries` });
    return;
  }
  const entries: service.LayoutEntry[] = [];
  for (const [index, raw] of tables.entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const at = `tables[${index}]`;
    if (typeof raw !== "object" || Object.keys(entry).some((key) => !LAYOUT_KEYS.includes(key)) || typeof entry.id !== "string") {
      res.status(400).json({ error: `${at} must be { id, x, y, w, h, shape?, rotation? }` });
      return;
    }
    const unplaced = entry.x === null && entry.y === null && entry.w === null && entry.h === null;
    const placed =
      isIntIn(entry.x, 0, 1000) && isIntIn(entry.y, 0, 1000) && isIntIn(entry.w, 20, 400) && isIntIn(entry.h, 20, 400);
    if (!unplaced && !placed) {
      res.status(400).json({ error: `${at}: x and y must be whole numbers 0-1000, w and h 20-400 (or all four null)` });
      return;
    }
    if (entry.shape !== undefined && entry.shape !== "RECT" && entry.shape !== "ROUND") {
      res.status(400).json({ error: `${at}.shape must be RECT or ROUND` });
      return;
    }
    if (entry.rotation !== undefined && !isIntIn(entry.rotation, 0, 359)) {
      res.status(400).json({ error: `${at}.rotation must be a whole number 0-359` });
      return;
    }
    entries.push({
      id: entry.id,
      x: entry.x as number | null,
      y: entry.y as number | null,
      w: entry.w as number | null,
      h: entry.h as number | null,
      ...(entry.shape !== undefined ? { shape: entry.shape as "RECT" | "ROUND" } : {}),
      ...(entry.rotation !== undefined ? { rotation: entry.rotation as number } : {}),
    });
  }
  await run(res, () => service.saveLayout(entries));
}

// GET /api/pos/tables/qr-sheet
export async function getQrSheet(req: Request, res: Response) {
  const { area } = req.query;
  if (area !== undefined && typeof area !== "string") {
    res.status(400).json({ error: "area must be a single string value" });
    return;
  }
  res.json(await service.getQrSheet(area));
}

// POST /api/pos/dining-areas/:id/qr-key/regenerate
export async function regenerateQrKey(req: Request, res: Response) {
  await run(res, () => service.regenerateQrKey(req.params.id as string));
}

// POST /api/pos/tables/:diningAreaId/seat — { waiterStaffId?: string | null }
export async function seat(req: Request, res: Response) {
  const { waiterStaffId, ...rest } = (req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    res.status(400).json({ error: "Only waiterStaffId may be sent" });
    return;
  }
  if (waiterStaffId !== undefined && waiterStaffId !== null && typeof waiterStaffId !== "string") {
    res.status(400).json({ error: "waiterStaffId must be a string or null" });
    return;
  }
  await run(
    res,
    () => service.seatTable(req.params.diningAreaId as string, req.staff!, waiterStaffId as string | null | undefined),
    201,
  );
}

// GET /api/pos/table-sessions/:id
export async function getSession(req: Request, res: Response) {
  await run(res, () => service.getSessionDetail(req.params.id as string));
}

// PATCH /api/pos/table-sessions/:id — { waiterStaffId: string | null }
export async function updateSession(req: Request, res: Response) {
  const { waiterStaffId, ...rest } = (req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || (waiterStaffId !== null && typeof waiterStaffId !== "string")) {
    res.status(400).json({ error: "Send { waiterStaffId: string | null }" });
    return;
  }
  await run(res, () => service.setWaiter(req.params.id as string, waiterStaffId as string | null, req.staff!.id));
}

// POST /api/pos/table-sessions/:id/pin/rotate
export async function rotatePin(req: Request, res: Response) {
  await run(res, () => service.rotatePin(req.params.id as string, req.staff!.id));
}

// POST /api/pos/table-sessions/:id/guests/:guestId/remove — { reason? }
export async function removeGuest(req: Request, res: Response) {
  const reason = optionalReason((req.body ?? {}).reason, res);
  if (!reason.ok) {
    return;
  }
  await run(res, () => service.removeGuest(req.params.id as string, req.params.guestId as string, req.staff!.id, reason.value));
}

// POST /api/pos/table-sessions/:id/close
export async function closeSession(req: Request, res: Response) {
  await run(res, () => service.closeSession(req.params.id as string, req.staff!.id));
}

export const VOID_REJECT_REASON = "Table closed";

// POST /api/pos/table-sessions/:id/void — { reason (1-200) }
export async function voidSession(req: Request, res: Response) {
  const { reason } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > 200) {
    res.status(400).json({ error: "reason is required (1-200 characters)" });
    return;
  }
  const actorId = req.staff!.id;
  await run(res, () =>
    service.voidSession(req.params.id as string, actorId, reason.trim(), (orderId) =>
      orderService.rejectOrder(orderId, { reason: VOID_REJECT_REASON }, actorId).catch((error) => {
        // Reception accepted or rejected it meanwhile — the void re-checks and decides.
        if (error instanceof orderService.OrderNotAwaitingReceptionError) {
          return null;
        }
        throw error;
      }),
    ),
  );
}

// GET /api/pos/table-calls?status=open (default) | all [&since=ISO time]
export async function listCalls(req: Request, res: Response) {
  const { status = "open", since } = req.query;
  if (status !== "open" && status !== "all") {
    res.status(400).json({ error: "status must be open or all" });
    return;
  }
  let sinceDate: Date | undefined;
  if (since !== undefined) {
    sinceDate = typeof since === "string" ? new Date(since) : new Date(Number.NaN);
    if (Number.isNaN(sinceDate.getTime())) {
      res.status(400).json({ error: "since must be an ISO date-time" });
      return;
    }
  }
  res.json(await callService.listCalls({ status, ...(sinceDate !== undefined ? { since: sinceDate } : {}) }));
}

// POST /api/pos/table-calls/:id/acknowledge — "On my way".
export async function acknowledgeCall(req: Request, res: Response) {
  await run(res, () => callService.acknowledgeCall(req.params.id as string, req.staff!.id));
}

// POST /api/pos/table-calls/:id/resolve — "Done".
export async function resolveCall(req: Request, res: Response) {
  await run(res, () => callService.resolveCall(req.params.id as string, req.staff!.id));
}
