import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import { ordersApi } from "../api/orders";
import type { OrderSource, OrderStatus, OrderSummary } from "../api/orders";
import { OrderCustomerCell } from "../components/OrderCustomerCell";
import { useCurrentBusinessDay } from "../hooks/useBusinessDay";
import { useDiningAreas } from "../hooks/useDiningAreas";
import { useOrdersList, useUpdateOrderPaymentStatus } from "../hooks/useOrders";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  buttonClassName,
  rowAccentClassForStatus,
} from "../components/ui";
import { cn } from "../components/ui/cn";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { COMPLETABLE_STATUSES, CompleteOrderDialog } from "../components/CompleteOrderDialog";
import { isPickup } from "../lib/orderCustomer";
import {
  ORDER_SOURCE_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
} from "../lib/enumLabels";

const ORDER_STATUSES: OrderStatus[] = [
  "AWAITING_RECEPTION",
  "PENDING",
  "CONFIRMED",
  "IN_KITCHEN",
  "READY",
  "COMPLETED",
  "CANCELLED",
];
const ORDER_SOURCES: OrderSource[] = ["POS", "ONLINE", "PHONE"];

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function OrdersPage() {
  const { data: currentBusinessDay } = useCurrentBusinessDay();
  const { data: diningAreas, isError: isDiningAreasError } = useDiningAreas();

  // The dashboard's daily table links here with ?businessDayId=; that choice wins over the
  // "current business day" default below.
  const [searchParams] = useSearchParams();
  const linkedBusinessDayId = searchParams.get("businessDayId") ?? "";
  const [businessDayId, setBusinessDayId] = useState(linkedBusinessDayId);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [source, setSource] = useState<OrderSource | "">("");
  const [diningAreaId, setDiningAreaId] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Phone only: the filters fold away behind a "Filters" button so the orders themselves start high on screen.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Default the filter to the current business day once, the first time it loads —
  // but never fight the user if they deliberately clear it afterward to see all days.
  const hasInitializedBusinessDayId = useRef(linkedBusinessDayId !== "");
  useEffect(() => {
    if (!hasInitializedBusinessDayId.current && currentBusinessDay) {
      setBusinessDayId(currentBusinessDay.id);
      hasInitializedBusinessDayId.current = true;
    }
  }, [currentBusinessDay]);

  const filter = {
    ...(businessDayId !== "" ? { businessDayId } : {}),
    ...(status !== "" ? { status } : {}),
    ...(source !== "" ? { source } : {}),
    ...(diningAreaId !== "" ? { diningAreaId } : {}),
  };

  const { data: orders, isLoading, isError } = useOrdersList(filter);
  const paymentStatusMutation = useUpdateOrderPaymentStatus();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // The order "Complete" was pressed on (an unpaid one confirms payment first, in the dialog).
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);

  const activeFilterCount = Object.keys(filter).length;
  const diningAreaNameById = new Map((diningAreas ?? []).map((area) => [area.id, area.name]));

  async function handleTogglePaymentStatus(order: OrderSummary) {
    setPaymentError(null);
    const nextStatus = order.paymentStatus === "VERIFIED" ? "PENDING" : "VERIFIED";
    try {
      await paymentStatusMutation.mutateAsync({ id: order.id, paymentStatus: nextStatus });
    } catch (error) {
      setPaymentError(getApiErrorMessage(error, "Failed to update payment status"));
    }
  }

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      const blob = await ordersApi.exportXlsx(filter);
      downloadBlob(blob, "orders.xlsx");
    } catch (error) {
      setExportError(getApiErrorMessage(error, "Failed to export orders"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Orders" />
      <CompleteOrderDialog orderId={completeOrderId} onClose={() => setCompleteOrderId(null)} />

      {isDiningAreasError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load dining areas — that filter may be incomplete.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          variant="secondary"
          className="md:hidden"
          aria-expanded={filtersOpen}
          aria-controls="orders-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
        </Button>
        {/* One toolbar: every field the same width. Phone: a 2-column grid, hidden until "Filters" is
            opened. md and up: columns of equal width that fill the row and wrap as the screen narrows
            (five across on a wide desktop). */}
        <div
          id="orders-filters"
          className={cn(
            "grid grid-cols-2 items-end gap-3 rounded-card border border-border bg-surface-raised p-3 shadow-sm",
            "md:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] md:gap-4 md:p-4",
            !filtersOpen && "max-md:hidden",
          )}
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="orders-business-day" className="text-meta font-medium text-ink-muted">
              Business day ID
            </label>
            {/* A UUID is far wider than the field, so the end is cut with an ellipsis (the full
                value is in the tooltip and still there when you click in to edit or copy). */}
            <Input
              id="orders-business-day"
              type="text"
              value={businessDayId}
              onChange={(event) => setBusinessDayId(event.target.value)}
              placeholder="All business days"
              title={businessDayId || undefined}
              className="truncate"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="orders-status" className="text-meta font-medium text-ink-muted">
              Status
            </label>
            <Select
              id="orders-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as OrderStatus | "")}
            >
              <option value="">All</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {ORDER_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="orders-source" className="text-meta font-medium text-ink-muted">
              Source
            </label>
            <Select
              id="orders-source"
              value={source}
              onChange={(event) => setSource(event.target.value as OrderSource | "")}
            >
              <option value="">All</option>
              {ORDER_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {ORDER_SOURCE_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="orders-dining-area" className="text-meta font-medium text-ink-muted">
              Dining area
            </label>
            <Select id="orders-dining-area" value={diningAreaId} onChange={(event) => setDiningAreaId(event.target.value)}>
              <option value="">All</option>
              {(diningAreas ?? []).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" className="col-span-2 w-full md:col-auto" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </div>
      </div>
      {exportError && (
        <p role="alert" className="text-body text-status-danger-text">
          {exportError}
        </p>
      )}
      {paymentError && (
        <p role="alert" className="text-body text-status-danger-text">
          {paymentError}
        </p>
      )}

      {isLoading && <p className="text-body text-ink-muted">Loading orders…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load orders.</p>}

      {orders && orders.length === 0 && (
        <EmptyState title="No orders match these filters" description="Try widening the filters above." />
      )}

      {orders && orders.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Order #</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell>Dining area</TableHeaderCell>
              <TableHeaderCell>Payment</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Placed at</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} className={cn("border-l-4", rowAccentClassForStatus(order.status))}>
                <TableCell className="font-medium text-ink">{order.orderNumber}</TableCell>
                <TableCell>
                  {isPickup(order) ? <StatusBadge status="PICKUP" label="PICKUP" /> : ORDER_TYPE_LABEL[order.type]}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge order={order} />
                </TableCell>
                <TableCell>{ORDER_SOURCE_LABEL[order.source]}</TableCell>
                <TableCell>
                  <OrderCustomerCell order={order} />
                </TableCell>
                <TableCell>{order.diningAreaId ? (diningAreaNameById.get(order.diningAreaId) ?? "—") : "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 max-md:items-end">
                    <span>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>
                    <StatusBadge status={order.paymentStatus} />
                    {/* Online payments go through the screenshot-verification flow instead —
                        this quick toggle is only for cash, settled at the table after eating. */}
                    {order.paymentMethod === "CASH" && (
                      <Button
                        variant="secondary"
                        className="mt-1"
                        onClick={() => handleTogglePaymentStatus(order)}
                        disabled={paymentStatusMutation.isPending}
                      >
                        {order.paymentStatus === "VERIFIED" ? "Mark unpaid" : "Mark paid"}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-numeric">{Number(order.totalAmount).toFixed(2)}</TableCell>
                <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2 max-md:justify-end">
                    {COMPLETABLE_STATUSES.has(order.status) && (
                      <Button variant="success" onClick={() => setCompleteOrderId(order.id)}>
                        Complete
                      </Button>
                    )}
                    <Link to={`/orders/${order.id}`} className={buttonClassName("secondary")}>
                      View
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
