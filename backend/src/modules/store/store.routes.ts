import { Router } from "express";
import * as storeController from "./store.controller";

// Public: GET /api/online/store
export const onlineStoreRouter = Router();

onlineStoreRouter.get("/", storeController.getStore);
