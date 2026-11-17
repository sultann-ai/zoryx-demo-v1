import { cn } from "./ui/cn";

// A per-line kitchen note ("no onion") shown directly under the item or deal it belongs
// to — the cart, order detail, reception/taker cards. break-words so a long unbroken note
// wraps on a phone instead of widening the row.
export function LineNote({ notes, className }: { notes: string; className?: string }) {
  return <p className={cn("break-words text-meta text-ink-muted", className)}>Note: {notes}</p>;
}
