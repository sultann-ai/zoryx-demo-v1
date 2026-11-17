import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "inverse";
// "lg" is for the Kitchen Display only — a screen read from a few feet away
// with messy hands, not the rest of the app's desk-distance admin screens.
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Focus ring is ink, not accent — a same-color ring on a same-color fill is
  // nearly invisible (confirmed by screenshot: focused/unfocused were almost
  // indistinguishable). Secondary/danger keep the accent ring since their
  // fill is light, so it already contrasts.
  // The ring-offset color is per variant too (not in the shared base): it has
  // to match the surface the button sits on, and that isn't always light.
  primary:
    "border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover focus-visible:ring-ink focus-visible:ring-offset-surface",
  secondary:
    "border-border bg-surface-raised text-ink hover:bg-surface focus-visible:ring-accent focus-visible:ring-offset-surface",
  // Outlined, not filled — a destructive action present but not shouting,
  // matching the plan's "quiet signal" rule for status colors.
  danger:
    "border-status-danger bg-surface-raised text-status-danger-text hover:bg-status-danger-bg focus-visible:ring-accent focus-visible:ring-offset-surface",
  // Filled, unlike danger — this is the forward/commit action (New Order's
  // Confirm), so it's allowed to be the more prominent of the pair.
  success:
    "border-status-success bg-status-success text-white hover:opacity-90 focus-visible:ring-ink focus-visible:ring-offset-surface",
  // For dark surfaces (the Kitchen Display header). The accent ring used
  // elsewhere is forest-green-on-near-black there and barely shows; a dark gap
  // with a white ring stays clearly visible.
  inverse: "border-white bg-white text-ink hover:bg-surface focus-visible:ring-white focus-visible:ring-offset-ink",
};

// 44px is the plan's minimum touch target for anything tapped mid-service;
// "lg" goes well beyond that for the Kitchen Display's messy-hands context.
// On a phone (below sm) held at arm's length rather than read across a room,
// lg steps down to 56px / 18px — still much bigger than an admin button, no
// longer sized for a wall-mounted screen.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-11 gap-2 px-4 text-body",
  lg: "h-14 gap-3 px-6 text-section sm:h-16 sm:text-title",
};

// Exported so a react-router <Link> that needs to look like a button (e.g. a
// "View" link in a table row) can share the exact same visual treatment
// instead of only being able to navigate via a <button onClick> — preserving
// native link semantics (open in new tab, right-click, hover preview).
export function buttonClassName(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(
    // no-underline: only needed when this is applied to an <a> (Preflight is
    // skipped app-wide, so the browser's default link underline isn't reset)
    // — harmless on a real <button>, which never has one to begin with.
    "inline-flex items-center justify-center whitespace-nowrap rounded-card border font-medium no-underline transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export function Button({ variant = "primary", size = "md", type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...props} />;
}
