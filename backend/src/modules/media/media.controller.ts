import { Request, Response } from "express";
import { MediaKind } from "../../../generated/prisma/client";
import { ifNoneMatchMatches } from "../../common/http/etag";
import { InvalidImageError, processForKind } from "../../common/media/processImage";
import * as mediaService from "./media.service";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

// POST /api/pos/media — multipart: `file` + `kind`.
export async function uploadMedia(req: Request, res: Response) {
  const kind = req.body?.kind;
  if (typeof kind !== "string" || !(mediaService.STAFF_UPLOAD_KINDS as readonly string[]).includes(kind)) {
    res.status(400).json({ error: `kind must be one of: ${mediaService.STAFF_UPLOAD_KINDS.join(", ")}` });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  let processed;
  try {
    processed = await processForKind(kind as MediaKind, req.file.buffer);
  } catch (error) {
    if (error instanceof InvalidImageError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const asset = await mediaService.createMedia({
    kind: kind as MediaKind,
    mimeType: processed.mimeType,
    width: processed.width,
    height: processed.height,
    hasTransparency: processed.hasTransparency,
    data: processed.data,
    thumb: processed.thumb,
    createdById: req.staff?.id ?? null,
  });
  res.status(201).json({ ...asset, urls: mediaService.mediaUrls(asset.id) });
}

// GET /api/online/media/:id?size=thumb|full — public. Assets are immutable per id (a replaced
// photo gets a new id), so the response is cached forever and the ETag is derived from the id
// without hashing any bytes: a revalidation answers 304 before the blob is ever read.
export async function serveMedia(req: Request, res: Response) {
  const size = req.query.size === undefined ? "full" : req.query.size;
  if (size !== "thumb" && size !== "full") {
    res.status(400).json({ error: "size must be thumb or full" });
    return;
  }

  const asset = await mediaService.getAssetMeta(req.params.id as string);
  // Payment proofs are private customer data: they 404 here exactly like an unknown id.
  if (!asset || asset.kind === MediaKind.PAYMENT_PROOF) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const etag = `"${asset.id}-${size}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", IMMUTABLE_CACHE);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (ifNoneMatchMatches(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return;
  }

  const bytes = await mediaService.getAssetBytes(asset.id, size);
  if (!bytes) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(bytes.byteLength));
  res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
