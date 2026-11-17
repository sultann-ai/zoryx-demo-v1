import { useState } from "react";
import type { Deal } from "../../api/deals";
import type { MenuItem } from "../../api/menuItems";
import { Button, Modal } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import type { CustomDealItem, CustomDealLine } from "../newOrder/dealCart";
import { computeDealExtras, standardItemsFromDeal } from "../newOrder/dealCustomize";

type PickerMode = "list" | "change" | "add";

interface TakerDealCustomizeFormProps {
  deal: Deal;
  existing: CustomDealLine | null;
  menuItems: MenuItem[];
  menuItemById: Map<string, MenuItem>;
  onApply: (items: CustomDealItem[], finalPrice: string) => void;
  onReset: () => void;
  onClose: () => void;
}

// A waiter-facing version of newOrder/DealCustomizeDialog.tsx: same Change/Remove/Add
// item logic and the same standardItemsFromDeal/computeDealExtras helpers, but no Final
// Price input and no Reason field — a taker never sets a deal's price. The estimated
// total shown here is read-only and informational; the backend always recomputes the
// real finalPrice itself from standard + extras when the order is accepted (see the
// plan's corrections-to-framing note), so this dialog's number never has to be exact,
// just a fair preview.
function TakerDealCustomizeForm({ deal, existing, menuItems, menuItemById, onApply, onReset, onClose }: TakerDealCustomizeFormProps) {
  const [items, setItems] = useState<CustomDealItem[]>(() => existing?.items ?? standardItemsFromDeal(deal));
  const [mode, setMode] = useState<PickerMode>("list");
  const [changingRowId, setChangingRowId] = useState<string | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [sizeTarget, setSizeTarget] = useState<MenuItem | null>(null);

  const standard = Number(deal.price);
  const extras = computeDealExtras(items, menuItemById);
  const estimated = standard + extras;

  const changingRow = changingRowId !== null ? items.find((item) => item.rowId === changingRowId) ?? null : null;
  const changingRowMenuItem = changingRow ? menuItemById.get(changingRow.menuItemId) : undefined;

  function eligibleItemsFor(targetMode: "change" | "add"): MenuItem[] {
    if (targetMode === "add") {
      return menuItems.filter((item) => item.isAvailableInPOS && item.sellableAlone && !item.isOpenPrice);
    }
    const pool = menuItems.filter((item) => item.isAvailableInPOS && !item.isOpenPrice);
    if (showAllItems || !changingRowMenuItem) {
      return pool;
    }
    return pool.filter((item) => {
      if (item.categoryId !== changingRowMenuItem.categoryId) {
        return false;
      }
      if (changingRow?.variantLabel) {
        return item.variants.some((variant) => variant.label === changingRow.variantLabel);
      }
      return true;
    });
  }

  function commitPick(item: MenuItem, variantId: string | null, variantLabel: string | null) {
    if (mode === "change" && changingRowId) {
      setItems((prev) =>
        prev.map((row) =>
          row.rowId === changingRowId
            ? { ...row, menuItemId: item.id, name: item.name, variantId, variantLabel, addOns: [], origin: "swapped" }
            : row,
        ),
      );
    } else if (mode === "add") {
      setItems((prev) => [
        ...prev,
        {
          rowId: crypto.randomUUID(),
          menuItemId: item.id,
          name: item.name,
          variantId,
          variantLabel,
          quantity: 1,
          addOns: [],
          origin: "added",
        },
      ]);
    }
    setMode("list");
    setChangingRowId(null);
    setSizeTarget(null);
    setShowAllItems(false);
  }

  function handlePickTile(item: MenuItem) {
    const pricedVariants = item.variants.filter((variant) => variant.price !== null);
    if (pricedVariants.length > 0) {
      setSizeTarget(item);
      return;
    }
    commitPick(item, null, null);
  }

  function handleRemoveRow(rowId: string) {
    if (items.length <= 1) {
      return;
    }
    setItems((prev) => prev.filter((row) => row.rowId !== rowId));
  }

  function handleToggleAddOn(rowId: string, addOnId: string, name: string, price: string) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) {
          return row;
        }
        const isSelected = row.addOns.some((addOn) => addOn.addOnId === addOnId);
        return {
          ...row,
          addOns: isSelected
            ? row.addOns.filter((addOn) => addOn.addOnId !== addOnId)
            : [...row.addOns, { addOnId, name, price }],
        };
      }),
    );
  }

  function handleApply() {
    onApply(items, estimated.toFixed(2));
  }

  if (mode !== "list") {
    const pool = eligibleItemsFor(mode);
    return (
      <div className="flex flex-col gap-3">
        {sizeTarget ? (
          <>
            <p className="text-body font-medium text-ink">{sizeTarget.name} — choose a size</p>
            <div className="flex flex-col gap-2">
              {sizeTarget.variants
                .filter((variant) => variant.price !== null)
                .map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => commitPick(sizeTarget, variant.id, variant.label)}
                    className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left text-body font-medium text-ink hover:bg-accent hover:text-white"
                  >
                    <span>{variant.label}</span>
                    <span className="text-numeric">{Number(variant.price).toFixed(2)}</span>
                  </button>
                ))}
            </div>
            <Button variant="secondary" onClick={() => setSizeTarget(null)}>
              Back
            </Button>
          </>
        ) : (
          <>
            {mode === "change" && (
              <label className="flex items-center gap-2 text-meta text-ink-muted">
                <input type="checkbox" checked={showAllItems} onChange={(event) => setShowAllItems(event.target.checked)} />
                All items
              </label>
            )}
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {pool.length === 0 && <p className="text-body text-ink-muted">No eligible items.</p>}
              {pool.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePickTile(item)}
                  className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left text-body font-medium text-ink hover:bg-accent hover:text-white"
                >
                  <span>{item.name}</span>
                  {item.price !== null && <span className="text-numeric">{Number(item.price).toFixed(2)}</span>}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setMode("list");
                setChangingRowId(null);
                setShowAllItems(false);
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex max-h-64 list-none flex-col gap-2 overflow-y-auto">
        {items.map((item) => {
          const menuItem = menuItemById.get(item.menuItemId);
          const availableAddOns = item.variantId
            ? menuItem?.variants.find((variant) => variant.id === item.variantId)?.addOns ?? []
            : [];
          return (
            <li key={item.rowId} className="flex flex-col gap-1.5 rounded-card border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-body font-medium text-ink">
                  {item.quantity}× {item.name}
                  {item.variantLabel && <span className="text-meta text-ink-muted"> · {item.variantLabel}</span>}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setChangingRowId(item.rowId);
                      setMode("change");
                      setShowAllItems(false);
                    }}
                    className="rounded-card px-2 py-1 text-meta font-medium text-accent hover:bg-surface"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(item.rowId)}
                    disabled={items.length <= 1}
                    className="rounded-card px-2 py-1 text-meta font-medium text-status-danger-text hover:bg-status-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {availableAddOns.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableAddOns.map((addOn) => {
                    const isSelected = item.addOns.some((chosen) => chosen.addOnId === addOn.id);
                    return (
                      <button
                        key={addOn.id}
                        type="button"
                        onClick={() => handleToggleAddOn(item.rowId, addOn.id, addOn.name, addOn.price)}
                        className={cn(
                          "rounded-card border px-2.5 py-1 text-meta font-medium transition-colors",
                          isSelected
                            ? "border-accent bg-accent text-white"
                            : "border-border bg-surface text-ink hover:bg-surface-raised",
                        )}
                      >
                        {addOn.name} (+{Number(addOn.price).toFixed(2)})
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Button variant="secondary" onClick={() => setMode("add")}>
        Add item
      </Button>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex justify-between text-meta text-ink-muted">
          <span>Standard price</span>
          <span className="text-numeric">{standard.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-meta text-ink-muted">
          <span>Extras</span>
          <span className="text-numeric">{extras.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-body font-medium text-ink">
          <span>Estimated total</span>
          <span className="text-numeric">{estimated.toFixed(2)}</span>
        </div>
        <p className="text-meta text-ink-muted">Reception confirms the final price.</p>
      </div>

      <div className="flex gap-2">
        {existing && (
          <Button variant="secondary" className="flex-1" onClick={onReset}>
            Reset to standard
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="success" className="flex-1" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </div>
  );
}

interface TakerDealCustomizeDialogProps {
  deal: Deal | null;
  existing: CustomDealLine | null;
  menuItems: MenuItem[];
  menuItemById: Map<string, MenuItem>;
  onApply: (items: CustomDealItem[], finalPrice: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export function TakerDealCustomizeDialog({
  deal,
  existing,
  menuItems,
  menuItemById,
  onApply,
  onReset,
  onClose,
}: TakerDealCustomizeDialogProps) {
  return (
    <Modal isOpen={deal !== null} onClose={onClose} title={deal ? `Customize ${deal.name}` : undefined} className="max-w-lg">
      {deal && (
        <TakerDealCustomizeForm
          key={existing?.lineId ?? deal.id}
          deal={deal}
          existing={existing}
          menuItems={menuItems}
          menuItemById={menuItemById}
          onApply={onApply}
          onReset={onReset}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
