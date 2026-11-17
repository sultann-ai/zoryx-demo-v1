import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { MenuItem } from "../api/menuItems";
import type { OrderDetail, OrderType, PaymentMethod } from "../api/orders";
import { useCurrentBusinessDay } from "../hooks/useBusinessDay";
import { useDeals } from "../hooks/useDeals";
import { useDiningAreas } from "../hooks/useDiningAreas";
import { useEmployees } from "../hooks/useEmployees";
import { useKitchens } from "../hooks/useKitchens";
import { useMenuItems } from "../hooks/useMenuItems";
import { useCreateOrder, useOrder, useUpdateScheduledItems } from "../hooks/useOrders";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { ORDER_TYPE_LABEL } from "../lib/enumLabels";
import type { WallTime } from "../lib/shopTime";
import { fromWallTime } from "../lib/shopTime";
import { CartPanel } from "./newOrder/CartPanel";
import { DealCustomizeDialog } from "./newOrder/DealCustomizeDialog";
import { KitchenTabs } from "./newOrder/KitchenTabs";
import { MenuSearchBar } from "./newOrder/MenuSearchBar";
import { MenuTileGrid } from "./newOrder/MenuTileGrid";
import type { OpenPriceTarget } from "./newOrder/OpenPriceDialog";
import { OpenPriceDialog } from "./newOrder/OpenPriceDialog";
import { OrderMetaBar } from "./newOrder/OrderMetaBar";
import { SchedulePicker } from "./newOrder/SchedulePicker";
import { SegmentedControl } from "./newOrder/SegmentedControl";
import { defaultScheduleWallTime, scheduleError } from "./newOrder/schedule";
import { hydrateCart } from "./takeOrder/hydrateCart";
import { SizePickerModal } from "./newOrder/SizePickerModal";
import type { Cart, CartAddOn } from "./newOrder/cart";
import {
  addOpenPriceItem,
  cartTotal,
  decrementQuantity,
  incrementLine,
  incrementQuantity,
  removeItem,
  setCustomPrice,
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
import { buildKitchenTagColorMap } from "./newOrder/kitchenTagColor";
import { useMenuGridSearch } from "./newOrder/useMenuGridSearch";

type When = "NOW" | "LATER";

const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "NOW", label: "Now" },
  { value: "LATER", label: "Schedule for later" },
];

// Two routes share this screen: /orders/new (a new order, placed now or scheduled) and
// /scheduled/:id/edit (the items of a still-SCHEDULED order). The edit route waits for the
// order, then mounts the form keyed by its id with the cart hydrated from it — the same
// "key it by the record" pattern TakeOrderPage uses for its edit flow.
export function NewOrderPage() {
  const { id: editScheduledId } = useParams<{ id?: string }>();
  const { data: editingOrder, isLoading, isError } = useOrder(editScheduledId ?? "", {
    enabled: editScheduledId !== undefined,
  });

  if (editScheduledId === undefined) {
    return <NewOrderForm key="new" editingOrder={null} />;
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Edit scheduled order" />
        <p className="text-body text-ink-muted">Loading…</p>
      </div>
    );
  }
  if (isError || !editingOrder) {
    return <p className="text-body text-status-danger-text">Order not found.</p>;
  }
  if (editingOrder.status !== "SCHEDULED") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={`Order #${editingOrder.orderNumber}`} />
        <EmptyState
          title="This order is no longer scheduled"
          description="It has already been released (or cancelled), so its items can't be edited here."
          action={
            <Link to={`/orders/${editingOrder.id}`} className="text-body font-medium text-accent">
              Open the order
            </Link>
          }
        />
      </div>
    );
  }
  return <NewOrderForm key={editingOrder.id} editingOrder={editingOrder} />;
}

function NewOrderForm({ editingOrder }: { editingOrder: OrderDetail | null }) {
  const navigate = useNavigate();
  const isEditingScheduled = editingOrder !== null;
  const { data: currentBusinessDay, isLoading: isLoadingBusinessDay } = useCurrentBusinessDay();
  const { data: kitchens, isError: isKitchensError } = useKitchens();
  const { data: diningAreas, isError: isDiningAreasError } = useDiningAreas();
  const { data: employees, isError: isEmployeesError } = useEmployees();
  const { data: menuItems, isError: isMenuItemsError } = useMenuItems();
  const { data: deals, isError: isDealsError } = useDeals();
  const createMutation = useCreateOrder();
  const updateScheduledItemsMutation = useUpdateScheduledItems();

  const hasReferenceDataError =
    isKitchensError || isDiningAreasError || isEmployeesError || isMenuItemsError || isDealsError;

  const [type, setType] = useState<OrderType>("DINE_IN");
  const [diningAreaId, setDiningAreaId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [waiterId, setWaiterId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [kitchenFilter, setKitchenFilter] = useState("");
  // Separate from the cart — typing, clearing or changing the search never touches it.
  const [searchQuery, setSearchQuery] = useState("");
  // Lazy, once per mount — the edit route remounts this form per order (see NewOrderPage).
  const [initial] = useState(() => (editingOrder ? hydrateCart(editingOrder) : null));
  const [cart, setCart] = useState<Cart>(() => initial?.cart ?? new Map());
  const [dealCart, setDealCart] = useState<DealCart>(() => initial?.dealCart ?? new Map());
  const [when, setWhen] = useState<When>("NOW");
  const [scheduleWall, setScheduleWall] = useState<WallTime>(() => defaultScheduleWallTime(new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const [isCartExpanded, setIsCartExpanded] = useState(false);
  const [sizePickerItem, setSizePickerItem] = useState<MenuItem | null>(null);
  // The cart-line key (plain dealId, or an existing custom line's lineId) the
  // customize dialog is currently open for; null when it's closed.
  const [customizingKey, setCustomizingKey] = useState<string | null>(null);
  // The open-price dialog's current target (a fresh add from a tile, or an existing
  // cart line being re-priced via its pencil); null when it's closed.
  const [openPriceTarget, setOpenPriceTarget] = useState<OpenPriceTarget | null>(null);

  // Bottom-sheet parity with the native <dialog> used elsewhere in the app,
  // which closes on Escape for free — this one is hand-rolled (needs to sit
  // at the bottom on narrow screens, not centered), so it needs it wired up.
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

  function handleTypeChange(nextType: OrderType) {
    setType(nextType);
    setDiningAreaId("");
    setDeliveryAddress("");
    // The rider picker only exists for a delivery, so a rider chosen before
    // switching away would otherwise stay silently attached to the order.
    setRiderId("");
  }

  const menuItemById = new Map((menuItems ?? []).map((item) => [item.id, item]));
  const dealById = new Map((deals ?? []).map((deal) => [deal.id, deal]));
  const kitchenNameById = new Map((kitchens ?? []).map((kitchen) => [kitchen.id, kitchen.name]));
  // Built once per kitchen list, not per id — colors are assigned by each
  // kitchen's position in a stable sort, so every kitchen needs the full set.
  const tagColorById = useMemo(
    () => buildKitchenTagColorMap((kitchens ?? []).map((kitchen) => kitchen.id)),
    [kitchens],
  );
  const orderableItems = useMemo(
    () => (menuItems ?? []).filter((item) => item.isAvailableInPOS && item.sellableAlone),
    [menuItems],
  );
  const orderableDeals = useMemo(
    () => (deals ?? []).filter((deal) => deal.isActive && deal.isAvailableInPOS),
    [deals],
  );
  // A deal spans multiple kitchens by nature, so it has no single kitchen to filter by —
  // it shows under "All", or whenever a search matches it.
  const { visibleItems: visibleMenuItems, visibleDeals, isSearching } = useMenuGridSearch({
    orderableItems,
    orderableDeals,
    kitchenFilter,
    query: searchQuery,
  });
  const cartEntries = Array.from(cart.entries());
  const dealCartEntries = Array.from(dealCart.entries());
  const cartCount =
    cartEntries.reduce((sum, [, entry]) => sum + entry.quantity, 0) +
    dealCartEntries.reduce((sum, [, line]) => sum + (line.kind === "plain" ? line.quantity : 1), 0);
  const total = cartTotal(cart, menuItemById) + dealCartTotal(dealCart, dealById);
  const canConfirm = cartEntries.length > 0 || dealCartEntries.length > 0;

  const customizingLine: DealCartLine | null = customizingKey ? dealCart.get(customizingKey) ?? null : null;
  const customizingDeal = customizingLine ? dealById.get(customizingLine.dealId) ?? null : null;
  const customizingExisting = customizingLine && customizingLine.kind === "custom" ? customizingLine : null;

  function handleAddItem(menuItemId: string, variantId?: string, variantLabel?: string) {
    setCart((prev) => incrementQuantity(prev, menuItemId, variantId, variantLabel));
  }

  function handleAddDeal(dealId: string) {
    setDealCart((prev) => incrementDealQuantity(prev, dealId));
  }

  function handleOpenPricePrompt(item: MenuItem) {
    setOpenPriceTarget({ item, editingKey: null, initialPrice: "", initialNotes: "" });
  }

  function handleEditOpenPriceLine(key: string) {
    const entry = cart.get(key);
    const item = entry ? menuItemById.get(entry.menuItemId) : undefined;
    if (!entry || !item || entry.customPrice === null) {
      return;
    }
    setOpenPriceTarget({ item, editingKey: key, initialPrice: entry.customPrice, initialNotes: entry.notes });
  }

  function handleAddOpenPriceItem(menuItemId: string, price: string, notes: string) {
    setCart((prev) => addOpenPriceItem(prev, menuItemId, price, notes));
    setOpenPriceTarget(null);
  }

  function handleSaveOpenPriceLine(key: string, price: string, notes: string) {
    setCart((prev) => setCustomPrice(prev, key, price, notes));
    setOpenPriceTarget(null);
  }

  function handleApplyDealCustomization(items: CustomDealItem[], finalPrice: string, reason: string) {
    if (!customizingKey || !customizingLine) {
      return;
    }
    setDealCart((prev) => applyDealCustomization(prev, customizingKey, customizingLine.dealId, { items, finalPrice, reason }));
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
    if (isEditingScheduled) {
      navigate("/scheduled");
      return;
    }
    setCart(new Map());
    setDealCart(new Map());
    setFormError(null);
  }

  function handleWhenChange(next: When) {
    setWhen(next);
    if (next === "LATER") {
      // Fresh default each time it's opened, so a stale time from earlier isn't reused.
      setScheduleWall(defaultScheduleWallTime(new Date()));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (cartEntries.length === 0 && dealCartEntries.length === 0) {
      setFormError("Add at least one item to the order.");
      return;
    }

    const items = cartEntries.map(([, entry]) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
      ...(entry.notes.trim() !== "" ? { notes: entry.notes.trim() } : {}),
      ...(entry.variantId !== null ? { variantId: entry.variantId } : {}),
      ...(entry.addOns.length > 0 ? { addOnIds: entry.addOns.map((addOn) => addOn.addOnId) } : {}),
      ...(entry.customPrice !== null ? { unitPrice: Number(entry.customPrice) } : {}),
    }));

    if (editingOrder) {
      try {
        await updateScheduledItemsMutation.mutateAsync({
          id: editingOrder.id,
          input: { items, deals: toDealPayload(dealCart) },
        });
        navigate("/scheduled");
      } catch (error) {
        setFormError(getApiErrorMessage(error, "Failed to save changes"));
      }
      return;
    }

    let scheduledFor: string | undefined;
    if (when === "LATER") {
      // Re-checked against the clock right now, not when the time was picked.
      const problem = scheduleError(scheduleWall, new Date());
      if (problem) {
        setFormError(problem);
        return;
      }
      scheduledFor = fromWallTime(scheduleWall).toISOString();
    }

    // The dining area is a tap grid rather than a <select>, so there's no
    // `required` attribute for the browser to enforce on submit.
    if (type === "DINE_IN" && diningAreaId === "") {
      setFormError("Select a dining area for a dine-in order.");
      return;
    }

    try {
      const order = await createMutation.mutateAsync({
        type,
        paymentMethod,
        ...(type === "DINE_IN" ? { diningAreaId } : {}),
        ...(type === "DELIVERY" ? { deliveryAddress: deliveryAddress.trim() } : {}),
        ...(waiterId !== "" ? { waiterId } : {}),
        ...(riderId !== "" ? { riderId } : {}),
        ...(scheduledFor !== undefined ? { scheduledFor } : {}),
        items,
        deals: toDealPayload(dealCart),
      });
      // A scheduled order is on hold — the Scheduled list is where it's managed from now on.
      navigate(scheduledFor !== undefined ? "/scheduled" : `/orders/${order.id}`);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Failed to create order"));
    }
  }

  if (!isEditingScheduled && !isLoadingBusinessDay && !currentBusinessDay) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New Order" />
        <EmptyState title="No active business day" description="Start one before creating orders." />
      </div>
    );
  }

  const cartPanelProps = {
    entries: cartEntries,
    menuItemById,
    onIncrement: (key: string) => setCart((prev) => incrementLine(prev, key)),
    onDecrement: (key: string) => setCart((prev) => decrementQuantity(prev, key)),
    onRemove: (key: string) => setCart((prev) => removeItem(prev, key)),
    onNotesChange: (key: string, notes: string) => setCart((prev) => setItemNotes(prev, key, notes)),
    onAddOnsChange: (key: string, addOns: CartAddOn[]) => setCart((prev) => setLineAddOns(prev, key, addOns)),
    onEditOpenPrice: handleEditOpenPriceLine,
    dealEntries: dealCartEntries,
    dealById,
    onIncrementDeal: (key: string) => setDealCart((prev) => incrementDealLine(prev, key)),
    onDecrementDeal: (key: string) => setDealCart((prev) => decrementDealQuantity(prev, key)),
    onDealNotesChange: (key: string, dealNotes: string) => setDealCart((prev) => setDealLineNotes(prev, key, dealNotes)),
    onRemoveDeal: (key: string) => setDealCart((prev) => removeDealLine(prev, key)),
    onCustomizeDeal: (key: string) => setCustomizingKey(key),
    total,
    formError,
    isSubmitting: createMutation.isPending || updateScheduledItemsMutation.isPending,
    canConfirm,
    onCancel: handleCancelCart,
    ...(isEditingScheduled
      ? { cancelLabel: "Discard", confirmLabel: "Save changes", submittingLabel: "Saving…" }
      : when === "LATER"
        ? { confirmLabel: "Schedule order", submittingLabel: "Scheduling…" }
        : {}),
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={editingOrder ? `Edit scheduled order #${editingOrder.orderNumber}` : "New Order"} />

      {hasReferenceDataError && (
        <p role="alert" className="text-body text-status-danger-text">
          Could not load some of the data this screen needs (kitchens, dining areas, employees, or menu items). Try
          reloading the page.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {editingOrder ? (
          // Only the items (and their notes) change here — the order's type, table, payment
          // and time stay as they are; the time has its own "Edit time" on the Scheduled list.
          <Card>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <OrderStatusBadge order={editingOrder} />
                <span className="text-body text-ink">
                  {ORDER_TYPE_LABEL[editingOrder.type]}
                  {editingOrder.diningArea ? ` — ${editingOrder.diningArea.name}` : ""}
                  {editingOrder.deliveryAddress ? ` — ${editingOrder.deliveryAddress}` : ""}
                </span>
              </div>
              <p className="text-meta text-ink-muted">
                Change the items below, then Save changes. It stays on hold until its scheduled time.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <OrderMetaBar
              type={type}
              onTypeChange={handleTypeChange}
              diningAreaId={diningAreaId}
              onDiningAreaChange={setDiningAreaId}
              diningAreas={diningAreas ?? []}
              deliveryAddress={deliveryAddress}
              onDeliveryAddressChange={setDeliveryAddress}
              waiterId={waiterId}
              onWaiterChange={setWaiterId}
              riderId={riderId}
              onRiderChange={setRiderId}
              employees={employees ?? []}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
            />
            <Card>
              <div className="flex flex-col gap-4">
                <SegmentedControl name="order-when" legend="When" options={WHEN_OPTIONS} value={when} onChange={handleWhenChange} />
                {when === "LATER" && <SchedulePicker idPrefix="new-order-schedule" value={scheduleWall} onChange={setScheduleWall} />}
              </div>
            </Card>
          </>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex flex-1 flex-col gap-4 pb-24 lg:pb-0">
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
              onOpenPricePrompt={handleOpenPricePrompt}
              tagColorById={tagColorById}
              deals={visibleDeals}
              onAddDeal={handleAddDeal}
              searchQuery={isSearching ? searchQuery : undefined}
              onClearSearch={() => setSearchQuery("")}
            />
          </div>

          {/* Persistent side panel — wide screens only. */}
          <div className="hidden lg:block lg:w-96 lg:shrink-0">
            <div className="rounded-card border border-border bg-surface-raised lg:sticky lg:top-6">
              <div className="border-b border-border px-4 py-3">
                <span className="font-heading text-section font-semibold text-ink">Cart</span>
              </div>
              <CartPanel {...cartPanelProps} />
            </div>
          </div>
        </div>

        {/* Bottom summary bar — narrow screens only; taps open the sheet below. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised lg:hidden">
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

        {/* Bottom sheet — narrow screens only, opened from the summary bar above. */}
        {isCartExpanded && (
          <div className="fixed inset-0 z-40 flex flex-col justify-end lg:hidden">
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

      <DealCustomizeDialog
        deal={customizingDeal}
        existing={customizingExisting}
        menuItems={menuItems ?? []}
        menuItemById={menuItemById}
        onApply={handleApplyDealCustomization}
        onReset={handleResetDealCustomization}
        onClose={() => setCustomizingKey(null)}
      />

      <OpenPriceDialog
        target={openPriceTarget}
        onAdd={handleAddOpenPriceItem}
        onSave={handleSaveOpenPriceLine}
        onClose={() => setOpenPriceTarget(null)}
      />
    </div>
  );
}
