import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, PROOF_MAX_DIMENSION, PROOF_THUMB_MAX_DIMENSION, processProof } from "./processImage";

const solid = (width: number, height: number, background = { r: 40, g: 120, b: 200 }) =>
  sharp({ create: { width, height, channels: 3, background } });

async function pixel(buffer: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! };
}

describe("processProof (a customer's payment screenshot)", () => {
  it("never crops: a tall phone screenshot keeps its aspect ratio and is downscaled to fit 1600 px", async () => {
    const result = await processProof(await solid(1080, 2400).png().toBuffer());
    expect(result.mimeType).toBe("image/webp");
    expect(result.height).toBe(PROOF_MAX_DIMENSION);
    expect(result.width).toBe(720); // 1080 x (1600 / 2400)
    const meta = await sharp(result.data).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 720, 1600]);
  });

  it("never upscales a small screenshot", async () => {
    const result = await processProof(await solid(300, 500).jpeg().toBuffer());
    expect([result.width, result.height]).toEqual([300, 500]);
  });

  it("makes a thumbnail that fits 480 px on its long side, aspect kept", async () => {
    const result = await processProof(await solid(1080, 2400).png().toBuffer());
    const thumb = await sharp(result.thumb!).metadata();
    expect(thumb.format).toBe("webp");
    expect(thumb.height).toBe(PROOF_THUMB_MAX_DIMENSION);
    expect(thumb.width).toBe(216);
  });

  it("applies the EXIF orientation and strips metadata from both renditions", async () => {
    const rotated = await processProof(await solid(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer());
    expect([rotated.width, rotated.height]).toEqual([100, 200]);
    for (const output of [rotated.data, rotated.thumb!]) {
      const metadata = await sharp(output).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("flattens transparency onto white", async () => {
    const transparent = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const flat = await processProof(transparent);
    const { r, g, b } = await pixel(flat.data, 5, 5);
    expect(Math.min(r, g, b)).toBeGreaterThan(245);
  });

  it("rejects what is not a real JPEG/PNG/WEBP", async () => {
    const gif = await solid(40, 40).gif().toBuffer();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>');
    for (const bad of [gif, svg, Buffer.from("plain text"), Buffer.alloc(0)]) {
      await expect(processProof(bad)).rejects.toBeInstanceOf(InvalidImageError);
    }
  });
});
