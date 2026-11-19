import { cn } from "./cn";

export type StatusTone = "neutral" | "active" | "success" | "warning" | "danger";

// Every raw status string this app produces, mapped to one of the plan's five
// semantic tones. An unrecognized string falls back to "neutral" rather than
// throwing, so a future backend enum value never crashes this component.
const STATUS_TONE_MAP: Record<string, StatusTone> = {
  // OrderStatus / OrderItemStatus
  PENDING: "neutral",
  CONFIRMED: "active",
  IN_KITCHEN: "active",
  PREPARING: "active",
  READY: "success",
  SERVED: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
  AWAITING_RECEPTION: "warning",
  // On hold until its time — "active" blue, distinct from awaiting reception's amber.
  SCHEDULED: "active",
  // An online pickup order (synthetic: ONLINE + TAKEAWAY), blue so it reads differently from a delivery.
  PICKUP: "active",
  // PaymentStatus
  AWAITING_VERIFICATION: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  // Inventory (synthetic — not a backend enum, computed from stock levels)
  LOW_STOCK: "warning",
  IN_STOCK: "success",
  // Generic active/inactive (synthetic — used for Kitchens, Staff, etc.)
  ACTIVE: "success",
  INACTIVE: "neutral",
  // AttendanceStatus
  PRESENT: "success",
  ABSENT: "danger",
  LEAVE: "warning",
  HALF_DAY: "active",
};

const TONE_CLASSES: Record<StatusTone, { dot: string; text: string; bg: string }> = {
  neutral: { dot: "bg-status-neutral", text: "text-status-neutral-text", bg: "bg-status-neutral-bg" },
  active: { dot: "bg-status-active", text: "text-status-active-text", bg: "bg-status-active-bg" },
  success: { dot: "bg-status-success", text: "text-status-success-text", bg: "bg-status-success-bg" },
  warning: { dot: "bg-status-warning", text: "text-status-warning-text", bg: "bg-status-warning-bg" },
  danger: { dot: "bg-status-danger", text: "text-status-danger-text", bg: "bg-status-danger-bg" },
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONE_MAP[status] ?? "neutral";
}

// Same tone map, expressed as a left-border accent for row-level highlighting
// (the Orders list, order items grouped by kitchen) — one mapping, two uses,
// so a row's accent color always agrees with its own status pill.
const TONE_ROW_ACCENT_CLASS: Record<StatusTone, string> = {
  neutral: "border-l-status-neutral",
  active: "border-l-status-active",
  success: "border-l-status-success",
  warning: "border-l-status-warning",
  danger: "border-l-status-danger",
};

export function rowAccentClassForStatus(status: string): string {
  return TONE_ROW_ACCENT_CLASS[toneForStatus(status)];
}

// Same tone map again, as a solid fill — for the Kitchen Display's ticket
// accent strip, which reads better as a filled block from a few feet away
// than a thin border line would.
export function accentBgClassForStatus(status: string): string {
  return TONE_CLASSES[toneForStatus(status)].dot;
}

// Same tone map once more, as a pale background tint — for the Attendance
// grid, where each cell is a functional <select> (so it can't become a
// StatusBadge) but still benefits from being scannable by color at a glance.
export function tintBgClassForStatus(status: string): string {
  return TONE_CLASSES[toneForStatus(status)].bg;
}

// Sentence case ("In kitchen", "Awaiting verification"), like every other
// label in the app — not Title Case.
function formatStatusLabel(status: string): string {
  const words = status.toLowerCase().split("_").filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface StatusBadgeProps {
  status: string;
  label?: string;
  // Overrides the tone looked up from `status` — for a state that isn't an order/payment enum
  // (the floor map's table states, see pages/tables/tableStates.ts).
  tone?: StatusTone;
  className?: string;
  // "lg" is for the Kitchen Display only — same tone map and dot+label shape,
  // scaled up for a screen read from a few feet away.
  size?: "sm" | "lg";
}

const SIZE_CLASSES: Record<"sm" | "lg", { wrapper: string; dot: string }> = {
  sm: { wrapper: "gap-1.5 text-body font-medium", dot: "h-1.5 w-1.5" },
  // Steps down below sm: on a phone held close, display-size text next to an
  // item name of the same size just crowds the card.
  lg: { wrapper: "gap-2 text-section font-semibold sm:gap-2.5 sm:text-display", dot: "h-3 w-3 sm:h-3.5 sm:w-3.5" },
};

// A dot + word, deliberately quiet — never a shouting filled pill. See the
// plan: color is a convenience for fast recognition, never the only signal.
export function StatusBadge({ status, label, tone: toneOverride, className, size = "sm" }: StatusBadgeProps) {
  const tone = toneOverride ?? toneForStatus(status);
  const { dot, text } = TONE_CLASSES[tone];
  const { wrapper, dot: dotSize } = SIZE_CLASSES[size];
  return (
    <span className={cn("inline-flex items-center", wrapper, text, className)}>
      <span className={cn("shrink-0 rounded-full", dotSize, dot)} aria-hidden="true" />
      {label ?? formatStatusLabel(status)}
    </span>
  );
}
