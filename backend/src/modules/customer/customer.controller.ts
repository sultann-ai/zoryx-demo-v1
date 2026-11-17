import { Request, Response } from "express";
import * as customerService from "./customer.service";

export async function signup(req: Request, res: Response) {
  const { name, phone, password, email } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof phone !== "string" || phone.trim().length === 0) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  if (typeof password !== "string" || password.length === 0) {
    res.status(400).json({ error: "password is required" });
    return;
  }
  if (email !== undefined && typeof email !== "string") {
    res.status(400).json({ error: "email must be a string" });
    return;
  }

  try {
    const result = await customerService.signup({
      name: name.trim(),
      phone: phone.trim(),
      password,
      ...(email !== undefined ? { email: email.trim() } : {}),
    });
    res.status(201).json(result);
  } catch (error) {
    if (customerService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A customer with this phone or email already exists" });
      return;
    }
    throw error;
  }
}

export async function login(req: Request, res: Response) {
  const { phone, password } = req.body ?? {};

  if (typeof phone !== "string" || phone.trim().length === 0) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  if (typeof password !== "string" || password.length === 0) {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const result = await customerService.login(phone.trim(), password);
  if (!result) {
    res.status(401).json({ error: "Invalid phone or password" });
    return;
  }
  res.json(result);
}
