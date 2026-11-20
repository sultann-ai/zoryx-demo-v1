import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PROOF_LIMIT_BYTES, PROOF_MAX_SIDE, PROOF_TARGET_BYTES, prepareProof, type ProofCodec } from './proofImage.ts'

const MB = 1024 * 1024
const photo = (bytes: number, type = 'image/jpeg', name = 'IMG_0001.jpg') => new File([new Uint8Array(bytes)], name, { type })
const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })

/** A codec that answers from a list of sizes, one per attempt, and records what it was asked. */
function fakeCodec(sizes: number[]) {
  const calls: { maxSide: number; quality: number }[] = []
  const codec: ProofCodec = {
    async encode(_file, maxSide, quality) {
      calls.push({ maxSide, quality })
      return jpeg(sizes[Math.min(calls.length - 1, sizes.length - 1)])
    },
  }
  return { codec, calls }
}
const brokenCodec: ProofCodec = {
  async encode() {
    throw new Error('decode failed')
  },
}

describe('prepareProof', () => {
  it('rejects something that is not a picture', async () => {
    const { codec, calls } = fakeCodec([100])
    const result = await prepareProof(photo(1000, 'application/pdf', 'bill.pdf'), codec)
    assert.deepEqual(result, { ok: false, reason: 'NOT_IMAGE' })
    assert.equal(calls.length, 0)
  })

  it('sends a small picture as it is, without touching it', async () => {
    const { codec, calls } = fakeCodec([100])
    const original = photo(120 * 1024, 'image/png', 'shot.png')
    const result = await prepareProof(original, codec)
    assert.ok(result.ok)
    assert.equal(result.file, original)
    assert.equal(result.compressed, false)
    assert.equal(calls.length, 0)
  })

  it('shrinks a 10 MB photo to about 1600px and a few hundred KB, as a .jpg', async () => {
    const { codec, calls } = fakeCodec([700 * 1024])
    const result = await prepareProof(photo(10 * MB, 'image/jpeg', 'IMG_2231.HEIC.jpeg'), codec)
    assert.ok(result.ok)
    assert.equal(result.compressed, true)
    assert.equal(result.file.type, 'image/jpeg')
    assert.equal(result.file.name, 'IMG_2231.HEIC.jpg')
    assert.ok(result.file.size < PROOF_TARGET_BYTES)
    assert.deepEqual(calls[0], { maxSide: PROOF_MAX_SIDE, quality: 0.85 })
  })

  it('tries harder (lower quality, then smaller) until it is under the target', async () => {
    const { codec, calls } = fakeCodec([4 * MB, 3 * MB, 1.2 * MB])
    const result = await prepareProof(photo(12 * MB), codec)
    assert.ok(result.ok)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls[2], { maxSide: 1280, quality: 0.6 })
    assert.equal(result.file.size, Math.round(1.2 * MB))
  })

  it('accepts a result over the target while it is still under the server limit', async () => {
    const { codec } = fakeCodec([4.5 * MB])
    const result = await prepareProof(photo(15 * MB), codec)
    assert.ok(result.ok && result.file.size < PROOF_LIMIT_BYTES)
  })

  it('keeps the original when it is already smaller than the recompressed picture', async () => {
    const { codec } = fakeCodec([900 * 1024])
    const original = photo(700 * 1024, 'image/webp', 'a.webp')
    const result = await prepareProof(original, codec)
    assert.ok(result.ok)
    assert.equal(result.file, original)
    assert.equal(result.compressed, false)
  })

  it('PATH: compression fails but the picture is under the limit -> the ORIGINAL is sent', async () => {
    const original = photo(3 * MB, 'image/png', 'big.png')
    const result = await prepareProof(original, brokenCodec)
    assert.ok(result.ok)
    assert.equal(result.file, original)
    assert.equal(result.compressed, false)
  })

  it('PATH: compression fails and the picture is over the limit -> COMPRESS_FAILED (the three-way help)', async () => {
    assert.deepEqual(await prepareProof(photo(9 * MB), brokenCodec), { ok: false, reason: 'COMPRESS_FAILED' })
  })

  it('PATH: compression fails on a format the server does not take (HEIC) -> COMPRESS_FAILED, even when small', async () => {
    assert.deepEqual(await prepareProof(photo(1 * MB, 'image/heic', 'IMG_9.heic'), brokenCodec), { ok: false, reason: 'COMPRESS_FAILED' })
  })

  it('PATH: it compresses fine but nothing gets under the limit -> TOO_BIG', async () => {
    const { codec } = fakeCodec([7 * MB, 6.5 * MB, 6 * MB, 5.5 * MB])
    assert.deepEqual(await prepareProof(photo(40 * MB), codec), { ok: false, reason: 'TOO_BIG' })
  })

  it('treats an encoder that cannot make JPEG (returns another type, or nothing) as a failure', async () => {
    const png: ProofCodec = { encode: async () => new Blob([new Uint8Array(500 * 1024)], { type: 'image/png' }) }
    const empty: ProofCodec = { encode: async () => new Blob([], { type: 'image/jpeg' }) }
    assert.deepEqual(await prepareProof(photo(8 * MB), png), { ok: false, reason: 'COMPRESS_FAILED' })
    assert.deepEqual(await prepareProof(photo(8 * MB), empty), { ok: false, reason: 'COMPRESS_FAILED' })
    // ...and the original goes through when it fits.
    const fits = photo(2 * MB)
    const result = await prepareProof(fits, png)
    assert.ok(result.ok && result.file === fits)
  })
})
