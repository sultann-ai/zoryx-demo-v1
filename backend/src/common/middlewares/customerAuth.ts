import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export interface CustomerAuthPayload {
  id: string;
  type: "customer";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: CustomerAuthPayload;
    }
  }
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    // Staff tokens carry a `role` instead of `type: "customer"` — reject them here
    // so a staff token can never be mistaken for an authenticated customer session.
    if (payload.type !== "customer" || typeof payload.id !== "string") {
      res.status(401).json({ error: "Invalid token: not a customer token" });
      return;
    }
    req.customer = { id: payload.id, type: "customer" };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
