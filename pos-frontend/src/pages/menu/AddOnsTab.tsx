import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AddOn } from "../../api/addOns";
import { getApiErrorMessage } from "../../api/errors";
import { useCategories } from "../../hooks/useCategories";
import {
  useAddOns,
  useCreateAddOn,
  useDeleteAddOn,
  useRemoveAddOnPrice,
  useSetAddOnPrice,
  useUpdateAddOn,
} from "../../hooks/useAddOns";
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

interface PriceRow {
  // The underlying AddOnPrice's size — undefined-vs-defined distinguishes "already
  // saved" from "new row not yet saved", same diffing idiom as MenuItemsTab's sizeRows.
  key: string;
  originalSize?: string;
  size: string;
  price: string;
}

interface FormState {
  name: string;
  categoryId: string;
  priceRows: PriceRow[];
}

const EMPTY_FORM: FormState = { name: "", categoryId: "", priceRows: [] };

function newPriceRow(): PriceRow {
  return { key: crypto.randomUUID(), size: "", price: "" };
}

export function AddOnsTab() {
  const { data: addOns, isLoading, isError } = useAddOns();
  const { data: categories, isError: isCategoriesError } = useCategories();

  const createMutation = useCreateAddOn();
  const updateMutation = useUpdateAddOn();
  const deleteMutation = useDeleteAddOn();
  const setPriceMutation = useSetAddOnPrice();
  const removePriceMutation = useRemoveAddOnPrice();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const categoryNameById = new Map((categories ?? []).map((category) => [category.id, category.name]));

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(addOn: AddOn) {
    setEditingId(addOn.id);
    setForm({
      name: addOn.name,
      categoryId: addOn.categoryId ?? "",
      priceRows: addOn.prices.map((price) => ({
        key: price.id,
        originalSize: price.size,
        size: price.size,
        price: price.price,
      })),
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function savePriceRows(addOnId: string, originalRows: PriceRow[]) {
    const currentSizes = new Set(form.priceRows.map((row) => row.size.trim()));
    const errors: string[] = [];

    const results = await Promise.allSettled([
      // Gone: had a saved size originally, which no longer appears among the current
      // rows' sizes — covers both an outright removed row and a row renamed away from
      // its original size (the upsert below creates the new size; this clears the old).
      ...originalRows
        .filter((row) => row.originalSize !== undefined && !currentSizes.has(row.originalSize))
        .map((row) => removePriceMutation.mutateAsync({ addOnId, size: row.originalSize! })),
      // Set (create or update): every current row, keyed by its current size text —
      // setAddOnPrice upserts, so a new row, a changed price, and a renamed size all
      // go through here.
      ...form.priceRows.map((row) =>
        setPriceMutation.mutateAsync({ addOnId, size: row.size.trim(), price: Number(row.price) }),
      ),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(getApiErrorMessage(result.reason, "Failed to save a price"));
      }
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (form.priceRows.some((row) => row.size.trim() === "")) {
      setFormError("Every price row needs a size.");
      return;
    }
    if (form.priceRows.some((row) => row.price.trim() === "" || Number.isNaN(Number(row.price)))) {
      setFormError("Every price row needs a valid price.");
      return;
    }

    const originalRows = form.priceRows.filter((row) => row.originalSize !== undefined);

    try {
      let addOnId = editingId;
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, input: { name: form.name, categoryId: form.categoryId } });
      } else {
        const created = await createMutation.mutateAsync({ name: form.name, categoryId: form.categoryId });
        addOnId = created.id;
      }

      if (addOnId) {
        const priceErrors = await savePriceRows(addOnId, originalRows);
        if (priceErrors.length > 0) {
          setFormError(priceErrors.join(" "));
          return;
        }
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save add-on"));
    }
  }

  async function handleDelete(addOn: AddOn) {
    if (!window.confirm(`Delete add-on "${addOn.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(addOn.id);
      if (editingId === addOn.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete add-on"));
    }
  }

  const selectedCategoryName = form.categoryId ? categoryNameById.get(form.categoryId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {isCategoriesError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load categories — the category picker may be incomplete.
        </p>
      )}

      <Card ref={formCardRef} title={editingId ? "Edit add-on" : "Add add-on"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="addon-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="addon-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="addon-category" className="text-meta font-medium text-ink-muted">
                Category
              </label>
              <Select
                id="addon-category"
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                required
              >
                <option value="" disabled>
                  Select a category
                </option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {/* Scopes which items can take this add-on — without it, a price keyed to
                  "Large" would also be offered on any other category's "Large" size. */}
              <p className="text-meta text-ink-muted">Only items in this category will offer this add-on.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-meta font-medium text-ink-muted">Prices by size</span>
            {selectedCategoryName && (
              <p className="text-meta text-ink-muted">
                Type the exact size label used on {selectedCategoryName} items (e.g. Small, Medium, Large).
              </p>
            )}
            {form.priceRows.map((row, index) => (
              <div key={row.key} className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor={`addon-price-size-${row.key}`} className="text-meta text-ink-muted">
                    Size
                  </label>
                  <Input
                    id={`addon-price-size-${row.key}`}
                    type="text"
                    value={row.size}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priceRows: prev.priceRows.map((r, i) => (i === index ? { ...r, size: event.target.value } : r)),
                      }))
                    }
                    required
                  />
                </div>
                <div className="flex w-32 flex-col gap-1.5">
                  <label htmlFor={`addon-price-amount-${row.key}`} className="text-meta text-ink-muted">
                    Price
                  </label>
                  <Input
                    id={`addon-price-amount-${row.key}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.price}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priceRows: prev.priceRows.map((r, i) => (i === index ? { ...r, price: event.target.value } : r)),
                      }))
                    }
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, priceRows: prev.priceRows.filter((_, i) => i !== index) }))
                  }
                  aria-label={`Remove price row ${row.size || index + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setForm((prev) => ({ ...prev, priceRows: [...prev.priceRows, newPriceRow()] }))}
            >
              + Add size
            </Button>
          </div>

          {formError && (
            <p role="alert" className="text-body text-status-danger-text">
              {formError}
            </p>
          )}
          <FormActions>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Add add-on"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={startCreate}>
                Cancel
              </Button>
            )}
          </FormActions>
        </form>
      </Card>

      {isLoading && <p className="text-body text-ink-muted">Loading add-ons…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load add-ons.</p>}

      {addOns && addOns.length === 0 && (
        <EmptyState title="No add-ons yet" description="Add one to let staff charge for extras like extra cheese." />
      )}

      {addOns && addOns.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Prices</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {addOns.map((addOn) => (
              <TableRow key={addOn.id}>
                <TableCell className="font-medium text-ink">{addOn.name}</TableCell>
                <TableCell>{addOn.category?.name ?? "—"}</TableCell>
                <TableCell>
                  {addOn.prices.length === 0
                    ? "—"
                    : addOn.prices.map((price) => `${price.size}: ${Number(price.price).toFixed(2)}`).join(", ")}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(addOn)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(addOn)} disabled={deleteMutation.isPending}>
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
