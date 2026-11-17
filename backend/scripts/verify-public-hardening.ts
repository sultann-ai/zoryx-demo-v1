// Verifies the public-surface hardening against the real app (real middleware stack, real
// routes, local dev DB): proxy-aware rate limits, helmet headers, body limits, clean upload
// errors, the ENABLE_CUSTOMER_ACCOUNTS gate, and the staff password minimum.
//
// Run twice, once per flag state (the flag is read at boot):
//   npx ts-node scripts/verify-public-hardening.ts
//   ENABLE_CUSTOMER_ACCOUNTS=true npx ts-node scripts/verify-public-hardening.ts
//
// Refuses to run unless DATABASE_URL points at localhost: it creates (and deletes) a couple of
// temporary staff rows. It never listens on a fixed port.
import dotenv from "dotenv";
dotenv.config();

import { AddressInfo } from "net";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL.includes("localhost")) {
  console.error("Refusing to run: DATABASE_URL does not point at localhost.");
  process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
  if (!ok) failures += 1;
}

async function main() {
  const bcrypt = (await import("bcrypt")).default;
  const jwt = (await import("jsonwebtoken")).default;
  const { StaffRole } = await import("../generated/prisma/client");
  const { prisma } = await import("../src/config/prisma");
  const { app } = await import("../src/app");
  const { env } = await import("../src/config/env");

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const stamp = Date.now();
  const adminUsername = `verify-admin-${stamp}`;
  const adminPassword = "verify-pass-123";
  const createdStaffIds: string[] = [];

  // Each fake IP is its own rate-limit bucket (trust proxy = 1 -> the one X-Forwarded-For entry).
  const from = (ip: string, extra: Record<string, string> = {}) => ({ "X-Forwarded-For": ip, ...extra });
  const json = { "Content-Type": "application/json" };
  const login = (ip: string, password: string, username = adminUsername, xff = ip) =>
    fetch(`${base}/api/pos/auth/login`, {
      method: "POST",
      headers: { ...json, ...from(xff) },
      body: JSON.stringify({ username, password }),
    });

  const admin = await prisma.staffUser.create({
    data: {
      name: "verify admin",
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: StaffRole.SUPER_ADMIN,
    },
  });
  createdStaffIds.push(admin.id);

  try {
    console.log(`TRUST_PROXY_HOPS=${env.TRUST_PROXY_HOPS} ENABLE_CUSTOMER_ACCOUNTS=${env.ENABLE_CUSTOMER_ACCOUNTS}\n`);

    // --- helmet / CORS --------------------------------------------------------------------
    const health = await fetch(`${base}/health`, { headers: { Origin: "https://example.test" } });
    check("helmet: x-content-type-options nosniff", health.headers.get("x-content-type-options") === "nosniff");
    check("helmet: strict-transport-security set", health.headers.get("strict-transport-security") !== null);
    check(
      "helmet: CORP stays same-origin by default (JSON API)",
      health.headers.get("cross-origin-resource-policy") === "same-origin",
      String(health.headers.get("cross-origin-resource-policy")),
    );
    const uploads = await fetch(`${base}/uploads/nothing.png`);
    check(
      "CORP is relaxed to cross-origin for /uploads only (POS frontend shows screenshots)",
      uploads.headers.get("cross-origin-resource-policy") === "cross-origin",
      String(uploads.headers.get("cross-origin-resource-policy")),
    );
    check("helmet: x-powered-by removed", health.headers.get("x-powered-by") === null);

    // --- per-IP rate limiting on staff login ----------------------------------------------
    let last = 0;
    for (let i = 0; i < 10; i += 1) last = (await login("198.51.100.1", "wrong-password")).status;
    check("login: 10 bad attempts are answered normally (401)", last === 401, String(last));
    const blocked = await login("198.51.100.1", "wrong-password");
    const blockedBody = (await blocked.json()) as { code?: string; error?: string };
    check("login: 11th attempt from the same IP -> 429", blocked.status === 429, String(blocked.status));
    check(
      "login: 429 body is { code: 'TOO_MANY', error }",
      blockedBody.code === "TOO_MANY" && typeof blockedBody.error === "string",
      JSON.stringify(blockedBody),
    );
    check("login: 429 carries Retry-After", blocked.headers.get("retry-after") !== null);
    const otherIp = await login("198.51.100.2", "wrong-password");
    check("login: a different IP has its own budget", otherIp.status === 401, String(otherIp.status));
    const forged = await login("x", "wrong-password", adminUsername, "9.9.9.9, 198.51.100.1");
    check(
      "login: forging a leftmost X-Forwarded-For does not escape the limit",
      forged.status === 429,
      String(forged.status),
    );

    let goodStatuses: number[] = [];
    for (let i = 0; i < 12; i += 1) goodStatuses.push((await login("198.51.100.3", adminPassword)).status);
    check("login: 12 successful logins never get limited", goodStatuses.every((s) => s === 200), goodStatuses.join(","));
    for (let i = 0; i < 10; i += 1) await login("198.51.100.3", "wrong-password");
    check(
      "login: failures after successes still hit the limit",
      (await login("198.51.100.3", "wrong-password")).status === 429,
    );

    // --- body limits ----------------------------------------------------------------------
    const padded = (kb: number) => JSON.stringify({ username: "u", password: "p", pad: "a".repeat(kb * 1024) });
    const onlineBig = await fetch(`${base}/api/online/auth/login`, {
      method: "POST",
      headers: { ...json, ...from("198.51.100.10") },
      body: padded(51),
    });
    check("body: 51 KB JSON to /api/online -> 413", onlineBig.status === 413, String(onlineBig.status));
    const posMid = await fetch(`${base}/api/pos/auth/login`, {
      method: "POST",
      headers: { ...json, ...from("198.51.100.11") },
      body: padded(60),
    });
    check("body: 60 KB JSON to /api/pos is still accepted (100 KB limit)", posMid.status !== 413, String(posMid.status));
    const posBig = await fetch(`${base}/api/pos/auth/login`, {
      method: "POST",
      headers: { ...json, ...from("198.51.100.12") },
      body: padded(101),
    });
    check("body: 101 KB JSON to /api/pos -> 413", posBig.status === 413, String(posBig.status));
    const badJson = await fetch(`${base}/api/pos/auth/login`, {
      method: "POST",
      headers: { ...json, ...from("198.51.100.13") },
      body: "{nope",
    });
    check("body: malformed JSON -> 400, not 500", badJson.status === 400, String(badJson.status));

    // --- ENABLE_CUSTOMER_ACCOUNTS gate ----------------------------------------------------
    const customerToken = jwt.sign({ id: "verify-customer", type: "customer" }, env.JWT_SECRET, { expiresIn: "5m" });
    const wrongType = new FormData();
    wrongType.append("screenshot", new Blob(["<html>"], { type: "text/html" }), "x.html");
    const signup = await fetch(`${base}/api/online/auth/signup`, {
      method: "POST",
      headers: { ...json, ...from("198.51.100.20") },
      body: JSON.stringify({}),
    });
    const addresses = await fetch(`${base}/api/online/addresses`, { headers: from("198.51.100.20") });
    const orderUpload = await fetch(`${base}/api/online/orders`, {
      method: "POST",
      headers: from("198.51.100.20", { Authorization: `Bearer ${customerToken}` }),
      body: wrongType,
    });
    const menu = await fetch(`${base}/api/online/menu`, { headers: from("198.51.100.20") });
    if (!env.ENABLE_CUSTOMER_ACCOUNTS) {
      check("flag off: POST /api/online/auth/signup -> 404", signup.status === 404, String(signup.status));
      check("flag off: GET /api/online/addresses -> 404", addresses.status === 404, String(addresses.status));
      check("flag off: POST /api/online/orders -> 404", orderUpload.status === 404, String(orderUpload.status));
      check("flag off: 404 body is { error: 'Not found' }", JSON.stringify(await signup.json()) === '{"error":"Not found"}');
    } else {
      check("flag on: signup reaches validation (400)", signup.status === 400, String(signup.status));
      check("flag on: addresses require a token (401)", addresses.status === 401, String(addresses.status));
      check("flag on: bad-type screenshot -> clean 400", orderUpload.status === 400, String(orderUpload.status));
      check(
        "flag on: upload error message is the real reason, not a generic 500",
        ((await orderUpload.json()) as { error?: string }).error === "Only JPEG, PNG, or WEBP images are allowed",
      );
    }
    check("menu stays public regardless of the flag", menu.status === 200, String(menu.status));

    // --- staff password minimum -----------------------------------------------------------
    const tokenRes = await login("198.51.100.30", adminPassword);
    const { token } = (await tokenRes.json()) as { token: string };
    const authed = { ...json, ...from("198.51.100.30"), Authorization: `Bearer ${token}` };
    const newStaff = (password: string, suffix: string) =>
      fetch(`${base}/api/pos/staff`, {
        method: "POST",
        headers: authed,
        body: JSON.stringify({ name: "verify temp", username: `verify-temp-${stamp}-${suffix}`, password, role: "POS_ADMIN" }),
      });
    const short = await newStaff("1234567", "short");
    check("staff create: 7-char password -> 400", short.status === 400, String(short.status));
    check(
      "staff create: error names the minimum",
      ((await short.json()) as { error?: string }).error === "password must be at least 8 characters",
    );
    const ok = await newStaff("12345678", "ok");
    const okBody = (await ok.json()) as { id?: string };
    if (okBody.id) createdStaffIds.push(okBody.id);
    check("staff create: 8-char password -> 201", ok.status === 201, String(ok.status));
    const reset = (password: string) =>
      fetch(`${base}/api/pos/staff/${okBody.id}`, { method: "PUT", headers: authed, body: JSON.stringify({ password }) });
    check("staff reset: 7-char password -> 400", (await reset("1234567")).status === 400);
    check("staff reset: 8-char password -> 200", (await reset("abcdefgh")).status === 200);
    const noPassword = await fetch(`${base}/api/pos/staff/${okBody.id}`, {
      method: "PUT",
      headers: authed,
      body: JSON.stringify({ name: "renamed" }),
    });
    check("staff update without a password is unaffected", noPassword.status === 200, String(noPassword.status));
  } finally {
    await prisma.staffUser.deleteMany({ where: { id: { in: createdStaffIds } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
