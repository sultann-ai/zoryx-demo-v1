import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  InvalidImageError,
  PHOTO_FULL,
  PHOTO_THUMB,
  processForKind,
  processPhoto,
  processQr,
  QR_MAX_DIMENSION,
} from "./processImage";
import { MediaKind } from "../../../generated/prisma/client";

const RED = { r: 220, g: 30, b: 30 };
const BLUE = { r: 30, g: 30, b: 220 };

const solid = (width: number, height: number, background = { r: 200, g: 120, b: 40 }) =>
  sharp({ create: { width, height, channels: 3, background } });

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! };
}

// Left half red, right half blue, stored as raw pixels.
async function splitImage(width: number, height: number, orientation?: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = x < width / 2 ? RED : BLUE;
      const offset = (y * width + x) * 3;
      raw[offset] = color.r;
      raw[offset + 1] = color.g;
      raw[offset + 2] = color.b;
    }
  }
  const pipeline = sharp(raw, { raw: { width, height, channels: 3 } });
  return (orientation ? pipeline.withMetadata({ orientation }) : pipeline).jpeg({ quality: 95 }).toBuffer();
}

describe("processPhoto", () => {
  it("outputs exactly 1000x750 and 480x360 WebP for wide, tall, and tiny sources", async () => {
    for (const [width, height] of [
      [3000, 500],
      [500, 3000],
      [50, 40],
      [1000, 750],
    ] as const) {
      const result = await processPhoto(await solid(width, height).jpeg().toBuffer());
      expect(result.mimeType).toBe("image/webp");
      expect([result.width, result.height]).toEqual([PHOTO_FULL.width, PHOTO_FULL.height]);

      const full = await sharp(result.data).metadata();
      expect([full.format, full.width, full.height]).toEqual(["webp", 1000, 750]);
      const thumb = await sharp(result.thumb!).metadata();
      expect([thumb.format, thumb.width, thumb.height]).toEqual(["webp", 480, 360]);
    }
  });

  it("applies the EXIF orientation (a portrait-stored image tagged 'rotate 90 CW' displays rotated)", async () => {
    // Stored 750x1000 with the red half on the left; orientation 6 means "rotate 90 degrees clockwise to
    // display", so the displayed 1000x750 image has red on top and blue below. (Already 4:3, so no crop.)
    const result = await processPhoto(await splitImage(750, 1000, 6));
    const top = await pixel(result.data, 500, 100);
    const bottom = await pixel(result.data, 500, 650);
    expect(top.r).toBeGreaterThan(top.b);
    expect(bottom.b).toBeGreaterThan(bottom.r);
  });

  it("strips all metadata (EXIF, ICC profile, orientation) from both renditions", async () => {
    const input = await solid(800, 600).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const result = await processPhoto(input);
    for (const output of [result.data, result.thumb!]) {
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("keeps a typical photo under the size targets", async () => {
    // A smooth gradient with mild noise, closer to a real photo than a flat fill.
    const width = 2000;
    const height = 1500;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i += 3) {
      const x = (i / 3) % width;
      const y = Math.floor(i / 3 / width);
      const noise = Math.floor(Math.random() * 12);
      raw[i] = (x / width) * 200 + noise;
      raw[i + 1] = (y / height) * 200 + noise;
      raw[i + 2] = 120 + noise;
    }
    const input = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
    const result = await processPhoto(input);
    expect(result.data.length).toBeLessThanOrEqual(PHOTO_FULL.targetBytes);
    expect(result.thumb!.length).toBeLessThanOrEqual(PHOTO_THUMB.targetBytes);
  });

  it("lowers quality for a noisy photo but never fails on size (floor reached)", async () => {
    const width = 1200;
    const height = 900;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i += 1) {
      raw[i] = Math.floor(Math.random() * 256);
    }
    const input = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const result = await processPhoto(input);

    const atFullQuality = await sharp(await sharp(input).resize(1000, 750).raw().toBuffer(), {
      raw: { width: 1000, height: 750, channels: 3 },
    })
      .webp({ quality: PHOTO_FULL.quality })
      .toBuffer();
    expect(result.data.length).toBeLessThan(atFullQuality.length);
    expect((await sharp(result.data).metadata()).format).toBe("webp");
  }, 30000);

  it("judges the real format, not the declared one (PNG bytes are fine whatever they were uploaded as)", async () => {
    const png = await solid(400, 300).png().toBuffer();
    await expect(processPhoto(png)).resolves.toMatchObject({ width: 1000, height: 750 });
    const webp = await solid(400, 300).webp().toBuffer();
    await expect(processPhoto(webp)).resolves.toMatchObject({ width: 1000, height: 750 });
  });

  it("rejects GIF, SVG, text, empty, and truncated files", async () => {
    const gif = await solid(40, 40).gif().toBuffer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    const jpeg = await solid(1500, 1500).jpeg().toBuffer();
    for (const bad of [gif, svg, Buffer.from("hello, not an image"), Buffer.alloc(0), jpeg.subarray(0, 400)]) {
      await expect(processPhoto(bad)).rejects.toBeInstanceOf(InvalidImageError);
    }
  });

  it("rejects a decompression bomb (a tiny file that decodes to far too many pixels)", async () => {
    const bomb = await solid(7500, 7000, { r: 0, g: 0, b: 0 }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(8 * 1024 * 1024);
    await expect(processPhoto(bomb)).rejects.toBeInstanceOf(InvalidImageError);
  }, 60000);
});

async function rgba(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * 4;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]!, a: data[offset + 3]! };
}

// A wide cut-out: fully transparent except an opaque red band on the far left and far right edge —
// the two places a 4:3 crop of a 4:1 picture would throw away.
async function wideCutout(alpha = 0) {
  const width = 2000;
  const height = 500;
  const band = (left: number) => ({
    input: { create: { width: 100, height, channels: 4 as const, background: { ...RED, alpha: 1 } } },
    left,
    top: 0,
  });
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha } } })
    .composite([band(0), band(width - 100)])
    .png()
    .toBuffer();
}

describe("processPhoto with transparency (cut-out photos)", () => {
  it("fits the whole picture inside 1000x750 instead of cropping it, and says it has transparency", async () => {
    const result = await processPhoto(await wideCutout());
    expect(result.hasTransparency).toBe(true);
    expect(result.mimeType).toBe("image/webp");
    expect([result.width, result.height]).toEqual([PHOTO_FULL.width, PHOTO_FULL.height]);

    // 2000x500 contained in 1000x750 is 1000x250, centred (rows 250-499). The red edge bands survive...
    for (const x of [5, 994]) {
      const edge = await rgba(result.data, x, 375);
      expect(edge.a).toBe(255);
      expect(edge.r).toBeGreaterThan(180);
    }
    // ...and the padding above and below, and the transparent middle, stay transparent.
    expect((await rgba(result.data, 500, 20)).a).toBe(0);
    expect((await rgba(result.data, 500, 730)).a).toBe(0);
    expect((await rgba(result.data, 500, 375)).a).toBe(0);
  });

  it("outputs WebP with an alpha channel for both the full image and the thumbnail", async () => {
    const result = await processPhoto(await wideCutout());
    const full = await sharp(result.data).metadata();
    expect([full.format, full.width, full.height, full.hasAlpha]).toEqual(["webp", 1000, 750, true]);
    const thumb = await sharp(result.thumb!).metadata();
    expect([thumb.format, thumb.width, thumb.height, thumb.hasAlpha]).toEqual(["webp", 480, 360, true]);
    expect((await rgba(result.thumb!, 240, 5)).a).toBe(0);
    expect((await rgba(result.thumb!, 3, 180)).a).toBe(255);
  });

  it("contains a tall cut-out on the other axis (padding left and right)", async () => {
    const tall = await sharp({ create: { width: 300, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 300, height: 1200, channels: 4, background: { ...BLUE, alpha: 1 } } }, top: 0, left: 0 }])
      .png()
      .toBuffer();
    // Fully opaque tall picture -> not a cut-out -> the normal crop path.
    expect((await processPhoto(tall)).hasTransparency).toBe(false);

    const tallCutout = await sharp({ create: { width: 300, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 300, height: 100, channels: 4, background: { ...BLUE, alpha: 1 } } }, top: 0, left: 0 }])
      .png()
      .toBuffer();
    const result = await processPhoto(tallCutout);
    expect(result.hasTransparency).toBe(true);
    // 300x1200 contained in 1000x750 is 187x750, centred: the blue strip is at the top, columns ~406-593.
    expect((await rgba(result.data, 500, 10)).b).toBeGreaterThan(180);
    expect((await rgba(result.data, 500, 10)).a).toBe(255);
    expect((await rgba(result.data, 100, 10)).a).toBe(0);
  });

  it("keeps the smart-crop behaviour for a photo without transparency", async () => {
    const jpeg = await processPhoto(await solid(3000, 500).jpeg().toBuffer());
    expect(jpeg.hasTransparency).toBe(false);
    expect((await sharp(jpeg.data).metadata()).hasAlpha).toBe(false);

    // A PNG whose alpha channel is fully opaque is an ordinary photo, not a cut-out.
    const opaqueRgba = await sharp({ create: { width: 800, height: 400, channels: 4, background: { ...RED, alpha: 1 } } })
      .png()
      .toBuffer();
    expect((await sharp(opaqueRgba).metadata()).hasAlpha).toBe(true);
    const flat = await processPhoto(opaqueRgba);
    expect(flat.hasTransparency).toBe(false);
    expect((await sharp(flat.data).metadata()).hasAlpha).toBe(false);
    // Covers the whole 4:3 frame, so even the corners are solid red.
    const corner = await pixel(flat.data, 2, 2);
    expect(corner.r).toBeGreaterThan(180);
    expect(corner.b).toBeLessThan(80);
  });

  it("treats a WebP with transparency the same as a PNG", async () => {
    const webp = await sharp(await wideCutout()).webp({ lossless: true }).toBuffer();
    const result = await processPhoto(webp);
    expect(result.hasTransparency).toBe(true);
    expect((await rgba(result.data, 500, 20)).a).toBe(0);
  });

  it("keeps the cut-out under the size targets (a flat-colour edge compresses well)", async () => {
    const result = await processPhoto(await wideCutout());
    expect(result.data.length).toBeLessThanOrEqual(PHOTO_FULL.targetBytes);
    expect(result.thumb!.length).toBeLessThanOrEqual(PHOTO_THUMB.targetBytes);
  });

  it("strips metadata from a cut-out too", async () => {
    const input = await sharp(await wideCutout()).withMetadata({ orientation: 6 }).png().toBuffer();
    const result = await processPhoto(input);
    for (const output of [result.data, result.thumb!]) {
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("is applied to every photo kind, but a QR and a payment proof are never treated as cut-outs", async () => {
    const cutout = await wideCutout();
    for (const kind of [MediaKind.MENU_ITEM, MediaKind.DEAL, MediaKind.GALLERY, MediaKind.CATEGORY]) {
      expect((await processForKind(kind, cutout)).hasTransparency).toBe(true);
    }
    for (const kind of [MediaKind.PAYMENT_QR, MediaKind.PAYMENT_PROOF]) {
      const result = await processForKind(kind, cutout);
      expect(result.hasTransparency).toBe(false);
      expect((await rgba(result.data, 500, 20)).a).toBe(255);
    }
  }, 30000);
});

describe("processQr", () => {
  it("never crops: aspect ratio is kept and only the long side is capped at 1200", async () => {
    const result = await processQr(await solid(1500, 800, { r: 0, g: 0, b: 0 }).png().toBuffer());
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(QR_MAX_DIMENSION);
    expect(result.height).toBe(640);
    expect(result.thumb).toBeNull();
    expect((await sharp(result.data).metadata()).format).toBe("png");
  });

  it("never upscales a small QR", async () => {
    const result = await processQr(await solid(300, 300, { r: 0, g: 0, b: 0 }).png().toBuffer());
    expect([result.width, result.height]).toEqual([300, 300]);
  });

  it("flattens transparency onto white so the code stays scannable on a dark page", async () => {
    const transparent = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const result = await processQr(transparent);
    expect(await pixel(result.data, 10, 10)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("applies orientation and strips metadata", async () => {
    const input = await solid(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await processQr(input);
    expect([result.width, result.height]).toEqual([100, 200]);
    const metadata = await sharp(result.data).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects non-images", async () => {
    await expect(processQr(Buffer.from("<svg></svg>"))).rejects.toBeInstanceOf(InvalidImageError);
  });
});
