import express from "express";
import { describe, expect, it } from "vitest";
import { serve } from "../testServer";
import { createLimiter, onlineGeneralLimiter, TOO_MANY_BODY } from "./rateLimit";

describe("createLimiter", () => {
  it("answers 429 with { code: 'TOO_MANY', error } once the limit is passed", async () => {
    const app = express();
    app.use(createLimiter({ limit: 2 }));
    app.get("/x", (_req, res) => res.json({ ok: true }));
    const server = await serve(app);
    try {
      expect((await fetch(`${server.url}/x`)).status).toBe(200);
      expect((await fetch(`${server.url}/x`)).status).toBe(200);
      const blocked = await fetch(`${server.url}/x`);
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual(TOO_MANY_BODY);
      expect(TOO_MANY_BODY.code).toBe("TOO_MANY");
      expect(blocked.headers.get("retry-after")).not.toBeNull();
    } finally {
      await server.close();
    }
  });

  it("with skipSuccessfulRequests, only failed responses use up the budget", async () => {
    const app = express();
    app.use(createLimiter({ limit: 2, skipSuccessfulRequests: true }));
    app.get("/login", (req, res) => {
      res.status(req.query.good ? 200 : 401).json({});
    });
    const server = await serve(app);
    try {
      for (let i = 0; i < 5; i += 1) {
        expect((await fetch(`${server.url}/login?good=1`)).status).toBe(200);
      }
      expect((await fetch(`${server.url}/login`)).status).toBe(401);
      expect((await fetch(`${server.url}/login`)).status).toBe(401);
      expect((await fetch(`${server.url}/login`)).status).toBe(429);
    } finally {
      await server.close();
    }
  });
});

describe("onlineGeneralLimiter", () => {
  it("limits public paths at 300 but never touches /payment/* or /media/*", async () => {
    const app = express();
    const router = express.Router();
    router.use(onlineGeneralLimiter);
    router.get("/payment/pending", (_req, res) => res.json({}));
    router.get("/menu", (_req, res) => res.json({}));
    router.get("/media/:id", (_req, res) => res.json({}));
    app.use("/api/online", router);
    const server = await serve(app);
    try {
      for (let i = 0; i < 305; i += 1) {
        expect((await fetch(`${server.url}/api/online/payment/pending`)).status).toBe(200);
      }
      // Images are counted by their own limiter, not this one.
      for (let i = 0; i < 305; i += 1) {
        expect((await fetch(`${server.url}/api/online/media/some-id`)).status).toBe(200);
      }
      for (let i = 0; i < 300; i += 1) {
        expect((await fetch(`${server.url}/api/online/menu`)).status).toBe(200);
      }
      expect((await fetch(`${server.url}/api/online/menu`)).status).toBe(429);
    } finally {
      await server.close();
    }
  }, 30000);
});
