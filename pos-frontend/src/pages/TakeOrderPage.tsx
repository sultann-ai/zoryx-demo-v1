import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { MenuItem } from "../api/menuItems";
import type { OrderDetail } from "../api/orders";
import { useCurrentBusinessDay } from "../hooks/useBusinessDay";
import { useDeals } from "../hooks/useDeals";
import { useDiningAreas } from "../hooks/useDiningAreas";
import { useKitchens } from "../hooks/useKitchens";
import { useMenuItems } from "../hooks/useMenuItems";
import { useCreateOrderChange, useOrder, useSubmitOrder, useUpdateSubmission } from "../hooks/useOrders";
import { useTakerOrdersContext } from "../context/TakerOrdersContext";
import { Button, EmptyState, PageHeader, Textarea } from "../components/ui";
import { CartPanel } from "./newOrder/CartPanel";
import { KitchenTabs } from "./newOrder/KitchenTabs";
import { MenuSearchBar } from "./newOrder/MenuSearchBar";
import { MenuTileGrid } from "./newOrder/MenuTileGrid";
import { SizePickerModal } from "./newOrder/SizePickerModal";
import type { Cart, CartAddOn } from "./newOrder/cart";
import {
  cartTotal,
  decrementQuantity,
  incrementLine,
  incrementQuantity,
  removeItem,
  setItemNotes,
  setLineAddOns,
} from "./newOrder/cart";
import type { CustomDealItem, DealCart, DealCartLine } from "./newOrder/dealCart";
import {
  applyDealCustomization,
  decrementDealQuantity,
  dealCartTotal,
  incrementDealLine,
  incrementDealQuantity,
  removeDealLine,
  resetDealCustomization,
  setDealLineNotes,
  toDealPayload,
} from "./newOrder/dealCart";
import { DiningAreaPicker } from "./newOrder/DiningAreaPicker";
import { buildKitchenTagColorMap } from "./newOrder/kitchenTagColor";
import { useMenuGridSearch } from "./newOrder/useMenuGridSearch";
import { TakerDealCustomizeDialog } from "./takeOrder/TakerDealCustomizeDialog";
import { hydrateCart } from "./takeOrder/hydrateCart";

type Step = "table" | "items" | "confirmation";

interface ConfirmationInfo {
  orderNumber: number;
  tableName: string;
}

interface EditLocationState {
  editOrderId?: string;
}

// Waits for the order being edited to load before mounting the form — TakeOrderForm
// below is keyed by editOrderId, so switching which order (or starting fresh) always
// gets a clean remount with the right initial state, the same "key it by the record's
// id" pattern DealCustomizeDialog/SizePickerModal already use, rather than an effect
// that pushes hydrated state in after the fact.
export function TakeOrderPage() {
  const location = useLocation();
  const editOrderId = (location.state as EditLocationState | null)?.editOrderId ?? null;
  const { data: editingOrder, isLoading } = useOrder(editOrderId ?? "", { enabled: editOrderId !== null });

  if (editOrderId && isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Edit order" />
        <p className="text-body text-ink-muted">Loading…</p>
      </div>
    );
  }

  return <TakeOrderForm key={editOrderId ?? "new"} editOrderId={editOrderId} editingOrder={editOrderId ? editingOrder ?? null : null} />;
}

interface TakeOrderFormProps {
  editOrderId: string | null;
  editingOrder: OrderDetail | null;
}

function TakeOrderForm({ editOrderId, editingOrder }: TakeOrderFormProps) {
  const navigate = useNavigate();
  const isEditMode = editOrderId !== null;

  const { connectionStatus } = useTakerOrdersContext();
  const {
    data: currentBusinessDay,
    isLoading: isLoadingBusinessDay,
    isError: isBusinessDayError,
    error: businessDayError,
  } = useCurrentBusinessDay();
  const { data: kitchens } = useKitchens();
  const { data: diningAreas } = useDiningAreas();
  const { data: menuItems } = useMenuItems();
  const { data: deals } = useDeals();
  const submitMutation = useSubmitOrder();
  const updateSubmissionMutation = useUpdateSubmission();
  const createChangeMutation = useCreateOrderChange();

  const initial = editingOrder ? hydrateCart(editingOrder) : null;

  const [step, setStep] = useState<Step>(isEditMode ? "items" : "table");
  const [diningAreaId, setDiningAreaId] = useState(editingOrder?.diningAreaId ?? "");
  const [kitchenFilter, setKitchenFilter] = useState("");
  // Separate from the cart — typing, clearing or changing the search never touches it.
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<Cart>(() => initial?.cart ?? new Map());
  const [dealCart, setDealCart] = useState<DealCart>(() => initial?.dealCart ?? new Map());
  const [notes, setNotes] = useState(editingOrder?.notes ?? "");
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [sizePickerItem, setSizePickerItem] = useState<MenuItem | null>(null);
  const [customizingKey, setCustomizingKey] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationInfo | null>(null);

  useEffect(() => {
    if (!isCartExpanded) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsCartExpanded(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCartExpanded]);

  const menuItemById = new Map((menuItems ?? []).map((item) => [item.id, item]));
  const dealById = new Map((deals ?? []).map((deal) => [deal.id, deal]));
  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));
  const tagColorById = useMemo(
    () => buildKitchenTagColorMap((kitchens ?? []).map((kitchen) => kitchen.id)),
    [kitchens],
  );
  // Open-price items are backend-blocked for an ORDER_TAKER submit (parseOrderItems is
  // called without allowUnitPrice there) — excluded here rather than offered and 400ing.
  const orderableItems = useMemo(
    () => (menuItems ?? []).filter((item) => item.isAvailableInPOS && item.sellableAlone && !item.isOpenPrice),
    [menuItems],
  );
  const orderableDeals = useMemo(
    () => (deals ?? []).filter((deal) => deal.isActive && deal.isAvailableInPOS),
    [deals],
  );
  const { visibleItems: visibleMenuItems, visibleDeals, isSearching } = useMenuGridSearch({
    orderableItems,
    orderableDeals,
    kitchenFilter,
    query: searchQuery,
  });
  const activeDiningAreas = (diningAreas ?? []).filter((area) => area.isActive);
  const diningAreaName = activeDiningAreas.find((area) => area.id === diningAreaId)?.name ?? "";

  const cartEntries = Array.from(cart.entries());
  const dealCartEntries = Array.from(dealCart.entries());
  const cartCount =
    cartEntries.reduce((sum, [, entry]) => sum + entry.quantity, 0) +
    dealCartEntries.reduce((sum, [, line]) => sum + (line.kind === "plain" ? line.quantity : 1), 0);
  const total = cartTotal(cart, menuItemById) + dealCartTotal(dealCart, dealById);
  const canConfirm = (cartEntries.length > 0 || dealCartEntries.length > 0) && connectionStatus !== "offline";

  const customizingLine: DealCartLine | null = customizingKey ? dealCart.get(customizingKey) ?? null : null;
  const customizingDeal = customizingLine ? dealById.get(customizingLine.dealId) ?? null : null;
  const customizingExisting = customizingLine && customizingLine.kind === "custom" ? customizingLine : null;

  function resetForNewOrder(preselectDiningAreaId?: string) {
    setCart(new Map());
    setDealCart(new Map());
    setNotes("");
    setSearchQuery("");
    setFormError(null);
    setClientRequestId(crypto.randomUUID());
    setConfirmation(null);
    if (preselectDiningAreaId) {
      setDiningAreaId(preselectDiningAreaId);
      setStep("items");
    } else {
      setDiningAreaId("");
      setStep("table");
    }
  }

  function handleSelectTable(id: string) {
    setDiningAreaId(id);
    setStep("items");
  }

  function handleAddItem(menuItemId: string, variantId?: string, variantLabel?: string) {
    setCart((prev) => incrementQuantity(prev, menuItemId, variantId, variantLabel));
  }

  function handleAddDeal(dealId: string) {
    setDealCart((prev) => incrementDealQuantity(prev, dealId));
  }

  function handleApplyDealCustomization(items: CustomDealItem[], finalPrice: string) {
    if (!customizingKey || !customizingLine) {
      return;
    }
    setDealCart((prev) =>
      applyDealCustomization(prev, customizingKey, customizingLine.dealId, { items, finalPrice, reason: "" }),
    );
    setCustomizingKey(null);
  }

  function handleResetDealCustomization() {
    if (!customizingKey) {
      return;
    }
    setDealCart((prev) => resetDealCustomization(prev, customizingKey));
    setCustomizingKey(null);
  }

  function handleCancelCart() {
    setCart(new Map());
    setDealCart(new Map());
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (cartEntries.length === 0 && dealCartEntries.length === 0) {
      setFormError("Add at least one item to the order.");
      return;
    }
    if (!isEditMode && diningAreaId === "") {
      setFormError("Select a table first.");
      return;
    }

    const items = cartEntries.map(([, entry]) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
      ...(entry.notes.trim() !== "" ? { notes: entry.notes.trim() } : {}),
      ...(entry.variantId !== null ? { variantId: entry.variantId } : {}),
      ...(entry.addOns.length > 0 ? { addOnIds: entry.addOns.map((addOn) => addOn.addOnId) } : {}),
    }));
    const dealsPayload = toDealPayload(dealCart);

    try {
      if (isEditMode && editOrderId) {
        if (editingOrder?.status === "AWAITING_RECEPTION") {
          await updateSubmissionMutation.mutateAsync({
            id: editOrderId,
            input: { items, deals: dealsPayload, ...(notes.trim() !== "" ? { notes: notes.trim() } : {}) },
          });
        } else {
          await createChangeMutation.mutateAsync({
            id: editOrderId,
            input: {
              kind: "EDIT",
              items,
              deals: dealsPayload,
              ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
              reason: "Full order edit requested by the order taker",
            },
          });
        }
        navigate("/my-orders");
        return;
      }
      const order = await submitMutation.mutateAsync({
        diningAreaId,
        items,
        deals: dealsPayload,
        ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
        clientRequestId,
      });
      setIsCartExpanded(false);
      setConfirmation({ orderNumber: order.orderNumber, tableName: order.diningArea?.name ?? diningAreaName });
      setStep("confirmation");
    } catch (error) {
      setFormError(getApiErrorMessage(error, isEditMode ? "Failed to save changes" : "Failed to send order"));
    }
  }

  if (step === "confirmation" && confirmation) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <h1 className="font-heading text-title font-semibold text-ink">
          Sent to reception — Order #{confirmation.orderNumber}, Table {confirmation.tableName}
        </h1>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button size="lg" onClick={() => resetForNewOrder(diningAreaId)}>
            Add more for this table
          </Button>
          <Button variant="secondary" size="lg" onClick={() => resetForNewOrder()}>
            New order
          </Button>
        </div>
      </div>
    );
  }

  if (step === "table") {
    if (isBusinessDayError) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="New Order" />
          <EmptyState
            title="Could not load business day"
            description={getApiErrorMessage(businessDayError, "Please refresh and try again.")}
          />
        </div>
      );
    }
    if (!isLoadingBusinessDay && !currentBusinessDay) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="New Order" />
          <EmptyState
            title="Business day hasn't started"
            description="Tell reception to start the day before taking orders."
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="New Order" description="Pick a table" />
        <DiningAreaPicker
          diningAreas={activeDiningAreas}
          selectedId={diningAreaId}
          onSelect={handleSelectTable}
          layout="grouped"
        />
      </div>
    );
  }

  const cartPanelProps = {
    entries: cartEntries,
    menuItemById,
    onIncrement: (key: string) => setCart((prev) => incrementLine(prev, key)),
    onDecrement: (key: string) => setCart((prev) => decrementQuantity(prev, key)),
    onRemove: (key: string) => setCart((prev) => removeItem(prev, key)),
    onNotesChange: (key: string, itemNotes: string) => setCart((prev) => setItemNotes(prev, key, itemNotes)),
    onAddOnsChange: (key: string, addOns: CartAddOn[]) => setCart((prev) => setLineAddOns(prev, key, addOns)),
    // Open-price items never reach this screen (see visibleMenuItems above), so no
    // cart line here is ever an open-price one — this callback has nothing to do.
    onEditOpenPrice: () => {},
    dealEntries: dealCartEntries,
    dealById,
    onIncrementDeal: (key: string) => setDealCart((prev) => incrementDealLine(prev, key)),
    onDecrementDeal: (key: string) => setDealCart((prev) => decrementDealQuantity(prev, key)),
    onDealNotesChange: (key: string, dealNotes: string) => setDealCart((prev) => setDealLineNotes(prev, key, dealNotes)),
    onRemoveDeal: (key: string) => setDealCart((prev) => removeDealLine(prev, key)),
    onCustomizeDeal: (key: string) => setCustomizingKey(key),
    total,
    formError,
    isSubmitting: submitMutation.isPending || updateSubmissionMutation.isPending || createChangeMutation.isPending,
    canConfirm,
    onCancel: handleCancelCart,
    cancelLabel: "Clear",
    confirmLabel: isEditMode ? (editingOrder?.status === "AWAITING_RECEPTION" ? "Save changes" : "Request changes") : "Send to reception",
    submittingLabel: isEditMode ? (editingOrder?.status === "AWAITING_RECEPTION" ? "Saving…" : "Requesting…") : "Sending…",
    beforeActions: (
      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink-muted">Note for this order</span>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. no chili, birthday" />
        {connectionStatus === "offline" && (
          <span className="text-meta text-status-danger-text">You're offline — reconnect to send this order.</span>
        )}
      </label>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={isEditMode ? "Edit order" : "New Order"} description={diningAreaName || undefined} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 pb-24">
          <MenuSearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            resultCount={isSearching ? visibleMenuItems.length + visibleDeals.length : null}
          />
          <KitchenTabs
            kitchens={kitchens ?? []}
            activeKitchenId={kitchenFilter}
            onSelect={setKitchenFilter}
            tagColorById={tagColorById}
          />
          <MenuTileGrid
            items={visibleMenuItems}
            kitchenNameById={kitchenNameById}
            onAddItem={handleAddItem}
            onPickSize={setSizePickerItem}
            onOpenPricePrompt={() => {}}
            tagColorById={tagColorById}
            deals={visibleDeals}
            onAddDeal={handleAddDeal}
            searchQuery={isSearching ? searchQuery : undefined}
            onClearSearch={() => setSearchQuery("")}
          />
        </div>

        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface-raised">
          <button
            type="button"
            onClick={() => setIsCartExpanded(true)}
            className="flex h-16 w-full items-center justify-between px-4 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span>
              {cartCount} item{cartCount === 1 ? "" : "s"} in cart
            </span>
            <span className="text-numeric">{total.toFixed(2)} — View Cart</span>
          </button>
        </div>

        {isCartExpanded && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close cart"
              className="absolute inset-0 bg-ink/40 focus-visible:outline-none"
              onClick={() => setIsCartExpanded(false)}
            />
            <div className="relative flex max-h-[85vh] flex-col overflow-y-auto rounded-t-card border-t border-border bg-surface-raised">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="font-heading text-section font-semibold text-ink">Cart</span>
                <button
                  type="button"
                  onClick={() => setIsCartExpanded(false)}
                  aria-label="Close cart"
                  className="rounded-card p-1 text-ink-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <CartPanel {...cartPanelProps} />
            </div>
          </div>
        )}
      </form>

      <SizePickerModal
        item={sizePickerItem}
        onClose={() => setSizePickerItem(null)}
        onPick={(menuItemId, variantId, variantLabel) => handleAddItem(menuItemId, variantId, variantLabel)}
      />

      <TakerDealCustomizeDialog
        deal={customizingDeal}
        existing={customizingExisting}
        menuItems={menuItems ?? []}
        menuItemById={menuItemById}
        onApply={handleApplyDealCustomization}
        onReset={handleResetDealCustomization}
        onClose={() => setCustomizingKey(null)}
      />
    </div>
  );
}
