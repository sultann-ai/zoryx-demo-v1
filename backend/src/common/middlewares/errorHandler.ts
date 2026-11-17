import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { UploadRejectedError } from "../../config/uploadRules";

// body-parser tags its errors with `type`; anything else keeps the generic 500.
function bodyParserStatus(err: unknown): { status: number; error: string } | null {
  if (typeof err !== "object" || err === null) {
    return null;
  }
  const type = (err as { type?: unknown }).type;
  if (type === "entity.too.large") {
    return { status: 413, error: "Request body too large" };
  }
  if (type === "entity.parse.failed") {
    return { status: 400, error: "Malformed JSON body" };
  }
  return null;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof UploadRejectedError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large" });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  const parsed = bodyParserStatus(err);
  if (parsed) {
    res.status(parsed.status).json({ error: parsed.error });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
