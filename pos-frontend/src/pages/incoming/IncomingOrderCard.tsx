import { useEffect, useState } from "react";
import type { Kitchen } from "../../api/kitchens";
import type { OrderDetail, OrderTableGuest, PaymentMethod } from "../../api/orders";
import { getApiErrorBody, getApiErrorMessage, getApiErrorStatus } from "../../api/errors";
import { TableConflictDialog } from "../../components/TableConflictDialog";
import { getTableConflict, tableErrorMessage } from "../../lib/tableErrors";
import type { TableConflict } from "../../lib/tableErrors";
import { useAcceptOrder, useRejectOrder, useUpdateSubmission } from "../../hooks/useOrders";
import { useTableRoundNumber } from "../../hooks/useTables";
import { usePrintDocs } from "../../hooks/usePrinter";
import { buildKitchenTicketDocs } from "../../print/buildKitchenTicketDocs";
import { buildReceiptDoc } from "../../print/buildReceiptDoc";
import { useIsDemo } from "../../hooks/useAppInfo";
import { Button, Input, StatusBadge } from "../../components/ui";
import { OnlineOrderInfo } from "../../components/OnlineOrderInfo";
import { useAuth } from "../../context/AuthContext";
import { DiscountCapHint } from "../../components/DiscountCapHint";
import { getOrderCustomer, isPickup } from "../../lib/orderCustomer";
import { cn } from "../../components/ui/cn";
import { formatMoney } from "../../lib/format";
import { ORDER_SOURCE_LABEL } from "../../lib/enumLabels";
import { SegmentedControl } from "../newOrder/SegmentedControl";
import { LineNote } from "../../components/LineNote";
import { RejectReasonModal } from "./RejectReasonModal";
import { formatShopTime } from "../../lib/shopTime";
import { areaLabel } from "../tables/tableStates";

interface IncomingOrderCardProps {
  order: OrderDetail;
  kitchens: Kitchen[];
  onGone: (orderId: string) => void;
  onPrintFailure: (order: OrderDetail, message: string) => void;
}

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
];

// Table QR: whose line it is. A line staff added to the table's order has no guest: shared.
function GuestTag({ guest }: { guest: OrderTableGuest | null | undefined }) {
  return <span className="text-meta text-ink-muted"> — {guest?.displayName ?? "Table (shared)"}</span>;
}

// "QR · Table 4 · Round 2" — the round number appears once the table's session has loaded.
function tableQrLabel(order: OrderDetail, round: number | null): string {
  return ["QR", order.diningArea?.name, round !== null ? `Round ${round}` : null].filter(Boolean).join(" · ");
}

function minutesWaiting(createdAt: string, now: number): number {
  return Math.floor((now - new Date(createdAt).getTime()) / 60_000);
}

export function IncomingOrderCard({ order, kitchens, onGone, onPrintFailure }: IncomingOrderCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(order.paymentMethod);
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantities, setEditQuantities] = useState<Map<string, number>>(
    () => new Map(order.items.filter((item) => item.dealOrderLineId === null).map((item) => [item.id, item.quantity])),
  );
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Table sync R2a: a scheduled dine-in order released while its table was busy — reception says whether
  // it goes on that table's bill.
  const [tableDecision, setTableDecision] = useState<{ conflict: TableConflict; andPrint: boolean } | null>(null);

  const { staff } = useAuth();
  // An online admin may accept or reject online orders, but not give a discount or re-price (the
  // server refuses too): those controls simply aren't offered.
  const isOnlineAdmin = staff?.role === "ONLINE_ADMIN";

  const acceptMutation = useAcceptOrder();
  const rejectMutation = useRejectOrder();
  const updateSubmissionMutation = useUpdateSubmission();
  const printMutation = usePrintDocs();
  const isDemo = useIsDemo();

  const isBusy = acceptMutation.isPending || rejectMutation.isPending || updateSubmissionMutation.isPending;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // A released scheduled order has been waiting since its release, not since it was booked.
  const waitingMinutes = minutesWaiting(order.releasedAt ?? order.createdAt, now);
  const timerTone =
    waitingMinutes >= 5
      ? "bg-status-danger-bg text-status-danger-text"
      : waitingMinutes >= 2
        ? "bg-status-warning-bg text-status-warning-text"
        : "text-ink-muted";

  const isOnline = order.source === "ONLINE";
  // A guest's round from the table's QR: reviewed exactly like an order taker's order, plus who sent it.
  const isTableQr = order.source === "TABLE_QR";
  const round = useTableRoundNumber(order);
  const isOnlinePaid = isOnline && order.paymentMethod === "ONLINE";
  const customer = getOrderCustomer(order);
  // A guest pays online AFTER placing the order, by uploading a screenshot. Until one is there
  // there is nothing to verify, so it can't be accepted as paid (the server refuses too) — unless
  // reception switches it to cash below.
  const needsProof =
    isOnlinePaid &&
    order.publicCode !== null &&
    order.paymentProofMediaId === null &&
    order.paymentScreenshotUrl === null &&
    paymentMethod !== "CASH";

  // "Already reviewed" (a plain 409 with no code) means someone else got there first: drop the card. A 409
  // with a code is a table conflict to deal with here (TABLE_DECISION_NEEDED, SPLIT_HAS_PAYMENTS, …).
  function handle409<T>(promise: Promise<T>): Promise<T | undefined> {
    return promise.catch((error: unknown) => {
      if (getApiErrorStatus(error) === 409 && !getApiErrorBody(error)?.code) {
        onGone(order.id);
        return undefined;
      }
      throw error;
    });
  }

  async function handleAccept(andPrint: boolean, expectedTableSessionId?: string | null) {
    setActionError(null);
    const discountNumber = discount.trim() === "" ? undefined : Number(discount);
    if (discountNumber !== undefined && (Number.isNaN(discountNumber) || discountNumber < 0)) {
      setActionError("Discount must be a non-negative number.");
      return;
    }
    if (discountNumber !== undefined && discountNumber > 0 && discountReason.trim() === "") {
      setActionError("Enter a reason for the discount.");
      return;
    }
    try {
      const accepted = await handle409(
        acceptMutation.mutateAsync({
          id: order.id,
          input: {
            paymentMethod,
            ...(discountNumber !== undefined ? { discount: discountNumber } : {}),
            ...(discountNumber !== undefined && discountNumber > 0 ? { discountReason: discountReason.trim() } : {}),
            ...(isOnlinePaid ? { paymentVerified: true } : {}),
            ...(expectedTableSessionId !== undefined ? { expectedTableSessionId } : {}),
          },
        }),
      );
      setTableDecision(null);
      if (!accepted) {
        return;
      }
      if (andPrint) {
        try {
          const docs = [buildReceiptDoc(accepted, { isDemo }), ...buildKitchenTicketDocs(accepted, kitchens)];
          await printMutation.mutateAsync({ docs });
        } catch (error) {
          onPrintFailure(accepted, getApiErrorMessage(error, "Failed to print"));
        }
      }
    } catch (error) {
      const conflict = getTableConflict(error);
      if (conflict) {
        setTableDecision({ conflict, andPrint });
        return;
      }
      setTableDecision(null);
      setActionError(tableErrorMessage(error, "Failed to accept order"));
    }
  }

  async function handleReject(reason: string, paymentRejected: boolean) {
    setActionError(null);
    try {
      await handle409(rejectMutation.mutateAsync({ id: order.id, input: { reason, paymentRejected } }));
      setIsRejectOpen(false);
    } catch (error) {
      setActionError(tableErrorMessage(error, "Failed to reject order"));
    }
  }

  async function handleSaveEdit() {
    setActionError(null);
    const items = order.items
      .filter((item) => item.dealOrderLineId === null)
      .map((item) => ({ id: item.id, quantity: editQuantities.get(item.id) ?? item.quantity }))
      .filter((item) => item.quantity > 0)
      .map((item) => {
        const original = order.items.find((candidate) => candidate.id === item.id)!;
        return {
          menuItemId: original.menuItemId,
          quantity: item.quantity,
          ...(original.variantId !== null ? { variantId: original.variantId } : {}),
          ...(original.addOns && original.addOns.length > 0
            ? { addOnIds: original.addOns.map((addOn) => addOn.addOnId) }
            : {}),
          ...(original.isCustomPrice ? { unitPrice: Number(original.unitPrice) } : {}),
          ...(original.notes ? { notes: original.notes } : {}),
        };
      });
    const deals = order.dealLines.map((line) => ({
      dealId: line.dealId ?? "",
      quantity: line.quantity,
      ...(line.notes ? { notes: line.notes } : {}),
      ...(line.customization
        ? {
            customization: {
              items: line.customization.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
              finalPrice: Number(line.unitPrice),
              ...(line.customization.reason !== undefined ? { reason: line.customization.reason } : {}),
            },
          }
        : {}),
    }));
    try {
      await handle409(
        updateSubmissionMutation.mutateAsync({
          id: order.id,
          input: { items, ...(deals.length > 0 ? { deals } : {}) },
        }),
      );
      setIsEditing(false);
    } catch (error) {
      setActionError(tableErrorMessage(error, "Failed to save changes"));
    }
  }

  const directItems = order.items.filter((item) => item.dealOrderLineId === null);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={order.source} label={isTableQr ? tableQrLabel(order, round) : ORDER_SOURCE_LABEL[order.source]} />
          {isPickup(order) && <StatusBadge status="PICKUP" label="PICKUP" />}
          <span className="text-body font-semibold text-ink">Order #{order.orderNumber}</span>
        </div>
        <span className={cn("rounded-card px-2 py-1 text-meta font-medium", timerTone)}>
          waiting {waitingMinutes} min
        </span>
      </div>

      {/* An online order: the code, who and where (tap to call), the fee, and how it is paid. */}
      {isOnline && <OnlineOrderInfo order={order} />}

      <div className="flex flex-col gap-0.5 text-body text-ink">
        {isTableQr && (
          <span>
            {areaLabel(order.diningArea?.area ?? null)} · sent by {order.tableGuest?.displayName ?? "a guest"}
          </span>
        )}
        {!isOnline &&
          !isTableQr &&
          (order.diningArea ? (
            <span>{order.diningArea.name}</span>
          ) : (
            <>
              {customer.name && (
                <span>
                  {customer.name}
                  {customer.phone && (
                    <>
                      {" "}
                      —{" "}
                      <a href={`tel:${customer.phone}`} className="text-accent no-underline hover:underline">
                        {customer.phone}
                      </a>
                    </>
                  )}
                </span>
              )}
              {customer.addressLines.map((line, index) => (
                <span key={index} className="text-meta text-ink-muted">
                  {line}
                </span>
              ))}
            </>
          ))}
        {order.placedByStaff && <span className="text-meta text-ink-muted">Taken by {order.placedByStaff.name}</span>}
        {order.scheduledFor && (
          <span className="text-meta font-medium text-status-active-text">
            Scheduled order for {formatShopTime(order.scheduledFor)}
          </span>
        )}
      </div>

      {needsProof && (
        <p role="alert" className="text-meta font-medium text-status-warning-text">
          No payment proof uploaded yet. Wait for the customer to send one, or switch this order to Cash below.
        </p>
      )}

      {!isEditing ? (
        <ul className="flex list-none flex-col gap-1 text-body text-ink">
          {directItems.map((item) => (
            <li key={item.id}>
              {item.quantity}× {item.menuItem.name}
              {item.variantLabel && <span className="text-meta text-ink-muted"> · {item.variantLabel}</span>}
              {item.addOns && item.addOns.length > 0 && (
                <span className="text-meta text-ink-muted"> (+ {item.addOns.map((addOn) => addOn.name).join(", ")})</span>
              )}
              {isTableQr && <GuestTag guest={item.tableGuest} />}
              {item.notes && <LineNote notes={item.notes} className="ml-4" />}
            </li>
          ))}
          {order.dealLines.map((line) => (
            <li key={line.id}>
              {line.quantity}× {line.dealName}
              {isTableQr && <GuestTag guest={line.tableGuest} />}
              {line.customization && (
                <div className="ml-4 flex flex-col text-meta text-ink-muted">
                  {line.customization.items.map((item, index) => (
                    <span key={index}>
                      {item.quantity}× {item.name}
                      {item.variantLabel && ` · ${item.variantLabel}`}
                    </span>
                  ))}
                </div>
              )}
              {line.notes && <LineNote notes={line.notes} className="ml-4" />}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {directItems.map((item) => {
            const quantity = editQuantities.get(item.id) ?? item.quantity;
            return (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-body text-ink">
                  {item.menuItem.name}
                  {item.variantLabel && <span className="text-meta text-ink-muted"> · {item.variantLabel}</span>}
                  {isTableQr && <GuestTag guest={item.tableGuest} />}
                  {item.notes && <LineNote notes={item.notes} />}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    className="w-9 px-0"
                    onClick={() =>
                      setEditQuantities((prev) => new Map(prev).set(item.id, Math.max(0, quantity - 1)))
                    }
                  >
                    −
                  </Button>
                  <span className="w-6 text-center text-numeric text-ink">{quantity}</span>
                  <Button
                    variant="secondary"
                    className="w-9 px-0"
                    onClick={() => setEditQuantities((prev) => new Map(prev).set(item.id, quantity + 1))}
                  >
                    +
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {order.notes && <p className="text-meta text-ink-muted">Note: {order.notes}</p>}

      <div className="flex items-center justify-between border-t border-border pt-2 text-body font-semibold text-ink">
        <span>Total</span>
        <span className="text-numeric">{formatMoney(order.totalAmount)}</span>
      </div>

      {actionError && <p role="alert" className="text-meta text-status-danger-text">{actionError}</p>}

      {isEditing ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setIsEditing(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button variant="success" className="flex-1" onClick={handleSaveEdit} disabled={isBusy}>
            {updateSubmissionMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SegmentedControl
              name={`payment-method-${order.id}`}
              legend="Payment method"
              options={PAYMENT_METHOD_OPTIONS}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
            {!isOnlineAdmin && (
              <label className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-ink-muted">Discount (optional)</span>
                <Input type="number" min={0} step={0.01} value={discount} onChange={(event) => setDiscount(event.target.value)} />
                <DiscountCapHint />
              </label>
            )}
            {!isOnlineAdmin && Number(discount) > 0 && (
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-meta font-medium text-ink-muted">Discount reason (required)</span>
                <Input
                  value={discountReason}
                  maxLength={200}
                  onChange={(event) => setDiscountReason(event.target.value)}
                  placeholder="e.g. regular customer, late order"
                />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="success" className="flex-1" onClick={() => handleAccept(false)} disabled={isBusy || needsProof}>
              {acceptMutation.isPending
                ? "Sending…"
                : isOnlinePaid
                  ? "Verify payment and send to kitchen"
                  : "Send to kitchen"}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => handleAccept(true)} disabled={isBusy || needsProof}>
              Print and send to kitchen
            </Button>
            {!isOnlineAdmin && (
              <Button variant="secondary" onClick={() => setIsEditing(true)} disabled={isBusy}>
                Edit
              </Button>
            )}
            <Button variant="danger" onClick={() => setIsRejectOpen(true)} disabled={isBusy}>
              Reject
            </Button>
          </div>
        </>
      )}

      <RejectReasonModal
        isOpen={isRejectOpen}
        orderNumber={order.orderNumber}
        onClose={() => setIsRejectOpen(false)}
        onConfirm={handleReject}
        isSubmitting={rejectMutation.isPending}
        isOnline={isOnline}
        isPickup={isPickup(order)}
      />

      <TableConflictDialog
        conflict={tableDecision?.conflict ?? null}
        tableName={order.diningArea?.name ?? "This table"}
        isSubmitting={acceptMutation.isPending}
        pickAnotherLabel="Not now"
        onClose={() => {
          setTableDecision(null);
          setActionError("Not sent. To put it on another table, open the order and use Move to table, then send it.");
        }}
        onConfirm={(expectedTableSessionId) => tableDecision && void handleAccept(tableDecision.andPrint, expectedTableSessionId)}
      />
    </div>
  );
}
