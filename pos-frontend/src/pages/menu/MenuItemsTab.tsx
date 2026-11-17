import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import type { MenuItem } from "../../api/menuItems";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { useKitchens } from "../../hooks/useKitchens";
import {
  useCreateMenuItem,
  useCreateMenuItemVariant,
  useDeleteMenuItem,
  useMenuItems,
  useRemoveMenuItemVariant,
  useSetMenuItemOnlineAvailability,
  useUpdateMenuItem,
  useUpdateMenuItemVariant,
} from "../../hooks/useMenuItems";
import { scrollFormIntoView } from "../../lib/scrollFormIntoView";
import { SegmentedControl } from "../newOrder/SegmentedControl";
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

interface SizeRow {
  // The underlying variant's id — undefined for a row not yet saved. Used to
  // diff against the item's existing variants on save (create/update/delete
  // per row, never a bulk delete-then-recreate — a variant still referenced
  // by a deal's DealComponent must not be silently destroyed).
  key: string;
  id?: string;
  label: string;
  price: string;
  sortOrder: number;
}

type PriceType = "fixed" | "sized" | "open";

interface FormState {
  name: string;
  description: string;
  price: string;
  kitchenId: string;
  categoryId: string;
  isAvailableInPOS: boolean;
  isAvailableOnline: boolean;
  priceType: PriceType;
  sizeRows: SizeRow[];
  minPrice: string;
  maxPrice: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  kitchenId: "",
  categoryId: "",
  isAvailableInPOS: true,
  isAvailableOnline: true,
  priceType: "fixed",
  sizeRows: [],
  minPrice: "",
  maxPrice: "",
};

function newSizeRow(sortOrder: number): SizeRow {
  return { key: crypto.randomUUID(), label: "", price: "", sortOrder };
}

const PRICE_TYPE_OPTIONS: { value: PriceType; label: string }[] = [
  { value: "fixed", label: "Fixed price" },
  { value: "sized", label: "Sold in sizes" },
  { value: "open", label: "Open price" },
];

function priceCellText(item: MenuItem): string {
  if (item.isOpenPrice) {
    return "Open price";
  }
  if (item.price !== null) {
    return Number(item.price).toFixed(2);
  }
  const prices = item.variants.map((variant) => variant.price).filter((price): price is string => price !== null).map(Number);
  if (prices.length === 0) {
    return "—";
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? min.toFixed(2) : `${min.toFixed(2)}–${max.toFixed(2)}`;
}

export function MenuItemsTab() {
  const { staff } = useAuth();
  // SUPER_ADMIN/POS_ADMIN get the full add/edit/delete form. ONLINE_ADMIN isn't
  // routed to this screen yet (see routes/navItems.ts), but the component is
  // already correct for them: read-only everywhere except a per-row online toggle.
  const canEditFull = staff?.role === "SUPER_ADMIN" || staff?.role === "POS_ADMIN";
  const canToggleOnlineOnly = staff?.role === "ONLINE_ADMIN";

  const [kitchenFilter, setKitchenFilter] = useState("");
  const { data: menuItems, isLoading, isError } = useMenuItems(kitchenFilter || undefined);
  const { data: kitchens, isError: isKitchensError } = useKitchens();
  const { data: categories, isError: isCategoriesError } = useCategories();

  const createMutation = useCreateMenuItem();
  const updateMutation = useUpdateMenuItem();
  const deleteMutation = useDeleteMenuItem();
  const onlineAvailabilityMutation = useSetMenuItemOnlineAvailability();
  const createVariantMutation = useCreateMenuItemVariant();
  const updateVariantMutation = useUpdateMenuItemVariant();
  const removeVariantMutation = useRemoveMenuItemVariant();

  const [editingId, setEditingId] = useState<string | null>(null);
  // The variants the editing item had when the form was opened — kept around
  // purely to diff against form.sizeRows on save (see handleSubmit).
  const [editingOriginalVariants, setEditingOriginalVariants] = useState<SizeRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));
  const categoryNameById = new Map((categories ?? []).map((category) => [category.id, category.name]));

  function startCreate() {
    setEditingId(null);
    setEditingOriginalVariants([]);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id);
    const sizeRows: SizeRow[] = item.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      label: variant.label,
      price: variant.price ?? "",
      sortOrder: variant.sortOrder,
    }));
    setEditingOriginalVariants(sizeRows);
    setForm({
      name: item.name,
      description: item.description ?? "",
      // Null for a sized/deal-only item — this simple form only supports a single
      // standalone price, so there's nothing to prefill for those (known gap).
      price: item.price ?? "",
      kitchenId: item.kitchenId,
      categoryId: item.categoryId ?? "",
      isAvailableInPOS: item.isAvailableInPOS,
      isAvailableOnline: item.isAvailableOnline,
      priceType: item.isOpenPrice ? "open" : item.variants.length > 0 ? "sized" : "fixed",
      sizeRows,
      minPrice: item.minPrice ?? "",
      maxPrice: item.maxPrice ?? "",
    });
    setFormError(null);
    scrollFormIntoView(formCardRef.current);
  }

  async function saveSizeRows(menuItemId: string) {
    const originalById = new Map(editingOriginalVariants.filter((row) => row.id).map((row) => [row.id, row]));
    const currentIds = new Set(form.sizeRows.filter((row) => row.id).map((row) => row.id));
    const errors: string[] = [];

    const results = await Promise.allSettled([
      // Deleted: had an id originally, no longer present.
      ...editingOriginalVariants
        .filter((row) => row.id && !currentIds.has(row.id))
        .map((row) => removeVariantMutation.mutateAsync({ menuItemId, variantId: row.id! })),
      // New: no id yet.
      ...form.sizeRows
        .filter((row) => !row.id)
        .map((row) =>
          createVariantMutation.mutateAsync({
            menuItemId,
            input: {
              label: row.label.trim(),
              price: row.price.trim() === "" ? null : Number(row.price),
              sortOrder: row.sortOrder,
            },
          }),
        ),
      // Changed: had an id, and label/price/sortOrder differ from the original.
      ...form.sizeRows
        .filter((row) => {
          if (!row.id) {
            return false;
          }
          const original = originalById.get(row.id);
          if (!original) {
            return false;
          }
          const price = row.price.trim() === "" ? null : Number(row.price);
          const originalPrice = original.price.trim() === "" ? null : Number(original.price);
          return row.label !== original.label || price !== originalPrice || row.sortOrder !== original.sortOrder;
        })
        .map((row) =>
          updateVariantMutation.mutateAsync({
            menuItemId,
            variantId: row.id!,
            input: {
              label: row.label.trim(),
              price: row.price.trim() === "" ? null : Number(row.price),
              sortOrder: row.sortOrder,
            },
          }),
        ),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(getApiErrorMessage(result.reason, "Failed to save a size"));
      }
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (form.priceType === "sized" && form.sizeRows.some((row) => row.label.trim() === "")) {
      setFormError("Every size needs a label.");
      return;
    }
    if (
      form.priceType === "open" &&
      form.minPrice.trim() !== "" &&
      form.maxPrice.trim() !== "" &&
      Number(form.minPrice) > Number(form.maxPrice)
    ) {
      setFormError("Lowest allowed price must not be more than the highest allowed price.");
      return;
    }

    const price = form.priceType === "fixed" ? Number(form.price) : null;
    const description = form.description.trim() === "" ? null : form.description.trim();
    const categoryId = form.categoryId === "" ? null : form.categoryId;
    const isOpenPrice = form.priceType === "open";
    const minPrice = isOpenPrice && form.minPrice.trim() !== "" ? Number(form.minPrice) : null;
    const maxPrice = isOpenPrice && form.maxPrice.trim() !== "" ? Number(form.maxPrice) : null;

    try {
      let menuItemId = editingId;
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            name: form.name,
            price,
            kitchenId: form.kitchenId,
            description,
            categoryId,
            isAvailableInPOS: form.isAvailableInPOS,
            isAvailableOnline: form.isAvailableOnline,
            isOpenPrice,
            minPrice,
            maxPrice,
          },
        });
      } else {
        const created = await createMutation.mutateAsync({
          name: form.name,
          ...(price !== null ? { price } : {}),
          kitchenId: form.kitchenId,
          ...(description !== null ? { description } : {}),
          ...(categoryId !== null ? { categoryId } : {}),
          isAvailableInPOS: form.isAvailableInPOS,
          isAvailableOnline: form.isAvailableOnline,
          isOpenPrice,
          ...(minPrice !== null ? { minPrice } : {}),
          ...(maxPrice !== null ? { maxPrice } : {}),
        });
        menuItemId = created.id;
      }

      if (form.priceType === "sized" && menuItemId) {
        const sizeErrors = await saveSizeRows(menuItemId);
        if (sizeErrors.length > 0) {
          setFormError(sizeErrors.join(" "));
          return;
        }
      }
      startCreate();
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to save menu item"));
    }
  }

  async function handleDelete(item: MenuItem) {
    if (!window.confirm(`Delete menu item "${item.name}"?`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(item.id);
      if (editingId === item.id) {
        startCreate();
      }
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to delete menu item"));
    }
  }

  async function handleToggleOnline(item: MenuItem, isAvailableOnline: boolean) {
    try {
      await onlineAvailabilityMutation.mutateAsync({ id: item.id, isAvailableOnline });
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to update online availability"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {(isKitchensError || isCategoriesError) && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load kitchens or categories — the filter and form dropdowns may be incomplete.
        </p>
      )}

      <div className="flex max-w-xs flex-col gap-1.5">
        <label htmlFor="menu-kitchen-filter" className="text-meta font-medium text-ink-muted">
          Filter by kitchen
        </label>
        <Select
          id="menu-kitchen-filter"
          value={kitchenFilter}
          onChange={(event) => setKitchenFilter(event.target.value)}
        >
          <option value="">All kitchens</option>
          {(kitchens ?? []).map((kitchen) => (
            <option key={kitchen.id} value={kitchen.id}>
              {kitchen.name}
            </option>
          ))}
        </Select>
      </div>

      {canEditFull && (
        <Card ref={formCardRef} title={editingId ? "Edit menu item" : "Add menu item"} className="max-w-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="menu-item-name" className="text-meta font-medium text-ink-muted">
                Name
              </label>
              <Input
                id="menu-item-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="menu-item-description" className="text-meta font-medium text-ink-muted">
                Description
              </label>
              <Textarea
                id="menu-item-description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <SegmentedControl
              name="menu-item-price-type"
              legend="Price type"
              options={PRICE_TYPE_OPTIONS}
              value={form.priceType}
              onChange={(priceType) =>
                setForm((prev) => ({
                  ...prev,
                  priceType,
                  sizeRows: priceType === "sized" && prev.sizeRows.length === 0 ? [newSizeRow(0)] : prev.sizeRows,
                }))
              }
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {form.priceType === "fixed" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="menu-item-price" className="text-meta font-medium text-ink-muted">
                    Price
                  </label>
                  <Input
                    id="menu-item-price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                    required
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="menu-item-kitchen" className="text-meta font-medium text-ink-muted">
                  Kitchen
                </label>
                <Select
                  id="menu-item-kitchen"
                  value={form.kitchenId}
                  onChange={(event) => setForm((prev) => ({ ...prev, kitchenId: event.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Select a kitchen
                  </option>
                  {(kitchens ?? []).map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {kitchen.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {form.priceType === "sized" && (
              <div className="flex flex-col gap-2">
                <span className="text-meta font-medium text-ink-muted">Sizes</span>
                {form.sizeRows.map((row, index) => (
                  <div key={row.key} className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label htmlFor={`size-label-${row.key}`} className="text-meta text-ink-muted">
                        Label
                      </label>
                      <Input
                        id={`size-label-${row.key}`}
                        type="text"
                        value={row.label}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            sizeRows: prev.sizeRows.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)),
                          }))
                        }
                        required
                      />
                    </div>
                    <div className="flex w-32 flex-col gap-1.5">
                      <label htmlFor={`size-price-${row.key}`} className="text-meta text-ink-muted">
                        Price
                      </label>
                      <Input
                        id={`size-price-${row.key}`}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="None"
                        value={row.price}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            sizeRows: prev.sizeRows.map((r, i) => (i === index ? { ...r, price: event.target.value } : r)),
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, sizeRows: prev.sizeRows.filter((_, i) => i !== index) }))
                      }
                      aria-label={`Remove size ${row.label || index + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, sizeRows: [...prev.sizeRows, newSizeRow(prev.sizeRows.length)] }))
                  }
                >
                  + Add size
                </Button>
                {/* No price here means this size exists only to be referenced by a
                    deal's choice slot (e.g. Nuggets "5 pc") — it can't be ordered on
                    its own, matching backend validation. */}
                <p className="text-meta text-ink-muted">Leave a size's price blank if it's only ever part of a deal.</p>
              </div>
            )}
            {form.priceType === "open" && (
              <div className="flex flex-col gap-2">
                <p className="text-meta text-ink-muted">
                  The cashier types the price for this item at order time. Optionally set a range to guard against typos.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="menu-item-min-price" className="text-meta text-ink-muted">
                      Lowest allowed price
                    </label>
                    <Input
                      id="menu-item-min-price"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="No minimum"
                      value={form.minPrice}
                      onChange={(event) => setForm((prev) => ({ ...prev, minPrice: event.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="menu-item-max-price" className="text-meta text-ink-muted">
                      Highest allowed price
                    </label>
                    <Input
                      id="menu-item-max-price"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="No maximum"
                      value={form.maxPrice}
                      onChange={(event) => setForm((prev) => ({ ...prev, maxPrice: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="menu-item-category" className="text-meta font-medium text-ink-muted">
                Category
              </label>
              <Select
                id="menu-item-category"
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
              >
                <option value="">None</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-4">
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
                {isSaving ? "Saving…" : editingId ? "Save changes" : "Add menu item"}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={startCreate}>
                  Cancel
                </Button>
              )}
            </FormActions>
          </form>
        </Card>
      )}

      {isLoading && <p className="text-body text-ink-muted">Loading menu items…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load menu items.</p>}

      {menuItems && menuItems.length === 0 && (
        <EmptyState title="No menu items yet" description="Add a menu item to start building the menu." />
      )}

      {menuItems && menuItems.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Kitchen</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Price</TableHeaderCell>
              <TableHeaderCell>In POS</TableHeaderCell>
              <TableHeaderCell>Online</TableHeaderCell>
              {canEditFull && <TableHeaderCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {menuItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-ink">{item.name}</TableCell>
                <TableCell>
                  {/* Not a real status — reuses the badge's dot+label shape as a
                      quiet identity tag, so it always falls back to the neutral tone. */}
                  <StatusBadge status="KITCHEN_TAG" label={kitchenNameById.get(item.kitchenId) ?? "—"} />
                </TableCell>
                <TableCell>{item.categoryId ? (categoryNameById.get(item.categoryId) ?? "—") : "—"}</TableCell>
                <TableCell className="text-numeric">{priceCellText(item)}</TableCell>
                <TableCell>
                  <StatusBadge status={item.isAvailableInPOS ? "ACTIVE" : "INACTIVE"} />
                </TableCell>
                <TableCell>
                  {canToggleOnlineOnly ? (
                    <label className="max-md:flex max-md:h-11 max-md:w-11 max-md:items-center max-md:justify-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-sm border-border accent-accent"
                        aria-label={`Available online: ${item.name}`}
                        checked={item.isAvailableOnline}
                        disabled={onlineAvailabilityMutation.isPending}
                        onChange={(event) => handleToggleOnline(item, event.target.checked)}
                      />
                    </label>
                  ) : (
                    <StatusBadge status={item.isAvailableOnline ? "ACTIVE" : "INACTIVE"} />
                  )}
                </TableCell>
                {canEditFull && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(item)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => handleDelete(item)} disabled={deleteMutation.isPending}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
