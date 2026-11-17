import express from "express";
import { describe, expect, it } from "vitest";
import { serve } from "../testServer";

async function gateApp(enabled: boolean) {
  // env.ts validates required vars at import time; the gate only needs the flag.
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test";
  process.env.PORT ??= "0";
  const { customerAccountsGate } = await import("./customerAccountsGate");
  const app = express();
  app.use("/accounts", customerAccountsGate(() => enabled), (_req, res) => res.json({ reached: true }));
  return serve(app);
}

describe("customerAccountsGate", () => {
  it("answers the standard 404 when accounts are off", async () => {
    const server = await gateApp(false);
    try {
      const res = await fetch(`${server.url}/accounts`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    } finally {
      await server.close();
    }
  });

  it("lets the request through when accounts are on", async () => {
    const server = await gateApp(true);
    try {
      const res = await fetch(`${server.url}/accounts`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ reached: true });
    } finally {
      await server.close();
    }
  });
});
