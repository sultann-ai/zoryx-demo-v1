import type { MenuItem } from "../../api/menuItems";
import { Modal } from "../../components/ui";

interface SizePickerFormProps {
  item: MenuItem;
  onPick: (variantId: string, variantLabel: string) => void;
}

// Keyed by item.id from the parent, same reset-by-remount pattern as AdjustStockDialog.
function SizePickerForm({ item, onPick }: SizePickerFormProps) {
  const pricedVariants = item.variants.filter((variant) => variant.price !== null);

  return (
    <div className="flex flex-col gap-2">
      {pricedVariants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          onClick={() => onPick(variant.id, variant.label)}
          className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 text-left text-body font-medium text-ink hover:bg-accent hover:text-white"
        >
          <span>{variant.label}</span>
          <span className="text-numeric">{Number(variant.price).toFixed(2)}</span>
        </button>
      ))}
    </div>
  );
}

interface SizePickerModalProps {
  item: MenuItem | null;
  onClose: () => void;
  // Tapping a size both reports the pick and closes the picker — one tap, no confirm step.
  onPick: (menuItemId: string, variantId: string, variantLabel: string) => void;
}

export function SizePickerModal({ item, onClose, onPick }: SizePickerModalProps) {
  return (
    <Modal isOpen={item !== null} onClose={onClose} title={item ? `${item.name} — choose a size` : undefined}>
      {item && (
        <SizePickerForm
          key={item.id}
          item={item}
          onPick={(variantId, variantLabel) => {
            onPick(item.id, variantId, variantLabel);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
