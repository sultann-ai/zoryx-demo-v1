import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FAST_WINDOW_MS, orderPollMs, POLL_FAST_MS, POLL_NORMAL_MS, proofCardState } from './paymentProofState.ts'

describe('proofCardState (driven by the server state)', () => {
  it('maps every server state to its card', () => {
    assert.equal(proofCardState('NOT_REQUIRED', false), 'NOT_REQUIRED')
    assert.equal(proofCardState('WAITING_FOR_PAYMENT', false), 'NEEDS_PAYMENT')
    assert.equal(proofCardState('PROOF_RECEIVED', false), 'WAITING')
    assert.equal(proofCardState('PAYMENT_CONFIRMED', false), 'VERIFIED')
    assert.equal(proofCardState('PAYMENT_PROBLEM', false), 'REJECTED')
  })

  it('shows UPLOADING while a picture is going out (first proof, replacement, or after a rejection)', () => {
    for (const state of ['WAITING_FOR_PAYMENT', 'PROOF_RECEIVED', 'PAYMENT_PROBLEM'] as const) {
      assert.equal(proofCardState(state, true), 'UPLOADING', state)
    }
  })

  it('never shows UPLOADING for cash or a confirmed payment', () => {
    assert.equal(proofCardState('NOT_REQUIRED', true), 'NOT_REQUIRED')
    assert.equal(proofCardState('PAYMENT_CONFIRMED', true), 'VERIFIED')
  })

  it('falls back to the server state when the upload ends, so a failure is never a false "sent"', () => {
    // upload started from "needs payment", then failed: uploading goes false, the server still says WAITING_FOR_PAYMENT
    assert.equal(proofCardState('WAITING_FOR_PAYMENT', false), 'NEEDS_PAYMENT')
    // a failed replacement leaves the earlier, real proof showing as waiting
    assert.equal(proofCardState('PROOF_RECEIVED', false), 'WAITING')
  })
})

describe('orderPollMs', () => {
  const base = { final: false, visible: true, paymentState: null, waitingForMs: 0 } as const

  it('polls at the normal rate by default', () => {
    assert.equal(orderPollMs(base), POLL_NORMAL_MS)
    assert.equal(orderPollMs({ ...base, paymentState: 'WAITING_FOR_PAYMENT' }), POLL_NORMAL_MS)
  })

  it('polls every 5 s for the first minute of waiting, then at the normal rate', () => {
    assert.equal(orderPollMs({ ...base, paymentState: 'PROOF_RECEIVED', waitingForMs: 0 }), POLL_FAST_MS)
    assert.equal(orderPollMs({ ...base, paymentState: 'PROOF_RECEIVED', waitingForMs: FAST_WINDOW_MS - 1 }), POLL_FAST_MS)
    assert.equal(orderPollMs({ ...base, paymentState: 'PROOF_RECEIVED', waitingForMs: FAST_WINDOW_MS }), POLL_NORMAL_MS)
  })

  it('leaves the fast rate once the payment is confirmed or turned down', () => {
    assert.equal(orderPollMs({ ...base, paymentState: 'PAYMENT_CONFIRMED' }), POLL_NORMAL_MS)
    assert.equal(orderPollMs({ ...base, paymentState: 'PAYMENT_PROBLEM' }), POLL_NORMAL_MS)
  })

  it('stops for a finished order and for a hidden tab', () => {
    assert.equal(orderPollMs({ ...base, final: true, paymentState: 'PROOF_RECEIVED' }), false)
    assert.equal(orderPollMs({ ...base, visible: false, paymentState: 'PROOF_RECEIVED' }), false)
  })

  it('stays far inside the status limit (600 per 15 minutes) even at the fast rate', () => {
    const firstMinute = FAST_WINDOW_MS / POLL_FAST_MS
    const afterwards = (15 * 60_000 - FAST_WINDOW_MS) / POLL_NORMAL_MS
    assert.ok(firstMinute + afterwards < 600 / 4, 'a quarter of the budget at most, since a Wi-Fi IP is shared')
  })
})
