import express from "express";
import { describe, expect, it } from "vitest";
import { serve } from "../common/testServer";
import { describeClientIp, isTruthyFlag, parseTrustProxyHops } from "./proxy";

describe("parseTrustProxyHops", () => {
  it("defaults to 1 (Railway's single edge proxy)", () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
    expect(parseTrustProxyHops("")).toBe(1);
  });

  it("accepts non-negative integers", () => {
    expect(parseTrustProxyHops("0")).toBe(0);
    expect(parseTrustProxyHops("2")).toBe(2);
  });

  it("rejects anything else", () => {
    expect(() => parseTrustProxyHops("-1")).toThrow();
    expect(() => parseTrustProxyHops("1.5")).toThrow();
    expect(() => parseTrustProxyHops("true")).toThrow();
  });
});

describe("isTruthyFlag", () => {
  it("is true only for true/1 (any case)", () => {
    expect(isTruthyFlag("true")).toBe(true);
    expect(isTruthyFlag("TRUE")).toBe(true);
    expect(isTruthyFlag("1")).toBe(true);
    expect(isTruthyFlag("false")).toBe(false);
    expect(isTruthyFlag("yes")).toBe(false);
    expect(isTruthyFlag(undefined)).toBe(false);
  });
});

// Proves the behaviour the rate limits depend on: with N trusted hops, req.ip is the
// X-Forwarded-For entry the nearest trusted proxy appended, not the client-forged leftmost one.
async function resolveIp(hops: number, headers: Record<string, string>) {
  const app = express();
  app.set("trust proxy", hops);
  app.get("/ip", (req, res) => res.json({ ip: req.ip, line: describeClientIp(req) }));
  const server = await serve(app);
  try {
    const res = await fetch(`${server.url}/ip`, { headers });
    return (await res.json()) as { ip: string; line: string };
  } finally {
    await server.close();
  }
}

describe("req.ip behind a proxy", () => {
  it("with 1 hop, takes the entry Railway appended and ignores a forged leftmost entry", async () => {
    const { ip } = await resolveIp(1, { "X-Forwarded-For": "6.6.6.6, 203.0.113.7" });
    expect(ip).toBe("203.0.113.7");
  });

  it("with 0 hops, ignores X-Forwarded-For entirely (the connecting socket is the client)", async () => {
    const { ip } = await resolveIp(0, { "X-Forwarded-For": "203.0.113.7" });
    expect(ip).not.toBe("203.0.113.7");
  });

  it("describeClientIp reports both what Express resolved and the raw headers", async () => {
    const { line } = await resolveIp(1, { "X-Forwarded-For": "203.0.113.7", "X-Real-IP": "203.0.113.7" });
    expect(line).toBe("req.ip=203.0.113.7 x-forwarded-for=203.0.113.7 x-real-ip=203.0.113.7");
  });
});
