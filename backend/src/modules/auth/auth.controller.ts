import { Request, Response } from "express";
import * as authService from "./auth.service";

export async function login(req: Request, res: Response) {
  const { username, password } = req.body ?? {};

  if (typeof username !== "string" || username.trim().length === 0) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  if (typeof password !== "string" || password.length === 0) {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const result = await authService.login(username.trim(), password);
  if (!result) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  res.json(result);
}
