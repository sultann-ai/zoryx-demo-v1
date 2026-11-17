import { Request } from "express";

// Pure helpers for the Railway-proxy setup. Kept free of any env/Prisma import so they're
// unit-testable (and so env.ts can import them without a cycle).

// How many reverse proxies sit in front of the app. Express then takes the X-Forwarded-For
// entry appended by the nearest trusted proxy, which a client can't forge. Railway's edge is
// one hop; put another proxy (e.g. Cloudflare) in front and this becomes 2.
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return 1;
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
  }
  return hops;
}

export function isTruthyFlag(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "true" || value === "1";
}

// One line for the LOG_CLIENT_IP debug log: what Express resolved vs. what the proxy sent.
export function describeClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  return `req.ip=${req.ip} x-forwarded-for=${forwardedFor ?? "-"} x-real-ip=${realIp ?? "-"}`;
}
