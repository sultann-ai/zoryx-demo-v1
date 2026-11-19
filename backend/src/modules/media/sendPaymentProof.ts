import { Request, Response } from "express";
import { ifNoneMatchMatches } from "../../common/http/etag";
import * as mediaService from "./media.service";

// A payment proof image for staff (an order's, or a table guest's share of a bill): ?size=thumb|full,
// never on the public media route (it is private customer data). The POS fetches it with its token and
// shows a blob URL. Cached privately; the media id changes whenever a proof is replaced.
export async function sendPaymentProof(req: Request, res: Response, mediaId: string | null, notFoundMessage: string) {
  const size = req.query.size === undefined ? "full" : req.query.size;
  if (size !== "thumb" && size !== "full") {
    res.status(400).json({ error: "size must be thumb or full" });
    return;
  }
  const asset = mediaId ? await mediaService.getAssetMeta(mediaId) : null;
  if (!mediaId || !asset) {
    res.status(404).json({ error: notFoundMessage });
    return;
  }

  const etag = `"${mediaId}-${size}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, max-age=86400");
  if (ifNoneMatchMatches(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return;
  }
  const bytes = await mediaService.getAssetBytes(mediaId, size);
  if (!bytes) {
    res.status(404).json({ error: notFoundMessage });
    return;
  }
  res.setHeader("Content-Type", asset.mimeType);
  res.setHeader("Content-Length", String(bytes.byteLength));
  res.end(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
