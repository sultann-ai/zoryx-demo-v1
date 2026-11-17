import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage, getApiErrorStatus } from "../api/errors";
import type { OrderDetail, OrderItem } from "../api/orders";
import { useDiningAreas } from "../hooks/useDiningAreas";
import { useEmployees } from "../hooks/useEmployees";
import { useKitchens } from "../hooks/useKitchens";
import { useMenuItems } from "../hooks/useMenuItems";
import {
  useAddOrderItems,
  useAssignOrder,
  useCancelOrder,
  useMarkOrderNotCollected,
  useOrder,
  useReleaseScheduledOrder,
  useRemoveOrderItem,
  useUpdateOrderDealLineNote,
  useUpdateOrderItemNote,
  useUpdateOrderPaymentStatus,
} from "../hooks/useOrders";
import { usePrinterStatus, usePrintDocs } from "../hooks/usePrinter";
import { useIsDemo } from "../hooks/useAppInfo";
import { buildKitchenTicketDocs } from "../print/buildKitchenTicketDocs";
import type { AddedQuantities } from "../print/kitchenSlip";
import { encodeAdded, newItemQuantities } from "../print/kitchenSlip";
import { buildReceiptDoc } from "../print/buildReceiptDoc";
import {
  Button,
  Card,
  ConfirmDialog,
  FormActions,
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
  rowAccentClassForStatus,
} from "../components/ui";
import { cn } from "../components/ui/cn";
import { LineNote } from "../components/LineNote";
import { OnlineOrderInfo } from "../components/OnlineOrderInfo";
import { PaymentProof } from "../components/PaymentProof";
import { getOrderCustomer, isPickup } from "../lib/orderCustomer";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { formatMoney } from "../lib/format";
import { formatShopTime, formatTimeUntil } from "../lib/shopTime";
import { ORDER_SOURCE_LABEL, orderTypeLabel, PAYMENT_METHOD_LABEL } from "../lib/enumLabels";
import { LINE_NOTE_MAX_LENGTH, normalizeLineNote } from "../lib/lineNotes";
import { AddItemPicker } from "./orderDetail/AddItemPicker";
import { CancelOrderModal } from "./orderDetail/CancelOrderModal";
import { COMPLETABLE_STATUSES, CompleteOrderDialog } from "../components/CompleteOrderDialog";
import { ConfirmPaymentForm } from "../components/ConfirmPaymentForm";
import { EditableLineNote } from "./orderDetail/EditableLineNote";
import { OrderHistory } from "./orderDetail/OrderHistory";

const CLOSED_STATUSES = new Set(["CANCELLED", "COMPLETED"]);
// The only statuses the server lets PATCH /:id/cancel act on (a scheduled order uses cancel-scheduled).
const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "AWAITING_RECEPTION"]);
// An accepted order that hasn't been handed over yet — the only ones "Not collected" applies to.
const DELIVERABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "IN_KITCHEN", "READY"]);

interface PrintFeedback {
  tone: "success" | "error";
  message: string;
  fallbackUrl?: string;
  // Where it's shown: beside the print buttons, or under "Add item" for the slips printed
  // after adding items (so it's seen where the cashier is, not at the top of the page).
  origin: "header" | "add-item";
}

function PrintFeedbackMessage({ feedback }: { feedback: PrintFeedback }) {
  return (
    <p
      role={feedback.tone === "error" ? "alert" : "status"}
      className={cn("text-body", feedback.tone === "error" ? "text-status-danger-text" : "text-status-success-text")}
    >
      {feedback.message}
      {feedback.fallbackUrl && (
        <Button variant="secondary" className="ml-2" onClick={() => window.open(feedback.fallbackUrl, "_blank")}>
          Open browser print view
        </Button>
      )}
    </p>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-meta font-medium text-ink-muted">{label}</span>
      <span className="break-words text-body text-ink">{value}</span>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? "";

  const { data: order, isLoading, isError } = useOrder(orderId);
  const { data: kitchens, isError: isKitchensError } = useKitchens();
  const { data: employees, isError: isEmployeesError } = useEmployees();
  const { data: diningAreas, isError: isDiningAreasError } = useDiningAreas();
  const { data: menuItems, isError: isMenuItemsError } = useMenuItems();
  const cancelMutation = useCancelOrder();
  const assignMutation = useAssignOrder();
  const addItemsMutation = useAddOrderItems();
  const removeItemMutation = useRemoveOrderItem();
  const paymentStatusMutation = useUpdateOrderPaymentStatus();
  const itemNoteMutation = useUpdateOrderItemNote();
  const dealLineNoteMutation = useUpdateOrderDealLineNote();
  const { data: printerStatus } = usePrinterStatus();
  const isDemo = useIsDemo();
  const printMutation = usePrintDocs();
  const releaseMutation = useReleaseScheduledOrder();
  const navigate = useNavigate();
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [isReleaseOpen, setIsReleaseOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  // Pickup only: the customer never came for it.
  const notCollectedMutation = useMarkOrderNotCollected();
  const [isNotCollectedOpen, setIsNotCollectedOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [notCollectedError, setNotCollectedError] = useState<string | null>(null);

  const [assignWaiterId, setAssignWaiterId] = useState("");
  const [assignRiderId, setAssignRiderId] = useState("");
  const [assignDiningAreaId, setAssignDiningAreaId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  const [addItemMenuItemId, setAddItemMenuItemId] = useState("");
  const [addItemVariantId, setAddItemVariantId] = useState("");
  const [addItemQuantity, setAddItemQuantity] = useState("1");
  const [addItemNotes, setAddItemNotes] = useState("");
  const [addItemError, setAddItemError] = useState<string | null>(null);
  const [removeItemError, setRemoveItemError] = useState<string | null>(null);
  const [itemToRemove, setItemToRemove] = useState<OrderItem | null>(null);
  const [markUnpaidError, setMarkUnpaidError] = useState<string | null>(null);
  const [printFeedback, setPrintFeedback] = useState<PrintFeedback | null>(null);

  const hasInitializedAssignForm = useRef(false);
  useEffect(() => {
    if (!hasInitializedAssignForm.current && order) {
      setAssignWaiterId(order.waiterId ?? "");
      setAssignRiderId(order.riderId ?? "");
      setAssignDiningAreaId(order.diningAreaId ?? "");
      hasInitializedAssignForm.current = true;
    }
  }, [order]);

  if (isLoading) {
    return <p className="text-body text-ink-muted">Loading order…</p>;
  }
  if (isError || !order) {
    return <p className="text-body text-status-danger-text">Order not found.</p>;
  }

  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));
  const employeeNameById = new Map((employees ?? []).map((employee) => [employee.id, employee.name]));
  const activeEmployees = (employees ?? []).filter((employee) => employee.isActive);
  const activeDiningAreas = (diningAreas ?? []).filter((area) => area.isActive);
  const itemsByKitchen = new Map<string, OrderItem[]>();
  for (const item of order.items) {
    const bucket = itemsByKitchen.get(item.kitchenId);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByKitchen.set(item.kitchenId, [item]);
    }
  }

  const canCancel = CANCELLABLE_STATUSES.has(order.status);
  const isOnline = order.source === "ONLINE";
  // Any accepted, open order — every source and type. An unpaid one goes through Confirm Payment first.
  const canComplete = COMPLETABLE_STATUSES.has(order.status);
  const pickup = isPickup(order);
  // An accepted pickup order can also end as "Not collected" (the same statuses that can be delivered).
  const canMarkNotCollected = pickup && DELIVERABLE_STATUSES.has(order.status);
  const customer = getOrderCustomer(order);
  const orderNumber = order.orderNumber;
  // Same rule the backend enforces: a cancelled/completed order is done, nothing on
  // it can be added or removed anymore. An order still awaiting reception is edited
  // from the Incoming screen (PUT /submission), never item-by-item here.
  // A SCHEDULED order is on hold: its items change only through "Edit items" (the
  // Scheduled list), since adding/removing/re-noting here would reach a kitchen or move stock.
  const isScheduled = order.status === "SCHEDULED";
  const canEditItems = !CLOSED_STATUSES.has(order.status) && order.status !== "AWAITING_RECEPTION" && !isScheduled;

  async function handleMarkNotCollected() {
    setNotCollectedError(null);
    try {
      await notCollectedMutation.mutateAsync(orderId);
      setIsNotCollectedOpen(false);
    } catch (error) {
      setNotCollectedError(getApiErrorMessage(error, "Could not mark the order not collected."));
    }
  }

  async function handleReleaseNow() {
    setReleaseError(null);
    try {
      await releaseMutation.mutateAsync(orderId);
      setIsReleaseOpen(false);
    } catch (error) {
      setReleaseError(getApiErrorMessage(error, "Failed to release the order"));
    }
  }
  const addableMenuItems = (menuItems ?? []).filter((item) => item.isAvailableInPOS && item.sellableAlone);
  const selectedAddItem = addableMenuItems.find((item) => item.id === addItemMenuItemId);
  const selectedAddItemSizes = selectedAddItem ? selectedAddItem.variants.filter((variant) => variant.price !== null) : [];
  const isSelectedAddItemSized = selectedAddItemSizes.length > 0;

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError(null);
    try {
      await assignMutation.mutateAsync({
        id: orderId,
        input: {
          ...(assignWaiterId !== "" ? { waiterId: assignWaiterId } : {}),
          ...(assignRiderId !== "" ? { riderId: assignRiderId } : {}),
          ...(assignDiningAreaId !== "" ? { diningAreaId: assignDiningAreaId } : {}),
        },
      });
    } catch (error) {
      setAssignError(getApiErrorMessage(error, "Failed to update assignment"));
    }
  }

  async function handleAddItemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddItemError(null);

    if (addItemMenuItemId === "") {
      setAddItemError("Choose an item to add.");
      return;
    }
    if (isSelectedAddItemSized && addItemVariantId === "") {
      setAddItemError("Choose a size for this item.");
      return;
    }
    const quantity = Number.parseInt(addItemQuantity, 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setAddItemError("Quantity must be a positive number.");
      return;
    }

    const notes = normalizeLineNote(addItemNotes);
    const before = order;

    try {
      const updated = await addItemsMutation.mutateAsync({
        id: orderId,
        input: {
          items: [
            {
              menuItemId: addItemMenuItemId,
              quantity,
              ...(addItemVariantId !== "" ? { variantId: addItemVariantId } : {}),
              ...(notes !== "" ? { notes } : {}),
            },
          ],
        },
      });
      setAddItemMenuItemId("");
      setAddItemVariantId("");
      setAddItemQuantity("1");
      setAddItemNotes("");
      // Every kitchen on the order gets the full slip again, with the new items marked ADDED.
      if (before) {
        await printKitchenSlips(updated, newItemQuantities(before, updated));
      }
    } catch (error) {
      setAddItemError(getApiErrorMessage(error, "Failed to add item"));
    }
  }

  async function handleRemoveItem(item: OrderItem) {
    setRemoveItemError(null);
    try {
      await removeItemMutation.mutateAsync({ id: orderId, itemId: item.id });
      setItemToRemove(null);
    } catch (error) {
      setRemoveItemError(getApiErrorMessage(error, "Failed to remove item"));
    }
  }

  // Errors are shown inside the modal (it rethrows to keep itself open).
  async function handleCancel(reason: string) {
    await cancelMutation.mutateAsync({ id: orderId, cancelledReason: reason });
    setIsCancelOpen(false);
  }

  async function handleMarkUnpaid() {
    setMarkUnpaidError(null);
    try {
      await paymentStatusMutation.mutateAsync({ id: orderId, paymentStatus: "PENDING" });
    } catch (error) {
      setMarkUnpaidError(getApiErrorMessage(error, "Failed to mark unpaid"));
    }
  }

  // Kitchen slips for every kitchen with an item on the order (see print/kitchenSlip.ts).
  // `added` marks the items this print is for — set after adding items, empty for a reprint.
  // The browser-print fallback gets the same marks through its URL.
  async function printKitchenSlips(target: OrderDetail, added: AddedQuantities = new Map()) {
    const origin: PrintFeedback["origin"] = added.size > 0 ? "add-item" : "header";
    setPrintFeedback(null);
    const query = added.size > 0 ? `?added=${encodeAdded(added)}` : "";
    const fallbackUrl = `/orders/${target.id}/print/kitchen-tickets${query}`;
    try {
      await printMutation.mutateAsync({ docs: buildKitchenTicketDocs(target, kitchens ?? [], { added }) });
      setPrintFeedback({
        tone: "success",
        message: added.size > 0 ? "Item added — kitchen slips sent with it marked ADDED." : "Sent to printer.",
        origin,
      });
    } catch (error) {
      setPrintFeedback({
        tone: "error",
        message:
          getApiErrorStatus(error) === 503
            ? "Printer agent offline — use browser print instead."
            : getApiErrorMessage(error, "Failed to print"),
        fallbackUrl,
        origin,
      });
    }
  }

  async function handlePrint(kind: "table-receipt" | "receipt" | "kitchen-tickets") {
    if (!order) {
      return;
    }
    if (kind === "kitchen-tickets") {
      await printKitchenSlips(order);
      return;
    }
    setPrintFeedback(null);
    // "table-receipt" (handed to the customer/table right when the order is placed) and
    // "receipt" (the payment-confirmation copy, printed later) are the same document apart
    // from the "Payment Confirmed" line, which only the latter carries — nothing's been paid
    // yet when the table copy goes out.
    const docs = [buildReceiptDoc(order, { paymentConfirmed: kind === "receipt", isDemo })];
    const fallbackUrl = `/orders/${orderId}/print/receipt`;
    try {
      await printMutation.mutateAsync({ docs });
      setPrintFeedback({ tone: "success", message: "Sent to printer.", origin: "header" });
    } catch (error) {
      if (getApiErrorStatus(error) === 503) {
        setPrintFeedback({ tone: "error", message: "Printer agent offline — use browser print instead.", fallbackUrl, origin: "header" });
        return;
      }
      setPrintFeedback({ tone: "error", message: getApiErrorMessage(error, "Failed to print"), fallbackUrl, origin: "header" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Order #${order.orderNumber}`}
        actions={
          <>
            {/* Nothing prints for an order on hold — slips go out after release, as for any
                other incoming order. */}
            {!isScheduled && (
              <>
                <StatusBadge
                  status={printerStatus?.online ? "ACTIVE" : "INACTIVE"}
                  label={printerStatus?.online ? "Printer: connected" : "Printer: offline"}
                />
                <Button
                  variant="secondary"
                  onClick={() => handlePrint("table-receipt")}
                  disabled={printMutation.isPending}
                >
                  Print table receipt
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handlePrint("kitchen-tickets")}
                  disabled={printMutation.isPending}
                >
                  Print kitchen tickets
                </Button>
                <Button variant="secondary" onClick={() => handlePrint("receipt")} disabled={printMutation.isPending}>
                  Print final receipt
                </Button>
              </>
            )}
            {canComplete && (
              <>
                <Button variant="success" onClick={() => setIsCompleteOpen(true)}>
                  Complete order
                </Button>
                <CompleteOrderDialog orderId={isCompleteOpen ? orderId : null} onClose={() => setIsCompleteOpen(false)} />
              </>
            )}
            {canMarkNotCollected && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotCollectedError(null);
                    setIsNotCollectedOpen(true);
                  }}
                >
                  Not collected
                </Button>
                <ConfirmDialog
                  isOpen={isNotCollectedOpen}
                  onClose={() => setIsNotCollectedOpen(false)}
                  onConfirm={() => void handleMarkNotCollected()}
                  title={`Not collected: order #${orderNumber}?`}
                  message="The customer did not come for this order. It is cancelled and counts as a no-show against their phone number: after 3 in 90 days, new online orders from that phone are refused."
                  confirmLabel="Not collected"
                  confirmingLabel="Saving…"
                  confirmVariant="danger"
                  isConfirming={notCollectedMutation.isPending}
                  error={notCollectedError}
                />
              </>
            )}
            {canCancel && (
              <>
                <Button variant="danger" onClick={() => setIsCancelOpen(true)} disabled={cancelMutation.isPending}>
                  Cancel order
                </Button>
                <CancelOrderModal
                  isOpen={isCancelOpen}
                  orderNumber={orderNumber}
                  totalAmount={order.totalAmount}
                  isPaid={order.paymentStatus === "VERIFIED"}
                  isCancelling={cancelMutation.isPending}
                  onClose={() => setIsCancelOpen(false)}
                  onConfirm={handleCancel}
                />
              </>
            )}
          </>
        }
      />

      {isScheduled && order.scheduledFor && (
        <div className="flex flex-col gap-3 rounded-card border border-status-active bg-status-active-bg p-4">
          <p className="text-body text-ink">
            <span className="font-semibold">On hold until {formatShopTime(order.scheduledFor)}</span> (
            {formatTimeUntil(order.scheduledFor)}). It isn't in Incoming orders or any kitchen yet, nothing has printed
            and no stock has been used. At that time it's sent to Incoming orders automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="success"
              onClick={() => {
                setReleaseError(null);
                setIsReleaseOpen(true);
              }}
              disabled={releaseMutation.isPending}
            >
              Release now
            </Button>
            <ConfirmDialog
              isOpen={isReleaseOpen}
              onClose={() => setIsReleaseOpen(false)}
              onConfirm={() => void handleReleaseNow()}
              title={`Release order #${orderNumber} now?`}
              message="It goes to Incoming orders right away, ahead of its scheduled time."
              confirmLabel="Release now"
              confirmingLabel="Releasing…"
              confirmVariant="success"
              isConfirming={releaseMutation.isPending}
              error={releaseError}
            />
            <Button variant="secondary" onClick={() => navigate(`/scheduled/${order.id}/edit`)}>
              Edit items
            </Button>
            <Link to="/scheduled" className="inline-flex h-11 items-center px-2 text-body font-medium text-accent">
              All scheduled orders
            </Link>
          </div>
        </div>
      )}
      {order.releasedAt && order.scheduledFor && (
        <p className="text-meta text-ink-muted">
          Scheduled for {formatShopTime(order.scheduledFor)}; released {formatShopTime(order.releasedAt)}.
        </p>
      )}

      {printFeedback?.origin === "header" && <PrintFeedbackMessage feedback={printFeedback} />}

      {(isKitchensError || isEmployeesError || isDiningAreasError) && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load some reference data (kitchens, employees, or dining areas) — names below may show as
          "Unknown" and the Assign dropdowns may be incomplete.
        </p>
      )}

      {isOnline && (
        <Card title="Online order">
          <OnlineOrderInfo order={order} />
        </Card>
      )}

      <Card>
        {/* One column on a phone (some values — a delivery address, a full
            timestamp — are long); 2 from sm, back to the original 3 from md,
            which is also this shell's desktop breakpoint, so desktop is unchanged. */}
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-8 md:grid-cols-3">
          <DetailField label="Status" value={<OrderStatusBadge order={order} />} />
          <DetailField label="Type" value={pickup ? <StatusBadge status="PICKUP" label="PICKUP" /> : orderTypeLabel(order)} />
          <DetailField label="Source" value={ORDER_SOURCE_LABEL[order.source]} />
          <DetailField
            label="Payment"
            value={
              <span className="flex items-center gap-2">
                {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                <StatusBadge status={order.paymentStatus} />
              </span>
            }
          />
          <DetailField label="Dining area" value={order.diningArea?.name ?? "—"} />
          {!isOnline && customer.name && <DetailField label="Customer" value={customer.name} />}
          {!isOnline && customer.phone && (
            <DetailField
              label="Phone"
              value={
                <a href={`tel:${customer.phone}`} className="text-accent no-underline hover:underline">
                  {customer.phone}
                </a>
              }
            />
          )}
          {!isOnline && customer.areaName && <DetailField label="Delivery area" value={customer.areaName} />}
          {!isOnline && customer.addressLines.length > 0 && (
            <DetailField label="Delivery address" value={<span className="whitespace-pre-line">{customer.addressLines.join("\n")}</span>} />
          )}
          {!isOnline && customer.deliveryFee > 0 && <DetailField label="Delivery fee" value={formatMoney(order.deliveryFee)} />}
          {!isOnline && customer.code && <DetailField label="Order code" value={<span className="font-semibold tracking-wider">{customer.code}</span>} />}
          {!isOnline && (order.paymentProofMediaId !== null || order.paymentScreenshotUrl !== null) && (
            <DetailField
              label="Payment proof"
              value={
                <PaymentProof
                  orderId={order.id}
                  proofMediaId={order.paymentProofMediaId}
                  legacyScreenshotUrl={order.paymentScreenshotUrl}
                />
              }
            />
          )}
          <DetailField
            label="Waiter"
            value={order.waiterId ? (employeeNameById.get(order.waiterId) ?? "—") : "Unassigned"}
          />
          <DetailField
            label="Rider"
            value={order.riderId ? (employeeNameById.get(order.riderId) ?? "—") : "Unassigned"}
          />
          <DetailField label="Placed at" value={new Date(order.createdAt).toLocaleString()} />
          <DetailField
            label="Discount"
            value={
              <>
                {Number(order.discount).toFixed(2)}
                {order.discountReason && <span className="block text-meta text-ink-muted">{order.discountReason}</span>}
              </>
            }
          />
          <DetailField label="Total" value={<span className="text-numeric">{Number(order.totalAmount).toFixed(2)}</span>} />
          {order.paidAmount !== null && (
            <>
              <DetailField label="Paid" value={Number(order.paidAmount).toFixed(2)} />
              <DetailField
                label="Change given"
                value={(Number(order.paidAmount) - Number(order.totalAmount)).toFixed(2)}
              />
            </>
          )}
        </div>
        {order.notes && (
          <p className="mt-4 text-body text-ink-muted">
            <span className="font-medium text-ink">Notes:</span> {order.notes}
          </p>
        )}
        {order.cancelledReason && (
          <p className="mt-2 text-body text-status-danger-text">
            <span className="font-medium">Cancelled reason:</span> {order.cancelledReason}
          </p>
        )}
      </Card>

      {order.paymentMethod === "CASH" && (
        <Card title="Confirm Payment" className="max-w-2xl">
          {order.paymentStatus === "VERIFIED" ? (
            <div className="flex flex-col gap-3">
              {markUnpaidError && (
                <p role="alert" className="text-body text-status-danger-text">
                  {markUnpaidError}
                </p>
              )}
              <FormActions>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleMarkUnpaid}
                  disabled={paymentStatusMutation.isPending}
                >
                  Mark unpaid
                </Button>
              </FormActions>
            </div>
          ) : (
            <ConfirmPaymentForm key={order.id} order={order} />
          )}
        </Card>
      )}

      {order.dealLines.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-section font-semibold text-ink">Deals</h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Deal</TableHeaderCell>
                <TableHeaderCell>Quantity</TableHeaderCell>
                <TableHeaderCell>Unit price</TableHeaderCell>
                <TableHeaderCell>Subtotal</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.dealLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium text-ink">
                    {line.dealName}
                    {line.customization && (
                      <div className="mt-1 flex flex-col gap-0.5 text-meta font-normal text-ink-muted">
                        <span>
                          Customized deal: standard Rs {Number(line.baseUnitPrice ?? line.unitPrice).toFixed(2)}, charged Rs{" "}
                          {Number(line.unitPrice).toFixed(2)}
                        </span>
                        {line.customization.items.map((item, index) => (
                          <span key={index}>
                            {item.quantity}× {item.name}
                            {item.variantLabel && ` · ${item.variantLabel}`}
                            {item.addOns.length > 0 && ` (+ ${item.addOns.map((addOn) => addOn.name).join(", ")})`}
                          </span>
                        ))}
                        {line.customization.reason && <span>Reason: {line.customization.reason}</span>}
                      </div>
                    )}
                    <EditableLineNote
                      notes={line.notes}
                      itemName={line.dealName}
                      canEdit={canEditItems}
                      onSave={(notes) => dealLineNoteMutation.mutateAsync({ id: orderId, dealLineId: line.id, notes })}
                    />
                  </TableCell>
                  <TableCell className="text-numeric">{line.quantity}</TableCell>
                  <TableCell className="text-numeric">{Number(line.unitPrice).toFixed(2)}</TableCell>
                  <TableCell className="text-numeric">{Number(line.subtotal).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold text-ink">Items</h2>
        <ConfirmDialog
          isOpen={itemToRemove !== null}
          onClose={() => setItemToRemove(null)}
          onConfirm={() => itemToRemove && void handleRemoveItem(itemToRemove)}
          title="Remove item?"
          message={itemToRemove ? `Remove ${itemToRemove.quantity} × ${itemToRemove.menuItem.name} from order #${orderNumber}?` : ""}
          confirmLabel="Remove"
          confirmingLabel="Removing…"
          isConfirming={removeItemMutation.isPending}
          error={removeItemError}
        />
        {Array.from(itemsByKitchen.entries()).map(([kitchenId, items]) => (
          <div key={kitchenId} className="flex flex-col gap-2">
            <h3 className="text-card-head font-semibold text-ink">{kitchenNameById.get(kitchenId) ?? "Unknown kitchen"}</h3>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell>Quantity</TableHeaderCell>
                  <TableHeaderCell>Unit price</TableHeaderCell>
                  <TableHeaderCell>Subtotal</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => {
                  const dealName = item.dealOrderLine?.dealName;
                  const isPartOfCustomizedDeal = item.dealOrderLine?.customization != null;
                  // Once the kitchen has picked an item up (or it's part of a deal),
                  // it can't just be deleted — only still-PENDING, directly-ordered
                  // items are safe to remove without a cancellation conversation.
                  const canRemove = canEditItems && item.status === "PENDING" && item.dealOrderLineId === null;
                  return (
                    <TableRow key={item.id} className={cn("border-l-4", rowAccentClassForStatus(item.status))}>
                      <TableCell className="font-medium text-ink">
                        {item.menuItem.name}
                        {item.isCustomPrice && <StatusBadge status="CUSTOM_PRICE_TAG" label="Custom price" />}
                        {item.variantLabel && (
                          <span className="block text-meta font-normal text-ink-muted">{item.variantLabel}</span>
                        )}
                        {item.addOns && item.addOns.length > 0 && (
                          <span className="block text-meta font-normal text-ink-muted">
                            {item.addOns.map((addOn) => `+ ${addOn.name}`).join(", ")}
                          </span>
                        )}
                        {dealName && (
                          <span className="block text-meta font-normal text-ink-muted">
                            Part of {dealName}
                            {isPartOfCustomizedDeal && " - customized"}
                          </span>
                        )}
                        {/* A deal item's note is its deal line's — read-only here, edited
                            on the deal's own row above. */}
                        {item.dealOrderLineId === null ? (
                          <EditableLineNote
                            notes={item.notes}
                            itemName={item.menuItem.name}
                            canEdit={canEditItems}
                            onSave={(notes) => itemNoteMutation.mutateAsync({ id: orderId, itemId: item.id, notes })}
                          />
                        ) : (
                          item.dealOrderLine?.notes && <LineNote notes={item.dealOrderLine.notes} className="font-normal" />
                        )}
                      </TableCell>
                      <TableCell className="text-numeric">{item.quantity}</TableCell>
                      <TableCell className="text-numeric">{Number(item.unitPrice).toFixed(2)}</TableCell>
                      <TableCell className="text-numeric">{Number(item.subtotal).toFixed(2)}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        {canRemove && (
                          <Button
                            variant="danger"
                            onClick={() => {
                              setRemoveItemError(null);
                              setItemToRemove(item);
                            }}
                            disabled={removeItemMutation.isPending}
                          >
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>

      {canEditItems && (
        <Card title="Add item" className="max-w-2xl">
          {isMenuItemsError && (
            <p role="alert" className="mb-3 text-body text-status-danger-text">
              Could not load the menu — items can't be added right now.
            </p>
          )}
          <form onSubmit={handleAddItemSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Item</span>
              <AddItemPicker
                menuItems={menuItems ?? []}
                kitchenNameById={kitchenNameById}
                selectedId={addItemMenuItemId}
                onSelect={(menuItemId) => {
                  setAddItemMenuItemId(menuItemId);
                  setAddItemVariantId("");
                }}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              {isSelectedAddItemSized && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="add-item-size" className="text-meta font-medium text-ink-muted">
                    Size
                  </label>
                  <Select
                    id="add-item-size"
                    value={addItemVariantId}
                    onChange={(event) => setAddItemVariantId(event.target.value)}
                  >
                    <option value="">Choose a size</option>
                    {selectedAddItemSizes.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.label} — {Number(variant.price).toFixed(2)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="add-item-quantity" className="text-meta font-medium text-ink-muted">
                  Quantity
                </label>
                <Input
                  id="add-item-quantity"
                  type="number"
                  min="1"
                  step="1"
                  className="w-24"
                  value={addItemQuantity}
                  onChange={(event) => setAddItemQuantity(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="add-item-notes" className="text-meta font-medium text-ink-muted">
                Note (optional)
              </label>
              <Input
                id="add-item-notes"
                value={addItemNotes}
                maxLength={LINE_NOTE_MAX_LENGTH}
                onChange={(event) => setAddItemNotes(event.target.value)}
                placeholder="e.g. no onion, extra spicy"
              />
            </div>
            {addItemError && (
              <p role="alert" className="text-body text-status-danger-text">
                {addItemError}
              </p>
            )}
            {printFeedback?.origin === "add-item" && <PrintFeedbackMessage feedback={printFeedback} />}
            <FormActions>
              <Button type="submit" variant="primary" disabled={addItemsMutation.isPending}>
                {addItemsMutation.isPending ? "Adding…" : "Add item"}
              </Button>
            </FormActions>
          </form>
        </Card>
      )}

      <Card title="Assign" className="max-w-2xl">
        <form onSubmit={handleAssignSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="assign-waiter" className="text-meta font-medium text-ink-muted">
                Waiter
              </label>
              <Select id="assign-waiter" value={assignWaiterId} onChange={(event) => setAssignWaiterId(event.target.value)}>
                <option value="">Unassigned</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="assign-rider" className="text-meta font-medium text-ink-muted">
                Rider
              </label>
              <Select id="assign-rider" value={assignRiderId} onChange={(event) => setAssignRiderId(event.target.value)}>
                <option value="">Unassigned</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="assign-dining-area" className="text-meta font-medium text-ink-muted">
                Dining area
              </label>
              <Select
                id="assign-dining-area"
                value={assignDiningAreaId}
                onChange={(event) => setAssignDiningAreaId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {activeDiningAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {assignError && (
            <p role="alert" className="text-body text-status-danger-text">
              {assignError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? "Saving…" : "Update assignment"}
            </Button>
          </FormActions>
        </form>
      </Card>

      <OrderHistory orderId={order.id} orderUpdatedAt={order.updatedAt} />
    </div>
  );
}
