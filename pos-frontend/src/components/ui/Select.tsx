import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClasses } from "./fieldStyles";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(fieldClasses, "h-11", className)} {...props} />;
});
