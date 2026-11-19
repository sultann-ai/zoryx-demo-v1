import type { ReactNode } from "react";
import { cn } from "../ui/cn";

const TONE_CLASSES = {
  // Orders waiting at reception.
  warning: "bg-status-warning",
  // Waiter calls nobody has answered.
  danger: "bg-status-danger",
} as const;

// The count pill on a nav entry (the sidebar's Incoming Orders badge, extracted). `label` is what a
// screen reader hears instead of the bare number.
export function NavCountBadge({ count, tone, label, className }: { count: number; tone: keyof typeof TONE_CLASSES; label: string; className?: string }) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-meta font-semibold text-white tabular-nums", TONE_CLASSES[tone], className)}
      aria-label={label}
    >
      {count}
    </span>
  );
}

// A bottom tab's icon with the badge pinned to its top-right corner (the tab's label stays put).
export function IconWithBadge({ icon, badge }: { icon: ReactNode; badge: ReactNode }) {
  return (
    <span className="relative inline-flex">
      {icon}
      {badge && <span className="absolute -top-2 left-1/2 ml-1 flex leading-none">{badge}</span>}
    </span>
  );
}
