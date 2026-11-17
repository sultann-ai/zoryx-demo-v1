import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { PrintStyles } from "../components/PrintStyles";
import { useOrder } from "../hooks/useOrders";
import { StatusBadge } from "../components/ui";
import { orderTypeLabel, PAYMENT_METHOD_LABEL } from "../lib/enumLabels";
import { getOrderCustomer } from "../lib/orderCustomer";

export function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? "";
  const { data: order, isLoading, isError } = useOrder(orderId);
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    // Nothing prints while a scheduled order is on hold — not even from this fallback page.
    if (order && order.status !== "SCHEDULED" && !hasPrintedRef.current) {
      hasPrintedRef.current = true;
      window.print();
    }
  }, [order]);

  if (isLoading) {
    return <p>Loading receipt…</p>;
  }
  if (isError || !order) {
    return <p>Order not found.</p>;
  }
  if (order.status === "SCHEDULED") {
    return <p>This order is scheduled and on hold — nothing prints until it's released.</p>;
  }

  const customer = getOrderCustomer(order);

  return (
    <div>
      <PrintStyles />
      <h1>Receipt</h1>
      <p>
        Order #{order.orderNumber} — <StatusBadge status={order.status} />
      </p>
      <p>{new Date(order.createdAt).toLocaleString()}</p>
      <p>Type: {orderTypeLabel(order)}</p>
      {order.diningArea && <p>Dining area: {order.diningArea.name}</p>}
      {customer.name && (
        <p>
          Customer: {customer.name}
          {customer.phone ? ` — ${customer.phone}` : ""}
        </p>
      )}
      {customer.addressLines.length > 0 && (
        <p>
          Delivery address:
          {customer.addressLines.map((line, index) => (
            <span key={index}>
              <br />
              {line}
            </span>
          ))}
        </p>
      )}
      {customer.code && <p>Order code: {customer.code}</p>}
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {/* A deal is one line at its own price here — its exploded items (unitPrice/
              subtotal "0") are excluded so they don't show up as free line items;
              they still print individually, split by kitchen, on the kitchen tickets. */}
          {order.items
            .filter((item) => item.dealOrderLineId === null)
            .map((item) => (
              <tr key={item.id}>
                <td>
                  {item.menuItem.name}
                  {item.variantLabel ? ` (${item.variantLabel})` : ""}
                  {item.addOns && item.addOns.length > 0
                    ? ` ${item.addOns.map((addOn) => `+${addOn.name}`).join(" ")}`
                    : ""}
                  {item.notes && <div>Note: {item.notes}</div>}
                </td>
                <td>{item.quantity}</td>
                <td>{Number(item.unitPrice).toFixed(2)}</td>
                <td>{Number(item.subtotal).toFixed(2)}</td>
              </tr>
            ))}
          {order.dealLines.map((line) => (
            <tr key={line.id}>
              <td>
                {line.dealName}
                {line.notes && <div>Note: {line.notes}</div>}
              </td>
              <td>{line.quantity}</td>
              <td>{Number(line.unitPrice).toFixed(2)}</td>
              <td>{Number(line.subtotal).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Discount: {Number(order.discount).toFixed(2)}</p>
      {customer.deliveryFee > 0 && <p>Delivery fee: {customer.deliveryFee.toFixed(2)}</p>}
      <p>Total: {Number(order.totalAmount).toFixed(2)}</p>
      <p>Payment method: {PAYMENT_METHOD_LABEL[order.paymentMethod]}</p>
      <button type="button" className="no-print" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
