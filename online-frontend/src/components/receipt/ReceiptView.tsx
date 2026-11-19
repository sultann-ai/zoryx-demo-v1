import { useState } from 'react'
import type { ReceiptSnapshot } from '../../api/table'
import { LogoMark } from '../../brand/Logo'
import { copyText } from '../../lib/clipboard'
import { formatRs } from '../../lib/format'
import { pick } from '../../lib/localized'
import { receiptImage, saveImage } from '../../lib/receiptImage'
import { showToast } from '../../lib/toast'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'

/** The receipt's public address (the long random key is the only thing that opens it). */
const receiptUrl = (receiptKey: string): string => `${window.location.origin}/r/${receiptKey}`

const formatDateTime = (lang: 'ur' | 'en', iso: string) =>
  new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))

function Row({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? 'text-2xl font-bold' : ''}`}>
      <span className="min-w-0">{label}</span>
      <span dir="ltr" className="num shrink-0">
        {amount}
      </span>
    </div>
  )
}

/**
 * A table's receipt, the same for every guest (the snapshot made when the bill was paid). Prints as a clean page
 * ("Save as PDF" is the browser's print dialog with the print stylesheet), saves as an image drawn on a canvas,
 * and shares its link. No staff names, phone numbers, proofs or account numbers are ever in it.
 */
export function ReceiptView({ receipt, receiptKey }: { receipt: ReceiptSnapshot; receiptKey: string }) {
  const { t, lang } = useT()
  const [saving, setSaving] = useState(false)
  const shopName = pick(lang, receipt.shop.nameEn, receipt.shop.nameUr) ?? receipt.shop.nameEn
  const tableName = receipt.table.area ? `${receipt.table.name} · ${receipt.table.area}` : receipt.table.name
  const discount = Number.parseFloat(receipt.discount) > 0
  const method = (value: 'CASH' | 'ONLINE' | null) => (value === 'ONLINE' ? t('bill.method.online') : t('bill.method.cash'))
  // The canvas image has no <Fill>: the number goes into the drawn string (drawn as one run, so it stays in order).
  const orderTitle = (n: number, guest: string | null) => t('receipt.order').replace('{n}', String(n)) + (guest ? ` · ${guest}` : '')

  const save = async () => {
    setSaving(true)
    try {
      const blob = await receiptImage(
        receipt,
        {
          title: t('receipt.title'),
          table: tableName,
          order: orderTitle,
          subtotal: t('receipt.subtotal'),
          discount: t('receipt.discount'),
          total: t('receipt.total'),
          shares: t('receipt.paidBy'),
          method,
          issued: formatDateTime(lang, receipt.issuedAt),
          thanks: t('receipt.thanks'),
          demo: receipt.isDemo ? t('receipt.demo') : null,
        },
        lang === 'ur',
      )
      await saveImage(blob, `receipt-${receipt.table.name.replace(/\W+/g, '-')}.png`)
    } catch {
      showToast({ message: t('receipt.imageFailed'), kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const share = async () => {
    const url = receiptUrl(receiptKey)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('receipt.title'), url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    const ok = await copyText(url)
    showToast({ message: ok ? t('receipt.linkCopied') : t('toast.copyFailed'), kind: ok ? 'success' : 'error' })
  }

  return (
    <div className="space-y-4">
      <article aria-labelledby="receipt-h" className="receipt-paper card mx-auto max-w-md space-y-4 p-5">
        <header className="flex flex-col items-center gap-2 text-center">
          <LogoMark className="size-14 text-2xl" />
          <h1 id="receipt-h" className="text-h3 leading-tight">
            {shopName}
          </h1>
          {receipt.shop.addressEn && <p className="text-sm text-muted">{receipt.shop.addressEn}</p>}
          {receipt.shop.phone && (
            <p dir="ltr" className="text-sm text-muted">
              {receipt.shop.phone}
            </p>
          )}
          <p className="eyebrow">{t('receipt.title')}</p>
        </header>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-y border-dashed border-ink/25 py-2 text-base">
          <span className="font-bold">{tableName}</span>
          <span dir="ltr" className="text-muted">
            {formatDateTime(lang, receipt.issuedAt)}
          </span>
        </div>

        {receipt.orders.map((order) => (
          <section key={order.orderNumber} className="space-y-1">
            <h2 className="text-base font-bold text-muted">
              <Fill text={t('receipt.order')} values={{ n: String(order.orderNumber) }} />
              {order.guestName ? ` · ${order.guestName}` : ''}
            </h2>
            <ul className="space-y-1">
              {order.lines.map((line, i) => (
                <li key={i} className="flex items-start justify-between gap-4">
                  <span className="min-w-0 break-words">
                    <span dir="ltr" className="num">
                      {line.quantity} ×
                    </span>{' '}
                    {pick(lang, line.name, line.nameUr) ?? line.name}
                    {line.size && <span className="text-muted"> ({line.size})</span>}
                    {line.addOns.length > 0 && <span className="text-muted"> + {line.addOns.join('، ')}</span>}
                  </span>
                  <span dir="ltr" className="num shrink-0">
                    {formatRs(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="space-y-1 border-t border-dashed border-ink/25 pt-3">
          <Row label={t('receipt.subtotal')} amount={formatRs(receipt.subtotal)} />
          {discount && <Row label={t('receipt.discount')} amount={`− ${formatRs(receipt.discount)}`} />}
          <Row label={t('receipt.total')} amount={formatRs(receipt.total)} strong />
        </div>

        {receipt.shares.length > 0 && (
          <div className="space-y-1 border-t border-dashed border-ink/25 pt-3">
            <h2 className="text-base font-bold text-muted">{t('receipt.paidBy')}</h2>
            {receipt.shares.map((share, i) => (
              <Row key={i} label={`${share.label} · ${method(share.method)}`} amount={formatRs(share.amount)} />
            ))}
          </div>
        )}

        <footer className="space-y-1 text-center">
          <p className="text-lg font-bold text-accent">{t('receipt.thanks')}</p>
          {receipt.isDemo && <p className="text-sm text-muted">{t('receipt.demo')}</p>}
          <p dir="ltr" className="selectable break-all text-xs text-muted">
            {receiptUrl(receiptKey)}
          </p>
        </footer>
      </article>

      <div className="no-print mx-auto grid max-w-md grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <Button onClick={() => window.print()}>
          <Icon name="receipt" />
          <span>{t('receipt.pdf')}</span>
        </Button>
        <Button variant="secondary" className="text-ink" disabled={saving} onClick={() => void save()}>
          <Icon name="image" />
          <span>{saving ? t('receipt.imageSaving') : t('receipt.image')}</span>
        </Button>
        <Button variant="secondary" className="text-ink min-[400px]:col-span-2" onClick={() => void share()}>
          <Icon name="share" />
          <span>{t('receipt.link')}</span>
        </Button>
      </div>
      <p className="no-print mx-auto max-w-md text-center text-sm text-muted">
        <Fill text={t('receipt.keep')} values={{ table: receipt.table.name }} />
      </p>
    </div>
  )
}
