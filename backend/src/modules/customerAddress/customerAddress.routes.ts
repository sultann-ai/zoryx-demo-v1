import { Router } from "express";
import { requireCustomerAuth } from "../../common/middlewares/customerAuth";
import * as addressController from "./customerAddress.controller";

export const customerAddressRouter = Router();

customerAddressRouter.use(requireCustomerAuth);

customerAddressRouter.get("/", addressController.listAddresses);
customerAddressRouter.post("/", addressController.createAddress);
customerAddressRouter.get("/:id", addressController.getAddress);
customerAddressRouter.put("/:id", addressController.updateAddress);
customerAddressRouter.delete("/:id", addressController.deleteAddress);
