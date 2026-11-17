import { cn } from "../../components/ui/cn";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  name: string;
  legend: string;
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Stretch to the width of its container, with equal-width segments. Off: hug the labels.
  fullWidth?: boolean;
}

// A row of real radio inputs (native semantics/keyboard support for free), visually hidden
// and styled via their label instead — faster to tap than a dropdown, which is the whole
// point of this screen. A labelled radiogroup rather than a <fieldset>, so there is no
// browser-drawn border or legend; the segments sit in one soft inset track and the chosen
// one is filled.
export function SegmentedControl<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  fullWidth = false,
}: SegmentedControlProps<T>) {
  const legendId = `${name}-legend`;
  return (
    <div role="radiogroup" aria-labelledby={legendId} className={cn("flex min-w-0 flex-col gap-1.5", !fullWidth && "w-fit")}>
      <span id={legendId} className="text-meta font-medium text-ink-muted">
        {legend}
      </span>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-card border border-border bg-surface p-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <div key={option.value} className="min-w-0">
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  "flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-[3px] px-4 text-body font-medium transition-colors",
                  "text-ink-muted hover:bg-surface-raised hover:text-ink",
                  "peer-checked:bg-accent peer-checked:text-white peer-checked:shadow-sm peer-checked:hover:bg-accent-hover peer-checked:hover:text-white",
                  "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
