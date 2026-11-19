import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { posRouter } from "./routes/pos.routes";
import { onlineRouter } from "./routes/online.routes";
import { env, isOriginAllowed } from "./config/env";
import { describeClientIp } from "./config/proxy";
import { allowCrossOriginResource } from "./common/middlewares/crossOriginResource";
import { errorHandler } from "./common/middlewares/errorHandler";

export const app = express();

// Railway terminates TLS and forwards via its proxy: trust exactly that many hops so req.ip
// (and every per-IP rate limit) sees the real visitor. See config/proxy.ts.
app.set("trust proxy", env.TRUST_PROXY_HOPS);

// helmet's defaults, including Cross-Origin-Resource-Policy: same-origin. The two things meant
// to be embedded from other origins opt out individually: /uploads here (the POS frontend shows
// payment screenshots) and GET /api/online/media (the customer website shows photos).
app.use(helmet());
// ETag is exposed so the table QR poll (a cross-origin fetch) can read it and send If-None-Match.
app.use(cors({ origin: (origin, callback) => callback(null, isOriginAllowed(origin)), exposedHeaders: ["ETag"] }));
// The first JSON parser to run wins, so the tighter /api/online limit must be registered
// before the general one.
app.use("/api/online", express.json({ limit: "50kb" }));
app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {
  if (env.LOG_CLIENT_IP) {
    console.log(`[client-ip] ${describeClientIp(req)}`);
  }
  res.json({ status: "ok" });
});

// Legacy only: payment screenshots used to be saved to local disk and linked as /uploads/<file>. New
// proofs live in Postgres (PAYMENT_PROOF media, served to staff by GET /api/pos/orders/:id/payment-proof),
// so nothing writes here any more; the route stays so old orders' links still resolve.
app.use("/uploads", allowCrossOriginResource, express.static(path.join(process.cwd(), "uploads")));

app.use("/api/pos", posRouter);
app.use("/api/online", onlineRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);
