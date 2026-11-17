import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { InventoryItem, InventoryTrackingType } from "../../api/inventory";
import {
  useCreateInventoryItem,
  useDeleteInventoryItem,
  useInventoryItems,
  useUpdateInventoryItem,
} from "../../hooks/useInventory";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";
import { AdjustStockDialog } from "./AdjustStockDialog";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormActions,
  Input,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/ui";

const TRACKING_TYPES: InventoryTrackingType[] = ["AUTO", "MANUAL"];

const TRACKING_TYPE_LABEL: Record<InventoryTrackingType, string> = {
  AUTO: "Auto",
  MANUAL: "Manual",
};

interface FormState {
  name: string;
  unit: string;
  currentStock: string;
  minThreshold: string;
  trackingType: InventoryTrackingType;
}

const EMPTY_FORM: FormState = { name: "", unit: "", currentStock: "", minThreshold: "", trackingType: "MANUAL" };

function isLowStock(item: InventoryItem): boolean {
  return item.minThreshold !== null && Number(item.currentStock) <= Number(item.minThreshold);
}

export function InventoryItemList() {
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { data: items, isLoading, isError } = useInventoryItems(lowStockOnly);
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      minThreshold: item.minThreshold ?? "",
      trackingType: item.trackingType,
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const minThreshold = form.minThreshold.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            unit: form.unit,
            trackingType: form.trackingType,
            minThreshold: minThreshold === "" ? null : Number(minThreshold),
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          unit: form.unit,
          currentStock: Number(form.currentStock),
          trackingType: form.trackingType,
          ...(minThreshold !== "" ? { minThreshold: Number(minThreshold) } : {}),
        });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save inventory item"));
    }
  }

  async function handleConfirmDelete() {
    if (!deletingItem) {
      return;
    }
    setDeleteError(null);
    try {
      const name = deletingItem.name;
      await deleteMutation.mutateAsync(deletingItem.id);
      setDeletingItem(null);
      setDeleteSuccessMessage(`Deleted "${name}".`);
    } catch (error) {
      // Kept open so the server's 409 (e.g. "Used by: Fajita Pizza. Remove those links
      // first.") stays visible right next to the Delete button that triggered it.
      setDeleteError(getApiErrorMessage(error, "Failed to delete inventory item"));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-section font-semibold text-ink">Inventory items</h2>

      <label className="flex items-center gap-2 text-body text-ink max-md:min-h-11">
        <input
          type="checkbox"
          className="h-4 w-4 rounded-sm border-border accent-accent"
          checked={lowStockOnly}
          onChange={(event) => setLowStockOnly(event.target.checked)}
        />
        Show low stock only
      </label>

      <Card ref={formCardRef} title={editingId ? "Edit inventory item" : "Add inventory item"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inventory-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="inventory-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inventory-unit" className="text-meta font-medium text-ink-muted">
                Unit
              </label>
              <Input
                id="inventory-unit"
                type="text"
                value={form.unit}
                onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
                placeholder="kg, liters, pcs…"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!editingId && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="inventory-current-stock" className="text-meta font-medium text-ink-muted">
                  Current stock
                </label>
                <Input
                  id="inventory-current-stock"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.currentStock}
                  onChange={(event) => setForm((prev) => ({ ...prev, currentStock: event.target.value }))}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inventory-min-threshold" className="text-meta font-medium text-ink-muted">
                Min threshold
              </label>
              <Input
                id="inventory-min-threshold"
                type="number"
                min={0}
                step={0.01}
                value={form.minThreshold}
                onChange={(event) => setForm((prev) => ({ ...prev, minThreshold: event.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inventory-tracking-type" className="text-meta font-medium text-ink-muted">
              Tracking type
            </label>
            <Select
              id="inventory-tracking-type"
              value={form.trackingType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, trackingType: event.target.value as InventoryTrackingType }))
              }
            >
              {TRACKING_TYPES.map((trackingType) => (
                <option key={trackingType} value={trackingType}>
                  {TRACKING_TYPE_LABEL[trackingType]}
                </option>
              ))}
            </Select>
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading inventory…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load inventory.</p>}
      {deleteSuccessMessage && (
        <p role="status" className="text-body text-status-success-text">
          {deleteSuccessMessage}
        </p>
      )}

      {items && items.length === 0 && (
        <EmptyState
          title={lowStockOnly ? "No low-stock items" : "No inventory items yet"}
          description={
            lowStockOnly ? "Nothing is below its minimum threshold right now." : "Add an item to start tracking stock."
          }
        />
      )}

      {items && items.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Unit</TableHeaderCell>
              <TableHeaderCell>Current stock</TableHeaderCell>
              <TableHeaderCell>Min threshold</TableHeaderCell>
              <TableHeaderCell>Tracking type</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-ink">{item.name}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-numeric">{Number(item.currentStock).toFixed(2)}</TableCell>
                <TableCell className="text-numeric">
                  {item.minThreshold !== null ? Number(item.minThreshold).toFixed(2) : "—"}
                </TableCell>
                <TableCell>{TRACKING_TYPE_LABEL[item.trackingType]}</TableCell>
                <TableCell>
                  {item.minThreshold !== null ? (
                    <StatusBadge status={isLowStock(item) ? "LOW_STOCK" : "IN_STOCK"} />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(item)}>
                      Edit
                    </Button>
                    {item.trackingType === "MANUAL" && (
                      <Button variant="secondary" onClick={() => setAdjustingItem(item)}>
                        Adjust stock
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      onClick={() => {
                        setDeleteSuccessMessage(null);
                        setDeleteError(null);
                        setDeletingItem(item);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AdjustStockDialog item={adjustingItem} onClose={() => setAdjustingItem(null)} />

      <ConfirmDialog
        isOpen={deletingItem !== null}
        onClose={() => {
          setDeletingItem(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete inventory item"
        message={
          <>
            Delete <span className="font-medium text-ink">{deletingItem?.name}</span>? Its stock history will also
            be deleted. This can't be undone.
          </>
        }
        isConfirming={deleteMutation.isPending}
        error={deleteError}
      />
    </section>
  );
}
