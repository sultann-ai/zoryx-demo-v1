import { Button } from "../ui";

interface ListRowActionsProps {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isActive: boolean;
  onToggleActive: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

// The same strip on every website list (areas, payment accounts, gallery, testimonials): reorder with
// up/down buttons (no drag and drop — it has to work with a thumb), hide/show, edit, delete.
export function ListRowActions({
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  isActive,
  onToggleActive,
  onEdit,
  onDelete,
  disabled,
}: ListRowActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={onMoveUp} disabled={disabled || isFirst} aria-label="Move up">
        <span aria-hidden="true">↑</span>
      </Button>
      <Button variant="secondary" onClick={onMoveDown} disabled={disabled || isLast} aria-label="Move down">
        <span aria-hidden="true">↓</span>
      </Button>
      <Button variant="secondary" onClick={onToggleActive} disabled={disabled}>
        {isActive ? "Hide" : "Show"}
      </Button>
      {onEdit && (
        <Button variant="secondary" onClick={onEdit} disabled={disabled}>
          Edit
        </Button>
      )}
      <Button variant="danger" onClick={onDelete} disabled={disabled}>
        Delete
      </Button>
    </div>
  );
}
