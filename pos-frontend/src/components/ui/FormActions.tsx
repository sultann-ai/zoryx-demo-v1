import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// The button row at the end of a form. On desktop it's the plain row it always
// was. Below md it's pinned: sticky to the bottom of the scrolling screen, so
// a long form (Menu item, Employee) never scrolls its Save button away, and
// the buttons share the width so each one is a big tap target.
//
// Sticky, not fixed: it sticks only while the form is taller than what's on
// screen, then rests at the form's own end. That's also why it can't be a
// fixed bar — on a list screen the form sits above a table, and a button
// hovering over the rows below would be wrong.
//
// -mx-4/-mb-4 cancel a Card's p-4 so the bar meets the card's edges; use this
// inside a <Card>. -bottom-4 cancels the 16px of padding on the phone shell's
// scrolling <main>: sticky measures inside that padding, so plain bottom-0
// would leave a 16px strip of form showing through under the bar.
export function FormActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex gap-2",
        "max-md:sticky max-md:-bottom-4 max-md:z-10 max-md:-mx-4 max-md:-mb-4 max-md:border-t max-md:border-border max-md:bg-surface-raised max-md:p-4 max-md:[&>*]:flex-1",
        className,
      )}
      {...props}
    />
  );
}
