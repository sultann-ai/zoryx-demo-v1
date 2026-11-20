// Getting a payment screenshot ready to send. Pure logic (no DOM): the browser part is a `ProofCodec` handed in, so the
// decisions can be unit-tested (proofImage.test.ts). The canvas codec lives in proofCanvas.ts.

/** The server's limit (backend/src/config/mediaUpload.ts). */
export const PROOF_LIMIT_BYTES = 5 * 1024 * 1024
/** What a compressed picture should come in under: well below the limit, so a slow connection still finishes. */
export const PROOF_TARGET_BYTES = 1.5 * 1024 * 1024
/** A picture this small is sent as it is (re-encoding could only lose sharpness). */
export const PROOF_SKIP_BYTES = 300 * 1024
/** Long side of the sent picture; text in a phone screenshot stays readable at this size. */
export const PROOF_MAX_SIDE = 1600
/** What the server accepts. */
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** The browser's picture work: draw `file` at most `maxSide` px on the long side and encode it as JPEG. Rejects when it cannot. */
export interface ProofCodec {
  encode(file: Blob, maxSide: number, quality: number): Promise<Blob>
}

export type ProofFailure = 'NOT_IMAGE' | 'TOO_BIG' | 'COMPRESS_FAILED'

export type PrepareResult =
  | { ok: true; file: File; /** False when the original is sent untouched. */ compressed: boolean }
  | { ok: false; reason: ProofFailure }

// Each step tries a little harder; the first result under the target wins.
const ATTEMPTS: { maxSide: number; quality: number }[] = [
  { maxSide: PROOF_MAX_SIDE, quality: 0.85 },
  { maxSide: PROOF_MAX_SIDE, quality: 0.7 },
  { maxSide: 1280, quality: 0.6 },
  { maxSide: 1000, quality: 0.55 },
]

const isImage = (file: Blob) => file.type.startsWith('image/')
const acceptedAsIs = (file: Blob) => PROOF_TYPES.includes(file.type) && file.size <= PROOF_LIMIT_BYTES

function jpegFile(blob: Blob, original: File): File {
  const base = original.name.replace(/\.[^./\\]+$/, '') || 'screenshot'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

/**
 * Shrink and recompress a screenshot. Never throws; the answer says what to do:
 * - not a picture at all: NOT_IMAGE.
 * - already small and in a type the server takes: sent untouched.
 * - compressed under the target (or at least under the limit): sent compressed, unless the original is smaller.
 * - compression broke (an unsupported format, a decoder error) but the original is under the limit and a type the server
 *   takes: the ORIGINAL is sent. Otherwise COMPRESS_FAILED.
 * - it works but nothing gets under the limit: TOO_BIG.
 * COMPRESS_FAILED and TOO_BIG are the two cases the screen answers with "pick another / call the waiter / WhatsApp".
 */
export async function prepareProof(file: File, codec: ProofCodec): Promise<PrepareResult> {
  if (!isImage(file)) return { ok: false, reason: 'NOT_IMAGE' }
  if (acceptedAsIs(file) && file.size <= PROOF_SKIP_BYTES) return { ok: true, file, compressed: false }

  let best: Blob | null = null
  let broke = false
  for (const attempt of ATTEMPTS) {
    let blob: Blob
    try {
      blob = await codec.encode(file, attempt.maxSide, attempt.quality)
    } catch {
      broke = true
      break
    }
    if (blob.type !== 'image/jpeg' || blob.size === 0) {
      // A browser that cannot encode JPEG hands back something else (or nothing): the same as a failure.
      broke = true
      break
    }
    if (!best || blob.size < best.size) best = blob
    if (blob.size <= PROOF_TARGET_BYTES) break
  }

  if (best && best.size <= PROOF_LIMIT_BYTES) {
    if (acceptedAsIs(file) && file.size <= best.size) return { ok: true, file, compressed: false }
    return { ok: true, file: jpegFile(best, file), compressed: true }
  }
  if (acceptedAsIs(file)) return { ok: true, file, compressed: false } // compression failed or did not help; the original fits
  return { ok: false, reason: broke || !best ? 'COMPRESS_FAILED' : 'TOO_BIG' }
}
