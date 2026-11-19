import { useState } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { TableBill } from "../../api/tables";
import {
  useMarkTableSharePaid,
  useRejectTableShare,
  useRequestTableBill,
  useSetTableBillDiscount,
  useSetTableBillSplit,
  usePrintTableReceipt,
  useTableReceipt,
  useVerifyTableShare,
} from "../../hooks/useTableBill";
import { useCloseTableSession } from "../../hooks/useTables";
import { ProofImage } from "../../components/PaymentProof";
import { fetchTableShareProof } from "../../api/tables";
import { Button, Card, Input, Select, StatusBadge } from "../../components/ui";
import { formatMoney } from "../../lib/format";

interface TableBillPanelProps {
  sessionId: string;
  bill: TableBill | null;
  isAdmin: boolean;
}

const shareTone = (status: TableBill["shares"][number]["status"]) => {
  if (status === "VERIFIED") return "success" as const;
  if (status === "PROOF_SUBMITTED") return "warning" as const;
  if (status === "REJECTED") return "danger" as const;
  return "neutral" as const;
};

function ReceiptActions({ sessionId }: { sessionId: string }) {
  const print = usePrintTableReceipt(sessionId);
  const [error, setError] = useState<string | null>(null);

  async function handlePrint() {
    setError(null);
    try {
      await print.mutateAsync();
    } catch (reason) {
      setError(getApiErrorMessage(reason, "Could not print the table receipt."));
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={handlePrint} disabled={print.isPending}>
        {print.isPending ? "Printing…" : "Print table receipt"}
      </Button>
      <Button variant="secondary" onClick={() => window.open(`/table-sessions/${sessionId}/print/receipt`, "_blank")}>
        Open browser print
      </Button>
      {error && <p role="alert" className="basis-full m-0 text-body text-status-danger-text">{error}</p>}
    </div>
  );
}

export function TableBillPanel({ sessionId, bill, isAdmin }: TableBillPanelProps) {
  const request = useRequestTableBill(sessionId);
  const discount = useSetTableBillDiscount(sessionId);
  const split = useSetTableBillSplit(sessionId);
  const markPaid = useMarkTableSharePaid(sessionId);
  const verify = useVerifyTableShare(sessionId);
  const reject = useRejectTableShare(sessionId);
  const close = useCloseTableSession();
  const receiptQuery = useTableReceipt(sessionId, bill?.status === "PAID");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [parts, setParts] = useState("2");
  const [customAmounts, setCustomAmounts] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  if (!bill) {
    return (
      <Card title="Table bill">
        <div className="flex flex-col gap-3">
          <p className="m-0 text-body text-ink-muted">Request one bill for all rounds at this table. Ordering pauses for the table.</p>
          <Button onClick={() => request.mutate(undefined, { onError: (reason) => setError(getApiErrorMessage(reason, "Could not request the bill.")) })} disabled={request.isPending}>
            {request.isPending ? "Requesting…" : "Request bill"}
          </Button>
          {error && <p role="alert" className="m-0 text-body text-status-danger-text">{error}</p>}
        </div>
      </Card>
    );
  }

  const hasPayments = bill.shares.some((share) => share.status === "PROOF_SUBMITTED" || share.status === "VERIFIED");
  const allPaid = bill.status === "PAID";
  const canSplit = !bill.blockedReason && !bill.needsSplit && !hasPayments;

  function run(action: () => Promise<unknown>) {
    setError(null);
    void action().catch((reason) => setError(getApiErrorMessage(reason, "Could not update the table bill.")));
  }

  return (
    <Card title="Table bill">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-body sm:grid-cols-4">
          <div><span className="block text-meta text-ink-muted">Subtotal</span>{formatMoney(bill.subtotal)}</div>
          <div><span className="block text-meta text-ink-muted">Discount</span>-{formatMoney(bill.discount)}</div>
          <div><span className="block text-meta text-ink-muted">Total</span><strong>{formatMoney(bill.total)}</strong></div>
          <div><span className="block text-meta text-ink-muted">Status</span><StatusBadge status={bill.status} /></div>
        </div>

        {isAdmin && !allPaid && (
          <div className="grid gap-2 rounded-card border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="Discount (Rs)" inputMode="decimal" />
            <Input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Reason (required above zero)" />
            <Button
              variant="secondary"
              disabled={discount.isPending || discountValue === ""}
              onClick={() => run(() => discount.mutateAsync({ discount: discountValue, discountReason: discountReason || undefined, expectedVersion: bill.version }))}
            >
              Apply discount
            </Button>
          </div>
        )}

        {!allPaid && isAdmin && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-meta text-ink-muted">
              Split
              <Select value={parts} onChange={(event) => setParts(event.target.value)}>
                {Array.from({ length: 10 }, (_, index) => <option key={index + 2} value={index + 2}>{index + 2} equal shares</option>)}
              </Select>
            </label>
            <Button variant="secondary" disabled={!canSplit || split.isPending} onClick={() => run(() => split.mutateAsync({ mode: "EQUAL", parts: Number(parts), expectedVersion: bill.version }))}>
              Split equally
            </Button>
            <Button variant="secondary" disabled={!canSplit || split.isPending} onClick={() => run(() => split.mutateAsync({ mode: "BY_ITEMS", expectedVersion: bill.version }))}>
              Split by items
            </Button>
            <div className="flex flex-wrap items-end gap-1">
              {customAmounts.map((amount, index) => (
                <Input key={index} className="w-24" value={amount} onChange={(event) => setCustomAmounts((current) => current.map((value, i) => i === index ? event.target.value : value))} placeholder={`Share ${index + 1}`} inputMode="decimal" />
              ))}
              <Button variant="secondary" onClick={() => setCustomAmounts((current) => [...current, ""])} disabled={customAmounts.length >= 20}>+ share</Button>
              <Button variant="secondary" disabled={!canSplit || customAmounts.some((amount) => amount === "") || split.isPending} onClick={() => run(() => split.mutateAsync({ mode: "CUSTOM", shares: customAmounts.map((amount) => ({ amount })), expectedVersion: bill.version }))}>
                Split custom
              </Button>
            </div>
          </div>
        )}

        {bill.blockedReason && <p className="m-0 text-body text-status-warning-text">Finish accepting the table's waiting rounds before splitting or settling.</p>}
        {bill.needsSplit && <p className="m-0 text-body text-status-warning-text">The bill changed. Split it again before collecting payment.</p>}

        {bill.shares.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center justify-between"><h3 className="m-0 text-card-head font-semibold">Shares</h3><span className="text-meta text-ink-muted">{bill.shares.filter((share) => share.status === "VERIFIED").length} / {bill.shares.length} paid</span></div>
            {bill.shares.map((share) => (
              <div key={share.id} className="flex flex-col gap-2 rounded-card border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{share.label} · {formatMoney(share.amount)}</span>
                  <StatusBadge status={share.status} tone={shareTone(share.status)} />
                </div>
                <span className="text-meta text-ink-muted">
                  Payment: {share.method === "ONLINE" ? "Online" : share.method === "CASH" ? "Cash" : "Not chosen"}
                </span>
                {share.status === "PROOF_SUBMITTED" && share.hasProof && (
                  <div className="flex flex-wrap items-start gap-3">
                    <ProofImage ownerKey={`table-share:${share.id}`} proofMediaId={share.proofMediaId} fetchProof={(size) => fetchTableShareProof(sessionId, share.id, size)} />
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="success" onClick={() => run(() => verify.mutateAsync(share.id))} disabled={verify.isPending}>Verify proof</Button>
                        <Input value={rejectReasons[share.id] ?? ""} onChange={(event) => setRejectReasons((current) => ({ ...current, [share.id]: event.target.value }))} placeholder="Reject reason" />
                        <Button variant="danger" onClick={() => run(() => reject.mutateAsync({ shareId: share.id, reason: rejectReasons[share.id] ?? "" }))} disabled={reject.isPending || !(rejectReasons[share.id] ?? "").trim()}>Reject</Button>
                      </div>
                    )}
                  </div>
                )}
                {!isAdmin && share.status === "UNPAID" && share.method !== "ONLINE" && (
                  <Button variant="secondary" className="self-start" onClick={() => run(() => markPaid.mutateAsync({ shareId: share.id, paidAmount: null }))} disabled={markPaid.isPending}>
                    Mark cash collected
                  </Button>
                )}
                {isAdmin && share.status === "UNPAID" && share.method !== "ONLINE" && (
                  <Button variant="secondary" className="self-start" onClick={() => run(() => markPaid.mutateAsync({ shareId: share.id, paidAmount: null }))} disabled={markPaid.isPending}>
                    Mark cash collected
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {allPaid && receiptQuery.data && <ReceiptActions sessionId={sessionId} />}
        {allPaid && (
          <Button onClick={() => run(() => close.mutateAsync(sessionId))} disabled={close.isPending}>
            {close.isPending ? "Closing…" : "Close table"}
          </Button>
        )}
        {error && <p role="alert" className="m-0 text-body text-status-danger-text">{error}</p>}
      </div>
    </Card>
  );
}
