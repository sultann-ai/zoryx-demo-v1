import sharp from "sharp";
import { MediaKind } from "../../../generated/prisma/client";

// Pure image pipeline (no database, no disk) so it can be unit-tested directly.

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

export const PHOTO_FULL = { width: 1000, height: 750, quality: 80, targetBytes: 120 * 1024 } as const;
export const PHOTO_THUMB = { width: 480, height: 360, quality: 75, targetBytes: 45 * 1024 } as const;
export const QR_MAX_DIMENSION = 1200;
export const PROOF_MAX_DIMENSION = 1600;
export const PROOF_THUMB_MAX_DIMENSION = 480;

// A pixel counts as transparent below this alpha. Anything at or above is treated as opaque, so a
// PNG saved with a stray 254-alpha pixel (or an alpha channel that is fully opaque) stays a normal photo.
const OPAQUE_ALPHA_MIN = 250;
const MIN_QUALITY = 40;
const QUALITY_STEP = 5;
// Rejects decompression bombs (a tiny file that expands to a huge bitmap). ~50 megapixels is
// well above any phone camera photo.
const MAX_INPUT_PIXELS = 50_000_000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const NOT_AN_IMAGE = "File is not a valid JPEG, PNG, or WEBP image";

export interface ProcessedMedia {
  data: Buffer;
  thumb: Buffer | null;
  mimeType: "image/webp" | "image/png";
  width: number;
  height: number;
  // True when a cut-out photo kept its transparent pixels (WebP with alpha).
  hasTransparency: boolean;
}

// Checks the file's *actual* format from its bytes — the client-declared mime type is never
// trusted — and its size, before any pixel work.
async function assertAllowedImage(input: Buffer): Promise<void> {
  let format: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
    format = metadata.format;
    width = metadata.width;
    height = metadata.height;
  } catch {
    throw new InvalidImageError(NOT_AN_IMAGE);
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new InvalidImageError(NOT_AN_IMAGE);
  }
  if (!width || !height || width * height > MAX_INPUT_PIXELS) {
    throw new InvalidImageError("Image dimensions are too large");
  }
}

// Re-encodes at decreasing quality until the result is at or under targetBytes (or the quality
// floor is reached — a very noisy photo may stay a little over, which is fine: the targets are
// "roughly", not a hard limit).
async function encodeWebpUnder(
  raw: Buffer,
  info: { width: number; height: number; channels: 3 | 4 },
  startQuality: number,
  targetBytes: number,
): Promise<Buffer> {
  let quality = startQuality;
  for (;;) {
    // alphaQuality 100 keeps a cut-out's edge crisp (it is ignored for a 3-channel image).
    const out = await sharp(raw, { raw: info }).webp({ quality, alphaQuality: 100, smartSubsample: true }).toBuffer();
    if (out.length <= targetBytes || quality <= MIN_QUALITY) {
      return out;
    }
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
  }
}

// Does the image have real transparent pixels (not just an alpha channel that is fully opaque)?
// Reads the alpha channel's minimum straight from the decoded pixels.
async function hasTransparentPixels(input: Buffer): Promise<boolean> {
  const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
  if (!metadata.hasAlpha) {
    return false;
  }
  const { channels } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).stats();
  const alpha = channels[channels.length - 1];
  return alpha !== undefined && alpha.min < OPAQUE_ALPHA_MIN;
}

// A cut-out (background removed): fit the whole picture inside the same 4:3 box instead of cropping
// it, pad with transparent pixels, and keep the alpha channel in both WebP renditions.
async function processCutout(input: Buffer): Promise<ProcessedMedia> {
  const { data: raw, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize(PHOTO_FULL.width, PHOTO_FULL.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const fullInfo = { width: info.width, height: info.height, channels: 4 as const };
  const data = await encodeWebpUnder(raw, fullInfo, PHOTO_FULL.quality, PHOTO_FULL.targetBytes);

  const { data: thumbRaw, info: thumbInfo } = await sharp(raw, { raw: fullInfo })
    .resize(PHOTO_THUMB.width, PHOTO_THUMB.height, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const thumb = await encodeWebpUnder(
    thumbRaw,
    { width: thumbInfo.width, height: thumbInfo.height, channels: 4 },
    PHOTO_THUMB.quality,
    PHOTO_THUMB.targetBytes,
  );

  return { data, thumb, mimeType: "image/webp", width: info.width, height: info.height, hasTransparency: true };
}

// Menu items, deals, gallery, categories: auto-rotate from EXIF, drop all metadata, smart-crop to 4:3,
// and produce a full and a thumbnail WebP. A photo with transparent pixels (a cut-out) is not cropped:
// it is fitted inside the same box and keeps its transparency (see processCutout).
export async function processPhoto(input: Buffer): Promise<ProcessedMedia> {
  await assertAllowedImage(input);
  try {
    if (await hasTransparentPixels(input)) {
      return await processCutout(input);
    }
    // Crop once, then derive the thumbnail from the cropped pixels so the two always match.
    const { data: raw, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(PHOTO_FULL.width, PHOTO_FULL.height, { fit: "cover", position: sharp.strategy.attention })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const fullInfo = { width: info.width, height: info.height, channels: 3 as const };
    const data = await encodeWebpUnder(raw, fullInfo, PHOTO_FULL.quality, PHOTO_FULL.targetBytes);

    const { data: thumbRaw, info: thumbInfo } = await sharp(raw, { raw: fullInfo })
      .resize(PHOTO_THUMB.width, PHOTO_THUMB.height, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const thumb = await encodeWebpUnder(
      thumbRaw,
      { width: thumbInfo.width, height: thumbInfo.height, channels: 3 },
      PHOTO_THUMB.quality,
      PHOTO_THUMB.targetBytes,
    );

    return { data, thumb, mimeType: "image/webp", width: info.width, height: info.height, hasTransparency: false };
  } catch {
    throw new InvalidImageError(NOT_AN_IMAGE);
  }
}

// Payment QR codes: never cropped (a cropped QR won't scan), kept lossless as PNG, and only
// ever downscaled — and only when larger than QR_MAX_DIMENSION. Transparency is flattened onto
// white so the code stays readable on a dark page.
export async function processQr(input: Buffer): Promise<ProcessedMedia> {
  await assertAllowedImage(input);
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: QR_MAX_DIMENSION, height: QR_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer({ resolveWithObject: true });
    return { data, thumb: null, mimeType: "image/png", width: info.width, height: info.height, hasTransparency: false };
  } catch {
    throw new InvalidImageError(NOT_AN_IMAGE);
  }
}

// A customer's payment screenshot. Unlike a menu photo it must NOT be cropped (a phone screenshot
// is tall, and the amount/reference could be anywhere), so it's only auto-rotated, stripped of
// metadata, flattened onto white and downscaled to fit 1600 px. Stored as WebP with a small thumbnail
// for the Incoming Orders inbox.
export async function processProof(input: Buffer): Promise<ProcessedMedia> {
  await assertAllowedImage(input);
  try {
    const { data: raw, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: PROOF_MAX_DIMENSION, height: PROOF_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const rawInfo = { width: info.width, height: info.height, channels: 3 as const };
    const data = await sharp(raw, { raw: rawInfo }).webp({ quality: 82, smartSubsample: true }).toBuffer();
    const thumb = await sharp(raw, { raw: rawInfo })
      .resize({
        width: PROOF_THUMB_MAX_DIMENSION,
        height: PROOF_THUMB_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
    return { data, thumb, mimeType: "image/webp", width: info.width, height: info.height, hasTransparency: false };
  } catch {
    throw new InvalidImageError(NOT_AN_IMAGE);
  }
}

export function processForKind(kind: MediaKind, input: Buffer): Promise<ProcessedMedia> {
  if (kind === MediaKind.PAYMENT_QR) {
    return processQr(input);
  }
  if (kind === MediaKind.PAYMENT_PROOF) {
    return processProof(input);
  }
  return processPhoto(input);
}
