import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { Deal, DealItemInput } from "../../api/deals";
import { useCreateDeal, useDeals, useDeleteDeal, useUpdateDeal } from "../../hooks/useDeals";
import { useMenuItems } from "../../hooks/useMenuItems";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";
import {
  Button,
  Card,
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
  Textarea,
} from "../../components/ui";

interface DealItemRow {
  menuItemId: string;
  quantity: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  isActive: boolean;
  isAvailableInPOS: boolean;
  isAvailableOnline: boolean;
  items: DealItemRow[];
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    price: "",
    isActive: true,
    isAvailableInPOS: true,
    isAvailableOnline: true,
    items: [{ menuItemId: "", quantity: "1" }],
  };
}

export function DealsTab() {
  const { data: deals, isLoading, isError } = useDeals();
  const { data: menuItems, isError: isMenuItemsError } = useMenuItems();

  const createMutation = useCreateDeal();
  const updateMutation = useUpdateDeal();
  const deleteMutation = useDeleteDeal();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const menuItemNameById = new Map((menuItems ?? []).map((item) => [item.id, item.name]));

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  }

  function startEdit(deal: Deal) {
    setEditingId(deal.id);
    setForm({
      name: deal.name,
      description: deal.description ?? "",
      price: deal.price,
      isActive: deal.isActive,
      isAvailableInPOS: deal.isAvailableInPOS,
      isAvailableOnline: deal.isAvailableOnline,
      items: deal.items.map((dealItem) => ({
        menuItemId: dealItem.menuItemId,
        quantity: String(dealItem.quantity),
      })),
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  function updateRow(index: number, patch: Partial<DealItemRow>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function addRow() {
    setForm((prev) => ({ ...prev, items: [...prev.items, { menuItemId: "", quantity: "1" }] }));
  }

  function removeRow(index: number) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, rowIndex) => rowIndex !== index) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const items: DealItemInput[] = [];
    for (const row of form.items) {
      if (row.menuItemId === "") {
        continue;
      }
      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setFormError("Each composition row needs a positive whole-number quantity.");
        return;
      }
      items.push({ menuItemId: row.menuItemId, quantity });
    }
    if (items.length === 0) {
      setFormError("Add at least one menu item to the deal's composition.");
      return;
    }
    const dealItemIds = new Set(items.map((item) => item.menuItemId));
    if (dealItemIds.size !== items.length) {
      setFormError("Each menu item may appear only once in a deal's composition.");
      return;
    }

    const price = Number(form.price);
    const description = form.description.trim() === "" ? undefined : form.description.trim();

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            price,
            description: description ?? null,
            isActive: form.isActive,
            isAvailableInPOS: form.isAvailableInPOS,
            isAvailableOnline: form.isAvailableOnline,
            items,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          price,
          ...(description !== undefined ? { description } : {}),
          isActive: form.isActive,
          isAvailableInPOS: form.isAvailableInPOS,
          isAvailableOnline: form.isAvailableOnline,
          items,
        });
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save deal"));
    }
  }

  async function handleDelete(deal: Deal) {
    if (!window.confirm(`Delete deal "${deal.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deal.id);
      if (editingId === deal.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete deal"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {isMenuItemsError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load menu items — the composition picker may be incomplete.
        </p>
      )}

      <Card ref={formCardRef} title={editingId ? "Edit deal" : "Add deal"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-name" className="text-meta font-medium text-ink-muted">
              Name
            </label>
            <Input
              id="deal-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-description" className="text-meta font-medium text-ink-muted">
              Description
            </label>
            <Textarea
              id="deal-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deal-price" className="text-meta font-medium text-ink-muted">
              Price
            </label>
            <Input
              id="deal-price"
              type="number"
              min={0}
              step={0.01}
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-meta font-medium text-ink-muted">Composition</span>
            <div className="flex flex-col gap-2">
              {form.items.map((row, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    aria-label={`Composition item ${index + 1}`}
                    className="sm:flex-1"
                    value={row.menuItemId}
                    onChange={(event) => updateRow(index, { menuItemId: event.target.value })}
                  >
                    <option value="">Select a menu item</option>
                    {(menuItems ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Composition item ${index + 1} quantity`}
                    type="number"
                    min={1}
                    step={1}
                    className="sm:w-24"
                    value={row.quantity}
                    onChange={(event) => updateRow(index, { quantity: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => removeRow(index)}
                    disabled={form.items.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div>
              <Button type="button" variant="secondary" onClick={addRow}>
                Add item
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-body text-ink max-md:min-h-11">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-sm border-border accent-accent"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-body text-ink max-md:min-h-11">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-sm border-border accent-accent"
                checked={form.isAvailableInPOS}
                onChange={(event) => setForm((prev) => ({ ...prev, isAvailableInPOS: event.target.checked }))}
              />
              Available in POS
            </label>
            <label className="flex items-center gap-2 text-body text-ink max-md:min-h-11">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-sm border-border accent-accent"
                checked={form.isAvailableOnline}
                onChange={(event) => setForm((prev) => ({ ...prev, isAvailableOnline: event.target.checked }))}
              />
              Available online
            </label>
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add deal"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading deals…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load deals.</p>}

      {deals && deals.length === 0 && (
        <EmptyState title="No deals yet" description="Add a deal to bundle menu items at a flat price." />
      )}

      {deals && deals.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Composition</TableHeaderCell>
              <TableHeaderCell>Price</TableHeaderCell>
              <TableHeaderCell>In POS</TableHeaderCell>
              <TableHeaderCell>Online</TableHeaderCell>
              <TableHeaderCell>Active</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell className="font-medium text-ink">{deal.name}</TableCell>
                <TableCell>
                  {deal.items
                    .map((dealItem) => `${menuItemNameById.get(dealItem.menuItemId) ?? "—"} ×${dealItem.quantity}`)
                    .join(", ")}
                </TableCell>
                <TableCell className="text-numeric">{Number(deal.price).toFixed(2)}</TableCell>
                <TableCell>
                  <StatusBadge status={deal.isAvailableInPOS ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={deal.isAvailableOnline ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={deal.isActive ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(deal)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(deal)} disabled={deleteMutation.isPending}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
