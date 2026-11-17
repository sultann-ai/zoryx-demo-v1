import { useState } from "react";
import { Button, Modal, Textarea } from "../../components/ui";
import { cn } from "../../components/ui/cn";

interface ReasonChip {
  key: string;
  // The text sent as the reason.
  text: string;
  // Only on chips that mean "the payment is the problem" — also flips paymentRejected.
  paymentRejected: boolean;
  // Shown on the chip (defaults to `text`).
  english: string;
  urdu?: string;
}

// Fixed, hardcoded lists — not configurable from any admin screen (a scope cut, see the plan).
const INTERNAL_CHIPS: ReasonChip[] = ["Out of stock", "Kitchen too busy", "Can't fulfil this order"]
  .map((text) => ({ key: text, text, english: text, paymentRejected: false }))
  .concat([{ key: "Payment problem", text: "Payment problem", english: "Payment problem", paymentRejected: true }]);

// For an online order the customer reads the reason on their order page, so each one is in English and
// Urdu — the same text is sent, "English — اردو".
const ONLINE_CHIPS: ReasonChip[] = [
  { english: "Outside our delivery area", urdu: "ہمارے ڈیلیوری ایریا سے باہر", paymentRejected: false },
  { english: "Item not available", urdu: "آئٹم دستیاب نہیں", paymentRejected: false },
  { english: "Payment not received", urdu: "ادائیگی موصول نہیں ہوئی", paymentRejected: true },
  { english: "Cannot reach you by phone", urdu: "فون پر آپ سے رابطہ نہیں ہو سکا", paymentRejected: false },
].map((chip) => ({ ...chip, key: chip.english, text: `${chip.english} — ${chip.urdu}` }));

// A pickup order has no delivery area; its quick reasons are about the shop instead.
const PICKUP_CHIPS: ReasonChip[] = [
  { english: "Shop is closing soon", urdu: "دکان جلد بند ہو رہی ہے", paymentRejected: false },
  { english: "Item not available", urdu: "آئٹم دستیاب نہیں", paymentRejected: false },
  { english: "Payment not received", urdu: "ادائیگی موصول نہیں ہوئی", paymentRejected: true },
  { english: "Cannot reach you by phone", urdu: "فون پر آپ سے رابطہ نہیں ہو سکا", paymentRejected: false },
].map((chip) => ({ ...chip, key: chip.english, text: `${chip.english} — ${chip.urdu}` }));

interface RejectReasonModalProps {
  isOpen: boolean;
  orderNumber: number | null;
  onClose: () => void;
  onConfirm: (reason: string, paymentRejected: boolean) => void;
  isSubmitting: boolean;
  // An online order: bilingual quick reasons, and a clear note that the customer will read it.
  isOnline?: boolean;
  // An online pickup order: reasons that do not mention a delivery area.
  isPickup?: boolean;
}

export function RejectReasonModal({ isOpen, orderNumber, onClose, onConfirm, isSubmitting, isOnline = false, isPickup = false }: RejectReasonModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");

  const chips = isOnline ? (isPickup ? PICKUP_CHIPS : ONLINE_CHIPS) : INTERNAL_CHIPS;
  const selected = chips.find((chip) => chip.key === selectedKey) ?? null;
  const detail = freeText.trim();

  // A chip alone is the reason; typed detail is added after it (online and payment chips) or, for the
  // internal reasons, ignored — exactly as before this screen had online orders.
  const reason = selected === null ? detail : selected.paymentRejected || isOnline ? (detail ? `${selected.text} — ${detail}` : selected.text) : selected.text;
  const isValid = reason.length > 0;

  function handleChipClick(key: string) {
    setSelectedKey((previous) => (previous === key ? null : key));
  }

  function handleConfirm() {
    if (!isValid) {
      return;
    }
    onConfirm(reason, selected?.paymentRejected ?? false);
  }

  function handleClose() {
    setSelectedKey(null);
    setFreeText("");
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={orderNumber ? `Reject order #${orderNumber}` : undefined}>
      <div className="flex flex-col gap-4">
        {isOnline && <p className="text-body font-semibold text-ink">The customer will see this reason.</p>}

        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const isSelected = selectedKey === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleChipClick(chip.key)}
                className={cn(
                  "rounded-card border px-3 py-1.5 text-left text-meta font-medium transition-colors",
                  isOnline && "flex min-h-11 flex-col justify-center",
                  isSelected ? "border-accent bg-accent text-white" : "border-border bg-surface text-ink hover:bg-surface-raised",
                )}
              >
                <span>{chip.english}</span>
                {chip.urdu && (
                  <span dir="rtl" lang="ur" className="self-end">
                    {chip.urdu}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-meta font-medium text-ink-muted">
            {isOnline ? "More detail for the customer (optional)" : "Reason (shown to the order taker)"}
          </span>
          <Textarea
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            placeholder={isOnline ? "Add detail, or just use a reason above" : "Add detail, or just use a chip above"}
          />
        </label>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleConfirm} disabled={!isValid || isSubmitting}>
            {isSubmitting ? "Rejecting…" : "Reject order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
