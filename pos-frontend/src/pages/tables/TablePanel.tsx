import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { getApiErrorBody, getApiErrorMessage } from "../../api/errors";
import type { FloorTable, TableSessionOrder } from "../../api/tables";
import { OrderStatusBadge } from "../../components/OrderStatusBadge";
import { Button, ConfirmDialog, StatusBadge, buttonClassName } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { Icon } from "../../components/shell/icons";
import {
  isOptimisticSessionId,
  useCloseTableSession,
  useRegenerateTableQrKey,
  useRotateTablePin,
  useSeatTable,
  useTableSession,
} from "../../hooks/useTables";
import { formatMoney, formatTime } from "../../lib/format";
import { useTableCallsContext } from "../../context/TableCallsContext";
import { CallCard } from "./CallCard";
import { PanelSkeleton } from "./FloorSkeleton";
import { TABLE_STATE_META, areaLabel, formatElapsed } from "./tableStates";

interface TablePanelProps {
  table: FloorTable;
  now: number;
  // SUPER_ADMIN / POS_ADMIN: regenerate QR, links into Orders and Incoming. ORDER_TAKER: floor actions only.
  isAdmin: boolean;
  // Present in the bottom sheet (a close button); the docked desktop panel has none.
  onClose?: () => void;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-card-head font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-body text-status-danger-text">
      {children}
    </p>
  );
}

// Everything about one table, for whoever works the floor. Keyed by table id by the caller, so
// local state (a revealed PIN, an error) never leaks from one table to the next.
export function TablePanel({ table, now, isAdmin, onClose }: TablePanelProps) {
  const { label: stateLabel, tone } = TABLE_STATE_META[table.state];
  const session = table.session;
  const { calls } = useTableCallsContext();
  const tableCalls = calls.filter((call) => call.table.id === table.id);
  // Owned here, not in SeatBlock: the optimistic update swaps SeatBlock out the moment Seat is tapped,
  // and React Query drops mutate() callbacks of an unmounted caller — the new PIN would be lost.
  const seat = useSeatTable();
  const [freshPin, setFreshPin] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);

  function handleSeat() {
    setSeatError(null);
    seat.mutate(table.id, {
      onSuccess: (result) => setFreshPin(result.pin),
      onError: (error) => setSeatError(getApiErrorMessage(error, "Couldn't seat this table")),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 truncate font-heading text-section font-semibold text-ink">{table.name}</h2>
          <p className="m-0 text-meta text-ink-muted">
            {areaLabel(table.area)}
            {table.capacity ? ` · ${table.capacity} seats` : ""}
          </p>
          <StatusBadge status={table.state} tone={tone} label={stateLabel} />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close table details"
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-card border-0 bg-transparent text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {tableCalls.length > 0 && (
        <Section title="Waiter calls">
          <ul className="m-0 p-0 flex list-none flex-col gap-2">
            {tableCalls.map((call) => (
              <CallCard key={call.id} call={call} now={now} showTable={false} />
            ))}
          </ul>
        </Section>
      )}

      {table.state === "UNAVAILABLE" && !session && (
        // No "turn it back on" pointer yet: the Dining areas out-of-service switch comes in a later step.
        <p className="m-0 text-body text-ink-muted">This table is out of service and can't be seated.</p>
      )}

      {!session && table.state !== "UNAVAILABLE" && <SeatBlock onSeat={handleSeat} isSeating={seat.isPending} error={seatError} />}

      {session && (
        <SessionBlock key={session.id} sessionId={session.id} now={now} isAdmin={isAdmin} freshPin={freshPin} />
      )}

      {isAdmin && <RegenerateQrBlock table={table} />}
    </div>
  );
}

function SeatBlock({ onSeat, isSeating, error }: { onSeat: () => void; isSeating: boolean; error: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-body text-ink-muted">Free. Seat it when guests sit down — their phones can then join from the table's QR.</p>
      {error && <ErrorText>{error}</ErrorText>}
      <Button onClick={onSeat} disabled={isSeating} className="w-full">
        Seat table
      </Button>
    </div>
  );
}

function SessionBlock({
  sessionId,
  now,
  isAdmin,
  freshPin,
}: {
  sessionId: string;
  now: number;
  isAdmin: boolean;
  freshPin: string | null;
}) {
  const { data, isPending, error } = useTableSession(sessionId);

  if (isOptimisticSessionId(sessionId) || isPending) {
    return (
      <div className="flex flex-col gap-3">
        {freshPin === null && isOptimisticSessionId(sessionId) && <p className="m-0 text-body text-ink-muted">Seating…</p>}
        <PanelSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorText>{getApiErrorMessage(error, "Couldn't load this table's session")}</ErrorText>;
  }

  const activeGuests = data.guests.filter((guest) => !guest.revoked);

  return (
    <div className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-body">
        <div>
          <dt className="text-meta text-ink-muted">Seated</dt>
          <dd className="m-0 tabular-nums lining-nums">
            {formatTime(data.session.seatedAt)} · {formatElapsed(data.session.seatedAt, now)}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-ink-muted">Waiter</dt>
          <dd className="m-0 truncate">{data.session.waiterStaff?.name ?? "Anyone"}</dd>
        </div>
      </dl>

      <PinBlock sessionId={sessionId} pin={data.session.pin} freshPin={freshPin} />

      <Section title="Guests" aside={<span className="text-meta text-ink-muted tabular-nums">{activeGuests.length} joined</span>}>
        {data.guests.length === 0 ? (
          <p className="m-0 text-body text-ink-muted">No one has joined from a phone yet.</p>
        ) : (
          <ul className="m-0 p-0 flex list-none flex-col gap-1">
            {data.guests.map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-2 text-body">
                <span className={cn("truncate", guest.revoked && "text-ink-muted line-through")}>{guest.displayName}</span>
                <span className="shrink-0 text-meta text-ink-muted tabular-nums">
                  {guest.revoked ? "Removed" : `joined ${formatTime(guest.joinedAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Orders" aside={<span className="text-meta text-ink-muted tabular-nums">{data.orders.length}</span>}>
        {data.orders.length === 0 ? (
          <p className="m-0 text-body text-ink-muted">No orders yet.</p>
        ) : (
          <ul className="m-0 p-0 flex list-none flex-col gap-2">
            {data.orders.map((order) => (
              <OrderRow key={order.id} order={order} canOpen={isAdmin} />
            ))}
          </ul>
        )}
      </Section>

      <CloseBlock sessionId={sessionId} />
    </div>
  );
}

function OrderRow({ order, canOpen }: { order: TableSessionOrder; canOpen: boolean }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0) + order.dealLines.reduce((sum, line) => sum + line.quantity, 0);
  const title = `#${order.orderNumber}`;
  // A round still at reception is opened from Incoming Orders; everything else from its own page.
  const to = order.status === "AWAITING_RECEPTION" ? "/incoming-orders" : `/orders/${order.id}`;
  return (
    <li className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-raised px-3 py-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-body font-medium">
          {canOpen ? (
            <Link to={to} className="text-accent">
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
          <span className="truncate text-ink-muted">{order.tableGuest?.displayName ?? "Staff"}</span>
        </span>
        <span className="text-meta text-ink-muted tabular-nums">
          {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(order.totalAmount)} · {formatTime(order.createdAt)}
        </span>
      </span>
      <span className="shrink-0">
        <OrderStatusBadge order={order} />
      </span>
    </li>
  );
}

function PinBlock({ sessionId, pin, freshPin }: { sessionId: string; pin: string | null; freshPin: string | null }) {
  const rotate = useRotateTablePin();
  // Hidden by default (guests can see this screen); shown at once right after seating or a new PIN.
  // Derived, not a starting state: a live refetch can mount this block before the seat request's
  // answer (and so the fresh PIN) has arrived. null = the user hasn't toggled it.
  const [toggledShown, setToggledShown] = useState<boolean | null>(null);
  const isShown = toggledShown ?? freshPin !== null;
  const [error, setError] = useState<string | null>(null);
  const shownPin = rotate.data?.pin ?? pin ?? freshPin;

  if (shownPin === null) {
    return <p className="m-0 text-meta text-ink-muted">No join PIN — the PIN setting was off when this table was seated.</p>;
  }

  function handleRotate() {
    setError(null);
    rotate.mutate(sessionId, {
      onSuccess: () => setToggledShown(true),
      onError: (rotateError) => setError(getApiErrorMessage(rotateError, "Couldn't make a new PIN")),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-meta text-ink-muted">Join PIN</span>
          <span
            className="font-body text-title font-semibold tracking-[0.3em] text-ink tabular-nums lining-nums"
            aria-live="polite"
          >
            {isShown ? shownPin : "••••"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setToggledShown(!isShown)}>
            {isShown ? "Hide" : "Show PIN"}
          </Button>
          <Button variant="secondary" onClick={handleRotate} disabled={rotate.isPending}>
            New PIN
          </Button>
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function CloseBlock({ sessionId }: { sessionId: string }) {
  const close = useCloseTableSession();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    close.mutate(sessionId, {
      onSuccess: () => setIsConfirming(false),
      onError: (closeError) => {
        const body = getApiErrorBody(closeError);
        const numbers = body?.openOrders?.map((order) => `#${order.orderNumber}`).join(", ");
        setError(`${getApiErrorMessage(closeError, "Couldn't close this table")}${numbers ? ` (${numbers})` : ""}`);
      },
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Button variant="secondary" className="w-full" onClick={() => setIsConfirming(true)}>
        Close table
      </Button>
      <ConfirmDialog
        isOpen={isConfirming}
        onClose={() => {
          setIsConfirming(false);
          setError(null);
        }}
        onConfirm={handleClose}
        title="Close this table?"
        message="Guests' phones are signed out and the table shows as free. Every order must be completed or cancelled first."
        confirmLabel="Close table"
        confirmingLabel="Closing…"
        confirmVariant="primary"
        isConfirming={close.isPending}
        error={error}
      />
    </div>
  );
}

function RegenerateQrBlock({ table }: { table: FloorTable }) {
  const regenerate = useRegenerateTableQrKey();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleRegenerate() {
    setError(null);
    regenerate.mutate(table.id, {
      onSuccess: () => {
        setDone(true);
        setIsConfirming(false);
      },
      onError: (regenerateError) => setError(getApiErrorMessage(regenerateError, "Couldn't make a new QR code")),
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      {done && (
        <p role="status" className="text-body text-status-success-text">
          New QR code made. The old printed card no longer works —{" "}
          <Link to="/tables/qr-sheet" className="font-medium underline">
            print a new one for {table.name}
          </Link>
          .
        </p>
      )}
      <button type="button" onClick={() => setIsConfirming(true)} className={buttonClassName("danger", "md", "w-full")}>
        Regenerate QR
      </button>
      <ConfirmDialog
        isOpen={isConfirming}
        onClose={() => {
          setIsConfirming(false);
          setError(null);
        }}
        onConfirm={handleRegenerate}
        title={`New QR code for ${table.name}?`}
        message="The QR card already printed for this table stops working the moment you confirm: anyone scanning it will see “We could not find this table”. Print the new card right away. Guests already at the table stay signed in."
        confirmLabel="Make new QR"
        confirmingLabel="Making…"
        isConfirming={regenerate.isPending}
        error={error}
      />
    </div>
  );
}
