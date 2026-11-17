import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Deal } from "../../api/deals";
import type { MenuItem } from "../../api/menuItems";
import { LineNote } from "../../components/LineNote";
import { Button, Input, StatusBadge } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { LINE_NOTE_MAX_LENGTH } from "../../lib/lineNotes";
import type { CartAddOn, CartEntry } from "./cart";
import { cartEntryPrice, cartKeyFor } from "./cart";
import type { DealCartLine } from "./dealCart";
import { dealLineTotal } from "./dealCart";

interface CartPanelProps {
  entries: [string, CartEntry][];
  menuItemById: Map<string, MenuItem>;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRemove: (key: string) => void;
  onNotesChange: (key: string, notes: string) => void;
  onAddOnsChange: (key: string, addOns: CartAddOn[]) => void;
  onEditOpenPrice: (key: string) => void;
  dealEntries: [string, DealCartLine][];
  dealById: Map<string, Deal>;
  // All keyed by the deal line's own cart key (see dealCart.ts's plainDealKey).
  onIncrementDeal: (key: string) => void;
  onDecrementDeal: (key: string) => void;
  onRemoveDeal: (key: string) => void;
  onCustomizeDeal: (key: string) => void;
  onDealNotesChange: (key: string, notes: string) => void;
  total: number;
  formError: string | null;
  isSubmitting: boolean;
  canConfirm: boolean;
  onCancel: () => void;
  // Taker mode relabels the pair ("Send to reception"/"Sending…") and slots an
  // order-level note field in above them — both optional, defaulted to New Order's
  // original behavior so this stays a non-breaking addition.
  cancelLabel?: string;
  confirmLabel?: string;
  submittingLabel?: string;
  beforeActions?: ReactNode;
}

// A small hand-drawn pencil glyph — no icon library in this project, and one
// icon doesn't justify adding one.
function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// A small "+" glyph for the add-ons control, distinct from the note pencil.
function AddOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const iconButtonClassName =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

// Edits a draft locally and hands it back once — on blur or Enter — rather than per
// keystroke: the note is part of a cart line's key, so committing re-keys the line, which
// would remount this input mid-typing. Escape abandons the draft.
function CartNoteInput({
  initialValue,
  label,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  label: string;
  onCommit: (notes: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const isDone = useRef(false);

  function commit() {
    if (isDone.current) {
      return;
    }
    isDone.current = true;
    onCommit(draft);
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={LINE_NOTE_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Inside the order <form> — Enter must save the note, never place the order.
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            // Keeps the mobile cart sheet (which also closes on Escape) open.
            event.preventDefault();
            event.stopPropagation();
            isDone.current = true;
            onCancel();
          }
        }}
        placeholder="e.g. no onion, extra spicy"
        enterKeyHint="done"
      />
      <span className="self-end text-meta text-ink-muted" aria-hidden="true">
        {draft.length}/{LINE_NOTE_MAX_LENGTH}
      </span>
    </div>
  );
}

export function CartPanel({
  entries,
  menuItemById,
  onIncrement,
  onDecrement,
  onRemove,
  onNotesChange,
  onAddOnsChange,
  onEditOpenPrice,
  dealEntries,
  dealById,
  onIncrementDeal,
  onDecrementDeal,
  onRemoveDeal,
  onCustomizeDeal,
  onDealNotesChange,
  total,
  formError,
  isSubmitting,
  canConfirm,
  onCancel,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  submittingLabel = "Placing…",
  beforeActions,
}: CartPanelProps) {
  // Prefixed ("item:"/"deal:") because an item key and a deal key could in theory collide.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingAddOnsKey, setEditingAddOnsKey] = useState<string | null>(null);
  const isEmpty = entries.length === 0 && dealEntries.length === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
              <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L19 8H6.2" />
              <circle cx="9.5" cy="20" r="1.2" />
              <circle cx="17" cy="20" r="1.2" />
            </svg>
          </span>
          <p className="m-0 text-card-head font-semibold text-ink">Your cart is empty</p>
          <p className="m-0 max-w-56 text-body text-ink-muted">Tap a menu item, or its + button, to start the order.</p>
        </div>
      ) : (
        <ul className="flex max-h-[45vh] list-none flex-col overflow-y-auto lg:max-h-[40vh]">
          {/* A plain deal line shows the deal's own name and price, never its
              contents — the composition is an admin/kitchen concern, not a cart-line
              one. A customized line is its own instance (always quantity 1) and
              shows exactly what it was changed to, read-only, under the name. */}
          {dealEntries.map(([key, line]) => {
            const deal = dealById.get(line.dealId);
            const name = deal?.name ?? line.dealId;
            const lineTotal = dealLineTotal(line, dealById);
            const noteId = `deal:${key}`;
            const isEditingNote = editingNoteId === noteId;
            const noteButton = (
              <button
                type="button"
                onClick={() => setEditingNoteId(isEditingNote ? null : noteId)}
                aria-label={line.notes ? `Edit note: ${name}` : `Add note: ${name}`}
                className={iconButtonClassName}
              >
                <NoteIcon />
              </button>
            );
            return (
              <li key={`deal-${key}`} className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body font-medium text-ink">
                    {name}
                    <StatusBadge status="DEAL_TAG" label="Deal" />
                    {line.kind === "custom" && <StatusBadge status="CUSTOMIZED_TAG" label="Customized" />}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDeal(key)}
                    aria-label={`Remove ${name}`}
                    className="shrink-0 rounded-card p-1 text-ink-muted transition-colors hover:bg-status-danger-bg hover:text-status-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                {line.kind === "custom" && (
                  <div className="flex flex-col gap-0.5">
                    {line.items.map((item) => (
                      <p key={item.rowId} className="text-meta text-ink-muted">
                        {item.quantity}× {item.name}
                        {item.variantLabel && ` · ${item.variantLabel}`}
                        {item.addOns.length > 0 && ` (+ ${item.addOns.map((addOn) => addOn.name).join(", ")})`}
                      </p>
                    ))}
                  </div>
                )}
                {line.notes && !isEditingNote && <LineNote notes={line.notes} />}

                {line.kind === "plain" ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-11 px-0"
                        onClick={() => onDecrementDeal(key)}
                        aria-label={`Decrease quantity: ${name}`}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-numeric text-ink">{line.quantity}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-11 px-0"
                        onClick={() => onIncrementDeal(key)}
                        aria-label={`Increase quantity: ${name}`}
                      >
                        +
                      </Button>
                      {noteButton}
                      <button
                        type="button"
                        onClick={() => onCustomizeDeal(key)}
                        className="rounded-card px-2 py-1 text-meta font-medium text-accent hover:bg-surface"
                      >
                        Customize
                      </button>
                    </div>
                    <span className="text-numeric font-medium text-ink">{lineTotal.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {noteButton}
                      <button
                        type="button"
                        onClick={() => onCustomizeDeal(key)}
                        className="rounded-card px-2 py-1 text-meta font-medium text-accent hover:bg-surface"
                      >
                        Customize
                      </button>
                    </div>
                    <span className="text-numeric font-medium text-ink">{lineTotal.toFixed(2)}</span>
                  </div>
                )}
                {isEditingNote && (
                  <CartNoteInput
                    initialValue={line.notes}
                    label={`Note for ${name}`}
                    onCommit={(notes) => {
                      onDealNotesChange(key, notes);
                      setEditingNoteId(null);
                    }}
                    onCancel={() => setEditingNoteId(null)}
                  />
                )}
              </li>
            );
          })}
          {entries.map(([key, entry]) => {
            const item = menuItemById.get(entry.menuItemId);
            const name = item?.name ?? entry.menuItemId;
            const price = cartEntryPrice(entry, menuItemById) ?? 0;
            const lineTotal = price * entry.quantity;
            const noteId = `item:${key}`;
            const isEditingNote = editingNoteId === noteId;
            const isEditingAddOns = editingAddOnsKey === key;
            const isOpenPriceEntry = entry.customPrice !== null;
            // Only a sized line can have add-ons (see AddOn's schema comment — prices
            // are keyed by size), and only when the item's own menu data lists some.
            const availableAddOns =
              item?.variants.find((variant) => variant.id === entry.variantId)?.addOns ?? [];
            return (
              <li key={key} className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-body font-medium text-ink">
                    {isOpenPriceEntry ? `${name} - Rs ${Number(entry.customPrice).toFixed(2)}` : name}
                    {entry.variantLabel && <span className="text-meta text-ink-muted"> · {entry.variantLabel}</span>}
                    {isOpenPriceEntry && <StatusBadge status="CUSTOM_PRICE_TAG" label="Custom price" />}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(key)}
                    aria-label={`Remove ${name}`}
                    className="shrink-0 rounded-card p-1 text-ink-muted transition-colors hover:bg-status-danger-bg hover:text-status-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                {entry.addOns.length > 0 && (
                  <p className="text-meta text-ink-muted">
                    {entry.addOns.map((addOn) => `+ ${addOn.name}`).join(", ")}
                  </p>
                )}
                {entry.notes && !isEditingNote && <LineNote notes={entry.notes} />}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-11 px-0"
                      onClick={() => onDecrement(key)}
                      aria-label={`Decrease quantity: ${name}`}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-numeric text-ink">{entry.quantity}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-11 px-0"
                      onClick={() => onIncrement(key)}
                      aria-label={`Increase quantity: ${name}`}
                    >
                      +
                    </Button>
                    {isOpenPriceEntry ? (
                      // The open-price dialog edits this line's price and note together.
                      <button
                        type="button"
                        onClick={() => onEditOpenPrice(key)}
                        aria-label={`Change price or note: ${name}`}
                        className={iconButtonClassName}
                      >
                        <NoteIcon />
                      </button>
                    ) : (
                      <>
                        {availableAddOns.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditingAddOnsKey(isEditingAddOns ? null : key)}
                            aria-label={entry.addOns.length > 0 ? `Edit add-ons: ${name}` : `Add add-ons: ${name}`}
                            className={iconButtonClassName}
                          >
                            <AddOnIcon />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(isEditingNote ? null : noteId)}
                          aria-label={entry.notes ? `Edit note: ${name}` : `Add note: ${name}`}
                          className={iconButtonClassName}
                        >
                          <NoteIcon />
                        </button>
                      </>
                    )}
                  </div>
                  <span className="text-numeric font-medium text-ink">{lineTotal.toFixed(2)}</span>
                </div>
                {!isOpenPriceEntry && isEditingNote && (
                  <CartNoteInput
                    initialValue={entry.notes}
                    label={`Note for ${name}`}
                    onCommit={(notes) => {
                      onNotesChange(key, notes);
                      setEditingNoteId(null);
                    }}
                    onCancel={() => setEditingNoteId(null)}
                  />
                )}
                {isEditingAddOns && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableAddOns.map((available) => {
                      const isSelected = entry.addOns.some((chosen) => chosen.addOnId === available.id);
                      return (
                        <button
                          key={available.id}
                          type="button"
                          onClick={() => {
                            const nextAddOns = isSelected
                              ? entry.addOns.filter((chosen) => chosen.addOnId !== available.id)
                              : [...entry.addOns, { addOnId: available.id, name: available.name, price: available.price }];
                            onAddOnsChange(key, nextAddOns);
                            // The key embeds the add-on set, so toggling moves this entry to a
                            // new key — follow it so the picker stays open for more toggles.
                            setEditingAddOnsKey(cartKeyFor(entry, { addOns: nextAddOns }));
                          }}
                          className={cn(
                            "rounded-card border px-3 py-1.5 text-meta font-medium transition-colors",
                            isSelected
                              ? "border-accent bg-accent text-white"
                              : "border-border bg-surface text-ink hover:bg-surface-raised",
                          )}
                        >
                          {available.name} (+{Number(available.price).toFixed(2)})
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div
        className={cn(
          "flex items-center justify-between border-t border-border pt-4 text-section font-semibold",
          isEmpty ? "text-ink-muted" : "text-ink",
        )}
      >
        <span>Total</span>
        <span className="text-numeric">{total.toFixed(2)}</span>
      </div>

      {formError && (
        <p role="alert" className="text-body text-status-danger-text">
          {formError}
        </p>
      )}

      {beforeActions}

      <div className="flex gap-2">
        <Button type="button" variant="danger" size="lg" className="flex-1" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          variant="success"
          size="lg"
          // An empty cart can't be confirmed: disabled and clearly faded (40%, a step below a
          // normal disabled button) so it reads as "not yet" next to Cancel.
          className={cn("flex-1", isEmpty && "disabled:opacity-40!")}
          disabled={!canConfirm || isSubmitting}
        >
          {isSubmitting ? submittingLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
