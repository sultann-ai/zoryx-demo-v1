// Phone photos are 4000+ px and several MB; the website needs ~1000 px. Shrinking in the browser
// first makes the upload fast on a mobile connection, and the server then does the final crop,
// compression and metadata stripping.

export class ImageProcessingError extends Error {}

export const UPLOAD_MAX_DIMENSION = 1600;
const KEEP_ORIGINAL_UNDER_BYTES = 1.5 * 1024 * 1024;
const READABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const UNREADABLE_PHOTO_MESSAGE =
  "We couldn't read that photo. Please choose a JPG or PNG, or take a new picture with the camera.";

// The size an image of width x height shrinks to so its longer side is at most `max` (never larger).
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) {
    return { width, height };
  }
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

// createImageBitmap honours the photo's EXIF rotation, so a portrait phone picture isn't drawn on
// its side; an <img> element is the fallback for browsers without it.
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageProcessingError(UNREADABLE_PHOTO_MESSAGE);
  }
}

// A pixel counts as transparent below this alpha (the server uses the same threshold).
const OPAQUE_ALPHA_MIN = 250;

// Does the drawn canvas have transparent pixels (a cut-out photo with its background removed)?
function hasTransparentPixels(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index]! < OPAQUE_ALPHA_MIN) {
      return true;
    }
  }
  return false;
}

export interface DownscaleOptions {
  maxDimension?: number;
  // Photos go out as JPEG, except a picture with transparent pixels (a cut-out), which stays PNG so the
  // server can keep the transparency; a QR code stays lossless PNG so it still scans.
  outputType?: "image/jpeg" | "image/png";
  quality?: number;
}

// Returns the file ready to upload: untouched when it is already small, otherwise redrawn at most
// `maxDimension` px on its longer side. Throws ImageProcessingError (with a message fit to show) for
// a file that isn't a readable picture.
export async function downscaleImage(file: File, options: DownscaleOptions = {}): Promise<File> {
  const { maxDimension = UPLOAD_MAX_DIMENSION, outputType = "image/jpeg", quality = 0.86 } = options;

  if (!file.type.startsWith("image/")) {
    throw new ImageProcessingError("That file isn't a picture. Please choose a photo.");
  }

  const decoded = await decode(file);
  try {
    if (decoded.width < 1 || decoded.height < 1) {
      throw new ImageProcessingError(UNREADABLE_PHOTO_MESSAGE);
    }
    const target = fitWithin(decoded.width, decoded.height, maxDimension);
    const alreadySmall = target.width === decoded.width && target.height === decoded.height;
    if (alreadySmall && file.size <= KEEP_ORIGINAL_UNDER_BYTES && READABLE_TYPES.has(file.type)) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ImageProcessingError(UNREADABLE_PHOTO_MESSAGE);
    }
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    // JPEG has no transparency. A cut-out photo is therefore sent as PNG; any other picture gets a white
    // background behind it (a transparent QR/logo that is not a cut-out reads best on white).
    let type = outputType;
    if (outputType === "image/jpeg") {
      if (READABLE_TYPES.has(file.type) && file.type !== "image/jpeg" && hasTransparentPixels(context, target.width, target.height)) {
        type = "image/png";
      } else {
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, target.width, target.height);
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) {
      throw new ImageProcessingError(UNREADABLE_PHOTO_MESSAGE);
    }
    const extension = type === "image/png" ? "png" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.${extension}`, { type });
  } finally {
    decoded.release();
  }
}
