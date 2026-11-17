import { Request, Response } from "express";
import rateLimit, { Options } from "express-rate-limit";

// In-memory, per-IP, per-process counters. Fine for the auth endpoints; order-placement limits
// will live in Postgres in a later module. Each limiter below is its own instance, so each has
// its own counter.

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const AUTH_ATTEMPTS_PER_WINDOW = 10;
const ONLINE_REQUESTS_PER_WINDOW = 300;
// A single menu page legitimately loads dozens of images, so they get their own, much larger
// budget instead of eating the general one.
const MEDIA_REQUESTS_PER_WINDOW = 1000;
// Guest checkout. The real per-IP / per-phone order limits live in Postgres (guestOrder module);
// these only blunt floods of invalid requests. Status polling gets a large budget because the
// website polls while a customer watches their order.
const GUEST_ORDER_REQUESTS_PER_WINDOW = 30;
const PROOF_UPLOADS_PER_WINDOW = 20;
const ORDER_STATUS_REQUESTS_PER_WINDOW = 600;

export const TOO_MANY_BODY = {
  code: "TOO_MANY",
  error: "Too many requests, please try again later",
} as const;

export function createLimiter(options: Partial<Options>) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: AUTH_ATTEMPTS_PER_WINDOW,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json(TOO_MANY_BODY);
    },
    ...options,
  });
}

// Staff login. Only failed attempts count: the whole cafe likely shares one public IP, so
// successful logins by staff must not use up the budget.
export const staffLoginLimiter = createLimiter({ skipSuccessfulRequests: true });

// Customer signup + login share one bucket. Every request counts — signup spam is the threat.
export const customerAuthLimiter = createLimiter({});

// General ceiling for the public /api/online surface. /payment/* is the staff-facing part of
// that router and, like staff login, can come from one shared cafe IP — so it's exempt. /media
// is exempt too and counted by mediaLimiter instead.
export const onlineGeneralLimiter = createLimiter({
  limit: ONLINE_REQUESTS_PER_WINDOW,
  skip: (req: Request) =>
    req.path.startsWith("/payment") ||
    req.path.startsWith("/media") ||
    req.path.startsWith("/guest-orders") ||
    req.path.startsWith("/orders"),
});

export const mediaLimiter = createLimiter({ limit: MEDIA_REQUESTS_PER_WINDOW });

export const guestOrderLimiter = createLimiter({ limit: GUEST_ORDER_REQUESTS_PER_WINDOW });
export const proofUploadLimiter = createLimiter({ limit: PROOF_UPLOADS_PER_WINDOW });
export const orderStatusLimiter = createLimiter({ limit: ORDER_STATUS_REQUESTS_PER_WINDOW });
