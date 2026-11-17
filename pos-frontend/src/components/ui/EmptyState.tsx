import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  // Optional decorative artwork shown above the title.
  illustration?: ReactNode;
}

// For "No active business day," "No items added yet," "No sales in this
// range," and similar — a consistent, calm treatment instead of a bare <p>.
export function EmptyState({ title, description, action, illustration }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      {illustration}
      <div className="text-body font-semibold text-ink">{title}</div>
      {description && <p className="max-w-sm text-body text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
