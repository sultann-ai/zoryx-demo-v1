import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { createGuestOrder, type GuestOrderBody } from '../../api/orders'
import { useStore } from '../../api/store'
import { useCart } from '../../cart/context'
import { useResolvedCart } from '../../cart/pricing'
import { phoneHref } from '../../lib/config'
import { formatRs } from '../../lib/format'
import { vibrate } from '../../lib/haptics'
import { useIsPhone } from '../../lib/useAppMode'
import { saveLastOrder } from '../../lib/lastOrder'
import { addOrderToHistory } from '../../lib/orderHistory'
import { pick } from '../../lib/localized'
import { clearDetails, loadDetails, saveDetails } from '../../lib/savedDetails'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT, type TranslationKey } from '../../i18n'
import { Fill } from '../Fill'
import { AppState } from '../mobile/AppState'
import { Icon, type IconName } from '../Icon'
import { Sheet } from '../Sheet'
import { Field, FieldError, inputClass } from './Field'
import { Button, ButtonLink } from '../ui/Button'

type PayMethod = 'CASH' | 'ONLINE'
/** Sentinel areaId for "my area isn't listed": the customer types it and staff confirm the fee by phone. */
const OTHER_AREA = '__other__'
type FieldName = 'name' | 'phone' | 'areaId' | 'house' | 'street' | 'landmark' | 'notes' | 'pay'

interface Values {
  name: string
  phone: string
  areaId: string
  otherArea: string
  house: string
  street: string
  landmark: string
  notes: string
  pay: PayMethod | null
}

type Failure =
  | { kind: 'network' }
  | { kind: 'code'; code: string; minOrderAmount?: string }
  | { kind: 'generic' }

const PHONE = /^(?:\+92|92|0)(3\d{9})$/
const compactPhone = (raw: string) => raw.replace(/[\s-]/g, '')

function validate(v: Values, areaOk: boolean): Partial<Record<FieldName, TranslationKey>> {
  const errors: Partial<Record<FieldName, TranslationKey>> = {}
  const name = v.name.trim()
  if (name.length < 2) errors.name = 'v.name'
  else if (name.length > 60) errors.name = 'v.tooLong'
  if (!PHONE.test(compactPhone(v.phone))) errors.phone = 'v.phone'
  if (v.areaId === OTHER_AREA) {
    const other = v.otherArea.trim()
    if (other.length < 2) errors.areaId = 'v.otherArea'
    else if (other.length > 60) errors.areaId = 'v.tooLong'
  } else if (!areaOk) errors.areaId = 'v.area'
  if (v.house.trim().length < 1) errors.house = 'v.house'
  else if (v.house.trim().length > 60) errors.house = 'v.tooLong'
  if (v.street.trim().length < 2) errors.street = 'v.street'
  else if (v.street.trim().length > 120) errors.street = 'v.tooLong'
  if (v.landmark.trim().length > 100) errors.landmark = 'v.tooLong'
  if (v.notes.trim().length > 200) errors.notes = 'v.tooLong'
  if (v.pay === null) errors.pay = 'v.pay'
  return errors
}

const FIELD_ORDER: FieldName[] = ['name', 'phone', 'areaId', 'house', 'street', 'landmark', 'notes', 'pay']

/** Full-screen, single scrolling checkout. Mounted only while open. */
export function CheckoutSheet({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT()
  const cart = useCart()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const store = useStore()
  const phoneNumber = useShopPhone()
  const { lines, total: subtotal } = useResolvedCart()
  // Phones: a full-bleed page (back arrow, sticky Place order), a collapsed summary on top, keyboard-friendly fields.
  const phone = useIsPhone()
  const [typing, setTyping] = useState(false)

  const [saved] = useState(loadDetails)
  const [values, setValues] = useState<Values>({
    name: saved.name ?? '',
    phone: saved.phone ?? '',
    areaId: saved.areaId ?? '',
    otherArea: '',
    house: saved.house ?? '',
    street: saved.street ?? '',
    landmark: saved.landmark ?? '',
    notes: '',
    pay: null,
  })
  const [hasSaved, setHasSaved] = useState(Object.keys(saved).length > 0)
  const [honeypot, setHoneypot] = useState('')
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverPhoneBad, setServerPhoneBad] = useState(false)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const sendingRef = useRef(false)

  const areas = store.data?.deliveryAreas ?? []
  // A remembered area that no longer exists is simply "not chosen".
  const area = areas.find((a) => a.id === values.areaId) ?? null
  const isOther = values.areaId === OTHER_AREA
  const fee = area ? Number.parseFloat(area.deliveryFee) || 0 : 0
  const total = subtotal + fee
  const min = area?.minOrderAmount ? Number.parseFloat(area.minOrderAmount) || 0 : 0
  const shortBy = area && subtotal < min ? min - subtotal : 0
  const areaName = area ? (pick(lang, area.nameEn, area.nameUr) ?? area.nameEn) : ''

  const errors = validate(values, area !== null)
  const shown = (field: FieldName): string | null => {
    if (field === 'phone' && serverPhoneBad) return t('v.phone')
    const key = errors[field]
    return key && (submitted || touched[field]) ? t(key) : null
  }
  const touch = (field: FieldName) => setTouched((current) => ({ ...current, [field]: true }))
  const set = <K extends keyof Values>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (field === 'phone') setServerPhoneBad(false)
  }

  const fail = (next: Failure) => setFailure(next)

  async function place() {
    if (sendingRef.current) return
    setSubmitted(true)
    setServerPhoneBad(false)
    const firstBad = FIELD_ORDER.find((f) => errors[f])
    if (firstBad) {
      const el = document.getElementById(`co-${firstBad}`)
      el?.focus()
      el?.scrollIntoView({ block: 'center' })
      return
    }
    if (shortBy > 0 || (!area && !isOther) || lines.length === 0 || values.pay === null) return

    const body: GuestOrderBody = {
      // One id per cart, kept across retries, so a double tap or a dropped connection can never make two orders.
      clientRequestId: cart.ensureRequestId(),
      orderType: 'DELIVERY',
      items: lines
        .filter((l) => l.line.kind === 'item')
        .map((l) => ({
          menuItemId: l.line.id,
          quantity: l.line.qty,
          ...(l.line.variantId ? { variantId: l.line.variantId } : {}),
          ...(l.line.addOnIds.length > 0 ? { addOnIds: l.line.addOnIds } : {}),
        })),
      deals: lines.filter((l) => l.line.kind === 'deal').map((l) => ({ dealId: l.line.id, quantity: l.line.qty })),
      customer: {
        name: values.name.trim(),
        phone: compactPhone(values.phone),
        ...(area ? { deliveryAreaId: area.id } : { otherArea: values.otherArea.trim() }),
        house: values.house.trim(),
        street: values.street.trim(),
        ...(values.landmark.trim() ? { landmark: values.landmark.trim() } : {}),
      },
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      paymentMethod: values.pay,
      website: honeypot,
    }

    sendingRef.current = true
    setSending(true)
    setFailure(null)
    try {
      const result = await createGuestOrder(body)
      saveDetails({
        name: values.name.trim(),
        phone: compactPhone(values.phone),
        areaId: area?.id ?? '',
        house: values.house.trim(),
        street: values.street.trim(),
        landmark: values.landmark.trim(),
      })
      saveLastOrder({ code: result.publicCode, publicId: result.publicId, lines: cart.lines })
      addOrderToHistory({
        code: result.publicCode,
        publicId: result.publicId,
        total: result.total,
        items: lines.map((l) => ({ n: l.name, u: l.nameUr, q: l.line.qty })),
        lines: cart.lines,
      })
      cart.clear()
      // replace: the sheet's own history entry becomes the order page, so Back goes to the menu, not to a dead sheet
      vibrate([15, 40, 25]) // order placed: a short double tick where the phone supports it
      navigate(`/order/${result.publicId}`, { replace: true })
    } catch (error) {
      handleError(error)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function handleError(error: unknown) {
    if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) return fail({ kind: 'network' })
    switch (error.code) {
      case 'BAD_PHONE':
        setServerPhoneBad(true)
        document.getElementById('co-phone')?.focus()
        return fail({ kind: 'code', code: 'BAD_PHONE' })
      case 'BAD_AREA':
        set('areaId', '')
        void queryClient.invalidateQueries({ queryKey: ['store'] })
        return fail({ kind: 'code', code: 'BAD_AREA' })
      case 'ITEM_UNAVAILABLE':
        void queryClient.invalidateQueries({ queryKey: ['menu'] })
        void queryClient.invalidateQueries({ queryKey: ['deals'] })
        return fail({ kind: 'code', code: 'ITEM_UNAVAILABLE' })
      case 'REQUEST_ID_REUSED':
        cart.resetRequestId()
        return fail({ kind: 'code', code: 'REQUEST_ID_REUSED' })
      case 'ORDERING_CLOSED':
      case 'TOO_MANY':
      case 'ORDER_TOO_LARGE':
      case 'BAD_REQUEST':
        return fail({ kind: 'code', code: error.code })
      case 'BELOW_MINIMUM': {
        const raw = error.details.minOrderAmount
        return fail({ kind: 'code', code: 'BELOW_MINIMUM', minOrderAmount: typeof raw === 'string' ? raw : undefined })
      }
      default:
        return fail({ kind: 'generic' })
    }
  }

  const hours = store.data && pick(lang, store.data.settings.openingHoursEn, store.data.settings.openingHoursUr)

  const failureText = (f: Failure): string => {
    if (f.kind === 'network') return t('e.network')
    if (f.kind === 'generic') return t('err.generic')
    switch (f.code) {
      case 'ORDERING_CLOSED':
        return `${t('e.closed')}${hours ? ` ${t('home.hoursLabel')}: ${hours}` : ''}`
      case 'TOO_MANY':
        return t('e.tooMany')
      case 'BAD_PHONE':
        return t('v.phone')
      case 'BELOW_MINIMUM':
        return t('e.belowMin').replace('{min}', formatRs(f.minOrderAmount ?? min))
      case 'BAD_AREA':
        return t('e.badArea')
      case 'ITEM_UNAVAILABLE':
        return t('e.unavailable')
      case 'ORDER_TOO_LARGE':
        return t('e.tooLarge')
      case 'REQUEST_ID_REUSED':
        return t('e.reused')
      default:
        return t('e.badRequest')
    }
  }

  const clearSaved = () => {
    clearDetails()
    setHasSaved(false)
    setValues((c) => ({ ...c, name: '', phone: '', areaId: '', otherArea: '', house: '', street: '', landmark: '' }))
  }

  // Delivery-area pills with the fee under each: selected = filled orange. An invalid group gets an error outline (and the message below it).
  const radio = (on: boolean, invalid: boolean) =>
    `rounded-tile border-2 px-4 py-2 text-center transition-colors ${on ? 'border-action bg-action text-on-action' : invalid ? 'border-error bg-surface' : 'border-transparent bg-surface shadow-soft'}`
  // Payment options: large white cards, selected = orange border and a check.
  const payCard = (on: boolean, invalid: boolean) =>
    `rounded-card border-2 bg-surface px-4 py-3 text-start shadow-soft transition-colors ${on ? 'border-action' : invalid ? 'border-error' : 'border-transparent'}`
  const summaryList = (
    <ul className={`divide-y divide-ink/10 px-4 ${phone ? '' : 'card'}`}>
                {lines.map((l) => (
                  <li key={l.key} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      <span dir="ltr">{l.line.qty} ×</span> {pick(lang, l.name, l.nameUr) ?? l.name}
                      {l.variantLabel && <span className="text-sm text-muted"> ({l.variantLabel})</span>}
                      {l.addOns.length > 0 && <span className="block text-sm text-muted">+ {l.addOns.map((a) => a.name).join('، ')}</span>}
                    </span>
                    <span dir="ltr" className="shrink-0 font-bold">
                      {formatRs(l.total)}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between py-2">
                  <span>{t('cart.subtotal')}</span>
                  <span dir="ltr" className="font-bold">
                    {formatRs(subtotal)}
                  </span>
                </li>
                <li className="flex justify-between py-2">
                  <span>{t('checkout.deliveryFee')}</span>
                  {area ? (
                    <span dir="ltr" className="font-bold">
                      {fee > 0 ? formatRs(fee) : t('checkout.freeDelivery')}
                    </span>
                  ) : isOther ? (
                    <span className="text-sm text-muted">{t('checkout.otherFee')}</span>
                  ) : (
                    <span className="text-sm text-muted">{t('checkout.chooseArea')}</span>
                  )}
                </li>
                <li className="flex justify-between py-2 text-xl font-bold">
                  <span>{t('checkout.total')}</span>
                  <span dir="ltr" className="text-ink">
                    {formatRs(total)}
                  </span>
                </li>
              </ul>
  )
  // Phones: the focused field scrolls to the middle of what is left above the keyboard, and Enter / Next moves on.
  function onFieldFocus(event: FocusEvent<HTMLFormElement>) {
    const el = event.target
    if (!phone || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
    setTyping(true) // the shell scrolls the field into view once the keyboard has resized the screen
  }
  const NEXT_FIELDS = ['co-name', 'co-phone', 'co-otherArea', 'co-house', 'co-street', 'co-landmark', 'co-notes']
  function onFieldKey(event: KeyboardEvent<HTMLFormElement>) {
    const el = event.target as HTMLElement
    if (!phone || event.key !== 'Enter' || el.tagName !== 'INPUT') return
    event.preventDefault() // Enter is "Next", not "submit"
    for (let i = NEXT_FIELDS.indexOf(el.id) + 1; i > 0 && i < NEXT_FIELDS.length; i++) {
      const next = document.getElementById(NEXT_FIELDS[i])
      if (next) return next.focus()
    }
  }
  const closedNow = store.data ? !store.data.orderingOpen : false
  const closedKey = (store.data?.closedReason ? `home.closed.${store.data.closedReason}` : 'home.closed.unknown') as TranslationKey
  const hasErrors = submitted && FIELD_ORDER.some((f) => errors[f])
  const showCallButton = failure && (failure.kind === 'network' || failure.kind === 'generic' || (failure.kind === 'code' && ['TOO_MANY', 'ORDER_TOO_LARGE', 'ORDERING_CLOSED'].includes(failure.code)))

  // The shop closed while the page was open: a calm full-screen state instead of a form that cannot be sent.
  if (phone && closedNow) {
    return (
      <Sheet fullscreen page title={t('checkout.title')} onClose={onClose}>
        <AppState icon="clock" tone="warning" role="status" title={t('state.closedTitle')} body={`${t(closedKey)}. ${t('menu.closedBody')}${hours ? ` ${t('home.hoursLabel')}: ${hours}` : ''}`}>
          <Button onClick={onClose}>{t('footer.menu')}</Button>
          <ButtonLink href={phoneHref(phoneNumber)} variant="secondary" className="text-ink">
            <Icon name="phone" />
            <span dir="ltr">{phoneNumber}</span>
          </ButtonLink>
        </AppState>
      </Sheet>
    )
  }

  return (
    <Sheet
      fullscreen
      page={phone}
      title={t('checkout.title')}
      onClose={onClose}
      footer={
        <div className="mx-auto max-w-xl space-y-2">
          {/* With the keyboard up the bar shrinks to the button (the total is on screen again once it closes). */}
          <div className={`items-center justify-between text-xl font-bold ${phone && typing ? 'hidden' : 'flex'}`}>
            <span>{t('checkout.total')}</span>
            <span dir="ltr" className="text-ink">
              {formatRs(total)}
            </span>
          </div>
          {shortBy > 0 && (
            <FieldError message={<Fill text={t('checkout.moreNeeded')} values={{ area: areaName, min: formatRs(min), more: formatRs(shortBy) }} />} />
          )}
          {hasErrors && <FieldError message={t('checkout.fixErrors')} />}
          {failure && !(failure.kind === 'code' && failure.code === 'BAD_PHONE') && (
            <div role="alert" className="space-y-2 rounded-card border border-error bg-surface p-3">
              <p className="flex items-start gap-2 font-bold text-error">
                <Icon name="alert" className="mt-2 size-5" />
                <span>{failureText(failure)}</span>
              </p>
              {showCallButton && (
                <ButtonLink href={phoneHref(phoneNumber)} variant="secondary" className="w-full text-ink">
                  <Icon name="phone" />
                  <span>{t('e.networkCall')}</span>
                  <span dir="ltr">{phoneNumber}</span>
                </ButtonLink>
              )}
            </div>
          )}
          <Button
            size="lg"
            onClick={() => void place()}
            disabled={sending || shortBy > 0 || lines.length === 0}
            className="w-full whitespace-nowrap"
          >
            {sending ? (
              <>
                <span aria-hidden="true" className="size-6 animate-spin rounded-full border-4 border-on-action/40 border-t-on-action" />
                <span>{t('checkout.sending')}</span>
              </>
            ) : failure && (failure.kind === 'network' || failure.kind === 'generic') ? (
              <>
                <Icon name="check" />
                <span>{t('err.retry')}</span>
              </>
            ) : (
              <>
                <Icon name="check" />
                <span>{t('checkout.place')}</span>
              </>
            )}
          </Button>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void place()
        }}
        onFocus={onFieldFocus}
        onBlur={() => phone && setTyping(false)}
        onKeyDown={onFieldKey}
        className="relative mx-auto max-w-xl space-y-8 pb-4"
      >
        {/* Honeypot: invisible, skipped by keyboard and screen readers. A bot that fills it gets a fake success. */}
        <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        {/* 1. Your order: a collapsed card at the top on phones (count and total in the summary line), the full list otherwise */}
        <section aria-labelledby="co-h-order" className="space-y-3">
          {phone ? (
            <details className="group card">
              <summary id="co-h-order" className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-bold">
                <span className="min-w-0">
                  {t('checkout.summary')} <span className="font-normal text-muted">(<span dir="ltr">{cart.count}</span>)</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span dir="ltr">{formatRs(total)}</span>
                  <Icon name="arrow" className="size-5 rotate-90 transition-transform group-open:-rotate-90" />
                </span>
              </summary>
              {lines.length === 0 ? <p className="px-4 pb-3">{t('checkout.emptyCart')}</p> : summaryList}
            </details>
          ) : (
            <>
              <h3 id="co-h-order" className="text-xl">
                {t('cart.title')}
              </h3>
              {lines.length === 0 ? <p>{t('checkout.emptyCart')}</p> : summaryList}
            </>
          )}
        </section>

        {/* 2. Your details */}
        <section aria-labelledby="co-h-details" className="card space-y-5 p-4">
          <h3 id="co-h-details" className="text-xl">
            {t('checkout.details')}
          </h3>
          <Field id="co-name" label={t('checkout.name')} error={shown('name')}>
            <input
              id="co-name"
              className={`${inputClass} ${shown('name') ? 'border-error' : 'border-muted'}`}
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              maxLength={80}
              value={values.name}
              aria-invalid={!!shown('name')}
              aria-describedby={shown('name') ? 'co-name-error' : undefined}
              aria-required={true}
              onChange={(e) => set('name', e.target.value)}
              onBlur={() => touch('name')}
            />
          </Field>
          <Field id="co-phone" label={t('checkout.phone')} error={shown('phone')}>
            <input
              id="co-phone"
              dir="ltr"
              className={`${inputClass} text-start ${shown('phone') ? 'border-error' : 'border-muted'}`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="next"
              placeholder={t('checkout.phonePh')}
              maxLength={20}
              value={values.phone}
              aria-invalid={!!shown('phone')}
              aria-describedby={shown('phone') ? 'co-phone-error' : undefined}
              aria-required={true}
              onChange={(e) => set('phone', e.target.value)}
              onBlur={() => touch('phone')}
            />
          </Field>

          <div className="space-y-2">
            <p id="co-area-label" className="font-bold text-ink">
              {t('checkout.area')}
            </p>
            <div
              id="co-areaId"
              tabIndex={-1}
              role="radiogroup"
              aria-labelledby="co-area-label"
              aria-required="true"
              aria-describedby={shown('areaId') ? 'co-areaId-error' : undefined}
              className="grid grid-cols-2 gap-2 max-[339px]:grid-cols-1"
            >
              {areas.map((a) => {
                const on = a.id === area?.id
                const feeNum = Number.parseFloat(a.deliveryFee) || 0
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      set('areaId', a.id)
                      touch('areaId')
                    }}
                    className={`min-h-16 ${radio(on, !!shown('areaId'))}`}
                  >
                    <span className="block font-bold leading-snug">{pick(lang, a.nameEn, a.nameUr)}</span>
                    <span className="block text-sm text-current" dir="ltr">
                      {feeNum > 0 ? `${t('checkout.delivery')} ${formatRs(feeNum)}` : t('checkout.freeDelivery')}
                    </span>
                  </button>
                )
              })}
              <button
                type="button"
                role="radio"
                aria-checked={isOther}
                onClick={() => {
                  set('areaId', OTHER_AREA)
                  touch('areaId')
                }}
                className={`min-h-16 ${radio(isOther, !!shown('areaId') && !isOther)}`}
              >
                <span className="block font-bold leading-snug">{t('checkout.otherArea')}</span>
                <span className="block text-sm">{t('checkout.otherFee')}</span>
              </button>
            </div>
            {isOther && (
              <input
                id="co-otherArea"
                className={`${inputClass} ${shown('areaId') ? 'border-error' : 'border-muted'}`}
                type="text"
                enterKeyHint="next"
                maxLength={60}
                placeholder={t('checkout.otherAreaPlaceholder')}
                value={values.otherArea}
                aria-label={t('checkout.otherArea')}
                aria-invalid={!!shown('areaId')}
                aria-describedby={shown('areaId') ? 'co-areaId-error' : undefined}
                onChange={(e) => set('otherArea', e.target.value)}
                onBlur={() => touch('areaId')}
              />
            )}
            <FieldError id="co-areaId-error" message={shown('areaId')} />
          </div>

          <Field id="co-house" label={t('checkout.house')} error={shown('house')}>
            <input
              id="co-house"
              className={`${inputClass} ${shown('house') ? 'border-error' : 'border-muted'}`}
              type="text"
              autoComplete="address-line1"
              enterKeyHint="next"
              maxLength={80}
              value={values.house}
              aria-invalid={!!shown('house')}
              aria-describedby={shown('house') ? 'co-house-error' : undefined}
              aria-required={true}
              onChange={(e) => set('house', e.target.value)}
              onBlur={() => touch('house')}
            />
          </Field>
          <Field id="co-street" label={t('checkout.street')} error={shown('street')}>
            <input
              id="co-street"
              className={`${inputClass} ${shown('street') ? 'border-error' : 'border-muted'}`}
              type="text"
              autoComplete="address-line2"
              enterKeyHint="next"
              maxLength={140}
              value={values.street}
              aria-invalid={!!shown('street')}
              aria-describedby={shown('street') ? 'co-street-error' : undefined}
              aria-required={true}
              onChange={(e) => set('street', e.target.value)}
              onBlur={() => touch('street')}
            />
          </Field>
          <Field id="co-landmark" label={t('checkout.landmark')} hint={t('checkout.landmarkHint')} error={shown('landmark')}>
            <input
              id="co-landmark"
              className={`${inputClass} ${shown('landmark') ? 'border-error' : 'border-muted'}`}
              type="text"
              autoComplete="off"
              enterKeyHint="next"
              maxLength={120}
              value={values.landmark}
              aria-describedby={shown('landmark') ? 'co-landmark-error' : 'co-landmark-hint'}
              onChange={(e) => set('landmark', e.target.value)}
              onBlur={() => touch('landmark')}
            />
          </Field>
          <Field id="co-notes" label={t('checkout.notes')} error={shown('notes')}>
            <textarea
              id="co-notes"
              rows={2}
              autoComplete="off"
              enterKeyHint="enter"
              className={`${inputClass} py-3 ${shown('notes') ? 'border-error' : 'border-muted'}`}
              maxLength={220}
              value={values.notes}
              aria-describedby={shown('notes') ? 'co-notes-error' : undefined}
              onChange={(e) => set('notes', e.target.value)}
              onBlur={() => touch('notes')}
            />
          </Field>
          {hasSaved && (
            <button type="button" onClick={clearSaved} className="min-h-touch text-base font-bold text-ink underline">
              {t('checkout.clearSaved')}
            </button>
          )}
        </section>

        {/* 3. How will you pay? */}
        <section aria-labelledby="co-h-pay" className="space-y-3">
          <h3 id="co-h-pay" className="text-xl">
            {t('checkout.pay')}
          </h3>
          <div
            id="co-pay"
            tabIndex={-1}
            role="radiogroup"
            aria-labelledby="co-h-pay"
            aria-required="true"
            aria-describedby={shown('pay') ? 'co-pay-error' : undefined}
            className="grid gap-2 sm:grid-cols-2"
          >
            {(
              [
                { value: 'CASH', icon: 'cash', title: 'checkout.cash', note: 'checkout.cashNote' },
                { value: 'ONLINE', icon: 'phone', title: 'checkout.online', note: 'checkout.onlineNote' },
              ] as { value: PayMethod; icon: IconName; title: TranslationKey; note: TranslationKey }[]
            ).map((option) => {
              const on = values.pay === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    set('pay', option.value)
                    touch('pay')
                  }}
                  className={`flex min-h-20 w-full items-center gap-3 ${payCard(on, !!shown('pay'))}`}
                >
                  <span className={`flex size-tap shrink-0 items-center justify-center rounded-full ${on ? 'bg-action text-on-action' : 'bg-band text-ink'}`}>
                    <Icon name={option.icon} className="size-7" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold leading-snug">{t(option.title)}</span>
                    <span className="block text-sm text-muted">{t(option.note)}</span>
                  </span>
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-action bg-action text-on-action' : 'border-muted text-transparent'}`}>
                    <Icon name="check" className="size-5" />
                  </span>
                </button>
              )
            })}
          </div>
          <FieldError id="co-pay-error" message={shown('pay')} />
        </section>
      </form>
    </Sheet>
  )
}
