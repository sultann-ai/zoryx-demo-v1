// Minimal className joiner — no tailwind-merge/clsx dependency needed since
// this library controls its own internal class combinations.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
