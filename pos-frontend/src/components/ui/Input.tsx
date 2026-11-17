import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClasses } from "./fieldStyles";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldClasses, "h-11", className)} {...props} />;
});
