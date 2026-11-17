import { MediaKind, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

// Kinds staff can upload. PAYMENT_PROOF is reserved for customer payment screenshots (ordering
// module) and is never accepted here or served publicly.
export const STAFF_UPLOAD_KINDS = [
  MediaKind.MENU_ITEM,
  MediaKind.DEAL,
  MediaKind.GALLERY,
  MediaKind.PAYMENT_QR,
  MediaKind.CATEGORY,
] as const;

export class InvalidMediaReferenceError extends Error {}

export { mediaUrls } from "../../common/media/mediaUrls";

const assetSelect = {
  id: true,
  kind: true,
  mimeType: true,
  width: true,
  height: true,
  sizeBytes: true,
  hasTransparency: true,
  createdAt: true,
} satisfies Prisma.MediaAssetSelect;

export function createMedia(input: {
  kind: MediaKind;
  mimeType: string;
  width: number;
  height: number;
  hasTransparency?: boolean;
  data: Buffer;
  thumb: Buffer | null;
  createdById: string | null;
}) {
  return prisma.mediaAsset.create({
    data: {
      kind: input.kind,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      sizeBytes: input.data.length,
      hasTransparency: input.hasTransparency ?? false,
      createdById: input.createdById,
      blob: {
        create: {
          data: new Uint8Array(input.data),
          thumb: input.thumb ? new Uint8Array(input.thumb) : null,
        },
      },
    },
    select: assetSelect,
  });
}

// Metadata only — never touches the blob table, so a 304 or a 404 never loads image bytes.
export function getAssetMeta(id: string) {
  return prisma.mediaAsset.findUnique({ where: { id }, select: { id: true, kind: true, mimeType: true } });
}

// The only place image bytes are read. Returns the thumbnail when asked and one exists,
// otherwise the full image (a QR has no thumbnail).
export async function getAssetBytes(id: string, size: "thumb" | "full"): Promise<Uint8Array | null> {
  if (size === "thumb") {
    const row = await prisma.mediaBlob.findUnique({ where: { id }, select: { thumb: true } });
    if (row?.thumb) {
      return row.thumb;
    }
  }
  const row = await prisma.mediaBlob.findUnique({ where: { id }, select: { data: true } });
  return row?.data ?? null;
}

// An asset can only be attached to something of the matching kind (a gallery photo can't be
// used as a payment QR, a payment proof can never be attached anywhere public).
export async function assertAttachable(
  client: Prisma.TransactionClient | typeof prisma,
  assetId: string,
  expectedKind: MediaKind,
): Promise<void> {
  const asset = await client.mediaAsset.findUnique({ where: { id: assetId }, select: { kind: true } });
  if (!asset) {
    throw new InvalidMediaReferenceError("imageId does not reference an existing media asset");
  }
  if (asset.kind !== expectedKind) {
    throw new InvalidMediaReferenceError(`media asset must be of kind ${expectedKind}`);
  }
}

// Deletes an asset (and, by cascade, its blob) once nothing references it any more. Call it
// inside the same transaction that re-pointed or removed the reference — after the update, so
// the old asset no longer counts itself — which is what makes "replace a photo" delete the old
// image atomically. A no-op for null, and for an asset another row still uses.
export async function releaseMediaIfUnreferenced(
  tx: Prisma.TransactionClient,
  assetId: string | null | undefined,
): Promise<void> {
  if (!assetId) {
    return;
  }
  const references =
    (await tx.menuItem.count({ where: { imageId: assetId } })) +
    (await tx.deal.count({ where: { imageId: assetId } })) +
    (await tx.category.count({ where: { imageId: assetId } })) +
    (await tx.galleryImage.count({ where: { mediaId: assetId } })) +
    (await tx.paymentAccount.count({ where: { qrMediaId: assetId } })) +
    // A payment proof is referenced only by its order.
    (await tx.order.count({ where: { paymentProofMediaId: assetId } }));
  if (references === 0) {
    await tx.mediaAsset.deleteMany({ where: { id: assetId } });
  }
}

// Housekeeping: an upload that was never attached to anything (the admin closed the tab, a guest
// order failed after its proof was stored) would sit in Postgres forever. Anything unreferenced
// by any of the tables that can point at media, and older than the cutoff, goes.
export async function purgeOrphanMedia(olderThan: Date): Promise<number> {
  const result = await prisma.mediaAsset.deleteMany({
    where: {
      createdAt: { lt: olderThan },
      menuItems: { none: {} },
      deals: { none: {} },
      categories: { none: {} },
      galleryImages: { none: {} },
      paymentAccounts: { none: {} },
      paymentProofOrders: { none: {} },
    },
  });
  return result.count;
}
