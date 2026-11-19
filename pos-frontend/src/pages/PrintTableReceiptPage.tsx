import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorStatus } from "../api/errors";
import { PrintStyles } from "../components/PrintStyles";
import { useTableReceipt } from "../hooks/useTableBill";
import { formatDateTime, formatMoney } from "../lib/format";

// Browser-print fallback for a table's receipt (when the print agent is offline): the same snapshot
// as the thermal copy (print/buildTableReceiptDoc.ts), on an 80 mm page. Standalone, like the
// order receipt page; opens the print dialog once the receipt has loaded.
export function PrintTableReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, error } = useTableReceipt(id ?? null, true);
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (data && !hasPrintedRef.current) {
      hasPrintedRef.current = true;
      window.print();
    }
  }, [data]);

  if (isPending) {
    return <p>Loading receipt…</p>;
  }
  if (error || !data) {
    return <p>{getApiErrorStatus(error) === 404 ? "This table's receipt isn't ready yet — it's made once every share is paid." : "Receipt not found."}</p>;
  }

  const receipt = data.receipt;
  return (
    <div>
      <PrintStyles />
      <h1>Receipt</h1>
      <p>
        {receipt.table.name}
        {receipt.table.area ? ` — ${receipt.table.area}` : ""}
      </p>
      <p>{formatDateTime(receipt.issuedAt)}</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        {receipt.orders.map((order) => (
          <tbody key={order.orderNumber}>
            <tr>
              <td colSpan={3}>
                <strong>
                  #{order.orderNumber}
                  {order.guestName ? ` · ${order.guestName}` : ""}
                </strong>
              </td>
            </tr>
            {order.lines.map((line, index) => (
              <tr key={index}>
                <td>
                  {line.name}
                  {line.size ? ` (${line.size})` : ""}
                  {line.addOns.length > 0 ? ` ${line.addOns.map((name) => `+${name}`).join(" ")}` : ""}
                </td>
                <td>{line.quantity}</td>
                <td>{formatMoney(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p>Subtotal: {formatMoney(receipt.subtotal)}</p>
      {Number(receipt.discount) > 0 && <p>Discount: -{formatMoney(receipt.discount)}</p>}
      <p>
        <strong>Total: {formatMoney(receipt.total)}</strong>
      </p>
      {receipt.shares.map((share, index) => (
        <p key={index}>
          {share.label}
          {share.method ? ` (${share.method === "CASH" ? "Cash" : "Online"})` : ""}: {formatMoney(share.amount)}
        </p>
      ))}
      <p>Payment confirmed</p>
      <button type="button" className="no-print" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
