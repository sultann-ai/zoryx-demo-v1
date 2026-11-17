import { useState } from "react";
import type { MenuItem } from "../../api/menuItems";
import { Button, Input, Modal } from "../../components/ui";
import { LINE_NOTE_MAX_LENGTH } from "../../lib/lineNotes";

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

function appendDigit(buffer: string, digit: string): string {
  if (digit === "⌫") {
    return buffer.slice(0, -1);
  }
  if (digit === ".") {
    return buffer.includes(".") ? buffer : buffer === "" ? "0." : buffer + ".";
  }
  if (buffer.includes(".")) {
    const decimals = buffer.split(".")[1] ?? "";
    return decimals.length >= 2 ? buffer : buffer + digit;
  }
  return buffer === "0" ? digit : buffer + digit;
}

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const HARD_CAP = 1_000_000;

export interface OpenPriceTarget {
  item: MenuItem;
  // Set when re-opening the dialog on an existing cart line (the pencil); null when
  // adding a fresh one from the menu tile.
  editingKey: string | null;
  initialPrice: string;
  initialNotes: string;
}

interface OpenPriceFormProps {
  target: OpenPriceTarget;
  onAdd: (menuItemId: string, price: string, notes: string) => void;
  onSave: (key: string, price: string, notes: string) => void;
  onClose: () => void;
}

function OpenPriceForm({ target, onAdd, onSave, onClose }: OpenPriceFormProps) {
  const { item, editingKey } = target;
  const [buffer, setBuffer] = useState(target.initialPrice);
  const [notes, setNotes] = useState(target.initialNotes);

  const min = item.minPrice !== null ? Number(item.minPrice) : null;
  const max = item.maxPrice !== null ? Number(item.maxPrice) : null;

  let error: string | null = null;
  if (buffer !== "" && PRICE_PATTERN.test(buffer)) {
    const value = Number(buffer);
    if (value <= 0) {
      error = "Price must be greater than 0.";
    } else if (value > HARD_CAP) {
      error = `Price must not exceed ${HARD_CAP.toLocaleString()}.`;
    } else if (min !== null && value < min) {
      error = `Price must be at least Rs ${min.toFixed(2)}.`;
    } else if (max !== null && value > max) {
      error = `Price must be at most Rs ${max.toFixed(2)}.`;
    }
  }
  const isValid = buffer !== "" && PRICE_PATTERN.test(buffer) && error === null;

  function handleSubmit() {
    if (!isValid) {
      return;
    }
    if (editingKey) {
      onSave(editingKey, buffer, notes.trim());
    } else {
      onAdd(item.id, buffer, notes.trim());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {(min !== null || max !== null) && (
        <p className="text-meta text-ink-muted">
          Allowed range: Rs {min !== null ? min.toFixed(2) : "0.00"} – Rs{" "}
          {max !== null ? max.toFixed(2) : "no limit"}.
        </p>
      )}

      <div className="rounded-card border border-border bg-surface px-4 py-3 text-right">
        <span className="text-display font-semibold text-ink">{buffer === "" ? "0" : buffer}</span>
      </div>
      {error && <p className="text-meta text-status-danger-text">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        {KEYPAD_ROWS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setBuffer((prev) => appendDigit(prev, key))}
            className="flex h-14 items-center justify-center rounded-card border border-border bg-surface text-section font-semibold text-ink hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {key}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-meta font-medium text-ink">Note (optional)</span>
        <Input
          value={notes}
          maxLength={LINE_NOTE_MAX_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. Happy Birthday Ali"
        />
      </label>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="success" className="flex-1" onClick={handleSubmit} disabled={!isValid}>
          {editingKey ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

interface OpenPriceDialogProps {
  target: OpenPriceTarget | null;
  onAdd: (menuItemId: string, price: string, notes: string) => void;
  onSave: (key: string, price: string, notes: string) => void;
  onClose: () => void;
}

export function OpenPriceDialog({ target, onAdd, onSave, onClose }: OpenPriceDialogProps) {
  return (
    <Modal isOpen={target !== null} onClose={onClose} title={target ? `${target.item.name} — enter price` : undefined}>
      {target && (
        <OpenPriceForm key={target.editingKey ?? target.item.id} target={target} onAdd={onAdd} onSave={onSave} onClose={onClose} />
      )}
    </Modal>
  );
}
