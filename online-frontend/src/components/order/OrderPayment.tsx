import { useQueryClient } from '@tanstack/react-query'
import { paymentProofThumbUrl, uploadPaymentProof, type OrderStatus, type PaymentState } from '../../api/orders'
import type { PublicStore } from '../../api/store'
import { waHref } from '../../lib/config'
import { useShopWhatsApp } from '../../lib/useShopContact'
import { useT } from '../../i18n'
import { PaymentSteps } from '../mobile/orders/PaymentSteps'
import { PaymentProofCard } from '../payment/PaymentProofCard'

const STATES: PaymentState[] = ['NOT_REQUIRED', 'WAITING_FOR_PAYMENT', 'PROOF_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_PROBLEM']

/**
 * The payment part of the order status page (phone and website layout alike) for an order paid ONLINE: the payment card
 * wired to this order. What it shows is the server's payment state; an upload only asks the page to re-read it.
 */
export function OrderPayment({ order, publicId, store }: { order: OrderStatus; publicId: string; store: PublicStore | undefined }) {
  const { t } = useT()
  const queryClient = useQueryClient()
  const shopWhatsapp = useShopWhatsApp()
  const number = store?.settings.whatsappNumber?.trim() || shopWhatsapp
  const message = t('order.pay.waMsg').replace('{code}', order.publicCode).replace('{amount}', `Rs ${Number.parseFloat(order.total)}`)
  const whatsappHref = number ? `${waHref(number)}?text=${encodeURIComponent(message)}` : null

  return (
    <PaymentProofCard
      payment={order.payment}
      thumbUrl={order.payment.proofSentAt ? paymentProofThumbUrl(publicId, order.payment.proofSentAt) : null}
      upload={(file, options) => uploadPaymentProof(publicId, file, options)}
      whatsappHref={whatsappHref}
      onUploaded={(result) => {
        // The server's own answer to the upload moves the card at once; the re-read then brings the time it was sent.
        const next = (result as { paymentState?: PaymentState } | undefined)?.paymentState
        if (next && STATES.includes(next)) {
          queryClient.setQueryData<OrderStatus>(['order', publicId], (current) => (current ? { ...current, payment: { ...current.payment, state: next } } : current))
        }
        void queryClient.invalidateQueries({ queryKey: ['order', publicId] })
      }}
      renderSteps={(uploadSlot, busy) => (
        <PaymentSteps order={order} store={store} whatsappHref={whatsappHref} uploadSlot={uploadSlot} uploading={busy} />
      )}
    />
  )
}
