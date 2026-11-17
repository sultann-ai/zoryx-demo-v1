import { Router } from "express";
import { staffLoginLimiter } from "../../common/middlewares/rateLimit";
import * as authController from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", staffLoginLimiter, authController.login);
