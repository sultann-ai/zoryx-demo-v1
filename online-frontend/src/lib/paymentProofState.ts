// What the payment card shows, and how fast the status page polls while it waits. Pure, so it is unit-tested
// (paymentProofState.test.ts). The card's state comes from the SERVER's payment state; the only thing local is "a
// picture is being sent right now", which can never turn into "sent" by itself.

export type ServerPaymentState = 'NOT_REQUIRED' | 'WAITING_FOR_PAYMENT' | 'PROOF_RECEIVED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_PROBLEM'

export type ProofCardState =
  /** Cash: no card. */
  | 'NOT_REQUIRED'
  /** No proof yet: the payment steps and the upload button. */
  | 'NEEDS_PAYMENT'
  /** A picture is on its way (first proof, a replacement, or a new one after a rejection). */
  | 'UPLOADING'
  /** The counter has the proof and is checking it. */
  | 'WAITING'
  | 'VERIFIED'
  /** Staff turned the payment down; the reason is shown and a new screenshot can be sent. */
  | 'REJECTED'

export function proofCardState(server: ServerPaymentState, uploading: boolean): ProofCardState {
  switch (server) {
    case 'NOT_REQUIRED':
      return 'NOT_REQUIRED'
    case 'PAYMENT_CONFIRMED':
      return 'VERIFIED' // nothing is sent once it is confirmed
    case 'WAITING_FOR_PAYMENT':
      return uploading ? 'UPLOADING' : 'NEEDS_PAYMENT'
    case 'PROOF_RECEIVED':
      return uploading ? 'UPLOADING' : 'WAITING'
    case 'PAYMENT_PROBLEM':
      return uploading ? 'UPLOADING' : 'REJECTED'
  }
}

export const POLL_NORMAL_MS = 20_000
/** Faster while the counter is checking a proof; 12 requests in the first minute, far inside the 600 per 15 min status limit. */
export const POLL_FAST_MS = 5_000
export const FAST_WINDOW_MS = 60_000

/**
 * How long until the next status poll, or false for none. Stops for a finished order and for a hidden tab; polls fast for
 * the first minute of the waiting state, then at the normal rate. A confirmed payment goes back to the normal rate (the
 * order's own progress still needs it).
 */
export function orderPollMs(input: { final: boolean; visible: boolean; paymentState: ServerPaymentState | null; waitingForMs: number }): number | false {
  if (input.final || !input.visible) return false
  if (input.paymentState === 'PROOF_RECEIVED' && input.waitingForMs < FAST_WINDOW_MS) return POLL_FAST_MS
  return POLL_NORMAL_MS
}
