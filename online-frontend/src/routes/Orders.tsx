import { isFinalStatus, useOrderStatus } from '../api/orders'
import { Icon } from '../components/Icon'
import { OrderTracking } from '../components/mobile/orders/OrderTracking'
import { PastOrders } from '../components/mobile/orders/PastOrders'
import { PageSkeleton } from '../components/Skeleton'
import { ButtonRoute } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useFreshOrderId, useOrderHistory } from '../lib/orderHistory'
import { useT } from '../i18n'

function EmptyOrders() {
  const { t } = useT()
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-2xl">{t('orders.empty')}</h1>
        <p>{t('orders.emptyBody')}</p>
        <ButtonRoute to="/menu" size="lg" className="w-full">
          <Icon name="bag" />
          <span>{t('nav.orderNow')}</span>
        </ButtonRoute>
      </Card>
    </div>
  )
}

/** The newest recent order: tracked here while it is in progress, otherwise it is just the first of the past orders. */
function WithRecent({ publicId }: { publicId: string }) {
  const history = useOrderHistory()
  const { data, isPending } = useOrderStatus(publicId)
  if (isPending) return <PageSkeleton />
  const active = data && !isFinalStatus(data.status)
  return (
    <>
      {active && <OrderTracking publicId={publicId} />}
      <div className="mx-auto max-w-xl px-4 pb-8 pt-2">
        <PastOrders orders={active ? history.filter((o) => o.publicId !== publicId) : history} />
      </div>
    </>
  )
}

/**
 * The Orders tab (phones; it also works on any width): the order in progress as a tracking screen with pull-to-refresh,
 * then the orders placed from this phone (up to 10) with Reorder; an empty state with an Order now button when there are none.
 */
export default function Orders() {
  const history = useOrderHistory()
  const recent = useFreshOrderId()
  if (recent) return <WithRecent publicId={recent} />
  return history.length > 0 ? (
    <div className="mx-auto max-w-xl px-4 pb-8 pt-2">
      <PastOrders orders={history} />
    </div>
  ) : (
    <EmptyOrders />
  )
}
