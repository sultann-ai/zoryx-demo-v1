import { Router } from "express";
import { customerAuthLimiter } from "../../common/middlewares/rateLimit";
import * as customerController from "./customer.controller";

export const customerAuthRouter = Router();

customerAuthRouter.post("/signup", customerAuthLimiter, customerController.signup);
customerAuthRouter.post("/login", customerAuthLimiter, customerController.login);
