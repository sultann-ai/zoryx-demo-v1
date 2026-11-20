import { ApiError } from '../../api/client'
import type { TableClosedReason } from '../../api/table'
import type { TranslationKey } from '../../i18n'

// Plain words for every refusal of the table QR routes (backend tableGuest.controller / tableGuest.service). Keep in
// step with the codes there.
const COMMON: Partial<Record<string, TranslationKey>> = {
  ORDERING_CLOSED: 'table.e.closed',
  QR_DISABLED: 'table.e.qrOff',
  TABLE_UNAVAILABLE: 'table.e.unavailable',
  TABLE_CLOSED: 'table.e.notSeated',
  ITEM_UNAVAILABLE: 'table.e.itemGone',
  ORDER_TOO_LARGE: 'table.e.tooLarge',
  REQUEST_ID_REUSED: 'table.e.again',
  NOT_CANCELLABLE: 'table.e.notCancellable',
  NOT_OPEN: 'table.e.callDone',
  NOT_FOUND: 'table.e.notFound',
  BAD_REQUEST: 'table.e.bad',
  SESSION_FULL: 'table.e.full',
  PIN_LOCKED: 'table.e.pinLocked',
  BAD_PIN: 'table.e.badPin',
  COOLDOWN: 'table.e.wait',
  TOO_MANY: 'table.e.tooMany',
  SESSION_ENDED: 'table.e.ended',
  SESSION_HAS_OPEN_ORDERS: 'table.e.openOrders',
  // The bill (phase 2)
  BILL_LOCKED: 'table.e.billLocked',
  BILL_CHANGED: 'table.e.billChanged',
  BILL_NOT_REQUESTED: 'table.e.billNotRequested',
  BILL_PAID: 'table.e.billPaid',
  NOTHING_TO_BILL: 'table.e.nothingToBill',
  ORDERS_AWAITING: 'table.e.ordersAwaiting',
  SPLIT_HAS_PAYMENTS: 'table.e.splitHasPayments',
  SPLIT_SUM_MISMATCH: 'table.e.sumMismatch',
  NOT_BY_ITEMS: 'table.e.billChanged',
  NOBODY_TO_SHARE: 'table.e.nobodyToShare',
  SHARE_TAKEN: 'table.e.shareTaken',
  NOT_YOUR_SHARE: 'table.e.notYourShare',
  NOT_AWAITING_PAYMENT: 'table.e.notAwaitingPayment',
  SESSION_NOT_OPEN: 'table.e.billPaid',
}

/**
 * What to tell the guest. A rate-limit refusal (429, other than a cooldown, which the screens count down themselves)
 * shows the server's own sentence exactly as it came. `overrides` swaps the wording of a code for one screen.
 */
export function tableErrorText(error: unknown, t: (key: TranslationKey) => string, overrides: Partial<Record<string, TranslationKey>> = {}): string {
  if (!(error instanceof ApiError)) return t('err.generic')
  if (error.status === 0) return t('err.network')
  const override = error.code ? overrides[error.code] : undefined
  if (override) return t(override)
  if (error.status === 429 && error.code !== 'COOLDOWN') return error.message || t('err.busy')
  const key = error.code ? COMMON[error.code] : undefined
  return t(key ?? 'err.generic')
}

/** Seconds the server asked us to wait (429 COOLDOWN), else 0. */
export const retryAfter = (error: unknown): number =>
  error instanceof ApiError && error.code === 'COOLDOWN' && typeof error.details.retryAfterSeconds === 'number' ? error.details.retryAfterSeconds : 0

/** A refusal that means the table can't take this right now (switched off, day over, table unavailable). */
export const isClosedRefusal = (error: unknown): boolean =>
  error instanceof ApiError && ['ORDERING_CLOSED', 'QR_DISABLED', 'TABLE_UNAVAILABLE', 'TABLE_CLOSED'].includes(error.code ?? '')

/** Why the table can't take orders, in the guest's words (the title and the line under it). */
export const CLOSED_TEXT: Record<TableClosedReason, { title: TranslationKey; body: TranslationKey; icon: 'clock' | 'alert' | 'users' }> = {
  not_seated: { title: 'table.closed.not_seated', body: 'table.closed.not_seatedBody', icon: 'users' },
  no_business_day: { title: 'table.closed.no_business_day', body: 'table.closed.no_business_dayBody', icon: 'clock' },
  qr_disabled: { title: 'table.closed.qr_disabled', body: 'table.closed.qr_disabledBody', icon: 'alert' },
  unavailable: { title: 'table.closed.unavailable', body: 'table.closed.unavailableBody', icon: 'alert' },
}
