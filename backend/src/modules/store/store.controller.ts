import { Request, Response } from "express";
import * as storeService from "./store.service";

// GET /api/online/store — public. Cached for a minute (on success only, so a 429 or 500 is never
// cached), which means staff changes and the open/closed flag can lag by up to 60 seconds.
export async function getStore(_req: Request, res: Response) {
  const store = await storeService.getPublicStore();
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(store);
}
