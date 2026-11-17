import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "./cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  // A plain prop in React 19; lets a screen scroll its form card into view.
  ref?: Ref<HTMLDivElement>;
}

// Earned, not default — per the plan, reserve this for the few things that
// genuinely behave like objects (Kitchen tickets, Dashboard stat tiles).
// Lists belong in <Table>, not a stack of these.
export function Card({ title, className, children, ...props }: CardProps) {
  return (
    <div className={cn("rounded-card border border-border bg-surface-raised p-4", className)} {...props}>
      {title && <div className="mb-3 text-card-head font-semibold text-ink">{title}</div>}
      {children}
    </div>
  );
}
