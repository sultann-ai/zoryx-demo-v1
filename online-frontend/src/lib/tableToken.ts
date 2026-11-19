// The guest's table token (from Join): sessionStorage, one per table's QR key, so it lives only as long as this tab and
// never outlives the visit on a shared phone. Sent only in the X-Table-Token header, never in a URL. Every access is
// guarded: with storage blocked the guest stays joined until the page reloads.
const PREFIX = 'zoryx:table-token:'
const TOKEN = /^[A-Za-z0-9_-]{43}$/

let memory: Record<string, string> = {}

export function readTableToken(qrKey: string): string | null {
  try {
    const value = sessionStorage.getItem(PREFIX + qrKey)
    if (value && TOKEN.test(value)) return value
  } catch {
    /* fall back to this page's memory */
  }
  return memory[qrKey] ?? null
}

export function saveTableToken(qrKey: string, token: string): void {
  memory = { ...memory, [qrKey]: token }
  try {
    sessionStorage.setItem(PREFIX + qrKey, token)
  } catch {
    /* kept in memory for this page */
  }
}

export function clearTableToken(qrKey: string): void {
  const rest = { ...memory }
  delete rest[qrKey]
  memory = rest
  try {
    sessionStorage.removeItem(PREFIX + qrKey)
  } catch {
    /* nothing stored */
  }
}

/** The table's own cart (ids + quantities + notes), next to the token in sessionStorage. */
export const tableCartKey = (qrKey: string): string => `zoryx:table-cart:${qrKey}`
