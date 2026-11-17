import dotenv from "dotenv";

dotenv.config();

const widthChars = Number(process.env.PRINTER_WIDTH_CHARS ?? "48");
if (Number.isNaN(widthChars) || widthChars <= 0) {
  throw new Error("PRINTER_WIDTH_CHARS must be a positive number");
}

export const config = {
  // Only needed to connect to the backend (checked in index.ts, not here) — `npm run
  // test-print` renders straight to the printer/preview without ever touching these.
  BACKEND_URL: process.env.BACKEND_URL,
  PRINT_AGENT_KEY: process.env.PRINT_AGENT_KEY,
  PRINTER_ID: process.env.PRINTER_ID ?? "main",
  // EPSON, STAR, or TANCA per the user's own spec (node-thermal-printer also supports DARUMA
  // and BROTHER, but those weren't asked for).
  PRINTER_TYPE: process.env.PRINTER_TYPE ?? "EPSON",
  PRINTER_INTERFACE: process.env.PRINTER_INTERFACE ?? "preview",
  PRINTER_WIDTH_CHARS: widthChars,
  PRINTER_CHARSET: process.env.PRINTER_CHARSET ?? "PC437_USA",
  CUT_ENABLED: (process.env.CUT_ENABLED ?? "true") !== "false",
  DRY_RUN: process.env.DRY_RUN === "1",
};

export function isPreviewMode(): boolean {
  return config.PRINTER_INTERFACE === "preview" || config.DRY_RUN;
}
