import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { joinTable, type JoinResult, type TableLookup } from '../../api/table'
import { Field, inputClass } from '../../components/checkout/Field'
import { Fill } from '../../components/Fill'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui/Button'
import { vibrate } from '../../lib/haptics'
import { loadDetails, saveDetails } from '../../lib/savedDetails'
import { useIsPhone } from '../../lib/useAppMode'
import { uuid } from '../../lib/uuid'
import { useT } from '../../i18n'
import { tableLabel } from './TableContext'
import { isClosedRefusal, tableErrorText } from './tableErrors'

/** The server's display-name limit (1-30 after trimming). */
const MAX_NAME = 30
const cleanName = (value: string) => value.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim()

/**
 * Join an open table: a display name (the one saved on this phone, if any) and the 4-digit PIN when the restaurant
 * asks for one. One joinRequestId per attempt: kept when the answer got lost (so a retry returns the same guest), new
 * after any real refusal.
 */
export function JoinSheet({
  qrKey,
  lookup,
  onJoined,
  onClose,
  onRefused,
}: {
  qrKey: string
  lookup: TableLookup
  onJoined: (result: JoinResult) => void
  onClose: () => void
  /** The table stopped being joinable meanwhile: look it up again. */
  onRefused: () => void
}) {
  const { t } = useT()
  const phone = useIsPhone()
  const nameId = useId()
  const pinId = useId()
  const [name, setName] = useState(() => (loadDetails().name ?? '').slice(0, MAX_NAME))
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [pinError, setPinError] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<string | null>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const displayName = cleanName(name)
    setNameError(displayName ? null : t('table.join.nameNeeded'))
    const pinOk = !lookup.requiresPin || /^\d{4}$/.test(pin)
    setPinError(pinOk ? null : t('table.join.pinNeeded'))
    if (!displayName || !pinOk) return
    attempt.current ??= uuid()
    setBusy(true)
    setError(null)
    try {
      const result = await joinTable(qrKey, { displayName, joinRequestId: attempt.current, ...(lookup.requiresPin ? { pin } : {}) })
      saveDetails({ name: displayName })
      vibrate(15)
      onJoined(result)
    } catch (err) {
      const lost = err instanceof ApiError && err.status === 0
      if (!lost) attempt.current = null
      if (err instanceof ApiError && err.code === 'BAD_PIN') {
        const left = typeof err.details.attemptsLeft === 'number' ? err.details.attemptsLeft : null
        setPinError(left === null ? t('table.join.badPin') : <Fill text={t('table.join.badPinLeft')} values={{ n: String(left) }} />)
        setPin('')
        pinRef.current?.focus()
      } else if (err instanceof ApiError && err.code === 'PIN_LOCKED') {
        setPin('')
        setPinError(t('table.e.pinLocked'))
      } else {
        if (isClosedRefusal(err)) onRefused()
        setError(tableErrorText(err, t))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={t('table.join.title')}
      onClose={onClose}
      draggable={phone}
      footer={
        <Button type="submit" form="join-form" size="lg" className="w-full" disabled={busy} aria-busy={busy || undefined}>
          <Icon name="users" />
          <span>{busy ? t('table.join.joining') : t('table.join.cta')}</span>
        </Button>
      }
    >
      <form id="join-form" noValidate onSubmit={(event) => void submit(event)} className="space-y-4 pb-2">
        <p className="text-lg">
          <Fill text={t('table.join.body')} values={{ table: tableLabel(lookup.table) }} />
        </p>
        <Field id={nameId} label={t('table.join.name')} hint={t('table.join.nameHint')} error={nameError}>
          <input
            id={nameId}
            value={name}
            maxLength={MAX_NAME}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint={lookup.requiresPin ? 'next' : 'go'}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : `${nameId}-hint`}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && lookup.requiresPin) {
                event.preventDefault()
                pinRef.current?.focus()
              }
            }}
            className={`${inputClass} ${nameError ? 'border-error' : 'border-muted'}`}
          />
        </Field>
        {lookup.requiresPin && (
          <Field id={pinId} label={t('table.join.pin')} hint={t('table.join.pinHint')} error={pinError}>
            <input
              id={pinId}
              ref={pinRef}
              value={pin}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="one-time-code"
              enterKeyHint="go"
              aria-invalid={pinError ? true : undefined}
              aria-describedby={pinError ? `${pinId}-error` : `${pinId}-hint`}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              dir="ltr"
              className={`${inputClass} num w-40 text-center text-2xl tracking-widest ${pinError ? 'border-error' : 'border-muted'}`}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 font-bold text-error">
            <Icon name="alert" className="mt-1 size-5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Sheet>
  )
}
