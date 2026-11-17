import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { InventoryItem, InventoryTxnType } from "../../api/inventory";
import { useAdjustStock } from "../../hooks/useInventory";
import { Button, Input, Modal, Select } from "../../components/ui";
import { INVENTORY_TXN_LABEL } from "../../lib/enumLabels";

const TXN_TYPES: InventoryTxnType[] = ["STOCK_IN", "STOCK_OUT", "ADJUSTMENT"];

interface AdjustStockFormProps {
  item: InventoryItem;
  onClose: () => void;
}

// Keyed by item.id from the parent, so switching items (or reopening) remounts
// this with fresh initial state instead of needing an effect to reset fields.
function AdjustStockForm({ item, onClose }: AdjustStockFormProps) {
  const adjustMutation = useAdjustStock();
  const [type, setType] = useState<InventoryTxnType>("STOCK_IN");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    // STOCK_IN/STOCK_OUT must be positive (the sign is implied by the type);
    // ADJUSTMENT applies the signed value directly, so it's sent as typed.
    const raw = Number(quantity);
    const signedQuantity = type === "ADJUSTMENT" ? raw : Math.abs(raw);

    try {
      await adjustMutation.mutateAsync({
        id: item.id,
        input: { type, quantity: signedQuantity, ...(note.trim() !== "" ? { note: note.trim() } : {}) },
      });
      onClose();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to adjust stock"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-body text-ink-muted">
        Current stock: <span className="text-numeric text-ink">{Number(item.currentStock).toFixed(2)}</span> {item.unit}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adjust-stock-type" className="text-meta font-medium text-ink-muted">
          Type
        </label>
        <Select id="adjust-stock-type" value={type} onChange={(event) => setType(event.target.value as InventoryTxnType)}>
          {TXN_TYPES.map((txnType) => (
            <option key={txnType} value={txnType}>
              {INVENTORY_TXN_LABEL[txnType]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adjust-stock-quantity" className="text-meta font-medium text-ink-muted">
          Quantity
        </label>
        <Input
          id="adjust-stock-quantity"
          type="number"
          step={0.01}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
        />
        {type === "ADJUSTMENT" && <p className="text-meta text-ink-muted">Use a negative number to decrease stock.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adjust-stock-note" className="text-meta font-medium text-ink-muted">
          Note
        </label>
        <Input id="adjust-stock-note" type="text" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {formError && (
        <p role="alert" className="text-body text-status-danger-text">
          {formError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={adjustMutation.isPending}>
          {adjustMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface AdjustStockDialogProps {
  item: InventoryItem | null;
  onClose: () => void;
}

// Restricted to MANUAL items by the caller — the backend itself also rejects
// adjusting an AUTO-tracked item.
export function AdjustStockDialog({ item, onClose }: AdjustStockDialogProps) {
  return (
    <Modal isOpen={item !== null} onClose={onClose} title={item ? `Adjust stock — ${item.name}` : undefined}>
      {item && <AdjustStockForm key={item.id} item={item} onClose={onClose} />}
    </Modal>
  );
}
