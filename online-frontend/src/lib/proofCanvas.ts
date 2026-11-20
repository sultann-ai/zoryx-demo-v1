import type { ProofCodec } from './proofImage'

/** Decode with the picture's own orientation applied (phones store photos sideways + a flag); older browsers get an <img>. */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      try {
        const bitmap = await createImageBitmap(file) // a browser that does not take the options object
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
      } catch {
        /* fall through to <img> */
      }
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** The browser's picture work for `prepareProof`: scale down on a canvas (never up) and encode JPEG on a white ground. */
export const canvasCodec: ProofCodec = {
  async encode(file, maxSide, quality) {
    const image = await decode(file)
    try {
      if (!image.width || !image.height) throw new Error('empty image')
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas')
      context.fillStyle = 'white' // a transparent PNG would turn black as a JPEG
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (!blob) throw new Error('could not encode')
      return blob
    } finally {
      image.release()
    }
  },
}
