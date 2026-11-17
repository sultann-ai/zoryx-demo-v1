import { Request, Response } from "express";
import * as addressService from "./customerAddress.service";

export async function listAddresses(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const addresses = await addressService.listAddresses(req.customer.id);
  res.json(addresses);
}

export async function getAddress(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const address = await addressService.findOwnedAddress(req.params.id as string, req.customer.id);
  if (!address) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  res.json(address);
}

export async function createAddress(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { label, addressText, isDefault } = req.body ?? {};

  if (typeof addressText !== "string" || addressText.trim().length === 0) {
    res.status(400).json({ error: "addressText is required" });
    return;
  }
  if (label !== undefined && typeof label !== "string") {
    res.status(400).json({ error: "label must be a string" });
    return;
  }
  if (isDefault !== undefined && typeof isDefault !== "boolean") {
    res.status(400).json({ error: "isDefault must be a boolean" });
    return;
  }

  const address = await addressService.createAddress({
    customerId: req.customer.id,
    addressText: addressText.trim(),
    ...(label !== undefined ? { label } : {}),
    ...(isDefault !== undefined ? { isDefault } : {}),
  });
  res.status(201).json(address);
}

export async function updateAddress(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const existing = await addressService.findOwnedAddress(req.params.id as string, req.customer.id);
  if (!existing) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  const { label, addressText, isDefault } = req.body ?? {};

  if (label !== undefined && label !== null && typeof label !== "string") {
    res.status(400).json({ error: "label must be a string or null" });
    return;
  }
  if (addressText !== undefined && (typeof addressText !== "string" || addressText.trim().length === 0)) {
    res.status(400).json({ error: "addressText must be a non-empty string" });
    return;
  }
  if (isDefault !== undefined && typeof isDefault !== "boolean") {
    res.status(400).json({ error: "isDefault must be a boolean" });
    return;
  }

  const address = await addressService.updateAddressById(existing.id, {
    ...(label !== undefined ? { label } : {}),
    ...(addressText !== undefined ? { addressText: addressText.trim() } : {}),
    ...(isDefault !== undefined ? { isDefault } : {}),
  });
  res.json(address);
}

export async function deleteAddress(req: Request, res: Response) {
  if (!req.customer) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const existing = await addressService.findOwnedAddress(req.params.id as string, req.customer.id);
  if (!existing) {
    res.status(404).json({ error: "Address not found" });
    return;
  }

  try {
    await addressService.deleteAddressById(existing.id);
    res.status(204).send();
  } catch (error) {
    if (addressService.isForeignKeyConstraintError(error)) {
      res.status(409).json({ error: "Cannot delete address: it still has orders referencing it" });
      return;
    }
    throw error;
  }
}
