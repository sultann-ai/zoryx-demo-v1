import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { StaffRole } from "../../../generated/prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

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

const VALID_STAFF_ROLES = Object.values(StaffRole);

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
  if (typeof payload.id !== "string" || !(VALID_STAFF_ROLES as string[]).includes(payload.role as string)) {
    res.status(401).json({ error: "Invalid token: not a staff token" });
    return;
  }

  // A token stays cryptographically valid for 12h, so check the account is still active —
  // otherwise a deleted staff member keeps working until their token expires.
  try {
    const staffUser = await prisma.staffUser.findUnique({
      where: { id: payload.id },
      select: { isActive: true },
    });
    if (!staffUser || !staffUser.isActive) {
      res.status(401).json({ error: "This account has been deactivated" });
      return;
    }
  } catch {
    res.status(500).json({ error: "Could not verify the staff account" });
    return;
  }

  req.staff = payload as unknown as AuthPayload;
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
