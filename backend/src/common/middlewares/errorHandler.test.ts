import express from "express";
import { describe, expect, it, vi } from "vitest";
import { extensionForMime } from "../../config/uploadRules";
import { serve } from "../testServer";
import { errorHandler } from "./errorHandler";

describe("extensionForMime", () => {
  it("maps allowed image types and nothing else", () => {
    expect(extensionForMime("image/jpeg")).toBe(".jpg");
    expect(extensionForMime("image/png")).toBe(".png");
    expect(extensionForMime("image/webp")).toBe(".webp");
    expect(extensionForMime("text/html")).toBeUndefined();
  });
});

async function appWithErrorHandler(setup: (app: express.Express) => void) {
  const app = express();
  setup(app);
  app.use(errorHandler);
  return serve(app);
}

describe("errorHandler", () => {
  it("returns 413 for an oversize JSON body and 400 for malformed JSON", async () => {
    const server = await appWithErrorHandler((app) => {
      app.use(express.json({ limit: "1kb" }));
      app.post("/x", (_req, res) => res.json({}));
    });
    try {
      const big = await fetch(`${server.url}/x`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pad: "a".repeat(2000) }),
      });
      expect(big.status).toBe(413);
      expect(await big.json()).toEqual({ error: "Request body too large" });

      const bad = await fetch(`${server.url}/x`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: "Malformed JSON body" });
    } finally {
      await server.close();
    }
  });

  it("keeps every other error as a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await appWithErrorHandler((app) => {
      app.get("/boom", () => {
        throw new Error("secret detail");
      });
    });
    try {
      const res = await fetch(`${server.url}/boom`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal server error" });
    } finally {
      spy.mockRestore();
      await server.close();
    }
  });

  it("returns a clean 400 for a rejected upload type and 413 for an oversize file", async () => {
    const { proofUpload } = await import("../../config/mediaUpload");
    const server = await appWithErrorHandler((app) => {
      app.post("/up", proofUpload.single("screenshot"), (_req, res) => res.json({ stored: true }));
    });
    try {
      const wrongType = new FormData();
      wrongType.append("screenshot", new Blob(["<html>"], { type: "text/html" }), "x.html");
      const rejected = await fetch(`${server.url}/up`, { method: "POST", body: wrongType });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: "Only JPEG, PNG, or WEBP images are allowed" });

      const tooBig = new FormData();
      tooBig.append("screenshot", new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" }), "big.png");
      const oversize = await fetch(`${server.url}/up`, { method: "POST", body: tooBig });
      expect(oversize.status).toBe(413);
      expect(await oversize.json()).toEqual({ error: "File too large" });
    } finally {
      await server.close();
    }
  });
});
