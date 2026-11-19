import type { ReceiptSnapshot } from '../api/table'
import { formatRs } from './format'

// "Save image" for a table receipt: the receipt drawn line by line on a canvas (no library, no network, no
// screenshot of the page), as a PNG. Colours and fonts are read from the page's own tokens, so the image matches
// the brand and never hard-codes a colour. Urdu is drawn right-to-left in the page's Nastaliq font.

export interface ReceiptImageText {
  title: string
  table: string
  order: (n: number, guest: string | null) => string
  subtotal: string
  discount: string
  total: string
  shares: string
  method: (method: 'CASH' | 'ONLINE' | null) => string
  issued: string
  thanks: string
  demo: string | null
}

const WIDTH = 760 // CSS px; drawn at 2x
const SCALE = 2
const PAD = 40

type Op = { text: string; y: number; size: number; weight: 400 | 700 | 800; side: 'start' | 'end' | 'center'; color: 'ink' | 'muted' | 'action'; ltr?: boolean }

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Lays the receipt out as drawing operations; returns them and the height they need. */
function layout(receipt: ReceiptSnapshot, text: ReceiptImageText, measure: (op: Pick<Op, 'text' | 'size' | 'weight' | 'ltr'>) => number, lineHeight: number) {
  const ops: Op[] = []
  let y = PAD
  const line = (size: number, extra = 0) => {
    y += size * lineHeight + extra
  }
  const push = (op: Omit<Op, 'y'>) => ops.push({ ...op, y })
  const amountRow = (label: string, amount: string, size: number, weight: 400 | 700 | 800 = 400) => {
    // Wrap a long label so it never runs into the amount.
    const room = WIDTH - PAD * 2 - measure({ text: amount, size, weight, ltr: true }) - 24
    const words = label.split(/\s+/)
    let current = ''
    const lines: string[] = []
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (current && measure({ text: next, size, weight }) > room) {
        lines.push(current)
        current = word
      } else current = next
    }
    lines.push(current)
    lines.forEach((part, i) => {
      push({ text: part, size, weight, side: 'start', color: 'ink' })
      if (i === 0) push({ text: amount, size, weight, side: 'end', color: 'ink', ltr: true })
      line(size)
    })
  }

  push({ text: receipt.shop.nameEn, size: 34, weight: 800, side: 'center', color: 'action', ltr: true })
  line(34)
  if (receipt.shop.nameUr && receipt.shop.nameUr !== receipt.shop.nameEn) {
    push({ text: receipt.shop.nameUr, size: 22, weight: 400, side: 'center', color: 'ink' })
    line(22)
  }
  push({ text: text.title, size: 20, weight: 700, side: 'center', color: 'muted' })
  line(20, 12)
  push({ text: text.table, size: 22, weight: 700, side: 'start', color: 'ink' })
  line(22)
  push({ text: text.issued, size: 18, weight: 400, side: 'start', color: 'muted' })
  line(18, 18)

  for (const order of receipt.orders) {
    push({ text: text.order(order.orderNumber, order.guestName), size: 18, weight: 700, side: 'start', color: 'muted' })
    line(18, 4)
    for (const item of order.lines) {
      const extras = [item.size ? `(${item.size})` : '', item.addOns.length ? `+ ${item.addOns.join('، ')}` : ''].filter(Boolean).join(' ')
      amountRow(`${item.quantity} × ${item.name}${extras ? ` ${extras}` : ''}`, formatRs(item.lineTotal), 20)
    }
    line(0, 10)
  }

  line(0, 6)
  amountRow(text.subtotal, formatRs(receipt.subtotal), 20)
  if (Number.parseFloat(receipt.discount) > 0) amountRow(text.discount, `− ${formatRs(receipt.discount)}`, 20)
  amountRow(text.total, formatRs(receipt.total), 28, 800)

  if (receipt.shares.length > 0) {
    line(0, 14)
    push({ text: text.shares, size: 18, weight: 700, side: 'start', color: 'muted' })
    line(18, 4)
    for (const share of receipt.shares) amountRow(`${share.label} · ${text.method(share.method)}`, formatRs(share.amount), 20)
  }
  line(0, 18)
  push({ text: text.thanks, size: 22, weight: 700, side: 'center', color: 'action' })
  line(22)
  if (text.demo) {
    push({ text: text.demo, size: 16, weight: 400, side: 'center', color: 'muted' })
    line(16)
  }
  return { ops, height: Math.ceil(y + PAD) }
}

/** The receipt as a PNG blob. `rtl` draws the words right-to-left (Urdu); amounts always read left-to-right. */
export async function receiptImage(receipt: ReceiptSnapshot, text: ReceiptImageText, rtl: boolean): Promise<Blob> {
  const family = rtl ? cssVar('--font-urdu') : cssVar('--font-sans')
  const numbers = cssVar('--font-sans')
  try {
    await document.fonts.ready
    await document.fonts.load(`20px ${family}`, rtl ? 'اردو' : 'Rs')
  } catch {
    /* draw with whatever font is there */
  }
  const lineHeight = rtl ? 2 : 1.45
  const font = (op: Pick<Op, 'size' | 'weight' | 'ltr'>) => `${op.weight} ${op.size}px ${op.ltr ? numbers : family}`

  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('Canvas is not available')
  const measure = (op: Pick<Op, 'text' | 'size' | 'weight' | 'ltr'>) => {
    probe.font = font(op)
    return probe.measureText(op.text).width
  }
  const { ops, height } = layout(receipt, text, measure, lineHeight)

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = cssVar('--color-surface')
  ctx.fillRect(0, 0, WIDTH, height)
  const colors = { ink: cssVar('--color-ink'), muted: cssVar('--color-muted'), action: cssVar('--color-action') }
  ctx.textBaseline = 'top'
  for (const op of ops) {
    ctx.font = font(op)
    ctx.fillStyle = colors[op.color]
    const textRtl = rtl && !op.ltr
    ctx.direction = textRtl ? 'rtl' : 'ltr'
    // The page's start edge is the right one in Urdu.
    const startX = rtl ? WIDTH - PAD : PAD
    const endX = rtl ? PAD : WIDTH - PAD
    if (op.side === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(op.text, WIDTH / 2, op.y)
    } else {
      const x = op.side === 'start' ? startX : endX
      ctx.textAlign = x === PAD ? 'left' : 'right'
      ctx.fillText(op.text, x, op.y)
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image'))), 'image/png'))
}

/** Hands the image to the phone's share sheet where it can take files, else downloads it. */
export async function saveImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      /* fall back to a download */
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
