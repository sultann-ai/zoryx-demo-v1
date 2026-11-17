import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { fieldClasses } from "./fieldStyles";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClasses, "min-h-24 py-2", className)} {...props} />;
  },
);
