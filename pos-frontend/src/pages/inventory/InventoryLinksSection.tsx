import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { InventoryLink } from "../../api/inventoryLinks";
import { useInventoryItems } from "../../hooks/useInventory";
import {
  useCreateInventoryLink,
  useDeleteInventoryLink,
  useInventoryLinks,
  useUpdateInventoryLink,
} from "../../hooks/useInventoryLinks";
import { useMenuItems } from "../../hooks/useMenuItems";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../components/ui";

interface FormState {
  menuItemId: string;
  inventoryItemId: string;
  quantityPerOrder: string;
}

const EMPTY_FORM: FormState = { menuItemId: "", inventoryItemId: "", quantityPerOrder: "" };

export function InventoryLinksSection() {
  const { data: links, isLoading, isError } = useInventoryLinks();
  const { data: menuItems, isError: isMenuItemsError } = useMenuItems();
  const { data: inventoryItems, isError: isInventoryItemsError } = useInventoryItems(false);
  const createMutation = useCreateInventoryLink();
  const updateMutation = useUpdateInventoryLink();
  const deleteMutation = useDeleteInventoryLink();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(link: InventoryLink) {
    setEditingId(link.id);
    setForm({
      menuItemId: link.menuItemId,
      inventoryItemId: link.inventoryItemId,
      quantityPerOrder: link.quantityPerOrder,
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = {
      menuItemId: form.menuItemId,
      inventoryItemId: form.inventoryItemId,
      quantityPerOrder: Number(form.quantityPerOrder),
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save link"));
    }
  }

  async function handleDelete(link: InventoryLink) {
    if (!window.confirm(`Remove the link between "${link.menuItem.name}" and "${link.inventoryItem.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(link.id);
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to remove link"));
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-section font-semibold text-ink">Menu item and inventory links</h2>
      {(isMenuItemsError || isInventoryItemsError) && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load menu items or inventory items — the dropdowns above may be incomplete.
        </p>
      )}

      <Card ref={formCardRef} title={editingId ? "Edit link" : "Add link"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="link-menu-item" className="text-meta font-medium text-ink-muted">
                Menu item
              </label>
              <Select
                id="link-menu-item"
                value={form.menuItemId}
                onChange={(event) => setForm((prev) => ({ ...prev, menuItemId: event.target.value }))}
                required
              >
                <option value="" disabled>
                  Select a menu item
                </option>
                {(menuItems ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="link-inventory-item" className="text-meta font-medium text-ink-muted">
                Inventory item
              </label>
              <Select
                id="link-inventory-item"
                value={form.inventoryItemId}
                onChange={(event) => setForm((prev) => ({ ...prev, inventoryItemId: event.target.value }))}
                required
              >
                <option value="" disabled>
                  Select an inventory item
                </option>
                {(inventoryItems ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.unit})
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="link-quantity-per-order" className="text-meta font-medium text-ink-muted">
              Quantity per order
            </label>
            <Input
              id="link-quantity-per-order"
              type="number"
              min={0.01}
              step={0.01}
              value={form.quantityPerOrder}
              onChange={(event) => setForm((prev) => ({ ...prev, quantityPerOrder: event.target.value }))}
              required
            />
          </div>
          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add link"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading links…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load links.</p>}

      {links && links.length === 0 && (
        <EmptyState title="No links yet" description="Link a menu item to an inventory item to deplete stock automatically." />
      )}

      {links && links.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Menu item</TableHeaderCell>
              <TableHeaderCell>Inventory item</TableHeaderCell>
              <TableHeaderCell>Quantity per order</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium text-ink">{link.menuItem.name}</TableCell>
                <TableCell>
                  {link.inventoryItem.name} ({link.inventoryItem.unit})
                </TableCell>
                <TableCell className="text-numeric">{Number(link.quantityPerOrder).toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(link)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(link)} disabled={deleteMutation.isPending}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
