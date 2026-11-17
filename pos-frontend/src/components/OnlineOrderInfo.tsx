import type { OrderDetail } from "../api/orders";
import { formatMoney } from "../lib/format";
import { getOrderCustomer, isPickup } from "../lib/orderCustomer";
import { PaymentProof } from "./PaymentProof";
import { buttonClassName, StatusBadge } from "./ui";

// How an online order's payment looks to staff, in one line: cash on delivery, waiting for the customer's
// payment (amber), proof received, confirmed, or a problem.
function PaymentLine({ order }: { order: OrderDetail }) {
  if (order.paymentMethod === "CASH") {
    return <StatusBadge status="PENDING" label={isPickup(order) ? "Cash at the counter" : "Cash on delivery"} />;
  }
  if (order.paymentStatus === "VERIFIED") {
    return <StatusBadge status="VERIFIED" label="Payment confirmed" />;
  }
  if (order.paymentStatus === "REJECTED") {
    return <StatusBadge status="REJECTED" label="Payment problem" />;
  }
  const hasProof = order.paymentProofMediaId !== null || order.paymentScreenshotUrl !== null;
  return hasProof ? (
    <StatusBadge status="CONFIRMED" label="Proof received" />
  ) : (
    <StatusBadge status="AWAITING_VERIFICATION" label="Waiting for payment" />
  );
}

// Everything staff need to know about an ONLINE order, used on the Incoming card and on Order detail so
// the two can't disagree: the order code (large — it's what the customer quotes on the phone), who and
// where (tap the phone to call), the delivery fee and the total, and how it is being paid.
export function OnlineOrderInfo({ order }: { order: OrderDetail }) {
  const customer = getOrderCustomer(order);
  const hasProof = order.paymentProofMediaId !== null || order.paymentScreenshotUrl !== null;
  const pickup = isPickup(order);

  return (
    <div className="flex flex-col gap-3">
      {pickup && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="PICKUP" label="PICKUP" />
          <span className="text-meta text-ink-muted">The customer collects it at the shop: no address, no delivery fee.</span>
        </div>
      )}
      {customer.code && (
        <div className="flex flex-col">
          <span className="text-meta font-medium text-ink-muted">Order code</span>
          <span className="font-heading text-display font-bold leading-tight tracking-[0.18em] text-ink">{customer.code}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-body text-ink">
        {customer.name && <span className="text-card-head font-semibold">{customer.name}</span>}
        {customer.phone && (
          <a href={`tel:${customer.phone}`} className={buttonClassName("secondary", "md", "self-start")}>
            Call {customer.phone}
          </a>
        )}
        {customer.areaName && (
          <span>
            <span className="text-meta text-ink-muted">Area: </span>
            {customer.areaName}
          </span>
        )}
        {customer.addressLines.map((line, index) => (
          <span key={index} className="text-body text-ink">
            {line}
          </span>
        ))}
      </div>

      {customer.deliveryFee > 0 && (
        <p className="text-body text-ink-muted">
          Delivery fee {formatMoney(order.deliveryFee)} · Total <span className="font-semibold text-ink">{formatMoney(order.totalAmount)}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PaymentLine order={order} />
        {hasProof && (
          <PaymentProof orderId={order.id} proofMediaId={order.paymentProofMediaId} legacyScreenshotUrl={order.paymentScreenshotUrl} />
        )}
      </div>
    </div>
  );
}
