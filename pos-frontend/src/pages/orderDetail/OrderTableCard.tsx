import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { OrderDetail } from "../../api/orders";
import type { FloorTable, TableOpened } from "../../api/tables";
import { TableConflictDialog } from "../../components/TableConflictDialog";
import { Button, Card } from "../../components/ui";
import { useFloorPlan, useMoveOrderToTable } from "../../hooks/useTables";
import { getTableConflict, tableErrorMessage } from "../../lib/tableErrors";
import type { TableConflict } from "../../lib/tableErrors";
import { expectedSessionFor, tableAvailability } from "../newOrder/tableAvailability";
import { TablePickerDialog } from "../tables/TablePickerDialog";
import { TABLE_STATE_META } from "../tables/tableStates";

// Order Detail's side of table sync (docs/TABLE_SYNC_SPEC.md R3, R4, R7): which table and bill this order
// is on (with a link to that table's sheet, which lists every order on it from every source), "Move to
// table…", and — right after the order opened a table — "Table 2 is now open" with its join PIN.
export function OrderTableCard({ order }: { order: OrderDetail }) {
  const location = useLocation();
  const tableOpened = (location.state as { tableOpened?: TableOpened } | null)?.tableOpened ?? null;
  const { data: floor } = useFloorPlan();
  const move = useMoveOrderToTable();
  const [isPicking, setIsPicking] = useState(false);
  const [opening, setOpening] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ conflict: TableConflict; target: FloorTable } | null>(null);
  const [moved, setMoved] = useState<string | null>(null);

  if (order.type !== "DINE_IN" || !order.diningArea) {
    return null;
  }
  const table = floor?.tables.find((candidate) => candidate.id === order.diningAreaId);
  const tableName = order.diningArea.area ? `${order.diningArea.area} · ${order.diningArea.name}` : order.diningArea.name;
  const canMove = order.status !== "COMPLETED" && order.status !== "CANCELLED" && order.source !== "TABLE_QR";
  const sessionOpen = order.tableSession?.status === "OPEN";

  function send(target: FloorTable, expectedTableSessionId: string | null) {
    setError(null);
    move.mutate(
      { orderId: order.id, diningAreaId: target.id, expectedTableSessionId },
      {
        onSuccess: () => {
          setIsPicking(false);
          setConflict(null);
          setMoved(target.name);
        },
        onError: (moveError) => {
          const tableConflict = getTableConflict(moveError);
          if (tableConflict) {
            setIsPicking(false);
            setConflict({ conflict: tableConflict, target });
            return;
          }
          setConflict(null);
          setError(tableErrorMessage(moveError, "Couldn't move the order."));
        },
      },
    );
  }

  return (
    <Card title="Table">
      <div className="flex flex-col gap-3">
        {tableOpened && (
          <p role="status" className="m-0 rounded-card border border-status-success bg-status-success-bg px-3 py-2 text-body text-ink">
            {tableName} is now open and shows as taken on the map.
            {tableOpened.pin && (
              <>
                {" "}
                Guests' join PIN: <strong className="tabular-nums tracking-[0.2em]">{tableOpened.pin}</strong>
              </>
            )}
          </p>
        )}
        {moved && (
          <p role="status" className="m-0 text-body text-status-success-text">
            Moved to {moved}. The kitchen sees the new table.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-ink">{tableName}</span>
            <span className="text-meta text-ink-muted">
              {order.status === "SCHEDULED"
                ? "Takes the table when it's released."
                : order.tableSession
                  ? sessionOpen
                    ? `On the table's bill${table ? ` · ${TABLE_STATE_META[table.state].label}` : ""}. Paid when the table is settled.`
                    : "The table has been closed."
                  : "Not on a table bill yet — reception chooses when accepting it."}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.tableSession && sessionOpen && (
              <Link to={`/tables?table=${order.diningAreaId}`} className="inline-flex h-11 items-center rounded-card border border-border bg-surface-raised px-4 text-body font-medium text-accent">
                Open table
              </Link>
            )}
            {canMove && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setOpening((count) => count + 1);
                  setIsPicking(true);
                }}
              >
                Move to table…
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="m-0 text-body text-status-danger-text">
            {error}
          </p>
        )}
      </div>

      <TablePickerDialog
        key={opening}
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        title={`Move order #${order.orderNumber} to…`}
        candidates={(floor?.tables ?? []).filter((candidate) => candidate.id !== order.diningAreaId && !candidate.inactive)}
        disabledReason={(candidate) => {
          const availability = tableAvailability(candidate);
          return availability.kind === "blocked" ? availability.short : null;
        }}
        describe={(target) => {
          const availability = tableAvailability(target);
          return availability.kind === "open" ? (
            <p className="m-0">
              Move order #{order.orderNumber} to <strong>{target.name}</strong> and add it to {target.name}'s bill ({availability.summary})?
              {order.tableSession ? ` It leaves ${order.diningArea?.name}'s bill.` : ""}
            </p>
          ) : (
            <p className="m-0">
              Move order #{order.orderNumber} to <strong>{target.name}</strong>? {target.name} is free, so this seats it.
              {order.tableSession ? ` It leaves ${order.diningArea?.name}'s bill.` : ""}
            </p>
          );
        }}
        confirmLabel={(target) => `Move to ${target.name}`}
        isPending={move.isPending}
        error={error}
        onConfirm={(target) => send(target, expectedSessionFor(target))}
      />

      <TableConflictDialog
        conflict={conflict?.conflict ?? null}
        tableName={conflict?.target.name ?? "That table"}
        isSubmitting={move.isPending}
        onClose={() => setConflict(null)}
        onConfirm={(expectedTableSessionId) => conflict && send(conflict.target, expectedTableSessionId)}
      />
    </Card>
  );
}
