import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // The visible label, and the switch's accessible name.
  label: ReactNode;
  // A second, quieter line under the label.
  description?: ReactNode;
  disabled?: boolean;
  // "lg" for the one switch that matters most on a screen ("Accept online orders").
  size?: "md" | "lg";
  className?: string;
}

// An on/off switch for settings that take effect straight away (unlike a form's checkbox, which waits
// for Save). A real <button role="switch">, so keyboard and screen readers get native semantics, and the
// whole row — not just the track — is the 44px-plus tap target. Green when on, grey when off: the same
// success/neutral tones the status badges use, never the accent (which means "primary action").
export function Switch({ checked, onChange, label, description, disabled, size = "md", className }: SwitchProps) {
  const track = size === "lg" ? "h-9 w-16" : "h-7 w-12";
  const knob = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const travel = size === "lg" ? "translate-x-7" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-card border-0 bg-transparent p-0 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border transition-colors",
          track,
          checked ? "border-status-success bg-status-success" : "border-border bg-status-neutral-bg",
        )}
      >
        <span
          className={cn(
            "absolute left-1 rounded-full bg-white shadow-sm transition-transform",
            knob,
            checked ? travel : "translate-x-0",
          )}
        />
      </span>
      <span className="flex flex-col">
        <span className={cn("font-medium text-ink", size === "lg" ? "text-section" : "text-body")}>{label}</span>
        {description && <span className="text-meta text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}
