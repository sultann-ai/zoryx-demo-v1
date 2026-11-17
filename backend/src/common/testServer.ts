import { AddressInfo } from "net";
import { Express } from "express";

// Test helper: serves a bare Express app on an ephemeral port so tests can use fetch with
// real headers (X-Forwarded-For, multipart bodies, ...). No database involved.
export async function serve(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
