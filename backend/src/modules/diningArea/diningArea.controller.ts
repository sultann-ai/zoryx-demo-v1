import { Request, Response } from "express";
import { DiningAreaType } from "../../../generated/prisma/client";
import * as diningAreaService from "./diningArea.service";
import { assertWaiter, TableStaffError } from "../table/tableSession.service";
import { emitTableUpdated } from "../table/tableNotify";

const VALID_TYPES = Object.values(DiningAreaType);

function isValidType(type: unknown): type is DiningAreaType {
  return typeof type === "string" && (VALID_TYPES as string[]).includes(type);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Table QR fields (docs/TABLE_QR_SPEC.md): outOfService and defaultWaiterStaffId (an active order taker,
// POS admin or super admin, or null). 400s and returns false on a bad value.
async function readTableQrFields(
  body: Record<string, unknown>,
  res: Response,
): Promise<{ ok: true; value: { outOfService?: boolean; defaultWaiterStaffId?: string | null } } | { ok: false }> {
  const { outOfService, defaultWaiterStaffId } = body;
  if (outOfService !== undefined && typeof outOfService !== "boolean") {
    res.status(400).json({ error: "outOfService must be a boolean" });
    return { ok: false };
  }
  if (defaultWaiterStaffId !== undefined && defaultWaiterStaffId !== null && typeof defaultWaiterStaffId !== "string") {
    res.status(400).json({ error: "defaultWaiterStaffId must be a string or null" });
    return { ok: false };
  }
  if (typeof defaultWaiterStaffId === "string") {
    try {
      await assertWaiter(defaultWaiterStaffId);
    } catch (error) {
      if (error instanceof TableStaffError) {
        res.status(400).json({ error: "defaultWaiterStaffId must be an active order taker, POS admin or super admin" });
        return { ok: false };
      }
      throw error;
    }
  }
  return {
    ok: true,
    value: {
      ...(outOfService !== undefined ? { outOfService } : {}),
      ...(defaultWaiterStaffId !== undefined ? { defaultWaiterStaffId: defaultWaiterStaffId as string | null } : {}),
    },
  };
}

// 400s and returns false on a bad `area`; otherwise hands back the parsed value.
function readArea(raw: unknown, res: Response): { ok: true; value: string | null | undefined } | { ok: false } {
  try {
    return { ok: true, value: diningAreaService.parseAreaField(raw) };
  } catch (error) {
    if (error instanceof diningAreaService.InvalidDiningAreaSectionError) {
      res.status(400).json({ error: error.message });
      return { ok: false };
    }
    throw error;
  }
}

export async function listDiningAreas(_req: Request, res: Response) {
  const diningAreas = await diningAreaService.listDiningAreas();
  res.json(diningAreas);
}

export async function getDiningArea(req: Request, res: Response) {
  const diningArea = await diningAreaService.getDiningAreaById(req.params.id as string);
  if (!diningArea) {
    res.status(404).json({ error: "Dining area not found" });
    return;
  }
  res.json(diningArea);
}

export async function createDiningArea(req: Request, res: Response) {
  const { name, type, area, capacity, isActive } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!isValidType(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }
  if (capacity !== undefined && !isPositiveInteger(capacity)) {
    res.status(400).json({ error: "capacity must be a positive integer" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  const parsedArea = readArea(area, res);
  if (!parsedArea.ok) {
    return;
  }
  const tableQr = await readTableQrFields(req.body ?? {}, res);
  if (!tableQr.ok) {
    return;
  }

  const diningArea = await diningAreaService.createDiningArea({
    name: name.trim(),
    type,
    ...(parsedArea.value !== undefined ? { area: parsedArea.value } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...tableQr.value,
  });
  res.status(201).json(diningArea);
}

export async function updateDiningArea(req: Request, res: Response) {
  const { name, type, area, capacity, isActive } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (type !== undefined && !isValidType(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }
  if (capacity !== undefined && capacity !== null && !isPositiveInteger(capacity)) {
    res.status(400).json({ error: "capacity must be a positive integer or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  const parsedArea = readArea(area, res);
  if (!parsedArea.ok) {
    return;
  }
  const tableQr = await readTableQrFields(req.body ?? {}, res);
  if (!tableQr.ok) {
    return;
  }

  try {
    const diningArea = await diningAreaService.updateDiningArea(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(parsedArea.value !== undefined ? { area: parsedArea.value } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...tableQr.value,
    });
    // Out of service (or back), or switched off: the floor map's tile changes.
    if (tableQr.value.outOfService !== undefined || isActive !== undefined) {
      await emitTableUpdated(diningArea.id);
    }
    res.json(diningArea);
  } catch (error) {
    if (diningAreaService.isNotFoundError(error)) {
      res.status(404).json({ error: "Dining area not found" });
      return;
    }
    throw error;
  }
}

export async function deleteDiningArea(req: Request, res: Response) {
  try {
    await diningAreaService.deleteDiningArea(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (diningAreaService.isNotFoundError(error)) {
      res.status(404).json({ error: "Dining area not found" });
      return;
    }
    if (diningAreaService.isForeignKeyConstraintError(error)) {
      res.status(409).json({ error: "Cannot delete dining area: it still has orders referencing it" });
      return;
    }
    throw error;
  }
}
