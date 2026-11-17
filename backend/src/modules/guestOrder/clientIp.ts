import { createHmac } from "crypto";

// A keyed hash of the client IP, so the per-IP guest-order limits can be counted in Postgres
// without ever storing an address. HMAC (not a bare hash) so the stored values can't be reversed
// by trying every IPv4 address. Changing the secret simply resets the counters.
export function hashClientIp(ip: string | undefined, secret: string): string {
  return createHmac("sha256", secret)
    .update(`guest-order-ip:${ip ?? "unknown"}`)
    .digest("hex")
    .slice(0, 32);
}
