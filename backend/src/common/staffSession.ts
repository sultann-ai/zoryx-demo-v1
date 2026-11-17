import { StaffRole } from "../../generated/prisma/client";
import { prisma } from "../config/prisma";

// A staff JWT stays cryptographically valid for 12h, so every use of one — an HTTP request
// (requireAuth) or a Socket.io handshake — also checks the account behind it: it must still exist,
// be active, and still have the role and kitchen the token was issued with. Otherwise a deactivated
// or demoted account keeps its old access until the token expires.

export interface StaffClaims {
  id: string;
  role: StaffRole;
  kitchenId: string | null;
}

export type StaffSessionProblem = "deactivated" | "changed";

export const STAFF_SESSION_MESSAGE: Record<StaffSessionProblem, string> = {
  deactivated: "This account has been deactivated",
  changed: "Your account was changed — please log in again",
};

const VALID_STAFF_ROLES = Object.values(StaffRole) as string[];

// Shape check on a verified JWT payload: a staff token, not a customer one (those carry
// `type: "customer"` and no role).
export function asStaffClaims(payload: Record<string, unknown>): StaffClaims | null {
  if (typeof payload.id !== "string" || !VALID_STAFF_ROLES.includes(payload.role as string)) {
    return null;
  }
  return {
    id: payload.id,
    role: payload.role as StaffRole,
    kitchenId: typeof payload.kitchenId === "string" ? payload.kitchenId : null,
  };
}

// null when the token's account is still good. Throws if the database can't be reached — callers
// treat that as "couldn't check", not as "deactivated".
export async function checkStaffSession(claims: StaffClaims): Promise<StaffSessionProblem | null> {
  const staffUser = await prisma.staffUser.findUnique({
    where: { id: claims.id },
    select: { isActive: true, role: true, kitchenId: true },
  });
  if (!staffUser || !staffUser.isActive) {
    return "deactivated";
  }
  if (staffUser.role !== claims.role || (staffUser.kitchenId ?? null) !== claims.kitchenId) {
    return "changed";
  }
  return null;
}
