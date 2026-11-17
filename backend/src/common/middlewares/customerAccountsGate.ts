import { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";

// Answers with the same 404 as an unmatched route while password-based customer accounts are
// switched off, so the routes look like they don't exist. `isEnabled` is injectable for tests.
export function customerAccountsGate(isEnabled: () => boolean = () => env.ENABLE_CUSTOMER_ACCOUNTS) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!isEnabled()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  };
}
