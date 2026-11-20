import { useState } from "react";
import { Link } from "react-router-dom";
import type { FloorTable, TableSessionDetail } from "../../api/tables";
import { Button, ConfirmDialog, FormActions, Input, Modal, Textarea, buttonClassName } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useFloorPlan, useMergeTableSession, useMoveTableSession, usePrintTableBill, useSettleTable, useCloseTableSession, useVoidTableSession } from "../../hooks/useTables";
import { formatMoney } from "../../lib/format";
import { tableErrorCode, tableErrorMessage } from "../../lib/tableErrors";
import { getApiErrorBody } from "../../api/errors";
import { SegmentedControl } from "../newOrder/SegmentedControl";
import { TablePickerDialog } from "./TablePickerDialog";
import { amountOwed, closeBlockers } from "./tableSessionRules";

// Table sync (docs/TABLE_SYNC_SPEC.md R3, R4, R5, R7, R13): the table side sheet's actions for an open
// table — new order, move the party, merge, print the running bill, and closing (with what blocks it).

const tableTitle = (table: { name: string; area: string | null }) => (table.area ? `${table.area} · ${table.name}` : table.name);

/** "New order for this table": the POS's New Order (admins) or the order taker's Take order, table picked. */
export function NewOrderForTableLink({ table, isAdmin }: { table: FloorTable; isAdmin: boolean }) {
  const to = isAdmin ? `/orders/new?table=${table.id}` : `/take-order?table=${table.id}`;
  return (
    <Link to={to} className={buttonClassName("primary", "md", "w-full")}>
      New order for {table.name}
    </Link>
  );
}

// ---------------- Move the party / merge ----------------

export function MoveMergeBlock({ table, sessionId }: { table: FloorTable; sessionId: string }) {
  const { data: floor } = useFloorPlan();
  const move = useMoveTableSession();
  const merge = useMergeTableSession();
  const [dialog, setDialog] = useState<"move" | "merge" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped per opening, so the picker starts at its first step each time.
  const [opening, setOpening] = useState(0);
  const others = (floor?.tables ?? []).filter((candidate) => candidate.id !== table.id && !candidate.inactive);

  function open(kind: "move" | "merge") {
    setError(null);
    setOpening((count) => count + 1);
    setDialog(kind);
  }

  function close() {
    setDialog(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => open("move")}>
          Move party
        </Button>
        <Button variant="secondary" onClick={() => open("merge")}>
          Merge tables
        </Button>
      </div>

      <TablePickerDialog
        key={`move-${opening}`}
        isOpen={dialog === "move"}
        onClose={close}
        title={`Move ${table.name}'s party to…`}
        candidates={others}
        disabledReason={(candidate) =>
          candidate.state === "UNAVAILABLE" ? "Out of service" : candidate.session ? "Taken — merge instead" : null
        }
        describe={(target) => (
          <p className="m-0">
            Move everyone at <strong>{tableTitle(table)}</strong> to <strong>{tableTitle(target)}</strong>? Their open orders, bill and
            waiter calls go with them, the kitchen sees the new table, and guests' phones keep working. {table.name} becomes free.
          </p>
        )}
        confirmLabel={(target) => `Move to ${target.name}`}
        isPending={move.isPending}
        error={error}
        onConfirm={(target) => {
          setError(null);
          move.mutate(
            { sessionId, diningAreaId: target.id },
            { onSuccess: close, onError: (moveError) => setError(tableErrorMessage(moveError, "Couldn't move the party.")) },
          );
        }}
      />

      <TablePickerDialog
        key={`merge-${opening}`}
        isOpen={dialog === "merge"}
        onClose={close}
        title={`Merge ${table.name} with…`}
        candidates={others}
        disabledReason={(candidate) => {
          if (!candidate.session) {
            return candidate.state === "UNAVAILABLE" ? "Out of service" : "Free — move the party instead";
          }
          if (candidate.session.id === sessionId) {
            return "Already on this bill";
          }
          if (candidate.session.fromPreviousDay) {
            return "From yesterday";
          }
          return null;
        }}
        describe={(target) => (
          <p className="m-0">
            Put <strong>{tableTitle(table)}</strong> on <strong>{tableTitle(target)}</strong>'s bill? Both parties share one bill; {table.name}{" "}
            stays taken, joined to {target.name}, and guests from both tables keep their phones. Not possible once someone has paid a share.
          </p>
        )}
        confirmLabel={(target) => `Merge into ${target.name}`}
        isPending={merge.isPending}
        error={error}
        onConfirm={(target) => {
          setError(null);
          merge.mutate(
            { sessionId, intoSessionId: target.session!.id },
            { onSuccess: close, onError: (mergeError) => setError(tableErrorMessage(mergeError, "Couldn't merge the tables.")) },
          );
        }}
      />
    </div>
  );
}

// ---------------- The running bill on paper ----------------

export function PrintRunningBillButton({ sessionId, className = "w-full" }: { sessionId: string; className?: string }) {
  const print = usePrintTableBill();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        className={className}
        disabled={print.isPending}
        onClick={() => {
          setMessage(null);
          print.mutate(sessionId, {
            onSuccess: () => setMessage({ tone: "success", text: "Bill sent to the printer." }),
            onError: (printError) => setMessage({ tone: "error", text: tableErrorMessage(printError, "Couldn't print the bill.") }),
          });
        }}
      >
        {print.isPending ? "Printing…" : "Print table bill"}
      </Button>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "m-0 text-meta text-status-danger-text" : "m-0 text-meta text-status-success-text"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

// ---------------- Closing: what blocks it, Settle, and the admins' Force ----------------

export interface SettledInfo {
  tableName: string;
  change: string | null;
}

export function CloseGuardBlock({
  detail,
  isAdmin,
  onSettled,
}: {
  detail: TableSessionDetail;
  isAdmin: boolean;
  onSettled: (info: SettledInfo) => void;
}) {
  const { staff } = useAuth();
  const close = useCloseTableSession();
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [isForcing, setIsForcing] = useState(false);
  const sessionId = detail.session.id;
  const blockers = closeBlockers(detail);
  const owed = amountOwed(detail);
  const billRequested = detail.bill?.status === "REQUESTED";
  const hasAwaiting = detail.orders.some((order) => order.status === "AWAITING_RECEPTION");
  // An order taker settles only the tables they wait on, in cash (the server checks too).
  const canSettle = owed > 0 && !billRequested && !hasAwaiting && (isAdmin || detail.session.waiterStaff?.id === staff?.id);

  function handleClose() {
    setCloseError(null);
    close.mutate(sessionId, {
      onSuccess: () => setIsConfirmingClose(false),
      onError: (error) => {
        const body = getApiErrorBody(error);
        const numbers = body?.openOrders?.map((order) => `#${order.orderNumber}`).join(", ");
        setCloseError(`${tableErrorMessage(error, "Couldn't close this table.")}${numbers ? ` (${numbers})` : ""}`);
      },
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 className="m-0 text-card-head font-semibold text-ink">Close table</h3>
      {blockers.length === 0 ? (
        <p className="m-0 text-body text-ink-muted">Nothing is open or owed. Closing signs out guests' phones and frees the table.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-body font-medium text-ink">Not ready to close:</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body text-ink">
            {blockers.map((blocker) => (
              <li key={blocker.key}>
                {blocker.text}{" "}
                {blocker.toIncoming && isAdmin && (
                  <Link to="/incoming-orders" className="font-medium text-accent">
                    Open Incoming
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canSettle && (
        <Button onClick={() => setIsSettling(true)} className="w-full">
          Settle {formatMoney(owed)} and close
        </Button>
      )}
      {blockers.length === 0 && (
        <Button variant="secondary" className="w-full" onClick={() => setIsConfirmingClose(true)}>
          Close table
        </Button>
      )}
      {isAdmin && blockers.length > 0 && (
        <Button variant="danger" className="w-full" onClick={() => setIsForcing(true)}>
          Force close…
        </Button>
      )}

      <ConfirmDialog
        isOpen={isConfirmingClose}
        onClose={() => {
          setIsConfirmingClose(false);
          setCloseError(null);
        }}
        onConfirm={handleClose}
        title={`Close ${detail.table.name}?`}
        message="Guests' phones are signed out and the table shows as free."
        confirmLabel="Close table"
        confirmingLabel="Closing…"
        confirmVariant="primary"
        isConfirming={close.isPending}
        error={closeError}
      />

      {isSettling && (
        <SettleDialog
          detail={detail}
          owed={owed}
          canDiscount={isAdmin}
          canPayOnline={isAdmin}
          onClose={() => setIsSettling(false)}
          onSettled={(info) => {
            setIsSettling(false);
            onSettled(info);
          }}
        />
      )}

      {isForcing && (
        <ForceCloseDialog
          detail={detail}
          canSettle={canSettle}
          onSettle={() => {
            setIsForcing(false);
            setIsSettling(true);
          }}
          onClose={() => setIsForcing(false)}
        />
      )}
    </section>
  );
}

function SettleDialog({
  detail,
  owed,
  canDiscount,
  canPayOnline,
  onClose,
  onSettled,
}: {
  detail: TableSessionDetail;
  owed: number;
  canDiscount: boolean;
  canPayOnline: boolean;
  onClose: () => void;
  onSettled: (info: SettledInfo) => void;
}) {
  const settle = useSettleTable();
  const [method, setMethod] = useState<"CASH" | "ONLINE">("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const discountValue = discount.trim() === "" ? 0 : Number(discount);
  const due = Math.max(0, owed - (Number.isFinite(discountValue) ? discountValue : 0));
  const received = paidAmount.trim() === "" ? null : Number(paidAmount);
  const change = received !== null && Number.isFinite(received) ? received - due : null;

  function handleSettle() {
    setError(null);
    settle.mutate(
      {
        sessionId: detail.session.id,
        input: {
          method,
          ...(method === "CASH" && paidAmount.trim() !== "" ? { paidAmount: paidAmount.trim() } : {}),
          ...(discount.trim() !== "" && discountValue > 0 ? { discount: discount.trim(), discountReason: discountReason.trim() || undefined } : {}),
        },
      },
      {
        onSuccess: (result) => onSettled({ tableName: detail.table.name, change: result.change }),
        onError: (settleError) => setError(tableErrorMessage(settleError, "Couldn't settle the table.")),
      },
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={`Settle ${detail.table.name}`}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-ink">
          Every unpaid order at this table, paid at the counter in one go, then the table closes. Total due{" "}
          <strong className="tabular-nums">{formatMoney(due)}</strong>.
        </p>
        {canPayOnline && (
          <SegmentedControl
            name="settle-method"
            legend="Paid by"
            options={[
              { value: "CASH", label: "Cash" },
              { value: "ONLINE", label: "Online (seen at the counter)" },
            ]}
            value={method}
            onChange={setMethod}
            fullWidth
          />
        )}
        {method === "CASH" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-meta font-medium text-ink-muted">Cash received (optional)</span>
            <Input inputMode="decimal" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder={due.toFixed(2)} />
            {change !== null && change >= 0 && <span className="text-meta text-ink-muted tabular-nums">Change: {formatMoney(change)}</span>}
            {change !== null && change < 0 && <span className="text-meta text-status-danger-text">Less than the total due.</span>}
          </label>
        )}
        {canDiscount && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Discount (optional)</span>
              <Input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Discount reason</span>
              <Input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Required above zero" />
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-body text-status-danger-text">
            {error}
          </p>
        )}
        <FormActions>
          <Button variant="secondary" onClick={onClose} disabled={settle.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSettle} disabled={settle.isPending || (change !== null && change < 0)}>
            {settle.isPending ? "Settling…" : `Settle and close`}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

// Admins only. There is no "close and forget the money": a table with accepted orders is settled (or its
// orders cancelled one by one, each with a reason). What can be forced is a table with nothing accepted —
// seated by mistake, guests gone — which is voided; rounds still at reception are rejected with it.
function ForceCloseDialog({
  detail,
  canSettle,
  onSettle,
  onClose,
}: {
  detail: TableSessionDetail;
  canSettle: boolean;
  onSettle: () => void;
  onClose: () => void;
}) {
  const voidSession = useVoidTableSession();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accepted = detail.orders.filter((order) => order.status !== "CANCELLED" && order.status !== "AWAITING_RECEPTION");
  const canVoid = accepted.length === 0;

  return (
    <Modal isOpen onClose={onClose} title={`Force close ${detail.table.name}`}>
      <div className="flex flex-col gap-4">
        {canVoid ? (
          <>
            <p className="m-0 text-body text-ink">
              Void this table: it closes without a sale and guests' phones are signed out.
              {detail.orders.some((order) => order.status === "AWAITING_RECEPTION") && " Rounds still at reception are rejected with the reason below."}
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-muted">Reason (required)</span>
              <Textarea value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Seated by mistake, guests left" />
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-2 text-body text-ink">
            <p className="m-0">
              This table has {accepted.length} accepted {accepted.length === 1 ? "order" : "orders"}, so it can't be closed without dealing with the money:
            </p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              <li>{canSettle ? "Settle it — take what's owed and close in one step." : "Finish the bill that's being paid, then close."}</li>
              <li>
                Or cancel each order from its page (a reason is required):{" "}
                {accepted.map((order, index) => (
                  <span key={order.id}>
                    {index > 0 && ", "}
                    <Link to={`/orders/${order.id}`} className="font-medium text-accent">
                      #{order.orderNumber}
                    </Link>
                  </span>
                ))}
                .
              </li>
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="m-0 text-body text-status-danger-text">
            {error}
          </p>
        )}
        <FormActions>
          <Button variant="secondary" onClick={onClose} disabled={voidSession.isPending}>
            Back
          </Button>
          {canVoid ? (
            <Button
              variant="danger"
              disabled={voidSession.isPending || reason.trim() === ""}
              onClick={() => {
                setError(null);
                voidSession.mutate(
                  { sessionId: detail.session.id, reason: reason.trim() },
                  {
                    onSuccess: onClose,
                    onError: (voidError) =>
                      setError(
                        tableErrorCode(voidError) === "SESSION_HAS_ORDERS"
                          ? "An order on this table was accepted meanwhile — settle it instead."
                          : tableErrorMessage(voidError, "Couldn't void the table."),
                      ),
                  },
                );
              }}
            >
              {voidSession.isPending ? "Voiding…" : "Void table"}
            </Button>
          ) : (
            canSettle && <Button onClick={onSettle}>Settle instead</Button>
          )}
        </FormActions>
      </div>
    </Modal>
  );
}

/** The table this one is merged into: its orders and bill live there. */
export function JoinedToNote({ table, isAdmin }: { table: FloorTable; isAdmin: boolean }) {
  const joinedTo = table.session?.joinedTo;
  if (!joinedTo) {
    return null;
  }
  return (
    <p role="status" className="m-0 rounded-card border border-status-active bg-status-active-bg px-3 py-2 text-body text-ink">
      {table.name} is joined to <strong>{joinedTo.name}</strong> — its orders and bill are on {joinedTo.name}.{" "}
      <Link to={`${isAdmin ? "/tables" : "/taker-tables"}?table=${joinedTo.tableId}`} className="font-medium text-accent">
        Open {joinedTo.name}
      </Link>
    </p>
  );
}

