import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { StaffRole } from "../../../generated/prisma/client";
import { env } from "../../config/env";
import { STAFF_SESSION_MESSAGE, asStaffClaims, checkStaffSession } from "../staffSession";

export interface AuthPayload {
  id: string;
  role: StaffRole;
  kitchenId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: AuthPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);

  let payload: Record<string, unknown>;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Customer tokens carry `type: "customer"` instead of a `role` — reject them here
  // so a customer token can never be mistaken for an authenticated staff session.
  const claims = asStaffClaims(payload);
  if (!claims) {
    res.status(401).json({ error: "Invalid token: not a staff token" });
    return;
  }

  // A token stays cryptographically valid for 12h, so check the account is still active and still
  // has the token's role and kitchen — otherwise a deactivated or demoted staff member keeps their
  // old access until the token expires.
  try {
    const problem = await checkStaffSession(claims);
    if (problem) {
      res.status(401).json({ error: STAFF_SESSION_MESSAGE[problem] });
      return;
    }
  } catch {
    res.status(500).json({ error: "Could not verify the staff account" });
    return;
  }

  req.staff = claims;
  next();
}

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.staff) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.staff.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
}
