import { Request, Response } from "express";
import { Prisma, VendorLedgerEntryType } from "../../../generated/prisma/client";
import * as vendorService from "./vendor.service";

const VALID_LEDGER_ENTRY_TYPES = Object.values(VendorLedgerEntryType);

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

export async function listVendors(_req: Request, res: Response) {
  const vendors = await vendorService.listVendors();
  res.json(vendors);
}

export async function getVendor(req: Request, res: Response) {
  const vendor = await vendorService.getVendorById(req.params.id as string);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(vendor);
}

export async function createVendor(req: Request, res: Response) {
  const { name, contactPerson, phone, address, isActive } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (contactPerson !== undefined && typeof contactPerson !== "string") {
    res.status(400).json({ error: "contactPerson must be a string" });
    return;
  }
  if (phone !== undefined && typeof phone !== "string") {
    res.status(400).json({ error: "phone must be a string" });
    return;
  }
  if (address !== undefined && typeof address !== "string") {
    res.status(400).json({ error: "address must be a string" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  const vendor = await vendorService.createVendor({
    name: name.trim(),
    ...(contactPerson !== undefined ? { contactPerson } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });
  res.status(201).json(vendor);
}

export async function updateVendor(req: Request, res: Response) {
  const { name, contactPerson, phone, address, isActive } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (contactPerson !== undefined && contactPerson !== null && typeof contactPerson !== "string") {
    res.status(400).json({ error: "contactPerson must be a string or null" });
    return;
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    res.status(400).json({ error: "phone must be a string or null" });
    return;
  }
  if (address !== undefined && address !== null && typeof address !== "string") {
    res.status(400).json({ error: "address must be a string or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  try {
    const vendor = await vendorService.updateVendor(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(contactPerson !== undefined ? { contactPerson } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.json(vendor);
  } catch (error) {
    if (vendorService.isNotFoundError(error)) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    throw error;
  }
}

export async function deleteVendor(req: Request, res: Response) {
  try {
    await vendorService.deleteVendor(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (vendorService.isNotFoundError(error)) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    throw error;
  }
}

export async function getLedger(req: Request, res: Response) {
  const vendorFound = await vendorService.vendorExists(req.params.id as string);
  if (!vendorFound) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const ledger = await vendorService.getLedger(req.params.id as string);
  res.json(ledger);
}

export async function addLedgerEntry(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { type, amount, description, date } = req.body ?? {};

  if (!isOneOf(type, VALID_LEDGER_ENTRY_TYPES)) {
    res.status(400).json({ error: `type must be one of: ${VALID_LEDGER_ENTRY_TYPES.join(", ")}` });
    return;
  }

  const amountDecimal = parseDecimal(amount);
  if (!amountDecimal || amountDecimal.isNaN() || amountDecimal.lessThanOrEqualTo(0)) {
    res.status(400).json({ error: "amount is required and must be a positive number" });
    return;
  }

  if (description !== undefined && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string" });
    return;
  }

  if (typeof date !== "string" || date.trim().length === 0) {
    res.status(400).json({ error: "date is required" });
    return;
  }
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: "date must be a valid date" });
    return;
  }

  try {
    const entry = await vendorService.addLedgerEntry(req.params.id as string, {
      type,
      amount: amountDecimal,
      date: parsedDate,
      recordedById: req.staff.id,
      ...(description !== undefined ? { description } : {}),
    });
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof vendorService.VendorNotFoundError) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    throw error;
  }
}
