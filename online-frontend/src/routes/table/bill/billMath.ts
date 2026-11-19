import type { TableBill } from '../../../api/table'

// Display-only arithmetic for the split screen, in whole paisa (integers) so it never drifts. The server
// computes and checks every real amount; these only preview what it will answer and drive the
// "Rs X left to assign" bar.

export const toPaisa = (amount: string): number => Math.round(Number.parseFloat(amount) * 100)
export const fromPaisa = (paisa: number): string => (paisa / 100).toFixed(2)

/** EQUAL(n), as the server does it: shares 2..n get whole rupees rounded down, share 1 the rest (and any paisa). */
export function equalPreview(totalPaisa: number, parts: number): number[] {
  const base = Math.floor(totalPaisa / 100 / parts) * 100
  return Array.from({ length: parts }, (_, i) => (i === 0 ? totalPaisa - base * (parts - 1) : base))
}

/** By items: the table's own lines (staff added them for everyone) that nobody has ticked yet. */
export function unassignedPaisa(bill: TableBill): number {
  return bill.sharedLines
    .filter((line) => line.ownerName === null && line.claimedBy.length === 0)
    .reduce((sum, line) => sum + toPaisa(line.lineTotal), 0)
}

const FIRST = /^\d{1,7}(\.\d{1,2})?$/
const OTHER = /^\d{1,7}$/

/** A custom amount as typed: share 1 may carry paisa, every other share is whole rupees. Null = not a valid amount. */
export function parseCustomAmount(text: string, first: boolean): number | null {
  const value = text.trim()
  if (!(first ? FIRST : OTHER).test(value)) return null
  return Math.round(Number.parseFloat(value) * 100)
}
