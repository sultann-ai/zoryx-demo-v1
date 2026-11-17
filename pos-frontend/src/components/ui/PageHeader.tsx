import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

// The one place Bricolage Grotesque shows up per screen — a page's title, read once,
// slowly. Everything in `actions` (buttons, etc.) stays in the body typeface.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    // Every screen stacks its sections with `gap-6`, so on desktop this mb-6
    // stacks with it (kept as is). On a phone, where vertical space is short,
    // that doubled gap is dropped.
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 max-md:mb-0">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-title font-semibold text-ink">{title}</h1>
        {description && <p className="text-body text-ink-muted">{description}</p>}
      </div>
      {/* Wraps, so several buttons fold onto a second line on a phone instead
          of squeezing until their labels break. */}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
