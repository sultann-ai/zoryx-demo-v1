import { NextFunction, Request, Response } from "express";
import { ifNoneMatchMatches } from "../../common/http/etag";
import {
  DealNotFoundError,
  EmptyOrderError,
  InvalidOrderDealsError,
  InvalidOrderItemsError,
  ItemNotOrderableOnlineError,
  MenuItemNotFoundError,
  NoActiveBusinessDayError,
  OrderTooLargeError,
} from "../order/order.service";
import { GuestOrderValidationError } from "../guestOrder/guestOrder.validators";
import { isPlausibleGuestToken, isPlausibleQrKey } from "./guestToken";
import * as service from "./tableGuest.service";
import { parseJoinBody, parseTableCallBody, parseTableOrderBody, TableGuestValidationError } from "./tableGuest.validators";

// Every error on the public Table QR routes is { code, error } (like guest checkout), so the page can
// branch on code.
function fail(res: Response, status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ code, error, ...extra });
}

// Turns a known refusal into its answer; returns false for anything else (rethrow it).
function respondToKnownError(res: Response, error: unknown): boolean {
  if (error instanceof service.TableGuestError) {
    fail(res, error.status, error.code, error.message, error.extra);
    return true;
  }
  if (error instanceof TableGuestValidationError || error instanceof GuestOrderValidationError) {
    fail(res, 400, "BAD_REQUEST", error.message);
    return true;
  }
  if (error instanceof NoActiveBusinessDayError) {
    fail(res, 409, "ORDERING_CLOSED", "We are not taking orders right now.");
    return true;
  }
  if (error instanceof ItemNotOrderableOnlineError) {
    fail(res, 400, "ITEM_UNAVAILABLE", "Something in your order is no longer available.");
    return true;
  }
  if (error instanceof OrderTooLargeError) {
    fail(res, 400, "ORDER_TOO_LARGE", "That order is too large to send from the table. Please ask a staff member.");
    return true;
  }
  if (
    error instanceof MenuItemNotFoundError ||
    error instanceof DealNotFoundError ||
    error instanceof InvalidOrderItemsError ||
    error instanceof InvalidOrderDealsError ||
    error instanceof EmptyOrderError
  ) {
    fail(res, 400, "BAD_REQUEST", error instanceof Error && error.message ? error.message : "Invalid order");
    return true;
  }
  return false;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tableGuest?: service.AuthenticatedGuest;
    }
  }
}

export const GUEST_TOKEN_HEADER = "x-table-token";

// The guest realm: an X-Table-Token header (never Authorization, which is the staff realm's). 401
// SESSION_ENDED for a missing/unknown token, a removed guest, or a session no longer open.
export async function requireTableGuest(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers[GUEST_TOKEN_HEADER];
  if (!isPlausibleGuestToken(token)) {
    const ended = service.sessionEnded();
    fail(res, ended.status, ended.code, ended.message);
    return;
  }
  const guest = await service.authenticateGuest(token);
  if (!guest) {
    const ended = service.sessionEnded();
    fail(res, ended.status, ended.code, ended.message);
    return;
  }
  req.tableGuest = guest;
  next();
}

// GET /api/online/table/:qrKey
export async function getTable(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const qrKey = req.params.qrKey;
  if (!isPlausibleQrKey(qrKey)) {
    fail(res, 404, "NOT_FOUND", "Table not found");
    return;
  }
  try {
    res.json(await service.getTableByQrKey(qrKey));
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}

// GET /api/online/table/menu — public, cached for a minute (like the website's menu).
export async function getMenu(_req: Request, res: Response) {
  const menu = await service.getQrMenu();
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(menu);
}

// POST /api/online/table/:qrKey/join
export async function join(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const qrKey = req.params.qrKey;
  if (!isPlausibleQrKey(qrKey)) {
    fail(res, 404, "NOT_FOUND", "Table not found");
    return;
  }
  try {
    const input = parseJoinBody(req.body);
    const { result, isNew } = await service.joinTable(qrKey, input, req.ip);
    res.status(isNew ? 201 : 200).json(result);
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}

// GET /api/online/table/session — the guest's poll. 304 when nothing changed since their last poll.
export async function getSession(req: Request, res: Response) {
  const guest = req.tableGuest!;
  const version = await service.getSessionVersion(guest.sessionId);
  if (version === null) {
    const ended = service.sessionEnded();
    fail(res, ended.status, ended.code, ended.message);
    return;
  }
  const etag = service.sessionEtag(guest, version);
  // The page sends it back itself as If-None-Match (the response is no-store, so the browser cache
  // won't), and it's a cross-origin call: the header must be exposed to read it.
  res.setHeader("Access-Control-Expose-Headers", "ETag");
  res.setHeader("ETag", etag);
  if (ifNoneMatchMatches(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return;
  }
  const poll = await service.getSessionPoll(guest);
  // The poll read the version again; send the ETag that matches what's in this body.
  res.setHeader("ETag", service.sessionEtag(guest, poll.version));
  res.json(poll);
}

// POST /api/online/table/orders
export async function createOrder(req: Request, res: Response) {
  try {
    const input = parseTableOrderBody(req.body);
    const { result, isNew } = await service.createTableOrder(req.tableGuest!, input);
    res.status(isNew ? 201 : 200).json(result);
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}

// POST /api/online/table/orders/:orderId/cancel
export async function cancelOrder(req: Request, res: Response) {
  try {
    res.json(await service.cancelOwnRound(req.tableGuest!, req.params.orderId as string));
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}

// POST /api/online/table/calls — { clientRequestId, type, note? }
export async function createCall(req: Request, res: Response) {
  try {
    const input = parseTableCallBody(req.body);
    const { result, isNew } = await service.createTableCall(req.tableGuest!, input);
    res.status(isNew ? 201 : 200).json(result);
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}

// POST /api/online/table/calls/:id/cancel
export async function cancelCall(req: Request, res: Response) {
  try {
    res.json(await service.cancelOwnCall(req.tableGuest!, req.params.id as string));
  } catch (error) {
    if (!respondToKnownError(res, error)) {
      throw error;
    }
  }
}
