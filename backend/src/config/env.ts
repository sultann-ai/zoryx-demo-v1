import dotenv from "dotenv";
import { isTruthyFlag, parseTrustProxyHops } from "./proxy";

dotenv.config();

const REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET", "PORT"] as const;

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const port = Number(process.env.PORT);
if (Number.isNaN(port)) {
  throw new Error("PORT must be a valid number");
}

// Comma-separated list of allowed origins, e.g. "https://pos.example.com,https://kitchen.example.com".
// A "*" in an entry matches any substring — handy for Vercel's per-deployment preview
// URLs, which change on every deploy, e.g. "https://zoryx-demo-*-yourteam.vercel.app"
// matches every preview build for this project without needing to update the env var
// each time. Falls back to the local Vite dev server when unset.
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["http://localhost:5173"];

const CORS_ORIGIN_PATTERNS = CORS_ORIGIN.map(
  (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`),
);

// Used as the `origin` callback for both the HTTP CORS middleware and Socket.io's CORS
// config, so the two never drift apart. Requests with no Origin header (curl, server-to-
// server calls, Railway health checks) are allowed through — there's no browser enforcing
// CORS on those anyway.
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return CORS_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

// Shared secret a print agent presents over its Socket.io handshake (see config/socket.ts).
// Optional: if unset, every print-agent connection attempt is simply rejected — there's no
// separate feature flag, the key's absence IS "print agents are disabled". A boot-time length
// warning (not here — see server.ts) catches an accidentally-weak key without blocking boot.
const PRINT_AGENT_KEY = process.env.PRINT_AGENT_KEY;

// Number of reverse proxies in front of the app whose X-Forwarded-For entry we trust (Railway's
// edge = 1). A count, not `true`: `true` trusts the client-controlled leftmost entry, which
// would let anyone dodge per-IP rate limits by forging a header. See config/proxy.ts.
const TRUST_PROXY_HOPS = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);

// When true, GET /health logs req.ip and the raw proxy headers so you can confirm after a
// deploy that per-IP limits see real visitors. Off by default.
const LOG_CLIENT_IP = isTruthyFlag(process.env.LOG_CLIENT_IP);

// Password-based customer accounts (signup, login, saved addresses, JWT POST /api/online/orders).
// Off by default: the website starts with guest checkout. When off those routes answer 404.
const ENABLE_CUSTOMER_ACCOUNTS = isTruthyFlag(process.env.ENABLE_CUSTOMER_ACCOUNTS);

export const env = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  PORT: port,
  CORS_ORIGIN,
  PRINT_AGENT_KEY,
  TRUST_PROXY_HOPS,
  LOG_CLIENT_IP,
  ENABLE_CUSTOMER_ACCOUNTS,
};
