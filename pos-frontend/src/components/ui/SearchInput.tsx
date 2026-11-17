import { useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClasses } from "./fieldStyles";

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "className"> {
  value: string;
  onChange: (value: string) => void;
  // Accessible name — there's no visible label, the placeholder isn't one.
  label: string;
  className?: string;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// A search field with a magnifier and its own clear (×) button — 44px tall, and the clear
// button is a full 44px target, for use mid-service on a phone. Enter never submits a
// surrounding form (the order screens sit inside one); Escape clears. The browser's own
// search-cancel glyph is hidden so there's only ever one ×.
export function SearchInput({ value, onChange, label, className, ...props }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
        <SearchIcon />
      </span>
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          } else if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
        className={cn(fieldClasses, "h-11 pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none")}
        {...props}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-card text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <span aria-hidden="true" className="text-section leading-none">
            ×
          </span>
        </button>
      )}
    </div>
  );
}
