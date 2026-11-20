import { Request, Response } from "express";
import { StaffRole } from "../../../generated/prisma/client";
import { validateNewPassword } from "../../common/password";
import { disconnectStaffSockets } from "../../config/socket";
import { releaseWaiterFromOpenSessions } from "../table/tableSession.service";
import * as staffService from "./staff.service";

const VALID_ROLES = Object.values(StaffRole);

// Live sockets (Kitchen Display, Incoming orders, the order-taker app) of an account whose access
// just changed are ended at once — HTTP is already refused by requireAuth on the next request. A
// socket problem never fails the staff change itself.
async function endLiveSessions(staffId: string, reason: string): Promise<void> {
  try {
    await disconnectStaffSockets(staffId, reason);
  } catch (error) {
    console.error(`Could not disconnect sockets of staff ${staffId}`, error);
  }
}

// Roles that can be a table's waiter (tableSession.service's WAITER_ROLES).
const FLOOR_ROLES: StaffRole[] = [StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN];

// Table sync R12: an account that can no longer work the floor stops being any open table's waiter.
async function releaseTables(staff: { id: string; isActive: boolean; role: StaffRole }, actorId: string): Promise<void> {
  if (staff.isActive && FLOOR_ROLES.includes(staff.role)) {
    return;
  }
  try {
    await releaseWaiterFromOpenSessions(staff.id, actorId);
  } catch (error) {
    console.error(`Could not release the tables of staff ${staff.id}`, error);
  }
}

// Why an update ends the account's live sessions, or null when it doesn't (a name change doesn't).
export function revokeReason(
  before: { role: StaffRole; kitchenId: string | null; isActive: boolean },
  after: { role: StaffRole; kitchenId: string | null; isActive: boolean },
  passwordReset: boolean,
): string | null {
  if (before.isActive && !after.isActive) return "Account deactivated";
  if (before.role !== after.role) return "Role changed";
  if (before.kitchenId !== after.kitchenId) return "Kitchen changed";
  if (passwordReset) return "Password reset";
  return null;
}

function isValidRole(role: unknown): role is StaffRole {
  return typeof role === "string" && (VALID_ROLES as string[]).includes(role);
}

export async function listStaff(_req: Request, res: Response) {
  const staff = await staffService.listStaff();
  res.json(staff);
}

export async function getStaff(req: Request, res: Response) {
  const staff = await staffService.getStaffById(req.params.id as string);
  if (!staff) {
    res.status(404).json({ error: "Staff user not found" });
    return;
  }
  res.json(staff);
}

export async function createStaff(req: Request, res: Response) {
  const { name, username, password, role, kitchenId, employeeId } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  const passwordError = validateNewPassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  if (!isValidRole(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }
  if (kitchenId !== undefined && typeof kitchenId !== "string") {
    res.status(400).json({ error: "kitchenId must be a string" });
    return;
  }
  if (employeeId !== undefined && typeof employeeId !== "string") {
    res.status(400).json({ error: "employeeId must be a string" });
    return;
  }

  try {
    const staff = await staffService.createStaff({
      name: name.trim(),
      username: username.trim(),
      password,
      role,
      ...(kitchenId !== undefined ? { kitchenId } : {}),
      ...(employeeId !== undefined ? { employeeId } : {}),
    });
    res.status(201).json(staff);
  } catch (error) {
    if (staffService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A staff user with this username or employeeId already exists" });
      return;
    }
    if (staffService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "kitchenId or employeeId does not reference an existing record" });
      return;
    }
    throw error;
  }
}

export async function updateStaff(req: Request, res: Response) {
  const { name, role, kitchenId, employeeId, isActive, password } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (role !== undefined && !isValidRole(role)) {
    res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }
  if (kitchenId !== undefined && kitchenId !== null && typeof kitchenId !== "string") {
    res.status(400).json({ error: "kitchenId must be a string or null" });
    return;
  }
  if (employeeId !== undefined && employeeId !== null && typeof employeeId !== "string") {
    res.status(400).json({ error: "employeeId must be a string or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }
  const passwordError = password !== undefined ? validateNewPassword(password) : null;
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const before = await staffService.getStaffById(req.params.id as string);
    const staff = await staffService.updateStaff(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(kitchenId !== undefined ? { kitchenId } : {}),
      ...(employeeId !== undefined ? { employeeId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(password !== undefined ? { password } : {}),
    });
    const reason = before ? revokeReason(before, staff, password !== undefined) : null;
    if (reason) {
      await endLiveSessions(staff.id, reason);
    }
    await releaseTables(staff, req.staff?.id ?? staff.id);
    res.json(staff);
  } catch (error) {
    if (staffService.isNotFoundError(error)) {
      res.status(404).json({ error: "Staff user not found" });
      return;
    }
    if (staffService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A staff user with this username or employeeId already exists" });
      return;
    }
    if (staffService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "kitchenId or employeeId does not reference an existing record" });
      return;
    }
    throw error;
  }
}

export async function deactivateStaff(req: Request, res: Response) {
  try {
    const staff = await staffService.deactivateStaff(req.params.id as string);
    await endLiveSessions(staff.id, "Account deleted");
    await releaseTables(staff, req.staff?.id ?? staff.id);
    res.json(staff);
  } catch (error) {
    if (staffService.isNotFoundError(error)) {
      res.status(404).json({ error: "Staff user not found" });
      return;
    }
    throw error;
  }
}
