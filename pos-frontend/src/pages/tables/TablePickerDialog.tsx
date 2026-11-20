import { useState } from "react";
import type { ReactNode } from "react";
import type { FloorTable } from "../../api/tables";
import { Button, FormActions, Modal } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { compareTableNames } from "../newOrder/diningAreaFilter";
import { SELECT_GRID, SELECT_TILE, selectTileState } from "../newOrder/selectionGrid";
import { TABLE_STATE_META, areaLabel } from "./tableStates";

interface TablePickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  // Which tables can be picked, and why the others can't (shown on the tile, disabled).
  candidates: FloorTable[];
  disabledReason: (table: FloorTable) => string | null;
  // The sentence the confirm step shows for the picked table ("Move the party to Table 5?").
  describe: (table: FloorTable) => ReactNode;
  confirmLabel: (table: FloorTable) => string;
  onConfirm: (table: FloorTable) => void;
  isPending: boolean;
  // The server's refusal, already in words (lib/tableErrors), shown on the confirm step.
  error: string | null;
}

// Pick a table, then confirm in words — move one order, move a party, merge two tables (table sync R7).
// Tiles show each table's live state; ones that can't be picked are disabled and say why. Keyed by the
// caller so nothing carries over between openings.
export function TablePickerDialog({
  isOpen,
  onClose,
  title,
  candidates,
  disabledReason,
  describe,
  confirmLabel,
  onConfirm,
  isPending,
  error,
}: TablePickerDialogProps) {
  const [picked, setPicked] = useState<FloorTable | null>(null);
  const sorted = [...candidates].sort((a, b) => (a.area ?? "").localeCompare(b.area ?? "") || compareTableNames(a, b));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {picked ? (
        <div className="flex flex-col gap-4">
          <div className="m-0 text-body text-ink">{describe(picked)}</div>
          {error && (
            <p role="alert" className="m-0 text-body text-status-danger-text">
              {error}
            </p>
          )}
          <FormActions>
            <Button variant="secondary" onClick={() => setPicked(null)} disabled={isPending}>
              Pick another table
            </Button>
            <Button onClick={() => onConfirm(picked)} disabled={isPending}>
              {isPending ? "Working…" : confirmLabel(picked)}
            </Button>
          </FormActions>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.length === 0 ? (
            <p className="m-0 text-body text-ink-muted">No tables to choose from.</p>
          ) : (
            <div role="group" aria-label="Tables" className={SELECT_GRID}>
              {sorted.map((table) => {
                const reason = disabledReason(table);
                const state = TABLE_STATE_META[table.state].label;
                return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={reason !== null}
                    title={reason ?? undefined}
                    aria-label={`${table.name}, ${areaLabel(table.area)}, ${reason ?? state}`}
                    onClick={() => setPicked(table)}
                    className={cn(
                      SELECT_TILE,
                      "h-auto min-h-14 py-2",
                      reason ? "cursor-not-allowed border-dashed border-border bg-surface text-ink-muted" : selectTileState(false),
                    )}
                  >
                    <span className="max-w-full truncate leading-tight">{table.name}</span>
                    <span className="max-w-full truncate text-meta font-normal leading-tight text-ink-muted">
                      {areaLabel(table.area)} · {reason ?? state}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <FormActions>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </FormActions>
        </div>
      )}
    </Modal>
  );
}
