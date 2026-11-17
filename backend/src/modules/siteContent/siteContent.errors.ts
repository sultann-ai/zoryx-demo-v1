import { Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import { InvalidMediaReferenceError } from "../media/media.service";

export class CapExceededError extends Error {}
export class RecordNotFoundError extends Error {}

// How many *active* rows each website-content list may have.
export const DELIVERY_AREA_ACTIVE_CAP = 30;
export const PAYMENT_ACCOUNT_ACTIVE_CAP = 4;
export const GALLERY_ACTIVE_CAP = 24;
export const TESTIMONIAL_ACTIVE_CAP = 12;

export function assertUnderCap(activeCount: number, cap: number, label: string): void {
  if (activeCount >= cap) {
    throw new CapExceededError(`At most ${cap} ${label} can be active at once — deactivate one first`);
  }
}

// Maps the errors the site-content services raise to HTTP. Returns true when it handled one, so
// callers can `throw error` for anything else (the global handler then answers 500).
export function respondToSiteContentError(error: unknown, res: Response, notFoundMessage: string): boolean {
  if (error instanceof CapExceededError) {
    res.status(409).json({ error: error.message });
    return true;
  }
  if (error instanceof InvalidMediaReferenceError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  if (error instanceof RecordNotFoundError) {
    res.status(404).json({ error: notFoundMessage });
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      res.status(404).json({ error: notFoundMessage });
      return true;
    }
    if (error.code === "P2003") {
      res.status(409).json({ error: "This record is still in use — deactivate it instead of deleting it" });
      return true;
    }
  }
  return false;
}
